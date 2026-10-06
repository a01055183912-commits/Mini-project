// E2E: 가입 → 작성 → 취합 → 내보내기 (실행: BASE=http://localhost:3100 TEACHER_PASSWORD=... node tests/e2e.mjs)
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:3100'
const PW = process.env.TEACHER_PASSWORD || 'teach123'
const SHOTS = process.env.SHOTS || '/tmp/claude-0/shots'
fs.mkdirSync(SHOTS, { recursive: true })
const exe = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p) && fs.statSync(p).isFile())
let fails = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++ }
const api = async (path, { method = 'GET', body, token } = {}) => {
  const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-token': token || '' }, body: body ? JSON.stringify(body) : undefined })
  return { status: r.status, data: await r.json().catch(() => null) }
}

const tt = (await api('/api/teacher/login', { method: 'POST', body: { password: PW } })).data.token
await api('/api/teacher/purge', { method: 'POST', token: tt, body: { confirm: 'DELETE' } })
const code = (await api('/api/teacher/overview', { token: tt })).data.cls.code

// 같은 칸을 연속 수정해도 저장되어야 함 (이력 저장 회귀 테스트)
{
  const j = (await api('/api/join', { method: 'POST', body: { code, team: '3', name: '회귀' } })).data
  const r1 = await api('/api/answers/trend', { method: 'PUT', token: j.token, body: { value: '첫 번째' } })
  const r2 = await api('/api/answers/trend', { method: 'PUT', token: j.token, body: { value: '두 번째 12%' } })
  ok(r1.status === 200 && r2.status === 200, '같은 칸을 두 번 저장해도 성공')
  await api('/api/teacher/purge', { method: 'POST', token: tt, body: { confirm: 'DELETE' } })
}

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
const ctxA = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true })
const ctxB = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const A = await ctxA.newPage()
const B = await ctxB.newPage()
const join = async (page, name) => {
  await page.goto(BASE + '/join')
  await page.getByLabel('수업 코드').fill(code)
  await page.getByText('1조').first().click()
  await page.getByLabel('이름').fill(name)
  await page.getByRole('button', { name: '입장하기' }).click()
  await page.waitForURL(/\/w/)
}
const tab = (page, text) => page.locator('nav .tab', { hasText: text })
const t0 = Date.now()
await join(A, '김롯데')
ok(Date.now() - t0 < 30000, `30초 안에 작성 시작 (${Date.now() - t0}ms)`)
await join(B, '박학생')
await A.waitForSelector('text=STEP 0')
ok((await A.textContent('.topbar')).includes('조장'), '첫 입장자는 조장')

// 입력 + 자동저장 + 새로고침 유지
await A.getByLabel('어느 채널, 어느 점포인가').fill('롯데백화점 부산본점 — 공식 층별 안내 근거')
await A.waitForSelector('text=저장됨')
await A.reload()
await A.waitForSelector('text=STEP 0')
ok((await A.getByLabel('어느 채널, 어느 점포인가').inputValue()).includes('부산본점'), '새로고침 후 답이 남아 있음')

// 실시간: B 입력 → A 조 취합 2초 이내
await tab(A, '조 취합').click()
await B.getByLabel('어느 채널, 어느 점포인가').fill('실시간확인문구')
const t1 = Date.now()
await A.waitForSelector('text=실시간확인문구', { timeout: 4000 })
ok(Date.now() - t1 < 2500, `입력이 다른 노트북 조 취합에 반영 (${Date.now() - t1}ms)`)

// 도구 선택 제약
await tab(B, 'STEP 3').click()
await B.getByLabel('선택 A 카테고리·MD 프로모션 메인').check()
await B.getByLabel('선택 B 캠페인·AI 콘텐츠 보조').check()
await B.getByLabel('선택 C 혜택·멤버십·CRM 보조').check()
ok(await B.getByLabel('선택 D 제휴 마케팅 보조').isDisabled(), '보조 3개째는 UI상 불가')
ok(await B.getByLabel('선택 A 카테고리·MD 프로모션 보조').isDisabled(), '메인으로 고른 도구는 보조에서 비활성')
await B.getByLabel('선택 B 캠페인·AI 콘텐츠 메인').check()
ok(!(await B.getByLabel('선택 B 캠페인·AI 콘텐츠 보조').isChecked()), '메인으로 바꾸면 보조에서 자동 해제')
ok((await B.getByLabel('선택 A 카테고리·MD 프로모션 보조').isEnabled()), 'A는 다시 보조 선택 가능')

// 자료 찾기 + 새 탭 + 칩 + 출처 넣기
await tab(A, 'STEP 1').click()
await A.locator('#q-c1').getByRole('button', { name: '자료 찾기' }).click()
await A.waitForSelector('.research')
const [pop] = await Promise.all([ctxA.waitForEvent('page'), A.locator('.research').getByText('신세계백화점').click()])
ok(true, `링크가 새 탭으로 열림 (${pop.url()})`)
await pop.close()
const chip = A.locator('.research .chip').first()
const u2 = decodeURIComponent(await chip.getAttribute('href'))
ok((await chip.getAttribute('target')) === '_blank' && (await chip.getAttribute('rel')).includes('noopener'), '칩 링크는 target=_blank rel=noopener')
const [pop2] = await Promise.all([ctxA.waitForEvent('page'), chip.click()])
ok(u2.includes('search.naver.com') && u2.includes('백화점 체험형 매장 체류시간'), `조별 검색어 칩 → 검색어 채운 뉴스 검색 (${u2.slice(0, 80)})`)
await pop2.close()
await A.locator('#q-c1').getByRole('button', { name: '방금 본 자료에서 출처 넣기' }).click()
ok((await A.locator('#q-c1').getByLabel(/숫자·출처/).inputValue()).includes('search.naver.com'), '방금 연 사이트 URL이 출처 칸에 들어감')
await A.screenshot({ path: `${SHOTS}/step1-research.png` })

// 사례 입력: c1 숫자·출처 없는 사례(경고), c2 정상
const fillCase = async (key, what, ev, why) => {
  const c = A.locator(`#q-${key}`)
  await c.getByLabel(/무엇을 했나/).fill(what); await c.getByLabel(/숫자·출처/).fill(ev); await c.getByLabel(/왜 통했나/).fill(why)
}
await fillCase('c1', '체험 매장 운영', '효과가 좋았다', '체류시간 증가')
await fillCase('c2', '복합몰 체험 존', '체류시간 18% 증가 (출처: 산업통상부 보도자료)', '동선 설계')
await A.waitForSelector('text=저장됨')

// 개인 답 몇 개 더 + 조장 최종 확정
await tab(A, 'STEP 5').click()
await A.getByLabel('선택 A 카테고리·MD 프로모션 금액').isDisabled().catch(() => {})

// 조장: 조 취합에서 B 답을 최종으로
await tab(A, '조 취합').click()
const row = A.locator('#g-store')
await row.locator('.col').nth(2).getByRole('button', { name: '조 최종으로' }).click()   // 박학생 열
await A.waitForSelector('#g-store .final >> text=실시간확인문구')
ok(true, '조장이 조원 답을 조 최종으로 확정')
// 학생(B)은 확정 버튼 없음
await tab(B, '조 취합').click()
ok((await B.getByRole('button', { name: '조 최종으로' }).count()) === 0, '학생에게는 [조 최종으로] 없음')
await B.locator('#g-store .col').nth(1).getByRole('button', { name: /추천/ }).click()
await A.waitForSelector('#g-store >> text=추천 1', { timeout: 4000 })
ok(true, '학생 추천이 조장 화면에 반영')

// 최종 도구(B가 메인 B, 보조 A) + 예산 직접 편집
await A.locator('#g-tools .col').nth(2).getByRole('button', { name: '조 최종으로' }).click()
await A.locator('#g-budget').getByRole('button', { name: '직접 편집' }).click()
const bw = A.locator('#g-budget .final')
await bw.getByLabel('선택 B 캠페인·AI 콘텐츠 금액').fill('9000')
await bw.getByLabel('선택 C 혜택·멤버십·CRM 금액').fill('7000')
await bw.getByLabel('예비비 금액').fill('1000')
await A.waitForTimeout(1200)
await tab(A, '전략서').click()
await A.waitForSelector('.checks')
let ck = await A.textContent('.checks')
ok(/예산[\s\S]*오류[\s\S]*합계 17,000만 원/.test(ck), '예산 합계가 2억이 아니면 오류 표시')
ok(/근거/.test(ck) && ck.includes('사례 4개 중'), '근거 점검 표시')
await A.locator('.checks').screenshot({ path: `${SHOTS}/checks.png` })
// 사례 최종은 아직 없음 → 빈칸 경고, 최종 확정 사례 반영
await tab(A, '조 취합').click()
await A.locator('#g-c1 .col').nth(1).getByRole('button', { name: '조 최종으로' }).click()
await A.locator('#g-c2 .col').nth(1).getByRole('button', { name: '조 최종으로' }).click()
await tab(A, '전략서').click()
await A.waitForFunction(() => /사례 4개 중 1개/.test(document.querySelector('.checks')?.textContent || ''), null, { timeout: 5000 })
ok(true, '사례 4개 중 숫자·출처 없는 것이 경고로 잡힘 (1개만 통과)')

// 내보내기
const dl = async (name) => { const [d] = await Promise.all([A.waitForEvent('download'), A.getByRole('button', { name }).click()]); const p = `${SHOTS}/${d.suggestedFilename()}`; await d.saveAs(p); return p }
const pptx = await dl('PPTX 내려받기'); ok(fs.statSync(pptx).size > 20000, `PPTX 생성 (${fs.statSync(pptx).size} bytes)`)
const pdf = await dl('PDF 내려받기'); ok(fs.readFileSync(pdf).slice(0, 4).toString() === '%PDF', `PDF 생성 (${fs.statSync(pdf).size} bytes)`)
await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'])
await A.getByRole('button', { name: 'Markdown 복사' }).click()
const md = await A.evaluate(() => navigator.clipboard.readText())
ok(md.startsWith('# 1조 마케팅 벤치마킹 전략서') && md.includes('## STEP 0 채널·점포와 미션') && md.includes('## 점검 결과'), 'Markdown 형식 일치')
fs.writeFileSync(`${SHOTS}/strategy.md`, md)
await A.screenshot({ path: `${SHOTS}/strategy.png`, fullPage: false })
ok((await tab(B, '전략서').click(), (await B.getByRole('button', { name: 'PPTX 내려받기' }).isDisabled())), '학생(비조장)은 내보내기 비활성')

// 오프라인 입력 → 재연결 후 반영
await tab(B, 'STEP 0').click()
await ctxB.setOffline(true)
await B.getByLabel('미션 한 문장').fill('오프라인에서 쓴 미션')
await B.waitForSelector('text=오프라인', { timeout: 6000 })
await ctxB.setOffline(false)
await B.waitForSelector('text=저장됨', { timeout: 10000 })
const st = (await api('/api/teacher/team/1', { token: tt })).data
ok(Object.values(st.answers).some((a) => a.mission?.value === '오프라인에서 쓴 미션'), '오프라인 입력이 재연결 후 서버에 반영')

// 다른 조/API 직접 호출 보안
const mem = Object.keys(st.answers)[0]
const j = await api('/api/join', { method: 'POST', body: { code, team: '2', name: '타조학생' } })
const other = (await api('/api/state', { token: j.data.token })).data
ok(!JSON.stringify(other).includes('오프라인에서 쓴 미션') && other.team.id === '2', '다른 조 데이터는 API로도 볼 수 없음')
ok((await api('/api/teacher/overview', { token: j.data.token })).status === 403, '학생 토큰으로 강사 API 접근 불가')
ok((await api('/api/state')).status === 401, '토큰 없으면 거부')
ok((await api('/api/join', { method: 'POST', body: { code: 'WRONG1', team: '1', name: 'x' } })).status === 404, '틀린 수업 코드 거부')

// 강사 UI
const T = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage()
await T.goto(BASE + '/teacher')
await T.getByLabel('강사 비밀번호').fill(PW)
await T.getByRole('button', { name: '들어가기' }).click()
await T.waitForSelector('.matrix')
ok((await T.textContent('.matrix')).includes('박학생'), '강사 진행 매트릭스에 조원 표시')
await T.screenshot({ path: `${SHOTS}/teacher.png` })
await T.getByRole('button', { name: '시작' }).click()
await A.waitForSelector('.timer', { timeout: 4000 })
ok(true, '강사 타이머가 학생 상단 바에 동기 표시')
await T.getByRole('button', { name: '정지' }).click()
await T.getByLabel('전체 잠금').click()
await T.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent.includes('전체 잠금') && l.querySelector('input').checked))
await B.waitForTimeout(800)
await B.getByLabel('미션 한 문장').fill('잠금 후 시도').catch(() => {})
await B.waitForSelector('text=잠갔습니다', { timeout: 6000 })
ok(true, '잠금 후 학생 입력 거부/표시')
await T.getByLabel('전체 잠금').click()
await T.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent.includes('전체 잠금') && !l.querySelector('input').checked))
await T.getByRole('button', { name: '조 보기' }).click()
await T.getByRole('button', { name: '1조' }).click()
await T.locator('#g-store').getByPlaceholder('이 질문에 피드백 남기기').fill('근거를 숫자로 보강하세요')
await T.locator('#g-store').getByRole('button', { name: '남기기' }).click()
await tab(A, '조 취합').click()
await A.waitForSelector('text=근거를 숫자로 보강하세요', { timeout: 4000 })
ok(true, '강사 피드백이 조 화면에 즉시 표시')
// ZIP
await T.getByRole('button', { name: '내보내기' }).click()
const [zd] = await Promise.all([T.waitForEvent('download', { timeout: 60000 }), T.getByRole('button', { name: 'ZIP 내려받기' }).click()])
await zd.saveAs(`${SHOTS}/all.zip`)
ok(fs.statSync(`${SHOTS}/all.zip`).size > 50000, `ZIP 내려받기 (${fs.statSync(`${SHOTS}/all.zip`).size} bytes)`)
// 발표 모드
const P = await ctxA.newPage()
await P.goto(BASE + '/present/1')
await P.waitForSelector('.slide h1')
await P.keyboard.press('ArrowRight')
ok((await P.textContent('.slide h1')).includes('STEP 0'), '발표 모드 ←/→ 이동')
await P.screenshot({ path: `${SHOTS}/present.png` })

await browser.close()
console.log(fails ? `\n${fails}건 실패` : '\n모두 통과')
process.exit(fails ? 1 : 0)
