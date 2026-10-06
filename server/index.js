import express from 'express'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import dns from 'node:dns/promises'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { pool, q, migrate } from './db.js'
import { buildPdf } from './pdf.js'
import { computeProgress } from '../shared/progress.js'
import { runChecks } from '../shared/checks.js'
import { buildDoc } from '../shared/doc.js'
import { allQuestions, questionMap, safeUrl, hasUnsafeScheme } from '../shared/util.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, 'config', f), 'utf8'))
const BASE_STEPS = readJson('steps.json')
const TOOLS = readJson('tools.json')
const BASE_LINKS = readJson('links.json')

const PORT = Number(process.env.PORT || 3000)
let TEACHER_PASSWORD = process.env.TEACHER_PASSWORD
if (!TEACHER_PASSWORD) {
  TEACHER_PASSWORD = crypto.randomBytes(4).toString('hex')
  console.warn(`[경고] TEACHER_PASSWORD 환경변수가 없어 임시 비밀번호를 만들었습니다: ${TEACHER_PASSWORD}`)
}
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('lift38:' + TEACHER_PASSWORD).digest('hex')

const DEFAULT_TEAMS = [
  { id: '1', name: '1조', topic: '리빙·F&B × 향·족욕·티를 결합한 30분 체험형 힐링 공간 × 퇴근 고객의 체류시간 증대 및 재방문 유도' },
  { id: '2', name: '2조', topic: '롯데백화점 부산본점 뷰티·웰니스 카테고리를 퇴근동선 기반 체험형 캠페인과 채널 연계 프로모션으로 활성화해, 25-34 직장인의 신규 유입과 구매전환을 확대하는 마케팅 전략' },
  { id: '3', name: '3조', topic: '백 커스텀 하우스, 나만의가방, 파우치만들기' },
]
const DEFAULT_SETTINGS = { teams: DEFAULT_TEAMS, timer: { endsAt: null, durationMin: 10 }, locked: { all: false, steps: [] }, links: null, stepsOverride: { steps: {}, questions: {} } }

// ───────── 보안 유틸 ─────────
const hashPw = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}` }
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }
const verifyPw = (pw, h) => { if (!h) return false; const [salt, hex] = h.split(':'); return eq(crypto.scryptSync(pw, salt, 32).toString('hex'), hex) }
const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `T.${b}.${crypto.createHmac('sha256', SECRET).update(b).digest('base64url')}` }
function verifyTeacher(tok) {
  const m = /^T\.([^.]+)\.([^.]+)$/.exec(tok || '')
  if (!m) return null
  if (!eq(crypto.createHmac('sha256', SECRET).update(m[1]).digest('base64url'), m[2])) return null
  try { const p = JSON.parse(Buffer.from(m[1], 'base64url').toString()); return p.exp > Date.now() ? p : null } catch { return null }
}
const hits = new Map()
function limit(name, max, windowMs = 60000) {
  return (req, res, next) => {
    const k = `${name}:${req.ip}`, now = Date.now()
    const h = (hits.get(k) || []).filter((t) => now - t < windowMs)
    if (h.length >= max) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' })
    h.push(now); hits.set(k, h); next()
  }
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k) }, 60000).unref()

// ───────── 수업/설정 ─────────
async function activeClass() {
  const { rows } = await q('select * from classes order by id desc limit 1')
  return rows[0]
}
const settingsOf = (cls) => ({ ...DEFAULT_SETTINGS, ...(cls.settings || {}), locked: { ...DEFAULT_SETTINGS.locked, ...(cls.settings?.locked || {}) }, timer: { ...DEFAULT_SETTINGS.timer, ...(cls.settings?.timer || {}) } })
async function saveSettings(cls, patch) {
  const next = { ...(cls.settings || {}), ...patch }
  await q('update classes set settings=$2 where id=$1', [cls.id, next])
  cls.settings = next
  return settingsOf(cls)
}
function mergedSteps(settings) {
  const o = settings.stepsOverride || {}
  return {
    ...BASE_STEPS,
    steps: BASE_STEPS.steps.map((s) => ({
      ...s,
      title: o.steps?.[s.id] ?? s.title,
      questions: s.questions.map((qq) => ({ ...qq, title: o.questions?.[qq.key]?.title ?? qq.title, hint: o.questions?.[qq.key]?.hint ?? qq.hint })),
    })),
  }
}
const linksOf = (settings) => settings.links || BASE_LINKS

async function bootstrap() {
  await migrate()
  let cls = await activeClass()
  if (!cls) {
    const code = (process.env.CLASS_CODE || 'LIFT38').toUpperCase()
    await q('insert into classes(code, teacher_pw_hash, settings) values ($1,$2,$3)', [code, hashPw(TEACHER_PASSWORD), DEFAULT_SETTINGS])
    console.log(`수업 코드 생성: ${code}`)
  } else if (!verifyPw(TEACHER_PASSWORD, cls.teacher_pw_hash)) {
    await q('update classes set teacher_pw_hash=$2 where id=$1', [cls.id, hashPw(TEACHER_PASSWORD)])
  }
}

// ───────── 실시간 (SSE) ─────────
const clients = new Set()
function broadcast(classId, teamId, type) {
  const msg = `data: ${JSON.stringify({ type, team: teamId || null, t: Date.now() })}\n\n`
  for (const c of clients) if (c.classId === classId && (!teamId || c.teamId === null || c.teamId === teamId)) c.res.write(msg)
}

// ───────── 인증 ─────────
async function auth(req, res, next) {
  const tok = req.get('x-token') || req.query.token
  if (!tok) return res.status(401).json({ error: '로그인이 필요합니다' })
  const t = verifyTeacher(tok)
  if (t) { req.teacher = t; req.classId = t.cid; return next() }
  const { rows } = await q('select * from members where token=$1', [tok])
  if (!rows[0]) return res.status(401).json({ error: '세션이 만료되었습니다. 다시 입장하세요', code: 'bad_token' })
  req.member = rows[0]; req.classId = rows[0].class_id
  if (Date.now() - new Date(rows[0].last_seen).getTime() > 30000) q('update members set last_seen=now() where id=$1', [rows[0].id]).catch(() => {})
  next()
}
const teacherOnly = (req, res, next) => (req.teacher ? next() : res.status(403).json({ error: '강사 전용입니다' }))
const memberOnly = (req, res, next) => (req.member ? next() : res.status(403).json({ error: '학생 전용입니다' }))
const leaderOnly = (req, res, next) => (req.member?.role === 'leader' ? next() : res.status(403).json({ error: '조장만 할 수 있습니다' }))
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: '서버 오류' }) })

// ───────── 팀 상태 ─────────
async function teamState(cls, teamId) {
  const settings = settingsOf(cls)
  const team = settings.teams.find((t) => t.id === teamId)
  const [mem, ans, fin, votes, fb] = await Promise.all([
    q('select id, display_name, role, last_seen from members where class_id=$1 and team_id=$2 order by created_at', [cls.id, teamId]),
    q('select member_id, key, value, updated_at from answers where class_id=$1 and team_id=$2', [cls.id, teamId]),
    q('select key, value, source_member_id, decided_by, updated_at from finals where class_id=$1 and team_id=$2', [cls.id, teamId]),
    q('select member_id, key, target_member_id from votes where class_id=$1 and team_id=$2', [cls.id, teamId]),
    q('select id, key, body, created_at from feedback where class_id=$1 and team_id=$2 order by created_at', [cls.id, teamId]),
  ])
  const answers = {}
  for (const m of mem.rows) answers[m.id] = {}
  for (const a of ans.rows) (answers[a.member_id] ||= {})[a.key] = { value: a.value, updated_at: a.updated_at }
  const finals = {}
  for (const f of fin.rows) finals[f.key] = { value: f.value, source_member_id: f.source_member_id, updated_at: f.updated_at }
  return { team, members: mem.rows, answers, finals, votes: votes.rows, feedback: fb.rows }
}
const valuesOf = (answers) => Object.fromEntries(Object.entries(answers || {}).map(([k, v]) => [k, v.value]))

async function teamDoc(cls, teamId) {
  const settings = settingsOf(cls)
  const steps = mergedSteps(settings)
  const st = await teamState(cls, teamId)
  const values = valuesOf(st.finals)
  const progress = computeProgress(steps, values)
  const checks = runChecks({ values, steps, tools: TOOLS, progress })
  return buildDoc({ team: st.team, members: st.members.map((m) => m.display_name), values, steps, tools: TOOLS, checks, feedback: st.feedback })
}

// ───────── 앱 ─────────
const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '300kb' }))
app.get('/api/health', wrap(async (req, res) => { await q('select 1'); res.json({ ok: true }) }))

// 입장
app.post('/api/join', limit('join', 40), wrap(async (req, res) => {
  const cls = await activeClass()
  const code = String(req.body.code || '').trim().toUpperCase()
  const teamId = String(req.body.team || '')
  const name = String(req.body.name || '').trim().slice(0, 20)
  if (!cls || cls.code !== code) return res.status(404).json({ error: '수업 코드가 맞지 않습니다' })
  const settings = settingsOf(cls)
  if (!settings.teams.some((t) => t.id === teamId)) return res.status(400).json({ error: '조를 선택하세요' })
  if (!name) return res.status(400).json({ error: '이름을 입력하세요' })
  const { rows: same } = await q('select id, display_name, token from members where class_id=$1 and team_id=$2 and name=$3 order by created_at', [cls.id, teamId, name])
  if (same.length && req.body.mode === 'resume') return res.json({ token: same[0].token })
  if (same.length && req.body.mode !== 'new') return res.status(409).json({ duplicate: true, error: `같은 조에 '${name}' 님이 이미 있습니다` })
  const display = same.length ? `${name}(${same.length + 1})` : name
  const { rows: cnt } = await q('select count(*)::int c from members where class_id=$1 and team_id=$2', [cls.id, teamId])
  const token = crypto.randomBytes(24).toString('base64url')
  await q('insert into members(class_id, team_id, name, display_name, role, token) values ($1,$2,$3,$4,$5,$6)', [cls.id, teamId, name, display, cnt[0].c === 0 ? 'leader' : 'student', token])
  broadcast(cls.id, teamId, 'members')
  res.json({ token, display_name: display })
}))
app.get('/api/join-info', wrap(async (req, res) => {
  const cls = await activeClass()
  const code = String(req.query.code || '').trim().toUpperCase()
  if (!cls || cls.code !== code) return res.json({ ok: false })
  res.json({ ok: true, teams: settingsOf(cls).teams.map((t) => ({ id: t.id, name: t.name, topic: t.topic })) })
}))

// 실시간 스트림
app.get('/api/stream', auth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  res.write('retry: 2000\n\n')
  const c = { res, classId: req.classId, teamId: req.member ? req.member.team_id : null }
  clients.add(c)
  const ping = setInterval(() => res.write(': ping\n\n'), 20000)
  req.on('close', () => { clearInterval(ping); clients.delete(c) })
})

// 학생 상태
app.get('/api/state', auth, memberOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const settings = settingsOf(cls)
  const st = await teamState(cls, req.member.team_id)
  const vis = await q('select url, title, question_key, opened_at from visited where member_id=$1 order by opened_at desc limit 20', [req.member.id])
  res.json({
    now: Date.now(),
    cls: { code: cls.code, title: cls.title },
    me: { id: req.member.id, name: req.member.display_name, role: req.member.role, team_id: req.member.team_id },
    ...st,
    settings: { timer: settings.timer, locked: settings.locked },
    steps: mergedSteps(settings), tools: TOOLS, links: linksOf(settings), visited: vis.rows,
  })
}))

// 답 저장
const isDeepEmpty = (v) => v == null || (typeof v === 'string' ? !v.trim() : typeof v === 'number' ? !v : typeof v === 'boolean' ? true : Array.isArray(v) ? v.every(isDeepEmpty) : typeof v === 'object' ? Object.values(v).every(isDeepEmpty) : false)
function validValue(v) {
  if (hasUnsafeScheme(v)) return 'javascript: 등 허용되지 않는 링크가 들어 있습니다'
  if (JSON.stringify(v ?? null).length > 20000) return '내용이 너무 깁니다'
  return null
}
app.put('/api/answers/:key', auth, memberOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const settings = settingsOf(cls)
  const qs = questionMap(mergedSteps(settings))
  const key = req.params.key
  if (!qs[key]) return res.status(400).json({ error: '알 수 없는 질문' })
  if (settings.locked.all || settings.locked.steps.includes(qs[key].step)) return res.status(423).json({ error: '강사가 입력을 잠갔습니다', locked: true })
  const value = req.body.value
  const bad = validValue(value)
  if (bad) return res.status(400).json({ error: bad })
  const m = req.member
  if (isDeepEmpty(value)) {
    await q('delete from answers where member_id=$1 and key=$2', [m.id, key])
  } else {
    const prev = await q('select value from answers where member_id=$1 and key=$2', [m.id, key])
    if (prev.rows[0] && JSON.stringify(prev.rows[0].value) !== JSON.stringify(value))
      await q('insert into answers_history(member_id, key, value) values ($1,$2,$3)', [m.id, key, JSON.stringify(prev.rows[0].value)])
    await q(`insert into answers(class_id, team_id, member_id, key, value, updated_at) values ($1,$2,$3,$4,$5,now())
             on conflict (member_id, key) do update set value=excluded.value, updated_at=now()`, [cls.id, m.team_id, m.id, key, JSON.stringify(value)])
  }
  broadcast(cls.id, m.team_id, 'answers')
  res.json({ ok: true, saved_at: new Date().toISOString() })
}))

// 추천 (조원)
app.put('/api/votes', auth, memberOnly, wrap(async (req, res) => {
  const { key, target_member_id } = req.body
  const m = req.member
  const t = await q('select 1 from answers where member_id=$1 and key=$2 and class_id=$3 and team_id=$4', [target_member_id, key, m.class_id, m.team_id])
  if (!t.rows[0]) return res.status(400).json({ error: '추천할 답이 없습니다' })
  const cur = await q('select target_member_id from votes where member_id=$1 and key=$2', [m.id, key])
  if (cur.rows[0]?.target_member_id === target_member_id) await q('delete from votes where member_id=$1 and key=$2', [m.id, key])
  else await q(`insert into votes(class_id, team_id, member_id, key, target_member_id) values ($1,$2,$3,$4,$5)
                on conflict (member_id, key) do update set target_member_id=excluded.target_member_id`, [m.class_id, m.team_id, m.id, key, target_member_id])
  broadcast(m.class_id, m.team_id, 'votes')
  res.json({ ok: true })
}))

// 조 최종 (조장)
app.put('/api/finals/:key', auth, memberOnly, leaderOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const key = req.params.key
  const qs = questionMap(mergedSteps(settingsOf(cls)))
  if (!qs[key]) return res.status(400).json({ error: '알 수 없는 질문' })
  const value = req.body.value
  const bad = validValue(value)
  if (bad) return res.status(400).json({ error: bad })
  const m = req.member
  if (isDeepEmpty(value)) await q('delete from finals where class_id=$1 and team_id=$2 and key=$3', [cls.id, m.team_id, key])
  else {
    let src = req.body.source_member_id || null
    if (src) { const ok = await q('select 1 from members where id=$1 and team_id=$2 and class_id=$3', [src, m.team_id, cls.id]); if (!ok.rows[0]) src = null }
    await q(`insert into finals(class_id, team_id, key, value, source_member_id, decided_by, updated_at) values ($1,$2,$3,$4,$5,$6,now())
             on conflict (class_id, team_id, key) do update set value=excluded.value, source_member_id=excluded.source_member_id, decided_by=excluded.decided_by, updated_at=now()`,
      [cls.id, m.team_id, key, JSON.stringify(value), src, m.id])
  }
  broadcast(cls.id, m.team_id, 'finals')
  res.json({ ok: true })
}))

// 조장 위임
app.post('/api/leader', auth, memberOnly, leaderOnly, wrap(async (req, res) => {
  const m = req.member
  const ok = await q('select 1 from members where id=$1 and team_id=$2 and class_id=$3', [req.body.member_id, m.team_id, m.class_id])
  if (!ok.rows[0]) return res.status(400).json({ error: '같은 조원이 아닙니다' })
  await q("update members set role = case when id=$3 then 'leader' else 'student' end where class_id=$1 and team_id=$2", [m.class_id, m.team_id, req.body.member_id])
  broadcast(m.class_id, m.team_id, 'members')
  res.json({ ok: true })
}))

// 내가 본 자료
app.post('/api/visited', auth, memberOnly, wrap(async (req, res) => {
  const url = safeUrl(req.body.url)
  if (!url) return res.status(400).json({ error: 'http(s) 주소만 저장할 수 있습니다' })
  const m = req.member
  await q('insert into visited(member_id, url, title, question_key) values ($1,$2,$3,$4)', [m.id, url, String(req.body.title || '').slice(0, 200), String(req.body.question_key || '').slice(0, 40)])
  await q('delete from visited where member_id=$1 and id not in (select id from visited where member_id=$1 order by opened_at desc, id desc limit 20)', [m.id])
  const { rows } = await q('select url, title, question_key, opened_at from visited where member_id=$1 order by opened_at desc, id desc limit 20', [m.id])
  res.json({ visited: rows })
}))

// 링크 미리보기 (출처 URL 의 <title>)
const previewCache = new Map()
const privateIp = (ip) => net.isIPv4(ip) ? /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) : /^(::1|fc|fd|fe80)/i.test(ip)
app.get('/api/preview', auth, limit('preview', 60), wrap(async (req, res) => {
  const url = safeUrl(req.query.url)
  if (!url) return res.status(400).json({ error: 'bad url' })
  if (previewCache.has(url)) return res.json(previewCache.get(url))
  const out = { url, title: '', site: new URL(url).hostname.replace(/^www\./, '') }
  try {
    const addrs = await dns.lookup(out.site, { all: true })
    if (addrs.some((a) => privateIp(a.address))) throw new Error('private')
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 4000)
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 LIFT-Workbook', accept: 'text/html' } })
    const reader = r.body.getReader()
    let html = '', n = 0
    while (n < 200000) { const { done, value } = await reader.read(); if (done) break; html += Buffer.from(value).toString('utf8'); n += value.length; if (/<\/title>/i.test(html)) break }
    clearTimeout(timer); reader.cancel().catch(() => {})
    const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
    const og = /property=["']og:site_name["'][^>]*content=["']([^"']+)/i.exec(html)
    out.title = (t?.[1] || '').replace(/\s+/g, ' ').replace(/&amp;/g, '&').trim().slice(0, 150)
    if (og) out.site = og[1].slice(0, 60)
  } catch { /* 실패하면 URL 만 */ }
  if (previewCache.size > 500) previewCache.clear()
  previewCache.set(url, out)
  res.json(out)
}))

// PDF (조장·강사)
app.get('/api/pdf', auth, wrap(async (req, res) => {
  if (!req.teacher && req.member.role !== 'leader') return res.status(403).json({ error: '조장만 내려받을 수 있습니다' })
  const cls = await activeClass()
  const teamId = req.teacher ? String(req.query.team) : req.member.team_id
  if (!settingsOf(cls).teams.some((t) => t.id === teamId)) return res.status(400).json({ error: 'team' })
  const doc = await teamDoc(cls, teamId)
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.teamName + '_전략서.pdf')}` })
  buildPdf(doc).pipe(res)
}))

// ───────── 강사 ─────────
app.post('/api/teacher/login', limit('login', 10), wrap(async (req, res) => {
  const cls = await activeClass()
  if (!eq(String(req.body.password || ''), TEACHER_PASSWORD)) return res.status(401).json({ error: '비밀번호가 맞지 않습니다' })
  res.json({ token: sign({ cid: cls.id, exp: Date.now() + 1000 * 60 * 60 * 12 }) })
}))

app.get('/api/teacher/overview', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const settings = settingsOf(cls)
  const steps = mergedSteps(settings)
  const [mem, ans] = await Promise.all([
    q('select id, team_id, display_name, role, last_seen from members where class_id=$1 order by created_at', [cls.id]),
    q('select member_id, key, value from answers where class_id=$1', [cls.id]),
  ])
  const byMember = {}
  for (const a of ans.rows) (byMember[a.member_id] ||= {})[a.key] = a.value
  const fin = await q('select team_id, key, value from finals where class_id=$1', [cls.id])
  const finByTeam = {}
  for (const f of fin.rows) (finByTeam[f.team_id] ||= {})[f.key] = f.value
  const teams = settings.teams.map((t) => {
    const members = mem.rows.filter((m) => m.team_id === t.id).map((m) => {
      const p = computeProgress(steps, byMember[m.id] || {})
      return { id: m.id, display_name: m.display_name, role: m.role, last_seen: m.last_seen, steps: Object.fromEntries(Object.entries(p.steps).map(([k, v]) => [k, v.pct])), overall: p.overall }
    })
    const fp = computeProgress(steps, finByTeam[t.id] || {})
    return { ...t, members, final: { steps: Object.fromEntries(Object.entries(fp.steps).map(([k, v]) => [k, v.pct])), overall: fp.overall } }
  })
  res.json({ now: Date.now(), cls: { code: cls.code, title: cls.title }, settings, teams, steps, tools: TOOLS, links: linksOf(settings), baseLinks: BASE_LINKS, baseSteps: BASE_STEPS })
}))

app.get('/api/teacher/team/:id', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const settings = settingsOf(cls)
  if (!settings.teams.some((t) => t.id === req.params.id)) return res.status(404).json({ error: 'team' })
  const st = await teamState(cls, req.params.id)
  res.json({ now: Date.now(), cls: { code: cls.code }, ...st, me: { id: 'teacher', role: 'teacher', name: '강사', team_id: req.params.id }, settings: { timer: settings.timer, locked: settings.locked }, steps: mergedSteps(settings), tools: TOOLS, links: linksOf(settings), visited: [], readOnly: true })
}))

app.post('/api/teacher/feedback', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const body = String(req.body.body || '').trim().slice(0, 1000)
  if (!body) return res.status(400).json({ error: '내용을 입력하세요' })
  await q('insert into feedback(class_id, team_id, key, body) values ($1,$2,$3,$4)', [cls.id, String(req.body.team_id), req.body.key || null, body])
  broadcast(cls.id, String(req.body.team_id), 'feedback')
  res.json({ ok: true })
}))
app.delete('/api/teacher/feedback/:id', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const r = await q('delete from feedback where id=$1 and class_id=$2 returning team_id', [req.params.id, cls.id])
  if (r.rows[0]) broadcast(cls.id, r.rows[0].team_id, 'feedback')
  res.json({ ok: true })
}))

app.post('/api/teacher/timer', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const min = Math.max(1, Math.min(240, Number(req.body.minutes) || settingsOf(cls).timer.durationMin))
  const s = await saveSettings(cls, { timer: { durationMin: min, endsAt: req.body.action === 'start' ? Date.now() + min * 60000 : null } })
  broadcast(cls.id, null, 'settings')
  res.json({ timer: s.timer })
}))
app.post('/api/teacher/lock', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const steps = (req.body.steps || []).map(Number).filter((n) => n >= 0 && n <= 5)
  const s = await saveSettings(cls, { locked: { all: !!req.body.all, steps } })
  broadcast(cls.id, null, 'settings')
  res.json({ locked: s.locked })
}))
app.put('/api/teacher/settings', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const patch = {}
  const b = req.body
  if (Array.isArray(b.teams)) {
    const teams = b.teams.slice(0, 12).map((t, i) => ({ id: String(t.id ?? i + 1), name: String(t.name || `${i + 1}조`).slice(0, 20), topic: String(t.topic || '').slice(0, 600) }))
    if (new Set(teams.map((t) => t.id)).size !== teams.length || !teams.length) return res.status(400).json({ error: '조 ID 가 중복되었거나 비었습니다' })
    patch.teams = teams
  }
  if (b.stepsOverride) {
    const o = { steps: {}, questions: {} }
    for (const [k, v] of Object.entries(b.stepsOverride.steps || {})) o.steps[k] = String(v).slice(0, 80)
    const qs = questionMap(BASE_STEPS)
    for (const [k, v] of Object.entries(b.stepsOverride.questions || {})) if (qs[k]) o.questions[k] = { title: String(v.title ?? qs[k].title).slice(0, 120), hint: String(v.hint ?? qs[k].hint).slice(0, 500) }
    patch.stepsOverride = o
  }
  if (b.links !== undefined) {
    if (b.links === null) patch.links = null
    else {
      const L = b.links
      const groups = (L.groups || []).map((g) => ({
        id: String(g.id).slice(0, 40), title: String(g.title).slice(0, 80),
        links: (g.links || []).filter((l) => safeUrl(String(l.url).replace('{q}', 'x'))).map((l) => ({ title: String(l.title).slice(0, 120), url: String(l.url).slice(0, 500), ...(l.tip ? { tip: String(l.tip).slice(0, 120) } : {}), ...(l.template ? { template: true } : {}) })),
      }))
      patch.links = { groups, byQuestion: L.byQuestion || {}, teamQueries: L.teamQueries || {} }
    }
  }
  const s = await saveSettings(cls, patch)
  broadcast(cls.id, null, 'settings')
  res.json({ settings: s })
}))
app.post('/api/teacher/code', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = String(req.body.code || '').trim().toUpperCase()
  if (!code) code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('')
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return res.status(400).json({ error: '코드는 영문·숫자 4~12자입니다' })
  try { await q('update classes set code=$2 where id=$1', [cls.id, code]) } catch { return res.status(409).json({ error: '이미 쓴 코드입니다' }) }
  res.json({ code })
}))
app.post('/api/teacher/leader', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const m = await q('select team_id from members where id=$1 and class_id=$2', [req.body.member_id, cls.id])
  if (!m.rows[0]) return res.status(404).json({ error: 'member' })
  await q("update members set role = case when id=$3 then 'leader' else 'student' end where class_id=$1 and team_id=$2", [cls.id, m.rows[0].team_id, req.body.member_id])
  broadcast(cls.id, m.rows[0].team_id, 'members')
  res.json({ ok: true })
}))
app.delete('/api/teacher/member/:id', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const r = await q('delete from members where id=$1 and class_id=$2 returning team_id', [req.params.id, cls.id])
  if (r.rows[0]) broadcast(cls.id, r.rows[0].team_id, 'members')
  res.json({ ok: true })
}))
app.get('/api/teacher/export', auth, teacherOnly, wrap(async (req, res) => {
  const cls = await activeClass()
  const settings = settingsOf(cls)
  const docs = []
  for (const t of settings.teams) docs.push({ team: t, doc: await teamDoc(cls, t.id) })
  const { rows } = await q(`select m.team_id, m.display_name, a.key, a.value, a.updated_at from answers a join members m on m.id=a.member_id where a.class_id=$1 order by m.team_id, m.created_at, a.key`, [cls.id])
  res.json({ code: cls.code, docs, answers: rows })
}))
app.post('/api/teacher/purge', auth, teacherOnly, wrap(async (req, res) => {
  if (req.body.confirm !== 'DELETE') return res.status(400).json({ error: '확인 문구가 필요합니다' })
  const cls = await activeClass()
  await q('delete from members where class_id=$1', [cls.id])
  await q('delete from finals where class_id=$1', [cls.id])
  await q('delete from feedback where class_id=$1', [cls.id])
  await saveSettings(cls, { timer: { endsAt: null, durationMin: 10 }, locked: { all: false, steps: [] } })
  broadcast(cls.id, null, 'settings')
  res.json({ ok: true })
}))

// ───────── 정적 파일 ─────────
const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}
app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }))

export { app, pool }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrap().then(() => app.listen(PORT, '0.0.0.0', () => console.log(`listening on ${PORT}`))).catch((e) => { console.error(e); process.exit(1) })
}
