// Lightweight shared store for fan-created opinions, keyed by club id.
// Persisted to localStorage so a newly written opinion survives navigation
// and shows at the top of the opinions list.

const KEY = 'fancluv_created_opinions'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

let store = load()

export function getCreatedOpinions(teamId) {
  return store[teamId] || []
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // ignore storage failures — in-memory store still works for the session
  }
}

export function addOpinion(teamId, opinion) {
  store = { ...store, [teamId]: [opinion, ...(store[teamId] || [])] }
  persist()
}

// 본인 작성 의견 수정(Mock). patch = { category, rating, title, body }
export function updateOpinion(teamId, id, patch) {
  store = {
    ...store,
    [teamId]: (store[teamId] || []).map(o => (String(o.id) === String(id) ? { ...o, ...patch } : o)),
  }
  persist()
}

// 본인 작성 의견 삭제(Mock)
export function removeOpinion(teamId, id) {
  store = { ...store, [teamId]: (store[teamId] || []).filter(o => String(o.id) !== String(id)) }
  persist()
}
