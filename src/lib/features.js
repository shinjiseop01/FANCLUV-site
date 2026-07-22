// FANCLUV — 런타임 기능 노출 플래그(빌드타임 환경변수 기반).
//
// 코드/Edge/DB/설정을 지우지 않고 UI 노출만 제어한다. 값을 바꾸려면 환경변수만 수정 후
// 재배포하면 되며(코드 수정 불필요), Vercel 은 Vite 특성상 VITE_ 접두 변수만 클라이언트에
// 주입한다.

// 문자열/부재를 boolean 으로 안전 해석("true"만 참, 그 외/미설정은 거짓).
const asBool = (v, dflt = false) => {
  if (v === undefined || v === null || v === '') return dflt
  return String(v).trim().toLowerCase() === 'true'
}

// 소셜 로그인(Google·Kakao·NAVER) UI 노출 여부.
// 베타 오픈 기본값 = false(숨김). OAuth 구현·Edge·설정·환경변수는 그대로 유지되며 UI만 숨는다.
// 다시 노출: VITE_ENABLE_SOCIAL_LOGIN=true 로 설정 후 재배포(코드 수정 불필요).
export const SOCIAL_LOGIN_ENABLED = asBool(import.meta.env.VITE_ENABLE_SOCIAL_LOGIN, false)
