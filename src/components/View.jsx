import { toBlock } from '../../shared/doc.js'
import { LinkPreview } from './widgets/index.jsx'

const URL_SPLIT = /(https?:\/\/[^\s)>\]]+)/g
// 텍스트 안의 URL 을 클릭 가능한 링크로
export function Rich({ text }) {
  return (
    <span className="rich">
      {String(text || '').split(URL_SPLIT).map((p, i) => {
        if (/^https?:\/\//.test(p)) {
          const clean = p.replace(/[.,;]+$/, '')
          return <span key={i}><a href={clean} target="_blank" rel="noopener noreferrer">{clean}</a>{p.slice(clean.length)}</span>
        }
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}

export function BlockView({ b, preview = false }) {
  switch (b.kind) {
    case 'empty': return <p className="empty">(미작성)</p>
    case 'text': return <p className="pre"><Rich text={b.text} /></p>
    case 'case':
      return (
        <dl className="dl">
          <dt>무엇을 했나</dt><dd className="pre">{b.what}</dd>
          <dt>숫자·출처</dt><dd className="pre"><Rich text={b.evidence} />{preview && b.urls.slice(0, 2).map((u) => <LinkPreview key={u} url={u} />)}</dd>
          <dt>왜 통했나</dt><dd className="pre">{b.why}</dd>
        </dl>
      )
    case 'low': return <dl className="dl"><dt>낮은 단계</dt><dd>{b.picks.join(', ')}</dd><dt>근거</dt><dd className="pre">{b.reason}</dd></dl>
    case 'tools': return <dl className="dl"><dt>메인</dt><dd>{b.main}</dd><dt>보조</dt><dd>{b.sub.length ? b.sub.join(', ') : '없음'}</dd></dl>
    case 'table':
      return (
        <table className="tbl view">
          <thead><tr>{b.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="pre">{c}</td>)}</tr>)}</tbody>
        </table>
      )
    case 'roi': return <dl className="dl"><dt>기대 매출 기여</dt><dd>{b.value}억 원 (ROI {b.percent}%)</dd><dt>계산식</dt><dd className="pre">{b.memo}</dd></dl>
    default: return null
  }
}

// 질문 하나의 값을 읽기 전용으로
export function ValueView({ q, value, wb, preview }) {
  const { steps, tools } = wb.state
  const toolName = (id) => tools.tools.find((t) => t.id === id)?.name || id
  const b = toBlock(q, value, { steps, toolName })
  return <BlockView b={b} preview={preview} />
}
