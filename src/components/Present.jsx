import { useEffect, useMemo, useState } from 'react'
import { WorkbookProvider, useWorkbook } from '../lib/store.jsx'
import { BlockView } from './View.jsx'
import { getToken } from '../lib/api.js'
import { go, getQuery } from '../lib/router.js'

// 발표 모드: STEP 단위로 한 화면씩 (←/→). 글자가 넘치면 같은 STEP 을 여러 장으로 나눈다.
function buildSlides(doc) {
  const slides = [{ kind: 'cover' }]
  const weight = (b) => {
    const t = JSON.stringify(b)
    return 160 + (b.kind === 'table' ? b.rows.length * 90 : b.kind === 'case' ? 260 : 0) + t.length * 0.4
  }
  for (const s of doc.steps) {
    let cur = []
    let w = 0
    for (const b of s.blocks) {
      const bw = weight(b)
      if (cur.length && w + bw > 1250) { slides.push({ kind: 'step', step: s, blocks: cur, part: slides.filter((x) => x.step === s).length + 1 }); cur = []; w = 0 }
      cur.push(b); w += bw
    }
    if (cur.length) slides.push({ kind: 'step', step: s, blocks: cur, part: slides.filter((x) => x.step === s).length + 1 })
  }
  slides.push({ kind: 'checks' })
  return slides
}

function Deck() {
  const { state, derived } = useWorkbook()
  const [i, setI] = useState(0)
  const doc = derived?.doc
  const slides = useMemo(() => (doc ? buildSlides(doc) : []), [doc])
  useEffect(() => {
    const f = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') setI((x) => Math.min(slides.length - 1, x + 1))
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setI((x) => Math.max(0, x - 1))
      if (e.key === 'Escape') window.close()
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [slides.length])
  if (!doc) return <main className="center"><p>불러오는 중…</p></main>
  const s = slides[Math.min(i, slides.length - 1)]
  return (
    <div className="present">
      <div className="slide">
        {s.kind === 'cover' && (
          <div>
            <h1>{doc.teamName} 마케팅 벤치마킹 전략서</h1>
            <p>주제: {doc.topic}</p>
            <p>미션: 롯데 {doc.store || '(점포 미정)'} · 2027 상반기 4주 · 예산 2억 · 신규 유입+재방문</p>
            <p className="muted">조원: {doc.members.join(', ')}</p>
          </div>
        )}
        {s.kind === 'step' && (
          <div>
            <h1>STEP {s.step.id} {s.step.title}{s.part > 1 ? ` (${s.part})` : ''}</h1>
            {s.blocks.map((b) => <div key={b.key}><h2>{b.title}</h2><BlockView b={b} /></div>)}
          </div>
        )}
        {s.kind === 'checks' && (
          <div>
            <h1>점검 결과</h1>
            <ul>{doc.checks.map((c) => <li key={c.id}><strong>{c.title}</strong> — {c.msg}</li>)}</ul>
          </div>
        )}
      </div>
      <div className="presentbar">
        <button className="btn" onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0}>← 이전</button>
        <span>{i + 1} / {slides.length}</span>
        <button className="btn" onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} disabled={i >= slides.length - 1}>다음 →</button>
        <button className="btn" onClick={() => go(getQuery('as') === 'teacher' || !getToken('student') ? '/teacher' : '/w?tab=strategy')}>나가기</button>
      </div>
    </div>
  )
}

export function Present({ team }) {
  const teacher = !!getToken('teacher') && (!getToken('student') || getQuery('as') === 'teacher')
  useEffect(() => { document.title = '발표 모드' }, [])
  if (!getToken('student') && !getToken('teacher')) { go('/join', true); return null }
  return <WorkbookProvider mode={teacher ? 'teacher' : 'student'} teamId={team}><Deck /></WorkbookProvider>
}
