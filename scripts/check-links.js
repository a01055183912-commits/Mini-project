// 배포 전 자료 찾기 링크 생존 확인: npm run check-links
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const links = JSON.parse(fs.readFileSync(path.join(root, 'config', 'links.json'), 'utf8'))
const targets = links.groups.flatMap((g) => g.links.map((l) => ({ group: g.title, title: l.title, url: l.url.replace('{q}', encodeURIComponent('백화점')) })))

async function check({ url }) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 12000)
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (LIFT link check)', accept: 'text/html,*/*' } })
    return { ok: r.status === 200, status: r.status }
  } catch (e) {
    return { ok: false, status: e.name === 'AbortError' ? '시간 초과' : e.cause?.code || e.message }
  } finally { clearTimeout(timer) }
}

const results = []
for (let i = 0; i < targets.length; i += 6) {
  const batch = targets.slice(i, i + 6)
  results.push(...(await Promise.all(batch.map(async (t) => ({ ...t, ...(await check(t)) })))))
}
const bad = results.filter((r) => !r.ok)
console.log(`링크 ${results.length}개 확인 — 정상 ${results.length - bad.length}개 / 실패 ${bad.length}개`)
for (const b of bad) console.log(`  ✕ [${b.group}] ${b.title}\n      ${b.url}  → ${b.status}`)
if (bad.length) console.log('\n실패한 링크는 강사 화면 [설정 → 자료 찾기 링크]에서 고치거나 config/links.json 을 수정하세요.')
process.exit(bad.length ? 1 : 0)
