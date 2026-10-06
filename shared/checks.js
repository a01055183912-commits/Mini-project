import { isObj, str, sumBudget, findUrls } from './util.js'

// 점검 결과: { id, level: 'error'|'warn'|'info'|'ok', title, msg }
const SRC_WORDS = /(출처|기사|보도|공시|협회|연구원|리포트|보고서|통계)/
const SRC_BU_CHEONG = /[가-힣]{2,}(부|청)(?![가-힣])/ // '산업통상부', '통계청' 등. '부산' 같은 단어는 제외
const NUM = /[0-9]/

export function hasSource(text) {
  const t = String(text || '')
  return findUrls(t).length > 0 || SRC_WORDS.test(t) || SRC_BU_CHEONG.test(t)
}
export const hasNumber = (text) => NUM.test(String(text || ''))

const ok = (id, title, msg) => ({ id, level: 'ok', title, msg })
const mk = (id, level, title, msg) => ({ id, level, title, msg })

export function checkEvidence(values, steps) {
  const items = []
  let good = 0
  const targets = [
    ['trend', '트렌드', values.trend],
    ...['c1', 'c2', 'c3', 'c4'].map((k) => [k, caseTitle(steps, k), isObj(values[k]) ? values[k].evidence : '']),
  ]
  for (const [key, label, text] of targets) {
    const numOk = hasNumber(text)
    const srcOk = hasSource(text)
    if (!str(text)) items.push({ key, label, level: 'warn', msg: '비어 있습니다' })
    else if (!numOk || !srcOk)
      items.push({ key, label, level: 'warn', msg: `${!numOk ? '숫자' : ''}${!numOk && !srcOk ? ' 또는 ' : ''}${!srcOk ? '출처' : ''}가 없습니다` })
    else if (key !== 'trend') good++
  }
  const trendBad = items.some((i) => i.key === 'trend')
  const msg = `사례 4개 중 ${good}개에 숫자·출처 있음${trendBad ? ' / 트렌드에 숫자·출처 없음' : ''}`
  const res = items.length ? mk('evidence', 'warn', '근거', msg) : ok('evidence', '근거', msg)
  res.items = items
  res.good = good
  res.total = 4
  return res
}

function caseTitle(steps, key) {
  for (const s of steps.steps) for (const q of s.questions) if (q.key === key) return q.title
  return key
}

export function checkNumberGoal(values) {
  const t = String(values.goal || '')
  if (!str(t)) return mk('number', 'warn', '수치 목표', '수치 목표가 비어 있습니다')
  if (!hasNumber(t) || !/(월|주|일|2027)/.test(t)) return mk('number', 'warn', '수치 목표', '숫자와 기한(월·주·일·2027)이 함께 있어야 합니다')
  return ok('number', '수치 목표', '숫자와 기한이 있습니다')
}

export function checkTools(values) {
  const t = values.tools
  if (!isObj(t) || !t.main) return mk('tools', 'error', '도구', '메인 도구를 1개 선택해야 합니다')
  const sub = Array.isArray(t.sub) ? t.sub : []
  if (sub.length > 2) return mk('tools', 'error', '도구', '보조 도구는 최대 2개입니다')
  if (sub.includes(t.main)) return mk('tools', 'error', '도구', '메인 도구가 보조에도 들어 있습니다')
  return ok('tools', '도구', `메인 ${t.main} / 보조 ${sub.length ? sub.join(', ') : '없음'}`)
}

export function checkPlanMatchesTools(values, toolsCfg) {
  const t = values.tools
  if (!isObj(t) || !t.main) return null
  const chosen = new Set([t.main, ...(t.sub || [])])
  const text = `${values.mainplan || ''}\n${values.subplan || ''}`
  const stray = []
  for (const tool of toolsCfg.tools) {
    if (chosen.has(tool.id)) continue
    // 선택하지 않은 도구 이름("선택 C", "C안")이 실행안에 직접 등장하는지만 본다
    if (new RegExp(`선택\\s*${tool.id}(?![A-Za-z])`).test(text)) stray.push(tool.id)
  }
  if (!str(values.mainplan)) return mk('plan-tools', 'warn', '실행안', '메인 도구 실행안이 비어 있습니다')
  if (chosen.size > 1 && !str(values.subplan)) return mk('plan-tools', 'warn', '실행안', '보조 도구 실행안이 비어 있습니다')
  if (stray.length) return mk('plan-tools', 'warn', '실행안', `선택하지 않은 도구(${stray.join(', ')})가 실행안에 나옵니다`)
  return ok('plan-tools', '실행안', '실행안이 선택한 도구와 어긋나지 않습니다')
}

export function checkBudget(values, mission) {
  const b = values.budget
  const total = mission.budgetMan
  if (!isObj(b) || sumBudget(b) === 0) return mk('budget', 'error', '예산', '예산표가 비어 있습니다')
  const out = []
  const sum = sumBudget(b)
  if (sum !== total) out.push({ level: 'error', msg: `합계 ${sum.toLocaleString()}만 원 (목표 ${total.toLocaleString()}만 원, 차이 ${(sum - total).toLocaleString()}만 원)` })
  const reserve = Number(b.reserve) || 0
  if (reserve < mission.reserveMinMan || reserve > mission.reserveMaxMan)
    out.push({ level: 'warn', msg: `예비비 ${reserve.toLocaleString()}만 원 — ${mission.reserveMinMan.toLocaleString()}~${mission.reserveMaxMan.toLocaleString()}만 원(5~10%)이어야 합니다` })
  const t = values.tools
  if (isObj(t) && t.main) {
    const chosen = new Set([t.main, ...(t.sub || [])])
    const zero = ['A', 'B', 'C', 'D', 'E'].filter((k) => !chosen.has(k) && Number(b[k]) > 0)
    if (zero.length) out.push({ level: 'error', msg: `선택하지 않은 도구(${zero.join(', ')})에 예산이 있습니다` })
    const mainV = Number(b[t.main]) || 0
    const others = [...chosen].filter((k) => k !== t.main).map((k) => Number(b[k]) || 0)
    if (others.some((v) => v > mainV)) out.push({ level: 'warn', msg: '메인 도구가 가장 큰 비중이어야 합니다' })
  } else out.push({ level: 'warn', msg: 'STEP 3 도구 선택이 없어 선택/미선택 도구 점검을 못 했습니다' })
  if (!out.length) return ok('budget', '예산', `합계 ${sum.toLocaleString()}만 원, 예비비·배분 이상 없음`)
  const level = out.some((o) => o.level === 'error') ? 'error' : 'warn'
  const r = mk('budget', level, '예산', out.map((o) => o.msg).join(' / '))
  r.items = out
  return r
}

export function checkKpi(values) {
  const k = values.kpi
  const rows = isObj(k) && Array.isArray(k.rows) ? k.rows.filter((r) => str(r.metric) || str(r.method) || str(r.target)) : []
  if (!rows.length) return mk('kpi', 'warn', 'KPI', 'KPI 행이 없습니다')
  if (rows.some((r) => !str(r.method))) return mk('kpi', 'warn', 'KPI', '측정 방법이 비어 있는 KPI가 있습니다')
  if (!rows.some((r) => r.lead)) return mk('kpi', 'warn', 'KPI', '선행 지표가 1개 이상 필요합니다')
  return ok('kpi', 'KPI', `KPI ${rows.length}개, 측정 방법·선행 지표 있음`)
}

export function checkRoi(values) {
  const r = values.roi
  if (!isObj(r) || !(Number(r.value) > 0)) return mk('roi', 'warn', 'ROI', '기대 매출이 비어 있습니다')
  if (!str(r.memo)) return mk('roi', 'warn', 'ROI', '계산식 메모가 비어 있습니다')
  return ok('roi', 'ROI', `ROI ${roiPercent(r.value)}%`)
}
export const roiPercent = (valueEok, costEok = 2) => Math.round(((Number(valueEok) - costEok) / costEok) * 100)

// 공백·조사 제거 수준의 키워드 추출
const JOSA = /(으로|에서|에게|까지|부터|처럼|보다|이다|하는|하고|하게|하지|에는|에도|으며|이며|은|는|이|가|을|를|의|에|와|과|도|로|만)$/
export function keywords(text) {
  const words = String(text || '').match(/[가-힣A-Za-z0-9]{2,}/g) || []
  const out = new Set()
  for (const w of words) {
    let x = w
    for (let i = 0; i < 2; i++) x = x.replace(JOSA, '')
    if (x.length >= 2) out.add(x.toLowerCase())
  }
  return out
}
export function checkConsistency(values) {
  const task = keywords(values.task)
  const concept = keywords(values.concept)
  const plan = keywords(values.mainplan)
  if (!task.size || !concept.size || !plan.size) return mk('consistency', 'info', '일관성', '핵심 과제·컨셉·메인 실행안이 모두 있어야 점검할 수 있습니다')
  const overlap = (a, b) => [...a].filter((w) => b.has(w) || [...b].some((x) => x.length >= 3 && w.length >= 3 && (x.includes(w) || w.includes(x))))
  const a = overlap(task, concept)
  const b = overlap(concept, plan)
  if (a.length && b.length) return ok('consistency', '일관성', `공통 키워드: ${[...new Set([...a, ...b])].slice(0, 5).join(', ')}`)
  const gaps = []
  if (!a.length) gaps.push('핵심 과제 ↔ 컨셉')
  if (!b.length) gaps.push('컨셉 ↔ 실행안')
  return mk('consistency', 'info', '일관성', `${gaps.join(', ')} 사이에 겹치는 키워드가 없습니다(참고용)`)
}

// 전체 점검 (조 최종 값 기준)
export function runChecks({ values, steps, tools, progress }) {
  const list = []
  if (progress.missing.length)
    list.push({ id: 'complete', level: 'warn', title: '빈칸', msg: `빈칸 ${progress.missing.length}개`, items: progress.missing.map((q) => ({ key: q.key, label: `STEP ${q.step} · ${q.title}`, level: 'warn', msg: '비어 있습니다' })) })
  else list.push(ok('complete', '빈칸', '빈칸 없음'))
  list.push(checkEvidence(values, steps))
  list.push(checkNumberGoal(values))
  list.push(checkTools(values))
  const pt = checkPlanMatchesTools(values, tools)
  if (pt) list.push(pt)
  list.push(checkBudget(values, steps.mission))
  list.push(checkKpi(values))
  list.push(checkRoi(values))
  list.push(checkConsistency(values))
  return list
}
