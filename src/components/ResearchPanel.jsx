import { useState } from 'react'
import { useWorkbook } from '../lib/store.jsx'
import { allQuestions } from '../../shared/util.js'

const fill = (url, q) => url.replace('{q}', encodeURIComponent(q))

export function ResearchPanel() {
  const wb = useWorkbook()
  const { state, researchKey, setResearchKey, visit } = wb
  const [query, setQuery] = useState('')
  if (!researchKey || !state) return null
  const { links, team } = state
  const q = allQuestions(state.steps).find((x) => x.key === researchKey)
  const primary = links.byQuestion?.[researchKey] || []
  const groups = links.groups
  const ordered = [...primary.map((id) => groups.find((g) => g.id === id)).filter(Boolean), ...groups.filter((g) => !primary.includes(g.id))]
  const chips = links.teamQueries?.[team?.name] || []
  const open = (url, title) => visit(url, title, researchKey)

  return (
    <aside className="research" aria-label="자료 찾기">
      <div className="row between">
        <h3>자료 찾기{q ? ` · ${q.title}` : ''}</h3>
        <button className="btn" onClick={() => setResearchKey(null)}>닫기</button>
      </div>
      <p className="checklist">찾을 때 체크<br />① 무엇을 했나 ② 숫자가 있나 ③ 출처가 어디인가</p>
      {ordered.map((g, i) => {
        const first = i < primary.length
        const body = (
          <div>
            {g.links.some((l) => l.template) && (
              <div className="searchbox">
                <input className="input" placeholder="검색어 입력" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="검색어" />
                {chips.length > 0 && (
                  <div className="chips">
                    {chips.map((c) => {
                      const tpl = g.links.find((l) => l.template)
                      return <a key={c} className="chip" href={fill(tpl.url, c)} target="_blank" rel="noopener noreferrer" onClick={() => { setQuery(c); open(fill(tpl.url, c), `뉴스: ${c}`) }}>{c}</a>
                    })}
                  </div>
                )}
              </div>
            )}
            <ul className="links">
              {g.links.map((l, j) => {
                if (l.template) {
                  const disabled = !query.trim()
                  const url = fill(l.url, query.trim())
                  const title = l.title.replace('{q}', query.trim() || '…')
                  return (
                    <li key={j}>
                      {disabled ? <span className="muted">{title}</span> : <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => open(url, title)}><strong>{title}</strong> ↗</a>}
                    </li>
                  )
                }
                return (
                  <li key={j}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => open(l.url, l.title)}><strong>{l.title}</strong> ↗</a>
                    {l.tip && <div className="muted small">{l.tip}</div>}
                  </li>
                )
              })}
            </ul>
          </div>
        )
        return first ? (
          <section key={g.id}><h4>{g.title}</h4>{body}</section>
        ) : (
          <details key={g.id}><summary>{g.title}</summary>{body}</details>
        )
      })}
      {state.visited?.length > 0 && (
        <section>
          <h4>내가 본 자료</h4>
          <ul className="links">
            {state.visited.map((v, i) => (
              <li key={i}><a href={v.url} target="_blank" rel="noopener noreferrer"><strong>{v.title || v.url}</strong> ↗</a><div className="muted small">{v.url}</div></li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}
