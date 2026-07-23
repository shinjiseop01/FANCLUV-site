// FC안양 collector 순수 파서/새니타이즈 단위 테스트 (node --test)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAnyangList, parseAnyangDetail, htmlToParagraphs } from './collect-anyang-news.js'

test('parseAnyangList: goDetail(seq) + 제목 추출, 중복 제거', () => {
  const html = `
    <table>
      <tr onclick="goDetail(1126)"><td><a href="#">FC안양, 미드필더 마테우스와 재계약 체결&nbsp;</a></td></tr>
      <tr onclick="goDetail(1125)"><td><a href="#">FC안양, 카메룬 공격수 블레이즈 영입</a></td></tr>
      <tr onclick="goDetail(1126)"><td><a href="#">중복 링크</a></td></tr>
    </table>`
  const out = parseAnyangList(html)
  assert.equal(out.length, 2)
  assert.equal(out[0].source_article_id, '1126')
  assert.equal(out[0].team_id, 'anyang')
  assert.equal(out[0].category, '이적')            // 재계약 → 이적
  assert.ok(out[0].source_url.includes('newsDetail.asp?menu=TNews&seq=1126'))
})

test('htmlToParagraphs: 태그/스크립트/이중인코딩/세미콜론없는 엔티티 제거', () => {
  const dirty = 'Lo&iumlc &nbsp&nbsp K&#39;s &amp; <script>alert(1)</script><b>text</b> &#60;img src=x&#62; &eacute;quipe'
  const out = htmlToParagraphs(dirty)
  assert.ok(!/[<>]/.test(out), 'no angle brackets remain')
  assert.ok(!/&[a-zA-Z#]/.test(out), 'no raw entities remain')
  assert.ok(out.includes('Loïc'), 'latin-1 decoded')
  assert.ok(out.includes('équipe'), 'accent decoded')
  assert.ok(!out.includes('alert'), 'script content removed')
})

test('parseAnyangDetail: view_data 본문 추출 + 이미지 절대경로', () => {
  const html = `<div class="sub_content"><span>2026-07-15</span>
    <div class="view_data"><img src="/DATA/TNews/img.jpg"><p>본문 내용입니다. 충분히 긴 문장을 담고 있습니다.</p></div>
    <div class="btn_center">버튼</div></div>`
  const d = parseAnyangDetail(html)
  assert.ok(d.content.includes('본문 내용'))
  assert.equal(d.image, 'https://www.fc-anyang.com/DATA/TNews/img.jpg')
  assert.ok(d.date.startsWith('2026-07-15'))
})
