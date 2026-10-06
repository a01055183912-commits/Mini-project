import pptxgen from 'pptxgenjs'
import { LEVEL_LABEL } from '../../shared/doc.js'

// 16:9 와이드, 흰 배경, 선·표·굵은 글씨만 사용. 본문 18pt 이상, 제목 32pt 굵게.
const FONT = '맑은 고딕'
const ACCENT = 'E05A38'
const INK = '222222'
const GRAY = '777777'
const W = 13.33
const MX = 0.6
const CW = W - MX * 2
const TOP = 1.3
const BOTTOM = 7.05
const BODY = 20
const URL_SPLIT = /(https?:\/\/[^\s)>\]]+)/g

// 한 줄에 들어갈 글자 수를 보수적으로 추정해 높이(inch) 계산
function est(text, widthIn, pt = BODY) {
  const cpl = Math.max(4, Math.floor((widthIn * 72) / (pt * 0.98)))
  const lines = String(text || ' ').split('\n').reduce((a, l) => a + Math.max(1, Math.ceil(l.length / cpl)), 0)
  return (lines * pt * 1.32) / 72
}

function runs(text, base = {}) {
  const out = []
  String(text || '').split(URL_SPLIT).forEach((p) => {
    if (!p) return
    if (/^https?:\/\//.test(p)) {
      const clean = p.replace(/[.,;]+$/, '')
      out.push({ text: clean, options: { ...base, color: ACCENT, underline: { style: 'sng' }, hyperlink: { url: clean, tooltip: clean } } })
      if (clean.length < p.length) out.push({ text: p.slice(clean.length), options: base })
    } else out.push({ text: p, options: base })
  })
  return out.length ? out : [{ text: ' ', options: base }]
}

class Deck {
  constructor() {
    this.p = new pptxgen()
    this.p.layout = 'LAYOUT_WIDE'
    this.s = null
    this.y = TOP
    this.title = ''
    this.count = 0
  }
  slide(title) {
    this.s = this.p.addSlide()
    this.s.background = { color: 'FFFFFF' }
    this.count++
    this.s.addText(title, { x: MX, y: 0.35, w: CW, h: 0.75, fontFace: FONT, fontSize: 32, bold: true, color: INK, valign: 'middle', margin: 0, fit: 'shrink' })
    this.s.addShape(this.p.ShapeType.line, { x: MX, y: 1.12, w: CW, h: 0, line: { color: ACCENT, width: 2 } })
    this.title = title.replace(/ \(계속\)$/, '')
    this.y = TOP
  }
  need(h) {
    if (!this.s || this.y + h > BOTTOM) this.slide(this.s ? `${this.title} (계속)` : this.title)
  }
  heading(t) {
    this.need(est(t, CW, 22) + 0.5)
    this.s.addText(t, { x: MX, y: this.y, w: CW, h: est(t, CW, 22) + 0.05, fontFace: FONT, fontSize: 22, bold: true, color: ACCENT, margin: 0, valign: 'top' })
    this.y += est(t, CW, 22) + 0.1
  }
  // 긴 글은 문단 단위로 쪼개 여러 장에 나눠 싣는다
  para(text, { label, color = INK } = {}) {
    const chunks = String(text || '').split('\n')
    let buf = []
    const flush = () => {
      if (!buf.length) return
      const body = buf.join('\n')
      const h = est(body, CW) + 0.1
      this.need(h)
      this.s.addText(runs(body, { fontFace: FONT, fontSize: BODY, color }), { x: MX, y: this.y, w: CW, h, margin: 0, valign: 'top', paraSpaceAfter: 2 })
      this.y += h + 0.05
      buf = []
    }
    for (const c of chunks) {
      const hh = est([...buf, c].join('\n'), CW) + 0.1
      if (buf.length && this.y + hh > BOTTOM) flush()
      buf.push(c)
    }
    flush()
  }
  label(l, text) {
    this.need(est(l, CW) + 0.6)
    this.s.addText(l, { x: MX, y: this.y, w: CW, h: 0.35, fontFace: FONT, fontSize: BODY, bold: true, color: GRAY, margin: 0 })
    this.y += 0.38
    this.para(text)
  }
  // 열 너비 비율 colRatio 로 표 출력. 행 단위로 쪼개 여러 장에 나눈다.
  table(head, rows, colRatio) {
    const tot = colRatio.reduce((a, b) => a + b, 0)
    const colW = colRatio.map((r) => (CW * r) / tot)
    const rowH = (cells) => Math.max(...cells.map((c, i) => est(typeof c === 'string' ? c : c.plain ?? '', colW[i] - 0.2))) + 0.2
    const mkHead = () => head.map((h) => ({ text: h, options: { bold: true, fontFace: FONT, fontSize: BODY, color: INK, fill: { color: 'F2F2F2' } } }))
    const mkRow = (cells) => cells.map((c) => ({ text: typeof c === 'string' ? runs(c, { fontFace: FONT, fontSize: BODY, color: INK }) : c.runs, options: { fontFace: FONT, fontSize: BODY, color: INK, valign: 'top' } }))
    let batch = []
    let h = 0.55
    const flush = () => {
      if (!batch.length) return
      this.s.addTable([mkHead(), ...batch.map(mkRow)], { x: MX, y: this.y, w: CW, colW, border: { type: 'solid', pt: 0.75, color: '999999' }, margin: [3, 6, 3, 6], autoPage: false })
      this.y += h + 0.1
      batch = []
      h = 0.55
    }
    for (const r of rows) {
      const rh = rowH(r)
      this.need(0.55 + rh)
      if (batch.length && this.y + h + rh > BOTTOM) { flush(); this.need(0.55 + rh) }
      batch.push(r)
      h += rh
    }
    flush()
  }
  toolsDiagram(tools, chosen) {
    this.need(2.1)
    const gap = 0.15
    const bw = (CW - gap * 4) / 5
    tools.tools.forEach((t, i) => {
      const x = MX + i * (bw + gap)
      const isMain = chosen.main === t.id
      const isSub = chosen.sub.includes(t.id)
      const role = isMain ? '메인' : isSub ? '보조' : '제외'
      this.s.addShape(this.p.ShapeType.rect, { x, y: this.y, w: bw, h: 1.7, fill: { color: isMain ? ACCENT : 'FFFFFF' }, line: { color: isMain || isSub ? ACCENT : 'BBBBBB', width: isMain || isSub ? 2 : 1 } })
      this.s.addText([{ text: `${role}\n`, options: { bold: true, fontSize: BODY } }, { text: t.short, options: { fontSize: BODY } }], { x, y: this.y, w: bw, h: 1.7, fontFace: FONT, color: isMain ? 'FFFFFF' : isSub ? INK : 'AAAAAA', align: 'center', valign: 'middle', margin: 4 })
    })
    this.y += 1.85
  }
}

function caseRows(blocks) {
  return blocks.map((b, i) => [
    { plain: b.title, runs: [{ text: b.title, options: { bold: true, fontFace: FONT, fontSize: BODY, color: INK } }] },
    b.what,
    { plain: b.evidence, runs: runs(b.evidence, { fontFace: FONT, fontSize: BODY, color: INK }) },
    b.why,
  ])
}

export function buildPptx(doc) {
  const d = new Deck()
  d.p.title = `${doc.teamName} 마케팅 벤치마킹 전략서`

  // 표지
  d.slide(`${doc.teamName} 마케팅 벤치마킹 전략서`)
  d.para(`주제: ${doc.topic}`)
  d.para(`미션: 롯데 ${doc.store || '(점포 미정)'} · 2027 상반기 4주 · 예산 2억 · 신규 유입+재방문`)
  if (doc.members.length) d.para(`조원: ${doc.members.join(', ')}`)

  if (doc.feedback?.length) {
    d.slide('강사 피드백')
    doc.feedback.forEach((f) => d.para(`${f.key ? `[${f.key}] ` : ''}${f.body}`))
  }

  for (const s of doc.steps) {
    d.slide(`STEP ${s.id} ${s.title}`)
    let i = 0
    while (i < s.blocks.length) {
      const b = s.blocks[i]
      if (b.kind === 'case') {
        const group = []
        while (i < s.blocks.length && s.blocks[i].kind === 'case') group.push(s.blocks[i++])
        d.heading('사례 비교')
        d.table(['사례', '무엇을 했나', '숫자·출처', '왜 통했나'], caseRows(group), [1.5, 3, 3.2, 3])
        continue
      }
      i++
      if (b.kind === 'tools') {
        d.heading(b.title)
        d.toolsDiagram(doc.tools, { main: b.mainId, sub: b.subIds })
        continue
      }
      d.heading(b.title)
      switch (b.kind) {
        case 'empty': d.para('(미작성)', { color: 'B45309' }); break
        case 'text': d.para(b.text); break
        case 'low': d.para(`낮은 단계: ${b.picks.join(', ')}\n근거: ${b.reason}`); break
        case 'table': d.table(b.head, b.rows.map((r) => r.map((c) => String(c))), b.head.length === 2 ? [1.6, 6] : b.head.length === 4 ? [2.2, 1.6, 4, 1.2] : b.head.map(() => 1)); break
        case 'roi': d.para(`기대 매출 기여: ${b.value}억 원 (ROI ${b.percent}%)\n계산식: ${b.memo}`); break
        default: break
      }
    }
  }

  d.slide('점검 결과')
  for (const c of doc.checks) {
    const color = c.level === 'error' ? 'B91C1C' : c.level === 'warn' ? 'B45309' : INK
    d.need(est(c.msg, CW) + 0.1)
    d.s.addText(`[${LEVEL_LABEL[c.level]}] ${c.title}: ${c.msg}`, { x: MX, y: d.y, w: CW, h: est(`[통과] ${c.title}: ${c.msg}`, CW) + 0.05, fontFace: FONT, fontSize: BODY, color, margin: 0, valign: 'top' })
    d.y += est(`[통과] ${c.title}: ${c.msg}`, CW) + 0.12
  }
  return d.p
}

export async function pptxBlob(doc) { return buildPptx(doc).write({ outputType: 'blob' }) }
export async function pptxBytes(doc) { return buildPptx(doc).write({ outputType: 'uint8array' }) }
