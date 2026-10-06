import { usePath, go } from './lib/router.js'
import { getToken } from './lib/api.js'
import { Join } from './components/Join.jsx'
import { Workbook } from './components/Workbook.jsx'
import { Teacher } from './components/Teacher.jsx'
import { Present } from './components/Present.jsx'

export default function App() {
  const full = usePath()
  const path = full.split('?')[0].replace(/\/+$/, '') || '/'
  if (path === '/' ) { go(getToken('student') ? '/w' : '/join', true); return null }
  if (path === '/join') return <Join />
  if (path === '/w') { if (!getToken('student')) { go('/join', true); return null } return <Workbook /> }
  if (path === '/teacher') return <Teacher />
  if (path.startsWith('/present/')) return <Present team={path.split('/')[2]} />
  return <main className="center"><p>페이지를 찾을 수 없습니다. <a href="/join">입장 화면으로</a></p></main>
}
