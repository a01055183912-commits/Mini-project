import { Widget } from './widgets/index.jsx'
import { useWorkbook } from '../lib/store.jsx'
import { isFilled } from '../../shared/progress.js'

export function QuestionCard({ q, value, onChange, disabled, values, feedback = [] }) {
  const wb = useWorkbook()
  const { state, setResearchKey, researchKey } = wb
  const filled = isFilled(q, value)
  return (
    <section className="card" id={`q-${q.key}`}>
      <div className="row between top">
        <h3>{q.title}</h3>
        <span className="muted small">{filled ? '● 작성됨' : '○ 비어 있음'}</span>
      </div>
      <p className="hint">{q.hint}</p>
      {feedback.map((f) => <p key={f.id} className="feedback">강사 피드백 · {f.body}</p>)}
      <Widget q={q} value={value} onChange={onChange} disabled={disabled} values={values} cfg={state.steps} tools={state.tools} visited={state.visited} />
      <div className="row">
        <button type="button" className="btn" aria-pressed={researchKey === q.key} onClick={() => setResearchKey(researchKey === q.key ? null : q.key)}>자료 찾기</button>
      </div>
    </section>
  )
}
