/**
 * 余额悬浮窗（合并版）—— host 半
 * 提供三个同源路由：
 *   GET /api/opencode-go/balance — OpenCode Go 官方额度（https://opencode.ai/zen/go/v1/usage），60s 缓存
 *   GET /api/opencode-go/usage   — 可选：本地 opencode.db 用量（未安装 opencode 时优雅降级）
 *   GET /api/deepseek/balance    — DeepSeek 官方余额（https://api.deepseek.com/user/balance），5s 缓存
 *
 * key 来源（均不读取 opencode 本地配置文件）：
 *   OpenCode Go：DSH 凭据 OPENCODE_GO_API_KEY → 环境变量 OGM_API_KEY
 *   DeepSeek   ：DSH 凭据 DEEPSEEK_API_KEY
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-opencode-go-monitor'

export const inject = ['credentials', 'webServer']

// ---------- OpenCode Go ----------
const DATA_DIR = process.env.OGM_DATA_DIR || join(homedir(), '.local', 'share', 'opencode')
const DB_PATH = process.env.OGM_DB || join(DATA_DIR, 'opencode.db')
const PROVIDER = process.env.OGM_PROVIDER || 'opencode-go'
const BALANCE_URL = process.env.OGM_BASE || 'https://opencode.ai/zen/go/v1/usage'
const BALANCE_CACHE_MS = 60000

async function resolveOpenCodeKey(ctx) {
  try {
    const cred = await ctx.credentials.resolve('OPENCODE_GO_API_KEY')
    if (cred && cred.value) return cred.value
  } catch { /* fallthrough */ }
  if (process.env.OGM_API_KEY) return process.env.OGM_API_KEY
  throw new Error('未配置 OPENCODE_GO_API_KEY 凭据（DSH 设置 → 凭据，或环境变量 OGM_API_KEY）')
}

async function queryOpenCodeBalance(ctx) {
  const key = await resolveOpenCodeKey(ctx)
  const resp = await fetch(BALANCE_URL, {
    headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'dsh-opencode-go-monitor/1.0' },
    signal: AbortSignal.timeout(12000),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`余额接口 HTTP ${resp.status}: ${String(text).slice(0, 120)}`)
  }
  const data = await resp.json()
  const u = (data && data.usage) || {}
  const norm = (w) => {
    const x = u[w] || {}
    return {
      status: x.status ?? null,
      percent: typeof x.percent === 'number' ? x.percent : null,
      resetsAt: x.resetsAt || null,
    }
  }
  return { ok: true, fetchedAt: Date.now(), rolling: norm('rolling'), weekly: norm('weekly'), monthly: norm('monthly') }
}

// ---------- DeepSeek ----------
const DS_BALANCE_URL = 'https://api.deepseek.com/user/balance'
const DS_PRICE_PER_MILLION = 4
const DS_CACHE_MS = 5000

async function queryDeepseekBalance(ctx) {
  const cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
  if (!cred || !cred.value) throw new Error('未配置 DEEPSEEK_API_KEY 凭据')
  const resp = await fetch(DS_BALANCE_URL, {
    headers: { Authorization: `Bearer ${cred.value}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`余额接口 HTTP ${resp.status}: ${String(text).slice(0, 120)}`)
  }
  const data = await resp.json()
  const info = (data.balance_infos || [])[0] || {}
  const balance = Number.parseFloat(info.total_balance)
  if (!Number.isFinite(balance)) throw new Error('余额响应格式异常')
  const estTokens = Math.floor(balance / (DS_PRICE_PER_MILLION / 1e6))
  let model = null
  try {
    const sel = ctx.get('agentDefaultModel')?.currentSelection()
    model = (sel && sel.model) || null
  } catch { /* 模型展示为可选项 */ }
  return {
    ok: true,
    balance,
    currency: info.currency || 'CNY',
    isAvailable: data.is_available !== false,
    estTokens,
    model,
    pricePerMillion: DS_PRICE_PER_MILLION,
    fetchedAt: Date.now(),
  }
}

// ---------- 用量（可选：本地 SQLite，只读） ----------
let DatabaseSync = null
async function loadSqlite() {
  if (!DatabaseSync) {
    try {
      const m = await import('node:sqlite')
      DatabaseSync = m.DatabaseSync
    } catch { /* Node < 22.5 */ }
  }
  return DatabaseSync
}

const zero = () => ({
  input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0,
  total: 0, cost: 0, msgs: 0, sessions: 0,
})

async function queryUsage() {
  const sqlite = await loadSqlite()
  if (!sqlite) return { ok: false, error: 'node:sqlite 不可用（用量统计为可选项，不影响余额显示）' }
  if (!existsSync(DB_PATH)) return { ok: false, error: '未找到 opencode 数据库（用量统计为可选项，不影响余额显示）' }

  const db = new sqlite(DB_PATH, { readOnly: true })
  try {
    const rows = db.prepare('SELECT session_id, time_created, data FROM message').all()

    // 会话 → 项目名 映射（多项目并行分析）
    const projName = new Map()
    try {
      const sessRows = db.prepare('SELECT id, project_id FROM session').all()
      const projRows = db.prepare('SELECT id, name FROM project').all()
      const pn = new Map(projRows.map((p) => [p.id, p.name || p.id]))
      for (const s of sessRows) projName.set(s.id, pn.get(s.project_id) || s.project_id || '?')
    } catch { /* 项目归属为可选项 */ }
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const ts0 = start.getTime()
    const now = Date.now()

    // DeepSeek 官方时段（北京时间 UTC+8）：高峰 09:00-12:00 / 14:00-18:00，其余空闲（半价）
    const bjHour = (ms) => Math.floor(((ms + 8 * 3600000) % 86400000) / 3600000)
    const DAY_MS = 86400000
    const dayKey = (ms) => Math.floor((ms + 8 * 3600000) / DAY_MS)
    const todayKey = dayKey(now)
    const hist = new Map() // 近 7 天（北京时间日）用量基线
    const offRecs = [] // 近 7 天低价时段请求 {t, tok, proj}（活跃窗口速率分析）
    const peakRecs = [] // 近 7 天高峰时段请求（低价无数据时作参考）
    let peakMsgs = 0, peakCost = 0, peakTokens = 0, offMsgs = 0, offCost = 0, hourNowTokens = 0

    const today = zero(), total = zero()
    const todayModels = new Map(), allModels = new Map()
    const todaySessions = new Set(), allSessions = new Set()
    let last = null

    for (const r of rows) {
      let d
      try { d = JSON.parse(r.data) } catch { continue }
      if (!d || d.role !== 'assistant' || d.providerID !== PROVIDER) continue
      const t = d.tokens || {}
      const tin = t.input ?? 0, tout = t.output ?? 0, trea = t.reasoning ?? 0
      const tcr = (t.cache && t.cache.read) ?? 0, tcw = (t.cache && t.cache.write) ?? 0
      const cost = typeof d.cost === 'number' ? d.cost : 0
      const created = typeof r.time_created === 'number' ? r.time_created : now
      const isToday = created >= ts0
      const mid = d.modelID || 'unknown'

      const agg = (b) => {
        b.input += tin; b.output += tout; b.reasoning += trea
        b.cacheRead += tcr; b.cacheWrite += tcw
        b.total += tin + tout + trea + tcr + tcw
        b.cost += cost; b.msgs += 1
      }
      agg(total)
      allSessions.add(r.session_id)
      let m = allModels.get(mid)
      if (!m) { m = { model: mid, msgs: 0, cost: 0, tokens: 0 }; allModels.set(mid, m) }
      m.msgs += 1; m.cost += cost; m.tokens += tin + tout + trea

      if (isToday) {
        agg(today)
        todaySessions.add(r.session_id)
        let tm = todayModels.get(mid)
        if (!tm) { tm = { model: mid, msgs: 0, cost: 0, tokens: 0 }; todayModels.set(mid, tm) }
        tm.msgs += 1; tm.cost += cost; tm.tokens += tin + tout + trea
        // 省钱分析：按 DeepSeek 官方时段（北京时间高峰 09-12 / 14-18，其余空闲半价）分桶
        const bh = bjHour(created)
        if (bh >= 9 && bh < 12 || bh >= 14 && bh < 18) { peakMsgs += 1; peakCost += cost; peakTokens += tin + tout + trea }
        else { offMsgs += 1; offCost += cost }
        if (bh === bjHour(now)) hourNowTokens += tin + tout + trea
      }

      const at = (d.time && d.time.completed) || created
      if (!last || at > last.at) {
        last = { at, sid: r.session_id, model: mid, input: tin, output: tout, cost, title: null }
      }

      // 近 7 天用量基线（分析依据）
      const dk = dayKey(created)
      if (dk >= todayKey - 6) {
        let e = hist.get(dk)
        if (!e) { e = { msgs: 0, cost: 0, tokens: 0, peakMsgs: 0, peakTokens: 0 }; hist.set(dk, e) }
        e.msgs += 1; e.cost += cost; e.tokens += tin + tout + trea
        const bh2 = bjHour(created)
        const rec = { t: created, tok: tin + tout + trea, proj: projName.get(r.session_id) || '?' }
        if ((bh2 >= 9 && bh2 < 12) || (bh2 >= 14 && bh2 < 18)) { e.peakMsgs += 1; e.peakTokens += tin + tout + trea; peakRecs.push(rec) }
        else offRecs.push(rec)
      }
    }

    today.sessions = todaySessions.size
    total.sessions = allSessions.size

    if (last) {
      try {
        const s = db.prepare('SELECT title FROM session WHERE id = ?').get(last.sid)
        last.title = s ? (s.title || null) : null
      } catch { /* ignore */ }
      last.agoMs = now - last.at
    }

    const sortM = (map) => Array.from(map.values()).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)

    // 当前时段状态与距下次切换分钟数（北京时间）
    const bjMin = ((now + 8 * 3600000) % 86400000) / 60000
    const inPeak = (bjHour(now) >= 9 && bjHour(now) < 12) || (bjHour(now) >= 14 && bjHour(now) < 18)
    const BOUNDS = [9 * 60, 12 * 60, 14 * 60, 18 * 60]
    let nextChangeMin = 0
    if (inPeak) {
      for (const b of BOUNDS) { if (b > bjMin) { nextChangeMin = Math.round(b - bjMin); break } }
    } else {
      for (const b of [9 * 60, 14 * 60]) { if (b > bjMin) { nextChangeMin = Math.round(b - bjMin); break } }
      if (nextChangeMin === 0) nextChangeMin = Math.round(24 * 60 - bjMin + 9 * 60)
    }

    // 近 7 天（含今天，北京时间日）日均基线
    const days = []
    let sum7Tokens = 0, sum7PeakTokens = 0
    for (let i = 6; i >= 0; i--) {
      const e = hist.get(todayKey - i) || { msgs: 0, cost: 0, tokens: 0, peakMsgs: 0, peakTokens: 0 }
      days.push({ msgs: e.msgs, cost: Math.round(e.cost * 1000) / 1000, tokens: e.tokens, peakTokens: e.peakTokens })
      sum7Tokens += e.tokens; sum7PeakTokens += e.peakTokens
    }
    const avg = {
      msgs: Math.round(days.reduce((s, d) => s + d.msgs, 0) / 7),
      cost: Math.round(days.reduce((s, d) => s + d.cost, 0) / 7 * 1000) / 1000,
      tokens: Math.round(days.reduce((s, d) => s + d.tokens, 0) / 7),
      peakMsgs: Math.round(days.reduce((s, d) => s + d.peakMsgs, 0) / 7),
    }
    // 单日参考：最近 7 天中最后有请求的一天（单日小时平均的基准）
    let refDay = null
    for (let i = 0; i < 7; i++) {
      const e = hist.get(todayKey - i)
      if (e && e.msgs > 0) { refDay = { msgs: e.msgs, tokens: e.tokens, cost: Math.round(e.cost * 1000) / 1000 }; break }
    }
    // 近 7 天小时均值（tok/小时）：高峰 6h/日、空闲 18h/日
    const hourly = {
      peakMean: Math.round(sum7PeakTokens / 7 / 6),
      offpeakMean: Math.round((sum7Tokens - sum7PeakTokens) / 7 / 18),
      mean: Math.round(sum7Tokens / 7 / 24),
    }
    // 低价区分析：按「实际活跃窗口」算低价时段每小时 tok 用量（不摊到全天），并统计窗口内并行项目数
    // 相邻请求间隔 ≤ 20 分钟视为同一次使用；单条请求窗口保底 2 分钟
    const rateByWindow = (recs) => {
      if (!recs.length) return null
      recs.sort((a, b) => a.t - b.t)
      const wins = []
      for (const x of recs) {
        const w = wins.length ? wins[wins.length - 1] : null
        if (!w || x.t - w.end > 20 * 60000) wins.push({ start: x.t, end: x.t, tok: x.tok, projs: new Set([x.proj]) })
        else { w.end = x.t; w.tok += x.tok; w.projs.add(x.proj) }
      }
      const winMs = wins.reduce((s, w) => s + Math.max(2 * 60000, w.end - w.start), 0)
      const parSizes = wins.map((w) => w.projs.size)
      return {
        hourly: winMs ? Math.round((recs.reduce((s, x) => s + x.tok, 0) / winMs) * 3600000) : 0,
        parallelAvg: parSizes.length ? Math.round((parSizes.reduce((a, b) => a + b, 0) / parSizes.length) * 10) / 10 : 0,
        parallelMax: parSizes.length ? Math.max(...parSizes) : 0,
        winCount: wins.length,
        winTotalMin: Math.round(winMs / 60000),
      }
    }
    const lowOff = rateByWindow(offRecs)
    const lowPeak = rateByWindow(peakRecs)
    const lowcost = {
      offpeakHourly: lowOff ? lowOff.hourly : 0,
      peakHourly: lowPeak ? lowPeak.hourly : 0,
      parallelAvg: lowOff ? lowOff.parallelAvg : 0,
      parallelMax: lowOff ? lowOff.parallelMax : 0,
      winCount: lowOff ? lowOff.winCount : 0,
      winTotalMin: lowOff ? lowOff.winTotalMin : 0,
    }

    return {
      ok: true,
      ts: now,
      provider: PROVIDER,
      db: DB_PATH,
      today,
      total,
      todayModels: sortM(todayModels),
      byModel: sortM(allModels),
      last,
      analysis: {
        today: { msgs: today.msgs, cost: today.cost, tokens: today.input + today.output + today.reasoning },
        peak: { msgs: peakMsgs, cost: peakCost, tokens: peakTokens },
        offpeak: { msgs: offMsgs, cost: offCost, tokens: today.input + today.output + today.reasoning - peakTokens },
        savingsEstimate: Math.round(peakCost * 500) / 1000, // 高峰费用挪到空闲可省一半
        windows: { peakHours: [[9, 12], [14, 18]], tz: 'UTC+8', offpeakDiscount: 0.5 },
        current: { status: inPeak ? 'peak' : 'offpeak', nextChangeMin },
        hourNow: { tokens: hourNowTokens },
      },
      history: {
        days,
        avg,
        refDay,
        hourly,
        lowcost,
      },
    }
  } finally {
    db.close()
  }
}

// ---------- 超限断点截断（真·控制：工具请求是天然断点——模型回复完整生成（含工具调用）并执行完毕后，
// 在下一个请求发出前拦截；不截断思考链、不回传异常 reasoning context，下一轮可原样续传） ----------
let gateEnabled = false
let gateCostLimit = 0
let gateTokenLimit = 0
let gatePeakOnly = false
let usageCache = null
let usageCacheAt = 0

async function budgetSnapshot(ctx) {
  const now = Date.now()
  if (usageCache && now - usageCacheAt < 5000) return usageCache
  try {
    usageCache = await queryUsage()
    usageCacheAt = now
  } catch { /* 保持旧缓存 */ }
  return usageCache
}

function overBudget(u) {
  if (!u || !u.ok || !u.today) return false
  return (gateCostLimit > 0 && u.today.cost > gateCostLimit)
      || (gateTokenLimit > 0 && u.today.tokens > gateTokenLimit)
}

// ---------- 低耗压缩：工具执行结果只留变化部分（行级 diff，无依赖；默认高峰时段激活） ----------
let compressEnabled = false
let compressAtPercent = 80
let compressPeakOnly = true
let compressCount = 0

function inPeakNow() {
  const h = Math.floor(((Date.now() + 8 * 3600000) % 86400000) / 3600000)
  return (h >= 9 && h < 12) || (h >= 14 && h < 18)
}

const MIN_COMPRESS_CHARS = 1500
const DIFF_LINE_CAP = 1200
const COMPRESS_MARK = '[低耗压缩：与上次执行结果仅保留变化]'

function myersDiff(a, b) {
  const n = a.length, m = b.length, max = n + m, offset = max
  const v = new Array(2 * max + 1).fill(0)
  const trace = []
  let found = false
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1]
      else x = v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[offset + k] = x
      if (x >= n && y >= m) { found = true; break }
    }
  }
  const ops = []
  let x = n, y = m
  for (let d = trace.length - 1; d >= 1; d--) {
    const vv = trace[d]
    const k = x - y
    let prevK
    if (k === -d || (k !== d && vv[offset + k - 1] < vv[offset + k + 1])) prevK = k + 1
    else prevK = k - 1
    const prevX = vv[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) { ops.push({ t: ' ', s: a[x - 1] }); x--; y-- }
    if (x === prevX) { while (y > prevY) { ops.push({ t: '+', s: b[y - 1] }); y-- } }
    else { while (x > prevX) { ops.push({ t: '-', s: a[x - 1] }); x-- } }
  }
  return ops.reverse()
}

function diffCompress(prevText, curText) {
  if (curText === prevText) return '[低耗压缩] 本次输出与上次执行结果完全相同，无变化'
  const a = prevText.split('\n'), b = curText.split('\n')
  if (a.length > DIFF_LINE_CAP || b.length > DIFF_LINE_CAP) return null
  let ops
  try { ops = myersDiff(a, b) } catch { return null }
  const changed = ops.filter((o) => o.t !== ' ').length
  if (changed === 0) return '[低耗压缩] 本次输出与上次执行结果完全相同，无变化'
  const body = ops.filter((o) => o.t !== ' ').map((o) => (o.t === '-' ? '- ' : '+ ') + o.s).join('\n')
  const out = COMPRESS_MARK + '\n（变化 ' + changed + ' 行，原 ' + curText.length + ' 字符）\n' + body
  if (out.length >= curText.length * 0.4) return null // 压缩收益不足，保留原文
  return out
}

async function compressPass(session) {
  if (!session || !session.surface || !session.events || !session.append) return 0
  const sid = session.sessionId || 'x'
  let prev = compressPrev.get(sid) ?? null
  let saved = 0
  for (const seq of [...session.surface.nodes]) {
    const ev = session.events[seq]
    if (!ev || ev.type !== 'tool/result') continue
    const msg = ev.data && ev.data.message
    const block = msg && msg.content && msg.content[0]
    if (!block || typeof block.content !== 'string') { prev = null; continue }
    const cur = block.content
    if (cur.length >= MIN_COMPRESS_CHARS) {
      let replacement = null
      if (prev !== null) replacement = diffCompress(prev, cur)
      if (replacement !== null) {
        try {
          session.append('tool/result', {
            ...ev.data,
            message: { ...msg, content: [{ ...block, content: replacement }] },
          }, { surfaceOp: { op: 'replace', start: seq, end: seq }, sourceEventSeqs: [seq] })
          compressCount += 1
          saved += cur.length - replacement.length
        } catch { /* 替换失败跳过 */ }
      }
    }
    prev = cur // 记录原始文本供下次 diff
  }
  compressPrev.set(sid, prev)
  return saved
}

const compressPrev = new Map()
let lastSession = null

function usedPercent(u) {
  if (!u || !u.ok || !u.today) return 0
  return Math.max(
    gateCostLimit > 0 ? (u.today.cost / gateCostLimit) * 100 : 0,
    gateTokenLimit > 0 ? (u.today.tokens / gateTokenLimit) * 100 : 0,
  )
}

// ---------- 应用 ----------
export function apply(ctx) {
  let goCache = null
  let goAt = 0
  let dsCache = null
  let dsAt = 0

  // 跟踪会话（低耗压缩需要重写会话表面）
  ctx.on('session/event', (subject) => { lastSession = subject })

  // 拦截 agent 请求：先压缩（接近限额且（默认）高峰时段），超出限额时停在工具断点
  ctx.on('agent/request', async (payload, next) => {
    if (compressEnabled && lastSession) {
      const u = await budgetSnapshot(ctx)
      const peak = !compressPeakOnly || inPeakNow()
      if (peak && usedPercent(u) >= compressAtPercent) {
        try { await compressPass(lastSession) } catch { /* 压缩失败不影响请求 */ }
      }
    }
    if (!gateEnabled) return next()
    const u = await budgetSnapshot(ctx)
    if ((!gatePeakOnly || inPeakNow()) && overBudget(u)) {
      throw new Error('预算已达上限（断点截断）：今日金额或 token 已超出限额，已停止于工具断点，不再发起新请求（会话历史保留，调整限额后可继续）。')
    }
    return next()
  })

  async function statusOpenCode() {
    const now = Date.now()
    if (goCache && now - goAt < BALANCE_CACHE_MS) return goCache
    try {
      const payload = await queryOpenCodeBalance(ctx)
      goCache = payload
      goAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryOpenCodeBalance(ctx)
        goCache = payload
        goAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (goCache) return { ...goCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  async function statusDeepseek() {
    const now = Date.now()
    if (dsCache && now - dsAt < DS_CACHE_MS) return dsCache
    try {
      const payload = await queryDeepseekBalance(ctx)
      dsCache = payload
      dsAt = now
      return payload
    } catch (e1) {
      try {
        const payload = await queryDeepseekBalance(ctx)
        dsCache = payload
        dsAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (dsCache) return { ...dsCache, stale: true, error: msg }
        return { ok: false, error: msg }
      }
    }
  }

  function json(res, payload, code = 200) {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(payload))
  }

  ctx.effect(() => {
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/opencode-go/balance',
      handler: async (_req, res) => {
        try { json(res, await statusOpenCode()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    })
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/opencode-go/usage',
      handler: async (_req, res) => {
        try {
          const payload = await queryUsage()
          json(res, {
            ...payload,
            enforcement: {
              gateEnabled,
              overBudget: overBudget(payload),
              active: gateEnabled && (!gatePeakOnly || inPeakNow()) && overBudget(payload),
              gatePeakOnly,
              compressEnabled,
              compressActive: compressEnabled && (!compressPeakOnly || inPeakNow()) && usedPercent(payload) >= compressAtPercent,
              compressAtPercent,
              compressPeakOnly,
              compressCount,
            },
          })
        } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    })
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/opencode-go/config',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST') {
            let raw = ''
            for await (const chunk of req) raw += chunk
            let body = {}
            try { body = JSON.parse(raw || '{}') } catch { /* 忽略非法体 */ }
            if (typeof body.gateEnabled === 'boolean') gateEnabled = body.gateEnabled
            if (typeof body.gatePeakOnly === 'boolean') gatePeakOnly = body.gatePeakOnly
            if (Number.isFinite(body.costLimit)) gateCostLimit = Math.max(0, body.costLimit)
            if (Number.isFinite(body.tokenLimit)) gateTokenLimit = Math.max(0, Math.floor(body.tokenLimit))
            if (typeof body.compressEnabled === 'boolean') compressEnabled = body.compressEnabled
            if (Number.isFinite(body.compressAtPercent)) compressAtPercent = Math.max(0, Math.min(100, body.compressAtPercent))
            if (typeof body.compressPeakOnly === 'boolean') compressPeakOnly = body.compressPeakOnly
          }
          const u = await budgetSnapshot(ctx)
          const over = overBudget(u)
          json(res, {
            ok: true,
            gateEnabled,
            gatePeakOnly,
            costLimit: gateCostLimit,
            tokenLimit: gateTokenLimit,
            overBudget: over,
            active: gateEnabled && (!gatePeakOnly || inPeakNow()) && over,
            compressEnabled,
            compressActive: compressEnabled && (!compressPeakOnly || inPeakNow()) && usedPercent(u) >= compressAtPercent,
            compressAtPercent,
            compressPeakOnly,
            inPeak: inPeakNow(),
            compressCount,
          })
        } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    })
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/deepseek/balance',
      handler: async (_req, res) => {
        try { json(res, await statusDeepseek()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    })
  }, 'balance-tabs: /api routes')
}
