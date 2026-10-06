import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { checkBudget, checkEvidence, checkTools, checkKpi, checkRoi, checkConsistency, checkNumberGoal, hasSource, roiPercent } from '../shared/checks.js'
import { computeProgress, isFilled } from '../shared/progress.js'
import { exportMd } from '../shared/exportMd.js'
import { buildDoc } from '../shared/doc.js'
import { hasUnsafeScheme, safeUrl } from '../shared/util.js'

const steps = JSON.parse(fs.readFileSync('config/steps.json', 'utf8'))
const tools = JSON.parse(fs.readFileSync('config/tools.json', 'utf8'))
const M = steps.mission

describe('evidence', () => {
  it('숫자와 출처가 모두 있어야 통과', () => {
    expect(hasSource('2026년 20.1% 증가 (산업통상부)')).toBe(true)
    expect(hasSource('https://kosis.kr/x')).toBe(true)
    expect(hasSource('부산 사례 20%')).toBe(false) // '부산'의 '부'는 출처가 아님
    const v = { c1: { evidence: '체류시간 18% 증가 (출처: 보도자료)' }, c2: { evidence: '효과가 좋았다' }, c3: { evidence: '출처 없음 12' }, c4: { evidence: '' } }
    const r = checkEvidence(v, steps)
    expect(r.good).toBe(2)
    expect(r.level).toBe('warn')
    expect(r.items.find((i) => i.key === 'c4').msg).toContain('비어')
  })
  it('목표는 숫자와 기한', () => {
    expect(checkNumberGoal({ goal: '신규 유입 3,000명 (4주 내)' }).level).toBe('ok')
    expect(checkNumberGoal({ goal: '많이 늘린다' }).level).toBe('warn')
  })
})

describe('tools', () => {
  it('메인 필수, 보조 ≤ 2, 중복 불가', () => {
    expect(checkTools({}).level).toBe('error')
    expect(checkTools({ tools: { main: 'A', sub: ['B', 'C', 'D'] } }).level).toBe('error')
    expect(checkTools({ tools: { main: 'A', sub: ['A'] } }).level).toBe('error')
    expect(checkTools({ tools: { main: 'A', sub: ['B', 'C'] } }).level).toBe('ok')
  })
})

describe('budget', () => {
  const t = { tools: { main: 'B', sub: ['C'] } }
  it('합계 2억·예비비·미선택 0원·메인 최대', () => {
    expect(checkBudget({ ...t, budget: { B: 12000, C: 6000, reserve: 2000 } }, M).level).toBe('ok')
    expect(checkBudget({ ...t, budget: { B: 12000, C: 5000, reserve: 2000 } }, M).level).toBe('error')
    expect(checkBudget({ ...t, budget: { B: 11000, C: 6000, A: 1000, reserve: 2000 } }, M).level).toBe('error')
    expect(checkBudget({ ...t, budget: { B: 6000, C: 12000, reserve: 2000 } }, M).level).toBe('warn')
    expect(checkBudget({ ...t, budget: { B: 12500, C: 6500, reserve: 1000 } }, M).level).toBe('ok')
    expect(checkBudget({ ...t, budget: { B: 13000, C: 6800, reserve: 200 } }, M).level).toBe('warn')
    expect(checkBudget({ ...t }, M).level).toBe('error')
  })
})

describe('kpi / roi / consistency', () => {
  it('kpi', () => {
    expect(checkKpi({}).level).toBe('warn')
    expect(checkKpi({ kpi: { rows: [{ metric: '방문', target: '1000', method: '', lead: true }] } }).level).toBe('warn')
    expect(checkKpi({ kpi: { rows: [{ metric: '방문', target: '1000', method: 'POS', lead: false }] } }).level).toBe('warn')
    expect(checkKpi({ kpi: { rows: [{ metric: '방문', target: '1000', method: 'POS', lead: true }] } }).level).toBe('ok')
  })
  it('roi', () => {
    expect(roiPercent(3)).toBe(50)
    expect(checkRoi({ roi: { value: 3, memo: '' } }).level).toBe('warn')
    expect(checkRoi({ roi: { value: 3, memo: '1만명 × 3만원' } }).level).toBe('ok')
  })
  it('일관성은 공통 키워드로', () => {
    const ok = checkConsistency({ task: '퇴근 고객은 체험 공간이 없어 오래 머물지 않는다', concept: '퇴근길 30분 체험 공간', mainplan: '체험 공간에서 족욕 체험을 제공' })
    expect(ok.level).toBe('ok')
    expect(checkConsistency({ task: '가격 부담', concept: '향기 휴식', mainplan: '쿠폰 발행' }).level).toBe('info')
  })
})

describe('progress', () => {
  it('필수 필드 기준 진행률, subplan 은 보조 도구가 있을 때만', () => {
    const p0 = computeProgress(steps, {})
    expect(p0.overall).toBe(0)
    expect(p0.total).toBe(20) // subplan 제외
    const p1 = computeProgress(steps, { tools: { main: 'A', sub: ['B'] } })
    expect(p1.total).toBe(21)
    expect(p1.steps[3].done).toBe(1)
  })
  it('type 별 채움 판정', () => {
    const q = (type) => ({ type })
    expect(isFilled(q('case'), { what: 'a', evidence: 'b', why: '' })).toBe(false)
    expect(isFilled(q('low'), { picks: ['인지'], reason: 'x' })).toBe(false)
    expect(isFilled(q('low'), { picks: ['인지', '방문'], reason: 'x' })).toBe(true)
    expect(isFilled(q('budget'), { A: 0 })).toBe(false)
    expect(isFilled(q('text'), '  ')).toBe(false)
  })
})

describe('안전', () => {
  it('javascript: 스킴 거부, http(s)만 허용', () => {
    expect(hasUnsafeScheme('javascript:alert(1)')).toBe(true)
    expect(hasUnsafeScheme({ a: ['x', ' JavaScript:bad'] })).toBe(true)
    expect(hasUnsafeScheme('Data: 20% 증가')).toBe(false)
    expect(safeUrl('javascript:alert(1)')).toBe(null)
    expect(safeUrl('https://a.com/x')).toContain('https://a.com')
  })
})

describe('Markdown 형식', () => {
  it('7.1 형식', () => {
    const values = { store: '부산본점', c1: { what: 'x', evidence: '18% https://a.com/y', why: 'z' }, tools: { main: 'A', sub: [] } }
    const doc = buildDoc({ team: { name: '1조', topic: '주제' }, members: ['가', '나'], values, steps, tools, checks: [{ id: 'complete', level: 'ok', title: '빈칸', msg: '없음' }] })
    const md = exportMd(doc)
    expect(md).toMatch(/^# 1조 마케팅 벤치마킹 전략서\n주제: 주제\n미션: 롯데 부산본점 · 2027 상반기 4주 · 예산 2억 · 신규 유입\+재방문/)
    expect(md).toContain('## STEP 0 채널·점포와 미션\n### 어느 채널, 어느 점포인가\n부산본점')
    expect(md).toContain('[https://a.com/y](https://a.com/y)')
    expect(md).toContain('## 점검 결과\n- 빈칸: 없음')
  })
})
