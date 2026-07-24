// FANCLUV — K리그 공식 경기 라인업(www.kleague.com/match.do HTML) 파서 (순수 함수, 테스트 가능).
//
// 공식 JSON/API 미제공(matchInfo/matchRecord/getMatchRecordAllDetail 어디에도 선발/교체 구분 플래그 없음) →
// 공식 match.do HTML 만이 선발(pitch)·교체(대기 명단)를 신뢰성 있게 구분한다(§5/§6). 실측 12경기 검증:
//   · 선발 XI = pitch 의 playerDetailPop('K##','id') + <div class="player"><p>번호.이름(c)?</p> → 팀당 정확히 11명
//   · 교체    = <div class="standby"> 2개(홈/원정) 의 <p>번호.이름</p> + player_<id>
//   · 홈/원정 = 각 선수 팀코드(onclick/이미지 URL)로 확정(경기 home_code/away_code 대조 = 교차오염 0)
//   · 주장    = 이름 뒤 (c) 마커. 포지션/GK/포메이션은 공식 소스에서 신뢰 불가 → 저장/표시 안 함(추측 금지).
// Edge(Deno) 수집기와 동일 규칙 공유용 순수 모듈. Raw HTML 은 저장하지 않는다(정규화 결과만).

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim()

// 선수 라벨 "23.김태환(c)" → { number, name, captain }
function parseLabel(label) {
  const m = /^(\d+)\.(.+?)(\(c\))?$/.exec(clean(label))
  if (!m) return null
  return { number: Number(m[1]), name: clean(m[2]), captain: !!m[3] }
}

// pitch 선발: playerDetailPop('CODE','ID') ... <div class="player"> ... <p>번호.이름(c)?</p>
function parseStarters(seg) {
  const out = []
  const re = /playerDetailPop\('(K\d+)',\s*'(\d+)'\)[\s\S]*?<div class="player">[\s\S]*?<p>([^<]+)<\/p>/g
  let m
  while ((m = re.exec(seg))) {
    const lab = parseLabel(m[3])
    if (lab) out.push({ code: m[1].toUpperCase(), playerId: m[2], number: lab.number, name: lab.name, captain: lab.captain })
  }
  return out
}

// 대기 명단(standby): 이미지 URL 의 팀코드(있으면) + <p>번호.이름</p> + player_<id>
function parseSubs(seg) {
  const out = []
  const seen = new Set()
  // 1차: 이미지 URL 에 팀코드가 있는 선수(/K##/player_<id>.png)
  const re1 = /url\('[^']*?\/(K\d+)\/player_(\d+)\.png'\)[\s\S]*?<p>(\d+)\.([^<]+)<\/p>/g
  let m
  while ((m = re1.exec(seg))) {
    if (seen.has(m[2])) continue
    seen.add(m[2])
    out.push({ code: m[1].toUpperCase(), playerId: m[2], number: Number(m[3]), name: clean(m[4]), captain: false })
  }
  // 2차: placeholder 이미지(player00.png)라 코드 없는 선수 — <p>번호.이름</p> + <ul class="player_<id>">
  const re2 = /<p>(\d+)\.([^<]+)<\/p>\s*<ul class="player_(\d+)"/g
  while ((m = re2.exec(seg))) {
    if (seen.has(m[3])) continue
    seen.add(m[3])
    out.push({ code: null, playerId: m[3], number: Number(m[1]), name: clean(m[2]), captain: false })
  }
  return out
}

// match.do HTML → 정규화 라인업. homeCode/awayCode 로 무결성 검증(선발 11·팀코드 일치·중복/빈이름 0).
//   유효하지 않으면 null 반환(§15 — 잘못된 데이터로 기존 정상 라인업을 덮어쓰지 않도록 호출측이 무시).
export function parseLineupHtml(html, homeCode, awayCode) {
  if (!html || typeof html !== 'string') return null
  const hi = html.indexOf('hFormation')
  const ai = html.indexOf('aFormation', hi >= 0 ? hi : 0)
  if (hi < 0 || ai < 0) return null
  const nextH = html.indexOf('hFormation', ai)
  const homePitch = html.slice(hi, ai)
  const awayPitch = html.slice(ai, nextH > 0 ? nextH : html.length)
  const homeStarters = parseStarters(homePitch).slice(0, 11)
  const awayStarters = parseStarters(awayPitch).slice(0, 11)

  // 교체: <div class="standby"> 2개(홈·원정 순). 각 블록은 </div></div>(standby+부모 닫힘)로 경계.
  const stand = []
  const sre = /<div class="standby">([\s\S]*?)<\/div>\s*<\/div>/g
  let sm
  while ((sm = sre.exec(html))) stand.push(sm[1])
  const homeSubs = stand[0] ? parseSubs(stand[0]) : []
  const awaySubs = stand[1] ? parseSubs(stand[1]) : []

  const HC = String(homeCode || '').toUpperCase()
  const AC = String(awayCode || '').toUpperCase()
  // 무결성: 선발 11 + 팀코드 일치(교차오염 0). 불일치 시 신뢰 불가 → null.
  const homeOk = homeStarters.length === 11 && (!HC || homeStarters.every(p => p.code === HC))
  const awayOk = awayStarters.length === 11 && (!AC || awayStarters.every(p => p.code === AC))
  if (!homeOk || !awayOk) return null

  const strip = p => ({ playerId: p.playerId, number: p.number, name: p.name, ...(p.captain ? { captain: true } : {}) })
  const all = [...homeStarters, ...awayStarters, ...homeSubs, ...awaySubs]
  const ids = all.map(p => p.playerId)
  if (new Set(ids).size !== ids.length) return null           // 중복 선수
  if (all.some(p => !p.name)) return null                     // 빈 이름

  return {
    home: { starters: homeStarters.map(strip), substitutes: homeSubs.map(strip) },
    away: { starters: awayStarters.map(strip), substitutes: awaySubs.map(strip) },
  }
}
