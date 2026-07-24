import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLineupHtml } from './kleagueLineup.js'

// 실제 match.do 구조를 축약한 픽스처 빌더.
function starterHtml(code, id, num, name, captain) {
  return `<div onclick="playerDetailPop('${code}', '${id}')" style="top:50%; left:2.5%;">
    <div class="player"><div style="background-image: url('https://cdn/x/${code}/player_${id}.png');"></div>
    <p>${num}.${name}${captain ? '(c)' : ''}</p></div>
    <div class="info player_${id}"></div></div>`
}
function subHtml(code, id, num, name) {
  const img = code ? `https://cdn/x/2026/${code}/player_${id}.png` : 'https://cdn/x/player00.png'
  return `<li><div class="player-data"><div style="background-image: url('${img}');"></div>
    <p>${num}.${name}</p><ul class="player_${id}"><li class="score off red">0.0</li></ul></div></li>`
}
function buildMatch({ homeCode = 'K05', awayCode = 'K21', homeStarters, awayStarters, homeSubs = [], awaySubs = [] }) {
  // 실제 player id 는 숫자만 → 픽스처도 숫자 id 사용.
  const hS = homeStarters.map((p, i) => starterHtml(homeCode, `1000${i}`, p.num, p.name, p.cap)).join('')
  const aS = awayStarters.map((p, i) => starterHtml(awayCode, `2000${i}`, p.num, p.name, p.cap)).join('')
  const hSub = homeSubs.map((p, i) => subHtml(p.code === null ? null : homeCode, `3000${i}`, p.num, p.name)).join('')
  const aSub = awaySubs.map((p, i) => subHtml(awayCode, `4000${i}`, p.num, p.name)).join('')
  return `<div class="lineup">
    <div class="home"><div class="position hFormation"></div>${hS}</div>
    <div class="away"><div class="position aFormation right"></div>${aS}</div>
  </div>
  <div class="standby"><p>대기 명단</p><ul class="simple">${hSub}</ul></div></div>
  <div class="standby"><p>대기 명단</p><ul class="simple">${aSub}</ul></div></div>
  <div class="cont-box"></div>`
}
const XI = n => Array.from({ length: n }, (_, i) => ({ num: i + 1, name: `선수${i + 1}` }))

test('정상 경기: 홈/원정 선발 11 + 교체 + 주장', () => {
  const html = buildMatch({
    homeStarters: [{ num: 1, name: '김GK' }, { num: 23, name: '김주장', cap: true }, ...XI(9)],
    awayStarters: [{ num: 1, name: '박GK' }, ...XI(10)],
    homeSubs: [{ num: 30, name: '교체1' }, { num: 31, name: '교체2' }],
    awaySubs: [{ num: 40, name: '교체A' }],
  })
  const lu = parseLineupHtml(html, 'K05', 'K21')
  assert.ok(lu)
  assert.equal(lu.home.starters.length, 11)
  assert.equal(lu.away.starters.length, 11)
  assert.equal(lu.home.substitutes.length, 2)
  assert.equal(lu.away.substitutes.length, 1)
  assert.equal(lu.home.starters.find(p => p.captain)?.name, '김주장')
  assert.equal(lu.home.starters[0].name, '김GK')
})

test('선수 객체: playerId/number/name, captain은 있을 때만', () => {
  const html = buildMatch({ homeStarters: [{ num: 7, name: '손흥민', cap: true }, ...XI(10)], awayStarters: XI(11), homeSubs: [{ num: 9, name: '교체' }] })
  const lu = parseLineupHtml(html, 'K05', 'K21')
  const cap = lu.home.starters[0]
  assert.deepEqual(cap, { playerId: '10000', number: 7, name: '손흥민', captain: true })
  const noncap = lu.home.starters[1]
  assert.ok(!('captain' in noncap))
  assert.deepEqual(lu.home.substitutes[0], { playerId: '30000', number: 9, name: '교체' })
})

test('Home/Away 구분: 팀코드 대조', () => {
  const lu = parseLineupHtml(buildMatch({ homeStarters: XI(11), awayStarters: XI(11), homeSubs: [{ num: 1, name: 's' }] }), 'K05', 'K21')
  assert.ok(lu)
})

test('선발 11 아님 → null(신뢰 불가)', () => {
  assert.equal(parseLineupHtml(buildMatch({ homeStarters: XI(10), awayStarters: XI(11) }), 'K05', 'K21'), null)
  assert.equal(parseLineupHtml(buildMatch({ homeStarters: XI(11), awayStarters: XI(9) }), 'K05', 'K21'), null)
})

test('팀코드 불일치 → null(교차오염 방지)', () => {
  // 홈 선발이 실제로 K21 코드인데 homeCode로 K05 를 기대 → 거부
  const html = buildMatch({ homeCode: 'K21', awayCode: 'K05', homeStarters: XI(11), awayStarters: XI(11) })
  assert.equal(parseLineupHtml(html, 'K05', 'K21'), null)
})

test('교체 placeholder 이미지(코드 없음)도 파싱', () => {
  const lu = parseLineupHtml(buildMatch({ homeStarters: XI(11), awayStarters: XI(11), homeSubs: [{ num: 91, name: '정대영', code: null }] }), 'K05', 'K21')
  assert.equal(lu.home.substitutes.length, 1)
  assert.equal(lu.home.substitutes[0].name, '정대영')
})

test('중복 선수 → null', () => {
  // 같은 playerId 를 억지로 두 번 — 빌더로는 불가하므로 직접 조작
  let html = buildMatch({ homeStarters: XI(11), awayStarters: XI(11), homeSubs: [{ num: 5, name: 'x' }] })
  html = html.replace(/30000/g, '10000') // 교체 id를 선발 id(10000)와 충돌시킴
  assert.equal(parseLineupHtml(html, 'K05', 'K21'), null)
})

test('빈 HTML / malformed → null (안전)', () => {
  assert.equal(parseLineupHtml('', 'K05', 'K21'), null)
  assert.equal(parseLineupHtml(null, 'K05', 'K21'), null)
  assert.equal(parseLineupHtml('<html><body>no lineup</body></html>', 'K05', 'K21'), null)
  assert.equal(parseLineupHtml('<div class="lineup"><div class="position hFormation"></div></div>', 'K05', 'K21'), null)
})

test('교체 없어도 선발만 유효하면 OK (bench 미등록 예외)', () => {
  const lu = parseLineupHtml(buildMatch({ homeStarters: XI(11), awayStarters: XI(11), homeSubs: [], awaySubs: [] }), 'K05', 'K21')
  assert.ok(lu)
  assert.equal(lu.home.substitutes.length, 0)
})

test('코드 미지정 인자면 코드검증 생략(11명만 확인)', () => {
  const lu = parseLineupHtml(buildMatch({ homeStarters: XI(11), awayStarters: XI(11) }), null, null)
  assert.ok(lu)
  assert.equal(lu.home.starters.length, 11)
})
