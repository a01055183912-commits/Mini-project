import { useEffect, useState } from 'react'
import { api, setToken, getToken } from '../lib/api.js'
import { go } from '../lib/router.js'

export function Join() {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('code') || '')
  const [teams, setTeams] = useState(null)
  const [team, setTeam] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [dup, setDup] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (getToken('student')) go('/w', true) }, [])
  useEffect(() => {
    const c = code.trim()
    if (c.length < 4) { setTeams(null); return }
    const t = setTimeout(() => api(`/api/join-info?code=${encodeURIComponent(c)}`).then((r) => { setTeams(r.ok ? r.teams : false); if (r.ok && !team && r.teams.length === 1) setTeam(r.teams[0].id) }).catch(() => setTeams(null)), 300)
    return () => clearTimeout(t)
  }, [code])

  async function submit(mode) {
    setErr(''); setBusy(true)
    try {
      const r = await api('/api/join', { method: 'POST', body: { code, team, name, mode } })
      setToken('student', r.token)
      go('/w')
    } catch (e) {
      if (e.status === 409) setDup(true)
      else setErr(e.message)
    } finally { setBusy(false) }
  }

  return (
    <main className="join">
      <h1>3-8 마케팅 벤치마킹 워크북</h1>
      <p className="muted">수업 코드, 조, 이름만 입력하면 바로 시작합니다.</p>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="stack">
        <label>수업 코드
          <input className="input big" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setDup(false) }} placeholder="예: LIFT38" autoFocus autoCapitalize="characters" maxLength={12} />
        </label>
        {teams === false && <p className="err">✕ 수업 코드가 맞지 않습니다</p>}
        {teams && (
          <fieldset>
            <legend>조 선택</legend>
            <div className="teams">
              {teams.map((t) => (
                <label key={t.id} className={'teamopt' + (team === t.id ? ' on' : '')}>
                  <input type="radio" name="team" checked={team === t.id} onChange={() => { setTeam(t.id); setDup(false) }} />
                  <strong>{team === t.id ? '● ' : '○ '}{t.name}</strong>
                  <span className="muted small">{t.topic}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label>이름
          <input className="input big" value={name} onChange={(e) => { setName(e.target.value); setDup(false) }} maxLength={20} placeholder="이름" />
        </label>
        {err && <p className="err">✕ {err}</p>}
        {dup && (
          <div className="note warn">
            <p>같은 조에 '{name.trim()}' 님이 이미 있습니다. 어느 쪽인가요?</p>
            <div className="row">
              <button type="button" className="btn primary" onClick={() => submit('resume')}>제가 맞아요 (이어서 작성)</button>
              <button type="button" className="btn" onClick={() => submit('new')}>다른 사람입니다 ({name.trim()}(2)로 입장)</button>
            </div>
          </div>
        )}
        <button className="btn primary big" disabled={busy || !teams || !team || !name.trim()}>입장하기</button>
      </form>
      <p className="small muted"><a href="/teacher" onClick={(e) => { e.preventDefault(); go('/teacher') }}>강사 화면</a></p>
    </main>
  )
}
