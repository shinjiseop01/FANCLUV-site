// FANCLUV — AI 작성 지원 Provider 어댑터/레지스트리.
//
// 목적: AI 공급자를 코드 변경 없이 교체할 수 있게 한다. 프론트는 이 어댑터를 직접
// 호출하지 않고, 반드시 Edge(ai-writing-assist)를 통해 서버에서 Provider 를 실행한다.
// 이 모듈은 (1) 인터페이스 계약 문서화, (2) Mock/미래 Provider 등록, (3) 서버측 선택에
// 사용된다. Provider API Key 는 절대 이 모듈(=브라우저 번들)에 포함하지 않는다.
//
// AiWritingProvider 인터페이스(§4):
//   improveText(input) / makeConstructive(input) / summarizeText(input)
//   suggestTitles(input) / structureOpinion(input) / healthCheck()
// 공통 입력 : { operation, sourceText, locale, teamId?, context?, requestId? }
// 공통 출력 : { success, outputText, titleSuggestions, warnings, provider, model,
//              requestId, usage, safetyResult, code? }
import { MockAiWritingProvider } from './mockAiWritingProvider.js'
import { AI_DEFAULTS } from './aiWritingConfig.js'

// 미래 Provider 스텁 — 실제 연결 없음(키 없음). 연결 전까지 안전하게 미구현 응답.
// 실제 구현은 Edge(서버)에서 OPENAI_API_KEY 로 이뤄져야 하며, 이 브라우저측 스텁은
// 절대 외부로 나가지 않는다.
export const OpenAiWritingProvider = {
  id: 'openai',
  model: 'unconfigured',
  __notConfigured: (i) => ({
    success: false, code: 'provider_not_configured', outputText: '', titleSuggestions: [],
    warnings: [], provider: 'openai', model: 'unconfigured', requestId: i?.requestId || null,
    usage: { estimatedInputUnits: 0, estimatedOutputUnits: 0 }, safetyResult: null,
  }),
  improveText(i) { return this.__notConfigured(i) },
  makeConstructive(i) { return this.__notConfigured(i) },
  summarizeText(i) { return this.__notConfigured(i) },
  suggestTitles(i) { return this.__notConfigured(i) },
  structureOpinion(i) { return this.__notConfigured(i) },
  healthCheck() { return { ok: false, provider: 'openai', model: 'unconfigured', reason: 'not_configured' } },
}

const REGISTRY = {
  mock: MockAiWritingProvider,
  openai: OpenAiWritingProvider,
}

// operation → 어댑터 메서드 매핑.
const OP_METHOD = {
  improve: 'improveText',
  constructive: 'makeConstructive',
  summarize: 'summarizeText',
  titles: 'suggestTitles',
  structure: 'structureOpinion',
}

// id 로 Provider 조회 — 미등록/미설정 시 Mock 으로 안전 폴백.
export function getProvider(id = AI_DEFAULTS.provider) {
  return REGISTRY[String(id || '').toLowerCase()] || REGISTRY.mock
}

// 어댑터를 통해 operation 실행(서버측 헬퍼). 동일 계약 출력.
export function runProviderOperation(providerId, input) {
  const provider = getProvider(providerId)
  const method = OP_METHOD[input?.operation]
  if (!method) return { success: false, code: 'unsupported_operation', outputText: '', titleSuggestions: [], warnings: [], provider: provider.id, model: provider.model, requestId: input?.requestId || null, usage: { estimatedInputUnits: 0, estimatedOutputUnits: 0 }, safetyResult: null }
  return provider[method](input)
}

export function providerStatus(id = AI_DEFAULTS.provider) {
  const p = getProvider(id)
  return { id: p.id, model: p.model, health: p.healthCheck() }
}
