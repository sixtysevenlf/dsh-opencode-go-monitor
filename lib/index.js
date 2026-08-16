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

      // 近 7 天用量基线（自动限额依据）
      const dk = dayKey(created)
      if (dk >= todayKey - 6) {
        let e = hist.get(dk)
        if (!e) { e = { msgs: 0, cost: 0, tokens: 0, peakMsgs: 0, peakTokens: 0 }; hist.set(dk, e) }
        e.msgs += 1; e.cost += cost; e.tokens += tin + tout + trea
        const bh2 = bjHour(created)
        if ((bh2 >= 9 && bh2 < 12) || (bh2 >= 14 && bh2 < 18)) { e.peakMsgs += 1; e.peakTokens += tin + tout + trea }
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
      },
    }
  } finally {
    db.close()
  }
}

// ---------- 应用 ----------
export function apply(ctx) {
  let goCache = null
  let goAt = 0
  let dsCache = null
  let dsAt = 0

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
        try { json(res, await queryUsage()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
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
