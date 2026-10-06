import { useCallback, useEffect, useState } from 'react'
import { api, setToken, getToken, clearToken } from '../lib/api.js'
import { go } from '../lib/router.js'
import { WorkbookProvider } from '../lib/store.jsx'
import { WorkbookBody } from './Workbook.jsx'
import { TopBar, Timer } from './TopBar.jsx'
import { exportAllZip } from '../lib/exportZip.js'

function Login({ onDone }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault()
    try { const r = await api('/api/teacher/login', { method: 'POST', body: { password: pw } }); setToken('teacher', r.token); onDone() } catch (e2) { setErr(e2.message) }
  }
  return (
    <main className="join">
      <h1>강사 로그인</h1>
      <form onSubmit={submit} className="stack">
        <label>강사 비밀번호<input className="input big" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
        {err && <p className="err">✕ {err}</p>}
        <button className="btn primary big" disabled={!pw}>들어가기</button>
      </form>
      <p className="small muted"><a href="/join" onClick={(e) => { e.preventDefault(); go('/join') }}>학생 입장 화면</a></p>
    </main>
  )
}

function useOverview() {
  const [ov, setOv] = useState(null)
  const [err, setErr] = useState('')
  const refresh = useCallback(async () => {
    try { const o = await api('/api/teacher/overview', { role: 'teacher' }); o.offset = o.now - Date.now(); setOv(o); setErr('') }
    catch (e) { if (e.status === 401 || e.status === 403) { clearToken('teacher'); go('/teacher', true); location.reload() } else setErr(e.message) }
  }, [])
  useEffect(() => {
    refresh()
    let t
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(getToken('teacher'))}`)
    es.onmessage = () => { clearTimeout(t); t = setTimeout(refresh, 150) }
    const poll = setInterval(refresh, 5000)
    return () => { es.close(); clearInterval(poll); clearTimeout(t) }
  }, [refresh])
  return { ov, err, refresh }
}

const pctText = (p) => (p >= 100 ? `✓ ${p}%` : `${p}%`)

function Matrix({ ov }) {
  const steps = ov.steps.steps
  return (
    <div className="hscroll">
      <table className="tbl matrix">
        <thead><tr><th>조 / 이름</th>{steps.map((s) => <th key={s.id}>STEP {s.id}<div className="small muted">{s.title}</div></th>)}<th>전체</th></tr></thead>
        {ov.teams.map((t) => {
          const avg = (fn) => (t.members.length ? Math.round(t.members.reduce((a, m) => a + fn(m), 0) / t.members.length) : 0)
          return (
            <tbody key={t.id}>
              <tr className="teamrow"><th>{t.name} <span className="muted small">({t.members.length}명)</span></th>{steps.map((s) => <td key={s.id}>{pctText(avg((m) => m.steps[s.id]))}</td>)}<td><strong>{pctText(avg((m) => m.overall))}</strong></td></tr>
              {t.members.map((m) => (
                <tr key={m.id}><td>　{m.display_name}{m.role === 'leader' ? ' (조장)' : ''}</td>{steps.map((s) => <td key={s.id}>{pctText(m.steps[s.id])}</td>)}<td>{pctText(m.overall)}</td></tr>
              ))}
              <tr className="finalrow"><td>　<strong>{t.name} 조 최종(확정)</strong></td>{steps.map((s) => <td key={s.id}>{pctText(t.final.steps[s.id])}</td>)}<td><strong>{pctText(t.final.overall)}</strong></td></tr>
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function Controls({ ov, refresh }) {
  const [min, setMin] = useState(ov.settings.timer.durationMin || 10)
  const locked = ov.settings.locked
  const act = async (path, body) => { await api(path, { method: 'POST', role: 'teacher', body }); refresh() }
  const toggleStep = (id) => {
    const steps = locked.steps.includes(id) ? locked.steps.filter((x) => x !== id) : [...locked.steps, id]
    act('/api/teacher/lock', { all: locked.all, steps })
  }
  return (
    <div className="controls">
      <fieldset>
        <legend>타이머</legend>
        <div className="row">
          <input className="input num" type="number" min="1" max="240" value={min} onChange={(e) => setMin(e.target.value)} aria-label="분" /> 분
          <button className="btn primary" onClick={() => act('/api/teacher/timer', { action: 'start', minutes: Number(min) })}>시작</button>
          <button className="btn" onClick={() => act('/api/teacher/timer', { action: 'stop', minutes: Number(min) })}>정지</button>
          <Timer timer={ov.settings.timer} serverNow={() => Date.now() + ov.offset} />
        </div>
      </fieldset>
      <fieldset>
        <legend>입력 잠금 (발표 준비)</legend>
        <div className="row">
          <label className="chip plain"><input type="checkbox" checked={locked.all} onChange={() => act('/api/teacher/lock', { all: !locked.all, steps: locked.steps })} />{locked.all ? '🔒 ' : ''}전체 잠금</label>
          {ov.steps.steps.map((s) => (
            <label key={s.id} className="chip plain"><input type="checkbox" checked={locked.all || locked.steps.includes(s.id)} disabled={locked.all} onChange={() => toggleStep(s.id)} />STEP {s.id}</label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function Progress({ ov, refresh }) {
  return (
    <div>
      <h2>진행 현황</h2>
      <Controls ov={ov} refresh={refresh} />
      <Matrix ov={ov} />
      <details>
        <summary>조장 지정·조원 삭제</summary>
        {ov.teams.map((t) => (
          <div key={t.id}>
            <h4>{t.name}</h4>
            <ul>{t.members.map((m) => (
              <li key={m.id}>{m.display_name}{m.role === 'leader' ? ' (조장)' : ''}{' '}
                {m.role !== 'leader' && <button className="btn small" onClick={async () => { await api('/api/teacher/leader', { method: 'POST', role: 'teacher', body: { member_id: m.id } }); refresh() }}>조장으로</button>}{' '}
                <button className="btn small" onClick={async () => { if (confirm(`${m.display_name} 님을 삭제할까요? 작성한 답도 함께 삭제됩니다.`)) { await api(`/api/teacher/member/${m.id}`, { method: 'DELETE', role: 'teacher' }); refresh() } }}>삭제</button>
              </li>))}</ul>
          </div>
        ))}
      </details>
    </div>
  )
}

function TeamView({ ov }) {
  const [team, setTeam] = useState(ov.teams[0]?.id)
  const [tab, setTab] = useState('group')
  return (
    <div>
      <div className="row tabsrow">{ov.teams.map((t) => <button key={t.id} className={'btn' + (team === t.id ? ' primary' : '')} aria-pressed={team === t.id} onClick={() => setTeam(t.id)}>{t.name}</button>)}</div>
      {team && (
        <WorkbookProvider key={team} mode="teacher" teamId={team}>
          <div className="embedded"><WorkbookBody tab={tab} onTab={setTab} /></div>
        </WorkbookProvider>
      )}
    </div>
  )
}

// ── 설정 ──
function Settings({ ov, refresh }) {
  const [teams, setTeams] = useState(() => structuredClone(ov.settings.teams))
  const [so, setSo] = useState(() => structuredClone(ov.settings.stepsOverride || { steps: {}, questions: {} }))
  const [links, setLinks] = useState(() => structuredClone(ov.links))
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  const put = async (body, m) => { try { await api('/api/teacher/settings', { method: 'PUT', role: 'teacher', body }); await refresh(); flash(m) } catch (e) { flash(e.message) } }
  const joinUrl = `${location.origin}/join?code=${ov.cls.code}`

  return (
    <div className="settings">
      <h2>설정</h2>
      {msg && <p role="status" className="okc">{msg}</p>}

      <section className="card">
        <h3>수업 코드</h3>
        <p>현재 코드 <strong className="code">{ov.cls.code}</strong> · 학생 입장 주소 <a href={joinUrl}>{joinUrl}</a></p>
        <div className="row">
          <button className="btn" onClick={async () => { const r = await api('/api/teacher/code', { method: 'POST', role: 'teacher', body: {} }); await refresh(); flash(`새 코드 ${r.code}`) }}>코드 새로 만들기</button>
          <input className="input" style={{ maxWidth: 160 }} placeholder="직접 지정" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn" disabled={!code} onClick={async () => { try { await api('/api/teacher/code', { method: 'POST', role: 'teacher', body: { code } }); await refresh(); setCode(''); flash('코드를 바꿨습니다') } catch (e) { flash(e.message) } }}>적용</button>
        </div>
      </section>

      <section className="card">
        <h3>조 · 주제</h3>
        {teams.map((t, i) => (
          <div key={t.id} className="stack tight">
            <div className="row"><input className="input" style={{ maxWidth: 140 }} value={t.name} onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="조 이름" />
              <button className="btn small" onClick={() => setTeams(teams.filter((_, j) => j !== i))} disabled={teams.length <= 1}>조 삭제</button></div>
            <textarea className="input" rows={2} value={t.topic} onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)))} aria-label={`${t.name} 주제`} />
          </div>
        ))}
        <div className="row">
          <button className="btn" onClick={() => setTeams([...teams, { id: String(Math.max(0, ...teams.map((t) => Number(t.id) || 0)) + 1), name: `${teams.length + 1}조`, topic: '' }])}>+ 조 추가</button>
          <button className="btn primary" onClick={() => put({ teams }, '조·주제를 저장했습니다')}>저장</button>
        </div>
        <p className="muted small">조를 삭제해도 이미 입장한 학생의 데이터는 남아 있지만 화면에서는 보이지 않습니다.</p>
      </section>

      <section className="card">
        <h3>질문 문구 (steps.json)</h3>
        <p className="muted small">질문의 key는 바꿀 수 없고, 제목·가이드 문구만 수정합니다.</p>
        {ov.baseSteps.steps.map((s) => (
          <details key={s.id}>
            <summary>STEP {s.id} · {so.steps?.[s.id] ?? s.title}</summary>
            <label className="sub">STEP 제목<input className="input" value={so.steps?.[s.id] ?? s.title} onChange={(e) => setSo({ ...so, steps: { ...so.steps, [s.id]: e.target.value } })} /></label>
            {s.questions.map((q) => {
              const o = so.questions?.[q.key] || {}
              const setQ = (patch) => setSo({ ...so, questions: { ...so.questions, [q.key]: { title: o.title ?? q.title, hint: o.hint ?? q.hint, ...patch } } })
              return (
                <div key={q.key} className="stack tight">
                  <label className="sub">질문 제목 <span className="muted small">({q.key})</span><input className="input" value={o.title ?? q.title} onChange={(e) => setQ({ title: e.target.value })} /></label>
                  <label className="sub">가이드 문구<textarea className="input" rows={2} value={o.hint ?? q.hint} onChange={(e) => setQ({ hint: e.target.value })} /></label>
                </div>
              )
            })}
          </details>
        ))}
        <div className="row">
          <button className="btn primary" onClick={() => put({ stepsOverride: so }, '질문 문구를 저장했습니다')}>저장</button>
          <button className="btn" onClick={() => { if (confirm('질문 문구를 기본값으로 되돌릴까요?')) { const e = { steps: {}, questions: {} }; setSo(e); put({ stepsOverride: e }, '기본값으로 되돌렸습니다') } }}>기본값으로</button>
        </div>
      </section>

      <section className="card">
        <h3>자료 찾기 링크</h3>
        {links.groups.map((g, gi) => (
          <details key={g.id}>
            <summary>{g.title} ({g.links.length})</summary>
            <label className="sub">그룹 이름<input className="input" value={g.title} onChange={(e) => setLinks({ ...links, groups: links.groups.map((x, j) => (j === gi ? { ...x, title: e.target.value } : x)) })} /></label>
            {g.links.map((l, li) => {
              const setL = (patch) => setLinks({ ...links, groups: links.groups.map((x, j) => (j === gi ? { ...x, links: x.links.map((y, k) => (k === li ? { ...y, ...patch } : y)) } : x)) })
              return (
                <div key={li} className="row linkedit">
                  <input className="input" value={l.title} onChange={(e) => setL({ title: e.target.value })} aria-label="링크 제목" />
                  <input className="input" value={l.url} onChange={(e) => setL({ url: e.target.value })} aria-label="URL" />
                  <input className="input" value={l.tip || ''} onChange={(e) => setL({ tip: e.target.value })} placeholder="한 줄 팁" aria-label="팁" />
                  <button className="btn small" onClick={() => setLinks({ ...links, groups: links.groups.map((x, j) => (j === gi ? { ...x, links: x.links.filter((_, k) => k !== li) } : x)) })}>삭제</button>
                </div>
              )
            })}
            <div className="row">
              <button className="btn small" onClick={() => setLinks({ ...links, groups: links.groups.map((x, j) => (j === gi ? { ...x, links: [...x.links, { title: '새 링크', url: 'https://' }] } : x)) })}>+ 링크 추가</button>
              <button className="btn small" onClick={() => { if (confirm('이 그룹을 삭제할까요?')) setLinks({ ...links, groups: links.groups.filter((_, j) => j !== gi) }) }}>그룹 삭제</button>
            </div>
          </details>
        ))}
        <div className="row"><button className="btn small" onClick={() => setLinks({ ...links, groups: [...links.groups, { id: 'g' + Date.now(), title: '새 그룹', links: [] }] })}>+ 그룹 추가</button></div>
        <h4>조별 추천 검색어 (한 줄에 하나)</h4>
        {ov.settings.teams.map((t) => (
          <label key={t.id} className="sub">{t.name}
            <textarea className="input" rows={3} value={(links.teamQueries?.[t.name] || []).join('\n')} onChange={(e) => setLinks({ ...links, teamQueries: { ...links.teamQueries, [t.name]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) } })} />
          </label>
        ))}
        <div className="row">
          <button className="btn primary" onClick={() => put({ links }, '링크를 저장했습니다')}>저장</button>
          <button className="btn" onClick={() => { if (confirm('링크를 기본값으로 되돌릴까요?')) { setLinks(structuredClone(ov.baseLinks)); put({ links: null }, '기본값으로 되돌렸습니다') } }}>기본값으로</button>
        </div>
      </section>

      <section className="card danger">
        <h3>수업 종료 후 데이터 삭제</h3>
        <p>입장한 학생, 답, 조 최종, 피드백을 모두 지웁니다. 되돌릴 수 없습니다. 먼저 [내보내기]에서 ZIP을 받아 두세요.</p>
        <button className="btn" onClick={async () => { if (prompt("정말 삭제하려면 DELETE 를 입력하세요") === 'DELETE') { await api('/api/teacher/purge', { method: 'POST', role: 'teacher', body: { confirm: 'DELETE' } }); await refresh(); flash('모든 데이터를 삭제했습니다') } }}>데이터 전체 삭제</button>
      </section>
    </div>
  )
}

function Exports() {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  return (
    <div>
      <h2>내보내기</h2>
      <p>조별 전략서(Markdown · PPTX · PDF)와 전체 응답 CSV를 ZIP 하나로 내려받습니다. 조 최종으로 확정된 답이 전략서에 들어갑니다.</p>
      <button className="btn primary" disabled={!!busy} onClick={async () => { setErr(''); try { await exportAllZip(setBusy); setBusy('') } catch (e) { setErr(e.message); setBusy('') } }}>ZIP 내려받기</button>
      {busy && <p role="status">{busy}</p>}
      {err && <p className="err">✕ {err}</p>}
    </div>
  )
}

export function Teacher() {
  const [authed, setAuthed] = useState(!!getToken('teacher'))
  if (!authed) return <Login onDone={() => setAuthed(true)} />
  return <TeacherApp onLogout={() => { clearToken('teacher'); setAuthed(false) }} />
}

function TeacherApp({ onLogout }) {
  const { ov, err, refresh } = useOverview()
  const [tab, setTab] = useState('progress')
  useEffect(() => { document.title = '강사 대시보드' }, [])
  if (!ov) return <main className="center">{err ? <p className="err">{err}</p> : <p>불러오는 중…</p>}</main>
  const tabs = [['progress', '진행 현황'], ['team', '조 보기'], ['settings', '설정'], ['export', '내보내기']]
  return (
    <>
      <header className="topbar">
        <div className="left"><strong>3-8 마케팅 벤치마킹 워크북 · 강사</strong><span className="muted"> · 수업 코드 {ov.cls.code}</span></div>
        <div className="mid">{ov.steps.mission.line}</div>
        <div className="right"><Timer timer={ov.settings.timer} serverNow={() => Date.now() + ov.offset} /><button className="btn" onClick={onLogout}>로그아웃</button></div>
      </header>
      <div className="shell teacher">
        <nav className="stepnav">
          {tabs.map(([id, label]) => <button key={id} className={'tab' + (tab === id ? ' on' : '')} aria-current={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        <main className="content wide">
          {tab === 'progress' && <Progress ov={ov} refresh={refresh} />}
          {tab === 'team' && <TeamView ov={ov} />}
          {tab === 'settings' && <Settings ov={ov} refresh={refresh} />}
          {tab === 'export' && <Exports />}
        </main>
      </div>
    </>
  )
}
