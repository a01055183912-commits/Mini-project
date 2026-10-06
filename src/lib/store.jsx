import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, clearToken, getToken, store } from './api.js'
import { go } from './router.js'
import { computeProgress } from '../../shared/progress.js'
import { runChecks } from '../../shared/checks.js'
import { buildDoc } from '../../shared/doc.js'

const Ctx = createContext(null)
export const useWorkbook = () => useContext(Ctx)

const valuesOf = (answers) => Object.fromEntries(Object.entries(answers || {}).map(([k, v]) => [k, v.value]))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// mode: 'student' (내 조) | 'teacher' (읽기 전용으로 특정 조 보기)
export function WorkbookProvider({ mode = 'student', teamId, children }) {
  const role = mode === 'teacher' ? 'teacher' : 'student'
  const readOnly = mode === 'teacher'
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('saved') // saved | saving | offline | error | locked
  const [online, setOnline] = useState(true)
  const [drafts, setDrafts] = useState({})
  const [finalDrafts, setFinalDrafts] = useState({})
  const [researchKey, setResearchKey] = useState(null)
  const offset = useRef(0)
  const draftsRef = useRef({})
  const finalRef = useRef({})
  const timers = useRef({})
  const meRef = useRef(null)
  const refreshTimer = useRef(null)

  const path = readOnly ? `/api/teacher/team/${teamId}` : '/api/state'

  const refresh = useCallback(async () => {
    try {
      const s = await api(path, { role })
      offset.current = s.now - Date.now()
      meRef.current = s.me
      setState(s)
      setOnline(true)
      setError(null)
    } catch (e) {
      if (e.status === 401) { clearToken(role); go(readOnly ? '/teacher' : '/join', true); return }
      if (e.status === 0) setOnline(false)
      else setError(e.message)
    }
  }, [path, role, readOnly])

  // 최초 로드 + 실시간(SSE) + 보조 폴링
  useEffect(() => {
    refresh()
    const tok = getToken(role)
    let es
    const schedule = () => { clearTimeout(refreshTimer.current); refreshTimer.current = setTimeout(refresh, 120) }
    if (tok && typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/stream?token=${encodeURIComponent(tok)}`)
      es.onmessage = schedule
    }
    const poll = setInterval(refresh, 6000)
    const on = () => { setOnline(true); refresh(); flushAll() }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { es?.close(); clearInterval(poll); clearTimeout(refreshTimer.current); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  // ── 내 답 저장 (자동 저장 + 오프라인 큐) ──
  const pendingKey = () => `lift.pending.${meRef.current?.id}`
  const persist = () => { const k = pendingKey(); Object.keys(draftsRef.current).length ? store.set(k, JSON.stringify(draftsRef.current)) : store.del(k) }

  const patchMine = (key, value) =>
    setState((s) => {
      if (!s) return s
      const mine = { ...(s.answers[s.me.id] || {}) }
      const empty = value == null || value === ''
      if (empty) delete mine[key]
      else mine[key] = { value, updated_at: new Date().toISOString() }
      return { ...s, answers: { ...s.answers, [s.me.id]: mine } }
    })

  const flush = useCallback(async (key) => {
    const value = draftsRef.current[key]
    if (value === undefined) return
    setStatus('saving')
    try {
      await api(`/api/answers/${key}`, { method: 'PUT', body: { value } })
      if (same(draftsRef.current[key], value)) {
        const d = { ...draftsRef.current }; delete d[key]; draftsRef.current = d; setDrafts(d); patchMine(key, value); persist()
      }
      setStatus(Object.keys(draftsRef.current).length ? 'saving' : 'saved')
    } catch (e) {
      if (e.status === 423) {
        const d = { ...draftsRef.current }; delete d[key]; draftsRef.current = d; setDrafts(d); persist(); setStatus('locked'); refresh()
      } else if (e.status === 0) setStatus('offline')
      else if (e.status === 401) { clearToken('student'); go('/join', true) }
      else setStatus('error')
    }
  }, [refresh])

  function flushAll() { Object.keys(draftsRef.current).forEach((k) => flush(k)) }

  const setMine = useCallback((key, value) => {
    if (readOnly) return
    draftsRef.current = { ...draftsRef.current, [key]: value }
    setDrafts(draftsRef.current)
    persist()
    setStatus((s) => (s === 'offline' ? s : 'saving'))
    clearTimeout(timers.current[key])
    timers.current[key] = setTimeout(() => flush(key), 800)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, flush])

  // 저장 못 한 임시 답 복구 + 재시도
  const loaded = useRef(false)
  useEffect(() => {
    if (!state || loaded.current || readOnly) return
    loaded.current = true
    try {
      const p = JSON.parse(store.get(`lift.pending.${state.me.id}`) || 'null')
      if (p && Object.keys(p).length) { draftsRef.current = p; setDrafts(p); flushAll() }
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  useEffect(() => {
    const t = setInterval(() => { if (Object.keys(draftsRef.current).length) flushAll() }, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flush])

  // ── 조 최종 (조장) ──
  const saveFinal = useCallback(async (key, value, source = null) => {
    try {
      await api(`/api/finals/${key}`, { method: 'PUT', body: { value, source_member_id: source } })
      if (same(finalRef.current[key], value)) { const d = { ...finalRef.current }; delete d[key]; finalRef.current = d; setFinalDrafts(d) }
      setStatus('saved')
      refresh()
    } catch (e) { setStatus(e.status === 0 ? 'offline' : 'error') }
  }, [refresh])
  const setFinal = useCallback((key, value, source = null, immediate = false) => {
    if (readOnly) return
    finalRef.current = { ...finalRef.current, [key]: value }
    setFinalDrafts(finalRef.current)
    clearTimeout(timers.current['f' + key])
    if (immediate) saveFinal(key, value, source)
    else { setStatus('saving'); timers.current['f' + key] = setTimeout(() => saveFinal(key, value, source), 800) }
  }, [readOnly, saveFinal])

  const vote = useCallback(async (key, target) => { try { await api('/api/votes', { method: 'PUT', body: { key, target_member_id: target } }); refresh() } catch (e) { setError(e.message) } }, [refresh])

  const visit = useCallback(async (url, title, key) => {
    if (readOnly) return
    try { const r = await api('/api/visited', { method: 'POST', body: { url, title, question_key: key } }); setState((s) => (s ? { ...s, visited: r.visited } : s)) } catch { /* 기록 실패는 무시 */ }
  }, [readOnly])

  // 파생 값
  const derived = useMemo(() => {
    if (!state) return null
    const me = state.me
    const myServer = valuesOf(state.answers[me.id])
    const myValues = { ...myServer, ...drafts }
    const finalServer = valuesOf(state.finals)
    const finalValues = { ...finalServer, ...finalDrafts }
    const myProgress = computeProgress(state.steps, myValues)
    const finalProgress = computeProgress(state.steps, finalValues)
    const checks = runChecks({ values: finalValues, steps: state.steps, tools: state.tools, progress: finalProgress })
    const doc = buildDoc({ team: state.team, members: state.members.map((m) => m.display_name), values: finalValues, steps: state.steps, tools: state.tools, checks, feedback: state.feedback })
    return { myValues, finalValues, myProgress, finalProgress, checks, doc }
  }, [state, drafts, finalDrafts])

  const serverNow = useCallback(() => Date.now() + offset.current, [])

  const value = { mode, readOnly, state, error, status, online, derived, setMine, setFinal, vote, visit, refresh, serverNow, researchKey, setResearchKey, drafts, finalDrafts, teamId: state?.team?.id }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
