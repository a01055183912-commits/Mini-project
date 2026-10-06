// 서버·클라이언트 공용 유틸 (ESM)
export const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
export const str = (v) => (typeof v === 'string' ? v.trim() : '')

export function allQuestions(steps) {
  return steps.steps.flatMap((s) => s.questions.map((q) => ({ ...q, step: s.id })))
}

export function questionMap(steps) {
  const m = {}
  for (const q of allQuestions(steps)) m[q.key] = q
  return m
}

export function safeUrl(u) {
  try {
    const x = new URL(String(u).trim())
    return x.protocol === 'http:' || x.protocol === 'https:' ? x.toString() : null
  } catch {
    return null
  }
}

export const URL_RE = /https?:\/\/[^\s)>\]"']+/g
export function findUrls(text) {
  return (String(text || '').match(URL_RE) || []).map((u) => u.replace(/[.,;]+$/, ''))
}

// 값 안에 위험한 URL 스킴이 들어 있으면 거부 (javascript: 등). 일반 문장 속 "data:" 같은 단어는 허용
const UNSAFE = /(^|[\s("'<=])(javascript|vbscript)\s*:|(^|[\s("'<=])data:(text|application|image)\//i
export function hasUnsafeScheme(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return UNSAFE.test(s.replace(/\\n/g, ' '))
}

export function sumBudget(b) {
  if (!isObj(b)) return 0
  return ['A', 'B', 'C', 'D', 'E', 'reserve'].reduce((a, k) => a + (Number(b[k]) || 0), 0)
}
