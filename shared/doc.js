import { isObj, str, findUrls, sumBudget } from './util.js'
import { hasSub } from './progress.js'
import { roiPercent } from './checks.js'

// 조 최종 답(values)을 렌더러(Markdown/PPTX/PDF) 공용 문서 모델로 변환
export function buildDoc({ team, members = [], values, steps, tools, checks = [], feedback = [] }) {
  const toolName = (id) => tools.tools.find((t) => t.id === id)?.name || id
  const out = []
  for (const s of steps.steps) {
    const blocks = []
    for (const q of s.questions) {
      if (q.requiredIf === 'hasSub' && !hasSub(values)) continue
      blocks.push({ key: q.key, title: q.title, ...toBlock(q, values[q.key], { steps, toolName, values }) })
    }
    out.push({ id: s.id, title: s.title, blocks })
  }
  return {
    teamName: team.name,
    topic: team.topic || '',
    mission: steps.mission.line,
    store: str(values.store),
    members,
    steps: out,
    checks,
    feedback,
    tools,
  }
}

export function toBlock(q, v, { steps, toolName }) {
  if (v == null || (typeof v === 'string' && !str(v))) return { kind: 'empty' }
  switch (q.type) {
    case 'case': {
      if (!isObj(v)) return { kind: 'empty' }
      return { kind: 'case', what: str(v.what), evidence: str(v.evidence), why: str(v.why), urls: findUrls(v.evidence) }
    }
    case 'low':
      return isObj(v) ? { kind: 'low', picks: v.picks || [], reason: str(v.reason) } : { kind: 'empty' }
    case 'tools':
      return isObj(v) && v.main ? { kind: 'tools', main: toolName(v.main), sub: (v.sub || []).map(toolName), mainId: v.main, subIds: v.sub || [] } : { kind: 'empty' }
    case 'plan':
      return isObj(v)
        ? { kind: 'table', head: ['시기', '할 일'], rows: steps.planSlots.map((p) => [p.label, str(v[p.id])]) }
        : { kind: 'empty' }
    case 'kpi':
      return isObj(v) && Array.isArray(v.rows)
        ? { kind: 'table', head: ['지표', '목표값', '측정 방법', '구분'], rows: v.rows.filter((r) => str(r.metric) || str(r.method)).map((r) => [str(r.metric), str(r.target), str(r.method), r.lead ? '선행' : '후행']) }
        : { kind: 'empty' }
    case 'budget': {
      if (!isObj(v)) return { kind: 'empty' }
      const rows = ['A', 'B', 'C', 'D', 'E'].map((k) => [toolName(k), (Number(v[k]) || 0).toLocaleString('ko-KR')])
      rows.push(['예비비', (Number(v.reserve) || 0).toLocaleString('ko-KR')])
      rows.push(['합계', sumBudget(v).toLocaleString('ko-KR')])
      return { kind: 'table', head: ['항목', '금액(만 원)'], rows }
    }
    case 'roi':
      return isObj(v) && Number(v.value) > 0
        ? { kind: 'roi', value: Number(v.value), memo: str(v.memo), percent: roiPercent(v.value) }
        : { kind: 'empty' }
    default:
      return { kind: 'text', text: str(v) }
  }
}

export const LEVEL_LABEL = { ok: '통과', info: '참고', warn: '경고', error: '오류' }
