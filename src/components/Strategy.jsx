import { useRef, useState } from 'react'
import { useWorkbook } from '../lib/store.jsx'
import { BlockView } from './View.jsx'
import { exportMd } from '../../shared/exportMd.js'
import { download, saveBlob } from '../lib/api.js'
import { pptxBlob } from '../lib/exportPptx.js'
import { LEVEL_LABEL } from '../../shared/doc.js'

const ICON = { ok: '✓', info: 'ⓘ', warn: '▲', error: '✕' }

export function CheckPanel({ checks }) {
  return (
    <aside className="checks" aria-label="점검 패널">
      <h3>점검</h3>
      <ul>
        {checks.map((c) => (
          <li key={c.id} className={'chk ' + c.level}>
            <strong>{ICON[c.level]} {c.title}</strong> <span className="lvl">{LEVEL_LABEL[c.level]}</span>
            <div className="small">{c.msg}</div>
            {c.level !== 'ok' && c.items?.length > 0 && (
              <ul className="sublist">{c.items.map((i, k) => <li key={k} className="small">{i.label ? `${i.label} — ` : ''}{i.msg}</li>)}</ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function Strategy() {
  const wb = useWorkbook()
  const { state, derived, readOnly, setMine } = wb
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)
  const canExport = readOnly || state.me.role === 'leader'
  const doc = derived.doc
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  const role = readOnly ? 'teacher' : 'student'

  async function copyMd() {
    const text = exportMd(doc)
    try { await navigator.clipboard.writeText(text); flash('Markdown을 복사했습니다') } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); flash('Markdown을 복사했습니다')
    }
  }
  async function pptx() { try { saveBlob(await pptxBlob(doc), `${doc.teamName}_전략서.pptx`) } catch (e) { flash('PPTX 생성 실패: ' + e.message) } }
  async function pdf() { try { await download(`/api/pdf?team=${state.team.id}`, `${doc.teamName}_전략서.pdf`, role) } catch (e) { flash(e.message) } }
  const exportJson = () => saveBlob(new Blob([JSON.stringify({ team: state.team.id, name: state.me.name, answers: derived.myValues }, null, 1)], { type: 'application/json' }), `${state.me.name}_내답.json`)
  async function importJson(e) {
    const f = e.target.files?.[0]; if (!f) return
    try {
      const j = JSON.parse(await f.text())
      const keys = Object.keys(j.answers || {})
      keys.forEach((k) => setMine(k, j.answers[k]))
      flash(`${keys.length}개 답을 가져왔습니다`)
    } catch { flash('JSON 파일을 읽지 못했습니다') }
    e.target.value = ''
  }

  return (
    <div className="strategy">
      <div className="main">
        <h2>{doc.teamName} 마케팅 벤치마킹 전략서</h2>
        <p className="muted">조장이 확정한 조 최종 답만 나타납니다. 주제: {doc.topic}</p>
        {state.feedback.length > 0 && (
          <div className="note">
            <strong>강사 피드백</strong>
            {state.feedback.map((f) => <p key={f.id}>{f.key ? <span className="muted">[{f.key}] </span> : null}{f.body}</p>)}
          </div>
        )}
        <div className="row toolbar">
          <button className="btn primary" onClick={copyMd} disabled={!canExport} title={canExport ? '' : '조장만 내보낼 수 있습니다'}>Markdown 복사</button>
          <button className="btn" onClick={pptx} disabled={!canExport}>PPTX 내려받기</button>
          <button className="btn" onClick={pdf} disabled={!canExport}>PDF 내려받기</button>
          <a className="btn" href={`/present/${state.team.id}${readOnly ? '?as=teacher' : ''}`} target="_blank" rel="noopener noreferrer">발표 모드</a>
          {!canExport && <span className="muted small">내보내기는 조장만 할 수 있습니다</span>}
          {msg && <span role="status" className="okc">{msg}</span>}
        </div>
        {doc.steps.map((s) => (
          <section key={s.id} className="docstep">
            <h2 className="steph">STEP {s.id} {s.title}</h2>
            {s.blocks.map((b) => <div key={b.key}><h3>{b.title}</h3><BlockView b={b} preview /></div>)}
          </section>
        ))}
        {!readOnly && (
          <section className="docstep">
            <h2 className="steph">비상용 백업</h2>
            <p className="muted small">서버가 완전히 멈췄을 때 수동 취합용으로 내 답을 파일로 저장·복원합니다.</p>
            <div className="row">
              <button className="btn" onClick={exportJson}>내 답 JSON 내보내기</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>내 답 JSON 가져오기</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importJson} />
            </div>
          </section>
        )}
      </div>
      <CheckPanel checks={derived.checks} />
    </div>
  )
}
