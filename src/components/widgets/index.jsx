import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api.js'
import { findUrls, sumBudget, isObj } from '../../../shared/util.js'
import { roiPercent } from '../../../shared/checks.js'

// 모든 위젯 공통 props: { q, value, onChange, disabled, values, cfg, visited }
function Auto({ value, onChange, disabled, rows = 3, placeholder, ...rest }) {
  const ref = useRef(null)
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight + 2, rows * 26) + 'px' } }, [value, rows])
  return <textarea ref={ref} className="input" rows={rows} value={value || ''} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function TextWidget({ value, onChange, disabled, q }) {
  return <input className="input" type="text" value={value || ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={q.title} />
}
export function LongWidget({ value, onChange, disabled, q }) {
  return <Auto value={value} onChange={onChange} disabled={disabled} rows={3} aria-label={q.title} />
}

// ── 링크 미리보기 ──
const previews = new Map()
export function LinkPreview({ url }) {
  const [p, setP] = useState(previews.get(url) || null)
  useEffect(() => {
    if (previews.has(url)) { setP(previews.get(url)); return }
    let live = true
    api(`/api/preview?url=${encodeURIComponent(url)}`).then((r) => { previews.set(url, r); if (live) setP(r) }).catch(() => {})
    return () => { live = false }
  }, [url])
  return (
    <a className="preview" href={url} target="_blank" rel="noopener noreferrer">
      <strong>{p?.title || url}</strong>
      <span>{p?.site || new URL(url).hostname}</span>
    </a>
  )
}

// ── 사례 3칸 ──
export function CaseWidget({ value, onChange, disabled, visited = [], q }) {
  const v = isObj(value) ? value : {}
  const set = (k, x) => onChange({ ...v, [k]: x })
  const urls = findUrls(v.evidence).slice(0, 3)
  const last = visited[0]
  const insert = () => {
    if (!last) return
    const cur = v.evidence || ''
    if (cur.includes(last.url)) return
    set('evidence', cur ? `${cur.trimEnd()}\n${last.url}` : last.url)
  }
  return (
    <div className="case">
      <label className="sub">무엇을 했나
        <Auto value={v.what} onChange={(x) => set('what', x)} disabled={disabled} rows={2} aria-label={`${q.title} 무엇을 했나`} />
      </label>
      <label className="sub">숫자·출처 <span className="muted">(숫자와 출처 URL 또는 기관명)</span>
        <Auto value={v.evidence} onChange={(x) => set('evidence', x)} disabled={disabled} rows={2} aria-label={`${q.title} 숫자·출처`} />
      </label>
      {!disabled && (
        <div className="row">
          <button type="button" className="btn" onClick={insert} disabled={!last} title={last ? last.url : '먼저 자료 찾기에서 사이트를 열어 보세요'}>
            방금 본 자료에서 출처 넣기
          </button>
          {last && <span className="muted small">{last.title || last.url}</span>}
        </div>
      )}
      {urls.map((u) => <LinkPreview key={u} url={u} />)}
      <label className="sub">왜 통했나
        <Auto value={v.why} onChange={(x) => set('why', x)} disabled={disabled} rows={2} aria-label={`${q.title} 왜 통했나`} />
      </label>
    </div>
  )
}

// ── 감정이 낮은 두 곳 ──
export function LowWidget({ value, onChange, disabled, cfg }) {
  const v = isObj(value) ? value : { picks: [], reason: '' }
  const picks = v.picks || []
  const toggle = (s) => onChange({ ...v, picks: picks.includes(s) ? picks.filter((x) => x !== s) : [...picks, s] })
  return (
    <div>
      <div className="chips" role="group" aria-label="감정이 낮은 단계 2개 선택">
        {cfg.lowStages.map((s) => {
          const on = picks.includes(s)
          return (
            <label key={s} className={'chip' + (on ? ' on' : '')}>
              <input type="checkbox" checked={on} disabled={disabled || (!on && picks.length >= 2)} onChange={() => toggle(s)} />
              {on ? '● ' : '○ '}{s}
            </label>
          )
        })}
      </div>
      <div className="muted small">{picks.length}/2 선택</div>
      <label className="sub">근거
        <Auto value={v.reason} onChange={(x) => onChange({ ...v, picks, reason: x })} disabled={disabled} rows={2} />
      </label>
    </div>
  )
}

// ── 도구 선택: 메인 1(라디오) + 보조 ≤2(체크박스) ──
export function ToolsWidget({ value, onChange, disabled, tools }) {
  const v = isObj(value) ? value : { main: '', sub: [] }
  const sub = v.sub || []
  const setMain = (id) => onChange({ main: id, sub: sub.filter((s) => s !== id) })
  const toggleSub = (id) => onChange({ main: v.main || '', sub: sub.includes(id) ? sub.filter((s) => s !== id) : [...sub, id] })
  return (
    <table className="tbl tools">
      <thead><tr><th>도구</th><th>메인 (1개)</th><th>보조 (최대 2개)</th></tr></thead>
      <tbody>
        {tools.tools.map((t) => (
          <tr key={t.id}>
            <td>{t.name}</td>
            <td><input type="radio" name="main-tool" aria-label={`${t.name} 메인`} checked={v.main === t.id} disabled={disabled} onChange={() => setMain(t.id)} /></td>
            <td><input type="checkbox" aria-label={`${t.name} 보조`} checked={sub.includes(t.id)} disabled={disabled || v.main === t.id || (!sub.includes(t.id) && sub.length >= 2)} onChange={() => toggleSub(t.id)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── 4주 일정 ──
export function PlanWidget({ value, onChange, disabled, cfg }) {
  const v = isObj(value) ? value : {}
  return (
    <table className="tbl">
      <tbody>
        {cfg.planSlots.map((s) => (
          <tr key={s.id}>
            <th scope="row" style={{ width: 90 }}>{s.label}</th>
            <td><Auto value={v[s.id]} onChange={(x) => onChange({ ...v, [s.id]: x })} disabled={disabled} rows={2} aria-label={s.label} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── KPI 표 ──
export function KpiWidget({ value, onChange, disabled }) {
  const rows = isObj(value) && Array.isArray(value.rows) && value.rows.length ? value.rows : [{ metric: '', target: '', method: '', lead: true }]
  const setRow = (i, patch) => onChange({ rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  return (
    <div>
      <table className="tbl">
        <thead><tr><th>지표</th><th>목표값</th><th>측정 방법</th><th>구분</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td><input className="input" value={r.metric || ''} disabled={disabled} onChange={(e) => setRow(i, { metric: e.target.value })} aria-label="지표" /></td>
              <td><input className="input" value={r.target || ''} disabled={disabled} onChange={(e) => setRow(i, { target: e.target.value })} aria-label="목표값" /></td>
              <td><input className="input" value={r.method || ''} disabled={disabled} onChange={(e) => setRow(i, { method: e.target.value })} aria-label="측정 방법" /></td>
              <td>
                <select className="input" value={r.lead ? 'lead' : 'lag'} disabled={disabled} onChange={(e) => setRow(i, { lead: e.target.value === 'lead' })} aria-label="선행/후행">
                  <option value="lead">선행</option><option value="lag">후행</option>
                </select>
              </td>
              <td>{!disabled && rows.length > 1 && <button type="button" className="btn" onClick={() => onChange({ rows: rows.filter((_, j) => j !== i) })} aria-label="행 삭제">삭제</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled && <button type="button" className="btn" onClick={() => onChange({ rows: [...rows, { metric: '', target: '', method: '', lead: false }] })}>+ 행 추가</button>}
    </div>
  )
}

// ── 예산표 (만 원) ──
export function BudgetWidget({ value, onChange, disabled, values, cfg, tools }) {
  const v = isObj(value) ? value : {}
  const t = values?.tools
  const chosen = t?.main ? new Set([t.main, ...(t.sub || [])]) : new Set()
  const total = cfg.mission.budgetMan
  const sum = sumBudget(v)
  const diff = sum - total
  const set = (k, x) => onChange({ ...v, [k]: x === '' ? '' : Math.max(0, Math.round(Number(x) || 0)) })
  return (
    <div>
      {!t?.main && <p className="note warn">STEP 3에서 도구를 먼저 고르면 선택한 도구만 입력할 수 있습니다.</p>}
      <table className="tbl budget">
        <thead><tr><th>항목</th><th>금액(만 원)</th></tr></thead>
        <tbody>
          {tools.tools.map((tool) => {
            const off = !chosen.has(tool.id)
            const bad = off && Number(v[tool.id]) > 0
            return (
              <tr key={tool.id}>
                <td>{tool.name}{off && chosen.size > 0 ? <span className="muted"> (미선택 · 0원)</span> : null}{t?.main === tool.id ? <strong> · 메인</strong> : null}</td>
                <td>
                  <input className={'input num' + (bad ? ' bad' : '')} type="number" min="0" step="100" inputMode="numeric"
                    value={off && !bad ? 0 : v[tool.id] ?? ''} disabled={disabled || (off && !bad)} onChange={(e) => set(tool.id, e.target.value)} aria-label={`${tool.name} 금액`} />
                  {bad && <span className="err"> ✕ 미선택 도구는 0원</span>}
                </td>
              </tr>
            )
          })}
          <tr>
            <td>예비비 <span className="muted">({cfg.mission.reserveMinMan.toLocaleString()}~{cfg.mission.reserveMaxMan.toLocaleString()}만 원)</span></td>
            <td><input className="input num" type="number" min="0" step="100" value={v.reserve ?? ''} disabled={disabled} onChange={(e) => set('reserve', e.target.value)} aria-label="예비비 금액" /></td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>합계</th>
            <th className="num">
              {sum.toLocaleString()}만 원 / 목표 {total.toLocaleString()}만 원{' '}
              <span className={diff === 0 ? 'okc' : 'err'}>{diff === 0 ? '✓ 일치' : `✕ 차이 ${diff > 0 ? '+' : ''}${diff.toLocaleString()}만 원`}</span>
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── 기대 매출 / ROI ──
export function RoiWidget({ value, onChange, disabled }) {
  const v = isObj(value) ? value : {}
  const n = Number(v.value)
  return (
    <div>
      <label className="sub">기대 매출 기여(억 원)
        <input className="input num" type="number" min="0" step="0.1" value={v.value ?? ''} disabled={disabled} onChange={(e) => onChange({ ...v, value: e.target.value === '' ? '' : Number(e.target.value) })} />
      </label>
      <label className="sub">계산식 메모
        <Auto value={v.memo} onChange={(x) => onChange({ ...v, memo: x })} disabled={disabled} rows={2} />
      </label>
      <p className="note">ROI = (기대매출 − 2억) ÷ 2억 × 100% = <strong>{n > 0 ? `${roiPercent(n)}%` : '—'}</strong></p>
    </div>
  )
}

export function Widget(props) {
  switch (props.q.type) {
    case 'text': return <TextWidget {...props} />
    case 'case': return <CaseWidget {...props} />
    case 'low': return <LowWidget {...props} />
    case 'tools': return <ToolsWidget {...props} />
    case 'plan': return <PlanWidget {...props} />
    case 'kpi': return <KpiWidget {...props} />
    case 'budget': return <BudgetWidget {...props} />
    case 'roi': return <RoiWidget {...props} />
    default: return <LongWidget {...props} />
  }
}
