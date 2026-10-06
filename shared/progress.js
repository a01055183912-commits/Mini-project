import { isObj, str, allQuestions } from './util.js'

// 질문 type별 "채워짐" 판정
export function isFilled(q, value) {
  if (value == null) return false
  switch (q.type) {
    case 'case':
      return isObj(value) && str(value.what) && str(value.evidence) && str(value.why) ? true : false
    case 'low':
      return isObj(value) && Array.isArray(value.picks) && value.picks.length === 2 && !!str(value.reason)
    case 'tools':
      return isObj(value) && !!value.main
    case 'plan':
      return isObj(value) && ['pre', 'w1', 'w2', 'w3', 'w4'].every((k) => str(value[k]))
    case 'kpi':
      return isObj(value) && Array.isArray(value.rows) && value.rows.some((r) => str(r.metric))
    case 'budget':
      return isObj(value) && ['A', 'B', 'C', 'D', 'E', 'reserve'].some((k) => Number(value[k]) > 0)
    case 'roi':
      return isObj(value) && Number(value.value) > 0
    default:
      return !!str(value)
  }
}

export function hasSub(values) {
  const t = values?.tools
  return !!(t && Array.isArray(t.sub) && t.sub.length > 0)
}

// 필수 질문 목록 (subplan 은 보조 도구가 있을 때만)
export function requiredQuestions(steps, values) {
  return allQuestions(steps).filter((q) => {
    if (!q.required) return false
    if (q.requiredIf === 'hasSub') return hasSub(values)
    return true
  })
}

// values: { key: value }  ->  { steps: {0..5: pct}, overall: pct, missing: [q] }
export function computeProgress(steps, values) {
  const req = requiredQuestions(steps, values)
  const per = {}
  const missing = []
  let done = 0
  for (const s of steps.steps) per[s.id] = { done: 0, total: 0, pct: 0 }
  for (const q of req) {
    per[q.step].total++
    if (isFilled(q, values[q.key])) {
      per[q.step].done++
      done++
    } else missing.push(q)
  }
  for (const s of steps.steps) {
    const p = per[s.id]
    p.pct = p.total ? Math.round((p.done / p.total) * 100) : 100
  }
  return {
    steps: per,
    overall: req.length ? Math.round((done / req.length) * 100) : 0,
    done,
    total: req.length,
    missing,
  }
}
