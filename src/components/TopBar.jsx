import { useEffect, useState } from 'react'
import { useWorkbook } from '../lib/store.jsx'

const STATUS = {
  saved: '✓ 저장됨',
  saving: '… 저장 중',
  offline: '⚠ 오프라인 — 입력은 저장되고 있습니다',
  error: '✕ 저장 실패(재시도 중)',
  locked: '🔒 강사가 입력을 잠갔습니다',
}

export function Timer({ timer, serverNow }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!timer?.endsAt) return
    const t = setInterval(() => tick((x) => x + 1), 250)
    return () => clearInterval(t)
  }, [timer?.endsAt])
  if (!timer?.endsAt) return null
  const left = Math.max(0, timer.endsAt - serverNow())
  const s = Math.ceil(left / 1000)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  const urgent = left > 0 && s <= 10
  return <span className={'timer' + (urgent || left === 0 ? ' urgent' : '')} role="timer">{left === 0 ? '⏱ 시간 종료' : `⏱ 남은 시간 ${mm}:${ss}${urgent ? ' (곧 종료)' : ''}`}</span>
}

export function TopBar({ right }) {
  const wb = useWorkbook()
  const { state, status, online, serverNow } = wb
  const st = !online ? 'offline' : status
  return (
    <header className="topbar">
      <div className="left"><strong>3-8 마케팅 벤치마킹 워크북</strong><span className="muted"> · 수업 코드 {state?.cls?.code}</span></div>
      <div className="mid">{state?.steps?.mission?.line}</div>
      <div className="right">
        {state && <span>{state.team?.name} · {state.me?.name}{state.me?.role === 'leader' ? ' (조장)' : ''}</span>}
        {!wb.readOnly && <span className={'save ' + st}>{STATUS[st]}</span>}
        {state && <Timer timer={state.settings?.timer} serverNow={serverNow} />}
        {right}
      </div>
    </header>
  )
}
