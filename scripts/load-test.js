// 25명 동시 입력 간이 부하 테스트: BASE=http://localhost:3000 TEACHER_PASSWORD=... npm run load-test
const BASE = process.env.BASE || 'http://localhost:3000'
const PW = process.env.TEACHER_PASSWORD
const N = Number(process.env.N || 25)
if (!PW) { console.error('TEACHER_PASSWORD 가 필요합니다 (테스트 전 데이터를 비웁니다 — 수업 중에는 실행하지 마세요)'); process.exit(1) }

const call = async (path, { method = 'GET', body, token } = {}) => {
  const t = performance.now()
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-token': token || '' }, body: body ? JSON.stringify(body) : undefined })
  const data = await r.json().catch(() => null)
  return { status: r.status, data, ms: performance.now() - t }
}
const tt = (await call('/api/teacher/login', { method: 'POST', body: { password: PW } })).data.token
await call('/api/teacher/purge', { method: 'POST', token: tt, body: { confirm: 'DELETE' } })
const code = (await call('/api/teacher/overview', { token: tt })).data.cls.code

const lat = []
const errors = []
const track = (r) => { lat.push(r.ms); if (r.status >= 400) errors.push(r.status + ' ' + JSON.stringify(r.data)); return r }
const text = '가'.repeat(300)

// SSE 수신 지연: 한 명이 쓰고 같은 조의 다른 사람이 이벤트를 받기까지
const t0 = performance.now()
const students = await Promise.all(Array.from({ length: N }, async (_, i) => {
  const r = track(await call('/api/join', { method: 'POST', body: { code, team: String((i % 3) + 1), name: `학생${i + 1}` } }))
  return r.data.token
}))
console.log(`입장 ${N}명 완료 (${Math.round(performance.now() - t0)}ms)`)

const keys = ['store', 'mission', 'trend', 'rule', 'task', 'goal', 'persona', 'concept', 'not', 'mainplan', 'plan']
const t1 = performance.now()
await Promise.all(students.map(async (tok) => {
  for (let round = 0; round < 3; round++) {
    await Promise.all(keys.map((k) => call(`/api/answers/${k}`, { method: 'PUT', token: tok, body: { value: k === 'plan' ? { pre: text, w1: text, w2: text, w3: text, w4: text } : text + round } }).then(track)))
    track(await call('/api/state', { token: tok }))
  }
}))
const dt = performance.now() - t1
const sorted = [...lat].sort((a, b) => a - b)
const p = (q) => Math.round(sorted[Math.floor(sorted.length * q)])
console.log(`요청 ${lat.length}건 / ${Math.round(dt)}ms — 중앙값 ${p(0.5)}ms · p95 ${p(0.95)}ms · 최대 ${Math.round(sorted.at(-1))}ms · 오류 ${errors.length}건`)

const ov = (await call('/api/teacher/overview', { token: tt })).data
const filled = ov.teams.flatMap((t) => t.members).filter((m) => m.steps[0] === 100).length
console.log(`저장 확인: STEP 0 완료 ${filled}/${N}명`)
await call('/api/teacher/purge', { method: 'POST', token: tt, body: { confirm: 'DELETE' } })
const ok = !errors.length && filled === N && p(0.95) < 1500
console.log(ok ? '\n통과' : '\n실패')
process.exit(ok ? 0 : 1)
