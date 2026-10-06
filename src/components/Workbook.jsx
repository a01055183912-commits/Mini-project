import { useEffect } from 'react'
import { WorkbookProvider, useWorkbook } from '../lib/store.jsx'
import { TopBar } from './TopBar.jsx'
import { QuestionCard } from './QuestionCard.jsx'
import { ResearchPanel } from './ResearchPanel.jsx'
import { Consolidate } from './Consolidate.jsx'
import { Strategy } from './Strategy.jsx'
import { getQuery, setQuery } from '../lib/router.js'

function StepView({ step, onNav }) {
  const wb = useWorkbook()
  const { state, derived, setMine } = wb
  const locked = state.settings.locked.all || state.settings.locked.steps.includes(step.id)
  const t = derived.myValues.tools
  const hasSub = !!t?.sub?.length
  const toolName = (id) => state.tools.tools.find((x) => x.id === id)?.name
  const idx = state.steps.steps.findIndex((s) => s.id === step.id)
  const prog = derived.myProgress.steps[step.id]
  return (
    <div>
      <h2>STEP {step.id} · {step.title} <span className="muted small">{prog.pct}% ({prog.done}/{prog.total})</span></h2>
      {locked && <p className="note warn">🔒 강사가 이 STEP의 입력을 잠갔습니다. 읽기만 할 수 있습니다.</p>}
      {step.id === 4 && (
        <p className="note">{t?.main ? <>메인: <strong>{toolName(t.main)}</strong> / 보조: <strong>{hasSub ? t.sub.map(toolName).join(', ') : '없음'}</strong></> : 'STEP 3에서 도구를 먼저 선택하세요.'}</p>
      )}
      {step.questions.map((q) => {
        if (q.requiredIf === 'hasSub' && !hasSub) return null
        return <QuestionCard key={q.key} q={q} value={derived.myValues[q.key]} onChange={(v) => setMine(q.key, v)} disabled={locked} values={derived.myValues} feedback={state.feedback.filter((f) => f.key === q.key)} />
      })}
      <div className="row between pager">
        <button className="btn" disabled={idx === 0} onClick={() => onNav(`step${state.steps.steps[idx - 1].id}`)}>← 이전 STEP</button>
        <button className="btn primary" onClick={() => onNav(idx === state.steps.steps.length - 1 ? 'group' : `step${state.steps.steps[idx + 1].id}`)}>{idx === state.steps.steps.length - 1 ? '조 취합으로 →' : '다음 STEP →'}</button>
      </div>
    </div>
  )
}

export function WorkbookBody({ tab, onTab }) {
  const wb = useWorkbook()
  const { state, derived, readOnly, researchKey, error } = wb
  if (!state) return <main className="center">{error ? <p className="err">{error}</p> : <p>불러오는 중…</p>}</main>
  const tabs = [
    ...(readOnly ? [] : state.steps.steps.map((s) => ({ id: `step${s.id}`, label: `STEP ${s.id}`, sub: s.title, pct: derived.myProgress.steps[s.id].pct }))),
    { id: 'group', label: '조 취합', sub: '조원 답 비교' },
    { id: 'strategy', label: '전략서', sub: `조 최종 ${derived.finalProgress.overall}%`, pct: derived.finalProgress.overall },
  ]
  const step = state.steps.steps.find((s) => `step${s.id}` === tab)
  return (
    <div className="shell">
      <nav className="stepnav" aria-label="단계">
        {tabs.map((t) => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' on' : '')} aria-current={tab === t.id} onClick={() => onTab(t.id)}>
            <span>{t.pct == null ? '' : t.pct >= 100 ? '● ' : '○ '}{t.label}</span>
            <span className="small">{t.sub}{t.pct != null && t.id.startsWith('step') ? ` · ${t.pct}%` : ''}</span>
          </button>
        ))}
        {!readOnly && <p className="small muted overall">내 전체 진행률 {derived.myProgress.overall}%</p>}
      </nav>
      <main className="content">
        <p className="topic"><strong>조 주제</strong> {state.team.topic}</p>
        {step && !readOnly ? <StepView step={step} onNav={onTab} /> : tab === 'strategy' ? <Strategy /> : <Consolidate />}
      </main>
      {researchKey && step && !readOnly && <ResearchPanel />}
    </div>
  )
}

export function Workbook() {
  const tab = getQuery('tab') || 'step0'
  useEffect(() => { document.title = '3-8 마케팅 벤치마킹 워크북' }, [])
  return (
    <WorkbookProvider mode="student">
      <TopBar />
      <WorkbookBody tab={tab} onTab={(t) => { setQuery('tab', t); window.scrollTo(0, 0) }} />
    </WorkbookProvider>
  )
}
