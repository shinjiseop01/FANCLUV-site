// FANCLUV — AI 리포트 생성 진입점.
// 관리자 화면은 generateAiReport() 하나만 호출하면 된다.
import { buildReportModel, REPORT_PERIODS } from './reportModel.js'
import { generateAiReportPdf } from './generatePdf.js'

export { REPORT_PERIODS }

// clubId 의 최신 AI 인사이트로 PDF 리포트를 생성·다운로드한다.
// periodType: 'current' | 'monthly' | 'quarterly' | 'yearly' (향후 확장)
// 반환: { ok, fileName } | { ok:false, code:'no_insight' }
export async function generateAiReport({ clubId = 'all', periodType = 'monthly', t }) {
  const model = await buildReportModel({ clubId, periodType })
  if (!model.ok) return model
  return generateAiReportPdf(model, t)
}
