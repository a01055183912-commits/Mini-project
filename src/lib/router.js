import { useEffect, useState } from 'react'

export function go(path, replace = false) {
  history[replace ? 'replaceState' : 'pushState'](null, '', path)
  window.dispatchEvent(new Event('navigate'))
}
export function usePath() {
  const [p, setP] = useState(location.pathname + location.search)
  useEffect(() => {
    const f = () => setP(location.pathname + location.search)
    window.addEventListener('navigate', f)
    window.addEventListener('popstate', f)
    return () => { window.removeEventListener('navigate', f); window.removeEventListener('popstate', f) }
  }, [])
  return p
}
export function getQuery(name) { return new URLSearchParams(location.search).get(name) }
export function setQuery(name, value) {
  const u = new URL(location.href)
  u.searchParams.set(name, value)
  go(u.pathname + u.search, true)
}
