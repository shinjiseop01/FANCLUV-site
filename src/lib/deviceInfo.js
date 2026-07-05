// FANCLUV — 현재 로그인 기기 정보(계정 보안 표시용).
//
// navigator.userAgent 를 파싱해 기기/브라우저/OS 를 추정한다. 국가/시간은
// 실제 세션 추적(서버) 전이라 Mock 구조로 준비 — 추후 로그인 세션 테이블과
// 연결하면 이 함수만 실제 데이터로 교체하면 된다.
export function getCurrentDevice() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  let os = 'Unknown'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Linux/i.test(ua)) os = 'Linux'

  let browser = 'Unknown'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua)) browser = 'Opera'
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome'
  else if (/Safari\//i.test(ua) && /Version\//i.test(ua)) browser = 'Safari'
  else if (/Firefox\//i.test(ua)) browser = 'Firefox'

  // 기기 라벨(간단 추정)
  let device = os === 'macOS' ? 'Mac' : os === 'Windows' ? 'PC' : os
  if (/iPhone/i.test(ua)) device = 'iPhone'
  else if (/iPad/i.test(ua)) device = 'iPad'
  else if (/Android/i.test(ua)) device = 'Android'

  return {
    device,
    browser,
    os,
    // Mock: 실제 세션 추적 전까지 지역/시각은 데모 값. 구조만 준비.
    country: '대한민국',
    current: true,
    lastActiveAt: new Date().toISOString(),
  }
}
