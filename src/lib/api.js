const KEYS = { student: 'lift.token', teacher: 'lift.teacher' }

export const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* 저장 불가 환경 */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* noop */ } },
}
export const getToken = (role) => store.get(KEYS[role])
export const setToken = (role, t) => store.set(KEYS[role], t)
export const clearToken = (role) => store.del(KEYS[role])

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data }
}

// role: 'student' | 'teacher'. 네트워크 실패는 status 0 (오프라인) 으로 던진다.
export async function api(path, { method = 'GET', body, role = 'student' } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', 'x-token': getToken(role) || '' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, '오프라인')
  }
  let data = null
  try { data = await res.json() } catch { /* 본문 없음 */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `오류 ${res.status}`, data)
  return data
}

export async function download(path, filename, role = 'student') {
  const res = await fetch(path, { headers: { 'x-token': getToken(role) || '' } })
  if (!res.ok) {
    let m = ''
    try { m = (await res.json()).error } catch { /* noop */ }
    throw new ApiError(res.status, m || '내려받기 실패')
  }
  saveBlob(await res.blob(), filename)
}
export function saveBlob(blob, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
