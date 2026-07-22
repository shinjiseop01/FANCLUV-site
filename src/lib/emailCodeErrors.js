// FANCLUV — OTP 이메일 발송 실패 사유 → 사용자 안전 메시지/코드 매핑(순수 함수, 테스트 대상).
//
// 내부 사유(email_provider_unconfigured 등)와 시크릿·공급자 응답은 사용자에게 노출하지 않는다.
// 실제 원인은 서버(Edge) 로그와 브라우저 Console(logger.error)에서만 확인한다.

export const EMAIL_CODE_MSG = {
  // 발송 공급자 미설정/공급자 장애 → "서비스 사용 불가"(운영 이슈, 사용자 조치 불가).
  serviceUnavailable: '현재 이메일 인증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  // 수신 불가·형식 등 → 사용자가 이메일을 확인하면 되는 경우.
  sendFailed: '인증번호를 전송하지 못했습니다. 이메일 주소를 확인한 후 다시 시도해 주세요.',
  invalidEmail: '올바른 이메일 주소를 입력해 주세요.',
  duplicate: '이미 가입된 이메일입니다.',
  empty: '이메일을 입력해 주세요.',
}

// reason(서버/네트워크 코드) → { code, message }. code 는 클라이언트 분기용 stable 값.
export function emailCodeErrorInfo(reason) {
  switch (reason) {
    case 'email_provider_unconfigured':
    case 'provider_unconfigured':
      return { code: 'provider_unavailable', message: EMAIL_CODE_MSG.serviceUnavailable }
    case 'email_send_failed':
    case 'store_failed':
      return { code: 'send_failed', message: EMAIL_CODE_MSG.sendFailed }
    case 'invalid_email':
      return { code: 'invalid_email', message: EMAIL_CODE_MSG.invalidEmail }
    default:
      return { code: reason || 'send_failed', message: EMAIL_CODE_MSG.sendFailed }
  }
}
