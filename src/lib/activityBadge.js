// Activity badge tiers, derived from a simple mock activity score.
// Rookie → Active → Super → Legend. `icon` maps to RankIcon names (SVG).

export const ACTIVITY_BADGES = [
  { key: 'rookie', icon: 'rookie', min: 0,   ko: 'Rookie Fan', en: 'Rookie Fan' },
  { key: 'active', icon: 'active', min: 30,  ko: 'Active Fan', en: 'Active Fan' },
  { key: 'super',  icon: 'super',  min: 80,  ko: 'Super Fan',  en: 'Super Fan' },
  { key: 'legend', icon: 'legend', min: 150, ko: 'Legend Fan', en: 'Legend Fan' },
]

// Returns { badge, next, progress } where progress is % toward the next tier.
export function getActivityBadge(score) {
  let idx = 0
  for (let i = 0; i < ACTIVITY_BADGES.length; i++) {
    if (score >= ACTIVITY_BADGES[i].min) idx = i
  }
  const badge = ACTIVITY_BADGES[idx]
  const next = ACTIVITY_BADGES[idx + 1] || null
  const progress = next
    ? Math.min(100, Math.round(((score - badge.min) / (next.min - badge.min)) * 100))
    : 100
  return { badge, next, progress }
}
