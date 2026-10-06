import JSZip from 'jszip'
import { api, getToken, saveBlob } from './api.js'
import { exportMd } from '../../shared/exportMd.js'
import { pptxBytes } from './exportPptx.js'

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

// 강사용: 조별 전략서(md·pptx·pdf) + 전체 응답 CSV 를 ZIP 으로
export async function exportAllZip(onProgress = () => {}) {
  const data = await api('/api/teacher/export', { role: 'teacher' })
  const zip = new JSZip()
  for (const { team, doc } of data.docs) {
    onProgress(`${team.name} 만드는 중…`)
    const dir = zip.folder(team.name)
    dir.file('전략서.md', exportMd(doc))
    dir.file('전략서.pptx', await pptxBytes(doc))
    try {
      const r = await fetch(`/api/pdf?team=${team.id}`, { headers: { 'x-token': getToken('teacher') } })
      if (r.ok) dir.file('전략서.pdf', await r.arrayBuffer())
    } catch { /* PDF 실패 시 나머지는 계속 */ }
  }
  const head = ['class', 'team', 'name', 'key', 'value', 'updated_at'].join(',')
  const teamName = Object.fromEntries(data.docs.map((d) => [d.team.id, d.team.name]))
  const lines = data.answers.map((a) => [data.code, teamName[a.team_id] || a.team_id, a.display_name, a.key, JSON.stringify(a.value), a.updated_at].map(csvCell).join(','))
  zip.file('전체응답.csv', '﻿' + [head, ...lines].join('\r\n'))
  onProgress('압축 중…')
  saveBlob(await zip.generateAsync({ type: 'blob' }), `벤치마킹_전략서_${data.code}.zip`)
}
