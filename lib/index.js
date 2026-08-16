/**
 * OpenCode Go 余额/用量悬浮窗 —— host 半
 * 提供两个同源路由：
 *   GET /api/opencode-go/balance — 官方额度接口（https://opencode.ai/zen/go/v1/usage），60s 缓存
 *   GET /api/opencode-go/usage   — 可选：本地 opencode.db 用量（未安装 opencode 时优雅降级，不影响余额）
 *
 * 余额 key 来源（按优先级）：
 *   1. DSH 凭据系统：OPENCODE_GO_API_KEY（设置 → 凭据）
 *   2. 环境变量 OGM_API_KEY
 * 不读取 opencode 的本地配置文件 —— 部署者不需要安装 opencode 也能查询余额。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'dsh-opencode-go-monitor'

export const inject = ['credentials', 'webServer']

const DATA_DIR = process.env.OGM_DATA_DIR || join(homedir(), '.local', 'share', 'opencode')
const DB_PATH = process.env.OGM_DB || join(DATA_DIR, 'opencode.db')
const PROVIDER = process.env.OGM_PROVIDER || 'opencode-go'
const BALANCE_URL = process.env.OGM_BASE || 'https://opencode.ai/zen/go/v1/usage'
const BALANCE_CACHE_MS = 60000

// ---------- 余额 key：DSH 凭据 → 环境变量（不依赖 opencode） ----------
async function resolveKey(ctx) {
  try {
    const cred = await ctx.credentials.resolve('OPENCODE_GO_API_KEY')
    if (cred && cred.value) return cred.value
  } catch { /* fallthrough */ }
  if (process.env.OGM_API_KEY) return process.env.OGM_API_KEY
  throw new Error('未配置 OPENCODE_GO_API_KEY 凭据（DSH 设置 → 凭据，或环境变量 OGM_API_KEY）')
}

// ---------- 余额（官方接口） ----------
async function queryBalance(ctx) {
  const key = await resolveKey(ctx)
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
      }

      const at = (d.time && d.time.completed) || created
      if (!last || at > last.at) {
        last = { at, sid: r.session_id, model: mid, input: tin, output: tout, cost, title: null }
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
    }
  } finally {
    db.close()
  }
}

// ---------- 应用 ----------
export function apply(ctx) {
  let balanceCache = null
  let balanceAt = 0

  async function statusBalance() {
    const now = Date.now()
    if (balanceCache && now - balanceAt < BALANCE_CACHE_MS) return balanceCache
    try {
      const payload = await queryBalance(ctx)
      balanceCache = payload
      balanceAt = now
      return payload
    } catch (e1) {
      // 偶发失败：立即自动重试一次
      try {
        const payload = await queryBalance(ctx)
        balanceCache = payload
        balanceAt = Date.now()
        return payload
      } catch (e2) {
        const msg = String((e2 && e2.message) || e2).slice(0, 200)
        if (balanceCache) return { ...balanceCache, stale: true, error: msg }
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
        try { json(res, await statusBalance()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    })
    ctx.webServer.register({
      kind: 'exact',
      path: '/api/opencode-go/usage',
      handler: async (_req, res) => {
        try { json(res, await queryUsage()) } catch (e) { json(res, { ok: false, error: String((e && e.message) || e).slice(0, 200) }, 500) }
      },
    })
  }, 'opencode-go-monitor: /api/opencode-go/* routes')
}
