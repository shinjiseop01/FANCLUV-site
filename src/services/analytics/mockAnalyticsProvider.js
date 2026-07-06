// FANCLUV — Analytics Mock Provider.
//
// 실제 수집기(GA4/Clarity)를 붙이기 전까지 사용하는 개발용 Provider.
// 실제 전송은 하지 않고, 개발 환경에서만 로그로 남겨 계측 지점이 잘 호출되는지 확인한다.
// 운영 빌드에서는 아무 것도 하지 않는다(no-op).
import { logger } from '../../lib/logger.js'

const IS_DEV = Boolean(import.meta.env?.DEV)

export const mockAnalyticsProvider = {
  name: 'mock',

  init() {
    if (IS_DEV) logger.debug('analytics(mock) init')
  },

  pageView(path, meta) {
    if (IS_DEV) logger.debug(`analytics(mock) pageView: ${path}`, { context: meta })
  },

  track(event, props) {
    if (IS_DEV) logger.debug(`analytics(mock) track: ${event}`, { context: props })
  },

  identify(id, traits) {
    if (IS_DEV) logger.debug(`analytics(mock) identify: ${id}`, { context: traits })
  },
}

export default mockAnalyticsProvider
