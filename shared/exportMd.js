const link = (u) => `[${u}](${u})`
const linkify = (t) => String(t).replace(/https?:\/\/[^\s)>\]]+/g, (u) => link(u.replace(/[.,;]+$/, '')) + (/[.,;]+$/.test(u) ? u.match(/[.,;]+$/)[0] : ''))
const cell = (t) => String(t || '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function exportMd(doc) {
  const L = []
  L.push(`# ${doc.teamName} 마케팅 벤치마킹 전략서`)
  L.push(`주제: ${doc.topic}`)
  L.push(`미션: 롯데 ${doc.store || '(점포 미정)'} · 2027 상반기 4주 · 예산 2억 · 신규 유입+재방문`)
  if (doc.members.length) L.push(`조원: ${doc.members.join(', ')}`)
  if (doc.feedback?.length) {
    L.push('', '## 강사 피드백')
    for (const f of doc.feedback) L.push(`- ${f.key ? `[${f.key}] ` : ''}${f.body}`)
  }
  for (const s of doc.steps) {
    L.push('', `## STEP ${s.id} ${s.title}`)
    for (const b of s.blocks) {
      L.push(`### ${b.title}`)
      L.push(...blockMd(b))
      L.push('')
    }
  }
  L.push('## 점검 결과')
  for (const c of doc.checks) {
    L.push(`- ${c.title}: ${c.msg}`)
    for (const i of c.items || []) if (c.level !== 'ok') L.push(`  - ${i.label ? i.label + ' — ' : ''}${i.msg}`)
  }
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function blockMd(b) {
  switch (b.kind) {
    case 'empty':
      return ['(미작성)']
    case 'text':
      return [linkify(b.text)]
    case 'case':
      return [`- 무엇을 했나: ${b.what}`, `- 숫자·출처: ${linkify(b.evidence)}`, `- 왜 통했나: ${b.why}`]
    case 'low':
      return [`- 낮은 단계: ${b.picks.join(', ')}`, `- 근거: ${b.reason}`]
    case 'tools':
      return [`- 메인: ${b.main}`, `- 보조: ${b.sub.length ? b.sub.join(', ') : '없음'}`]
    case 'table': {
      const L = [`| ${b.head.join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`]
      for (const r of b.rows) L.push(`| ${r.map(cell).join(' | ')} |`)
      return L
    }
    case 'roi':
      return [`- 기대 매출 기여: ${b.value}억 원`, `- 계산식: ${b.memo}`, `- ROI = (기대매출 − 2억) ÷ 2억 × 100% = ${b.percent}%`]
    default:
      return []
  }
}
