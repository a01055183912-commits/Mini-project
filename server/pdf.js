import PDFDocument from 'pdfkit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEVEL_LABEL } from '../shared/doc.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const FONT = path.join(here, 'fonts', 'NotoSansKR-Regular.ttf')
const BOLD = path.join(here, 'fonts', 'NotoSansKR-Bold.ttf')
const ACCENT = '#E05A38'
const URL_SPLIT = /(https?:\/\/[^\s)>\]]+)/g

// 흰 배경 A4 세로. 출처 URL 은 클릭 가능한 링크로 출력.
export function buildPdf(doc) {
  const pdf = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `${doc.teamName} 마케팅 벤치마킹 전략서` } })
  pdf.registerFont('r', FONT)
  pdf.registerFont('b', BOLD)
  const W = pdf.page.width - 112

  const rich = (text, opts = {}) => {
    const parts = String(text).split(URL_SPLIT)
    parts.forEach((p, i) => {
      if (!p) return
      const last = i === parts.length - 1
      const isUrl = /^https?:\/\//.test(p)
      pdf.fillColor(isUrl ? ACCENT : '#222').font('r').fontSize(opts.size || 11)
      pdf.text(p, { ...opts, link: isUrl ? p.replace(/[.,;]+$/, '') : undefined, underline: isUrl, continued: !last })
    })
    if (!parts.length) pdf.text('')
  }
  const h1 = (t) => pdf.fillColor('#222').font('b').fontSize(20).text(t, { width: W }).moveDown(0.3)
  const h2 = (t) => {
    if (pdf.y > pdf.page.height - 140) pdf.addPage()
    pdf.moveDown(0.8)
    pdf.fillColor(ACCENT).font('b').fontSize(14).text(t)
    const y = pdf.y + 2
    pdf.moveTo(56, y).lineTo(56 + W, y).strokeColor(ACCENT).lineWidth(1).stroke()
    pdf.moveDown(0.5)
  }
  const h3 = (t) => pdf.fillColor('#222').font('b').fontSize(12).text(t, { width: W }).moveDown(0.15)
  const label = (l, t) => {
    pdf.fillColor('#777').font('r').fontSize(10).text(l, { width: W })
    rich(t || '-', { width: W })
    pdf.moveDown(0.2)
  }
  const table = (head, rows) => {
    const n = head.length
    const widths = n === 2 ? [W * 0.3, W * 0.7] : n === 4 ? [W * 0.25, W * 0.2, W * 0.4, W * 0.15] : Array(n).fill(W / n)
    const row = (cells, bold) => {
      const hs = cells.map((c, i) => pdf.font(bold ? 'b' : 'r').fontSize(10).heightOfString(String(c), { width: widths[i] - 8 }))
      const h = Math.max(...hs) + 8
      if (pdf.y + h > pdf.page.height - 56) pdf.addPage()
      let x = 56
      const y = pdf.y
      cells.forEach((c, i) => {
        pdf.rect(x, y, widths[i], h).strokeColor('#bbb').lineWidth(0.5).stroke()
        pdf.fillColor('#222').font(bold ? 'b' : 'r').fontSize(10).text(String(c), x + 4, y + 4, { width: widths[i] - 8 })
        x += widths[i]
      })
      pdf.x = 56
      pdf.y = y + h
    }
    row(head, true)
    rows.forEach((r) => row(r, false))
    pdf.moveDown(0.4)
  }

  h1(`${doc.teamName} 마케팅 벤치마킹 전략서`)
  pdf.fillColor('#222').font('r').fontSize(11).text(`주제: ${doc.topic}`, { width: W })
  pdf.text(`미션: 롯데 ${doc.store || '(점포 미정)'} · 2027 상반기 4주 · 예산 2억 · 신규 유입+재방문`, { width: W })
  if (doc.members.length) pdf.text(`조원: ${doc.members.join(', ')}`, { width: W })

  if (doc.feedback?.length) {
    h2('강사 피드백')
    for (const f of doc.feedback) rich(`${f.key ? `[${f.key}] ` : ''}${f.body}`, { width: W })
  }
  for (const s of doc.steps) {
    h2(`STEP ${s.id} ${s.title}`)
    for (const b of s.blocks) {
      h3(b.title)
      switch (b.kind) {
        case 'empty': pdf.fillColor('#B45309').font('r').fontSize(10).text('(미작성)').moveDown(0.3); break
        case 'text': rich(b.text, { width: W }); pdf.moveDown(0.4); break
        case 'case': label('무엇을 했나', b.what); label('숫자·출처', b.evidence); label('왜 통했나', b.why); break
        case 'low': label('낮은 단계', b.picks.join(', ')); label('근거', b.reason); break
        case 'tools': label('메인', b.main); label('보조', b.sub.length ? b.sub.join(', ') : '없음'); break
        case 'table': table(b.head, b.rows); break
        case 'roi': label('기대 매출 기여', `${b.value}억 원 (ROI ${b.percent}%)`); label('계산식', b.memo); break
      }
    }
  }
  h2('점검 결과')
  for (const c of doc.checks) {
    pdf.fillColor(c.level === 'error' ? '#B91C1C' : c.level === 'warn' ? '#B45309' : '#222').font('r').fontSize(10.5)
      .text(`[${LEVEL_LABEL[c.level]}] ${c.title}: ${c.msg}`, { width: W })
  }
  pdf.end()
  return pdf
}
