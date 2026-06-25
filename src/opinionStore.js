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

export function addOpinion(teamId, opinion) {
  store = { ...store, [teamId]: [opinion, ...(store[teamId] || [])] }
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // ignore storage failures — in-memory store still works for the session
  }
}
