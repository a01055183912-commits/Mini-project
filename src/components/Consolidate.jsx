import { useState } from 'react'
import { useWorkbook } from '../lib/store.jsx'
import { Widget } from './widgets/index.jsx'
import { ValueView } from './View.jsx'
import { api } from '../lib/api.js'
import { isFilled } from '../../shared/progress.js'

function ToolsDistribution({ wb }) {
  const { state } = wb
  const rows = state.tools.tools.map((t) => {
    let main = 0, sub = 0
    for (const m of state.members) {
      const v = state.answers[m.id]?.tools?.value
      if (v?.main === t.id) main++
      if (v?.sub?.includes(t.id)) sub++
    }
    return { t, main, sub }
  })
  const max = Math.max(1, ...rows.map((r) => r.main + r.sub))
  return (
    <div className="dist" aria-label="조원 도구 선택 분포">
      {rows.map(({ t, main, sub }) => (
        <div key={t.id} className="distrow">
          <span className="lbl">{t.name}</span>
          <span className="bar"><i className="m" style={{ width: `${(main / max) * 100}%` }} /><i className="s" style={{ width: `${(sub / max) * 100}%` }} /></span>
          <span className="small">메인 {main}명 / 보조 {sub}명</span>
        </div>
      ))}
      <p className="muted small">■ 진한 막대 = 메인, ▨ 연한 막대 = 보조</p>
    </div>
  )
}

function TeacherFeedback({ wb, qkey }) {
  const [text, setText] = useState('')
  const { state } = wb
  const mine = state.feedback.filter((f) => f.key === qkey)
  async function add() {
    if (!text.trim()) return
    await api('/api/teacher/feedback', { method: 'POST', role: 'teacher', body: { team_id: state.team.id, key: qkey, body: text } })
    setText(''); wb.refresh()
  }
  async function del(id) { await api(`/api/teacher/feedback/${id}`, { method: 'DELETE', role: 'teacher' }); wb.refresh() }
  return (
    <div className="fbform">
      {mine.map((f) => <p key={f.id} className="feedback">피드백 · {f.body} <button className="btn small" onClick={() => del(f.id)}>삭제</button></p>)}
      <div className="row">
        <input className="input" placeholder="이 질문에 피드백 남기기" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}>남기기</button>
      </div>
    </div>
  )
}

function Row({ q }) {
  const wb = useWorkbook()
  const { state, derived, vote, setFinal, readOnly } = wb
  const [editing, setEditing] = useState(false)
  const me = state.me
  const leader = me.role === 'leader' && !readOnly
  const teacher = me.role === 'teacher'
  const final = derived.finalValues[q.key]
  const finalSrc = state.finals[q.key]?.source_member_id
  const feedback = state.feedback.filter((f) => f.key === q.key)
  const isText = q.type === 'text' || q.type === 'long'

  return (
    <section className="crow" id={`g-${q.key}`}>
      <h3>{q.title}</h3>
      {!teacher && feedback.map((f) => <p key={f.id} className="feedback">강사 피드백 · {f.body}</p>)}
      {teacher && <TeacherFeedback wb={wb} qkey={q.key} />}
      {q.key === 'tools' && <ToolsDistribution wb={wb} />}
      <div className="hscroll">
        <div className="col final">
          <div className="colhead">조 최종 {isFilled(q, final) ? '● 확정' : '○ 미확정'}</div>
          {editing && leader ? (
            <Widget q={q} value={final} onChange={(v) => setFinal(q.key, v)} values={derived.finalValues} cfg={state.steps} tools={state.tools} visited={[]} />
          ) : <ValueView q={q} value={final} wb={wb} />}
          {leader && (
            <div className="row">
              <button className="btn" onClick={() => setEditing((e) => !e)}>{editing ? '편집 닫기' : '직접 편집'}</button>
              {isFilled(q, final) && <button className="btn" onClick={() => { if (confirm('조 최종 답을 지울까요?')) setFinal(q.key, '', null, true) }}>지우기</button>}
            </div>
          )}
        </div>
        {state.members.map((m) => {
          const v = state.answers[m.id]?.[q.key]?.value
          const n = state.votes.filter((x) => x.key === q.key && x.target_member_id === m.id).length
          const mine = state.votes.some((x) => x.member_id === me.id && x.key === q.key && x.target_member_id === m.id)
          const has = isFilled(q, v) || v != null
          return (
            <div key={m.id} className="col">
              <div className="colhead">{m.display_name}{m.role === 'leader' ? ' (조장)' : ''}{finalSrc === m.id ? ' · 최종 채택' : ''}</div>
              <ValueView q={q} value={v} wb={wb} />
              <div className="row">
                {!readOnly && has && <button className="btn" aria-pressed={mine} onClick={() => vote(q.key, m.id)}>{mine ? '👍 추천함' : '👍 추천'} {n}</button>}
                {readOnly && n > 0 && <span className="small">👍 추천 {n}</span>}
                {leader && has && <button className="btn primary" onClick={() => setFinal(q.key, v, m.id, true)}>조 최종으로</button>}
                {leader && has && isText && <button className="btn" onClick={() => setFinal(q.key, [final, v].filter((x) => typeof x === 'string' && x.trim()).join('\n'), m.id, true)}>이어 붙이기</button>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function Consolidate() {
  const { state, readOnly } = useWorkbook()
  const me = state.me
  const hasSub = !!state.members.some((m) => state.answers[m.id]?.tools?.value?.sub?.length) || !!state.finals.tools?.value?.sub?.length
  return (
    <div>
      <h2>조 취합</h2>
      <p className="muted">{me.role === 'leader' ? '조장: 조원 답 아래 [조 최종으로]로 확정하거나 [직접 편집]으로 합쳐 쓸 수 있습니다.' : readOnly ? '읽기 전용입니다.' : '조원 답을 비교하고 마음에 드는 답을 추천하세요. 확정은 조장이 합니다.'}</p>
      {state.steps.steps.map((s) => (
        <div key={s.id}>
          <h2 className="steph">STEP {s.id} · {s.title}</h2>
          {s.questions.filter((q) => !(q.requiredIf === 'hasSub' && !hasSub)).map((q) => <Row key={q.key} q={q} />)}
        </div>
      ))}
    </div>
  )
}
