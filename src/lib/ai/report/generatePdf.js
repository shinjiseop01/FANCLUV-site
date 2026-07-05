// FANCLUV — AI 리포트 PDF 생성기.
//
// 리포트 모델(reportModel)을 A4 세로, 기업 보고서 스타일 HTML 로 그린 뒤
// html2canvas 로 캡처해 jsPDF 로 PDF 를 만든다. (한글 렌더링을 위해 브라우저 폰트를 그대로
// 래스터화 — jsPDF 기본 폰트는 한글 미지원.)
//
// 라이브러리(jspdf/html2canvas)는 동적 import 로 리포트 생성 시에만 로드해 메인 번들을
// 가볍게 유지한다. 색상은 FANCLUV Primary + 구단 대표 색상 위주.
import { FANCLUV_PRIMARY } from './reportModel.js'

const A4 = { wPx: 794, hPx: 1123 } // 96dpi 기준 A4 세로

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 공용 폰트 스택 (앱과 동일 계열)
const FONT = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',-apple-system,BlinkMacSystemFont,system-ui,sans-serif"

// FANCLUV 로고를 dataURL 로 (없으면 null → 표지에서 생략)
async function loadLogoDataUrl() {
  try {
    const res = await fetch('/logo.png')
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise(resolve => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.readAsDataURL(blob)
    })
  } catch { return null }
}

// ── 표지 HTML (정확히 A4 1페이지) ──
function coverHtml(model, t, logo) {
  const c = model.team.colorDeep || FANCLUV_PRIMARY
  return `
  <div style="width:${A4.wPx}px;height:${A4.hPx}px;box-sizing:border-box;background:#fff;font-family:${FONT};position:relative;overflow:hidden;">
    <div style="height:16px;background:${FANCLUV_PRIMARY};"></div>
    <div style="padding:70px 64px 0;">
      ${logo ? `<img src="${logo}" alt="" style="height:54px;width:auto;object-fit:contain;" />` : `<div style="font-size:30px;font-weight:900;color:${FANCLUV_PRIMARY};letter-spacing:-1px;">FANCLUV</div>`}
    </div>
    <div style="position:absolute;top:340px;left:64px;right:64px;">
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:26px;">
        <div style="width:64px;height:64px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;">${esc(model.team.short)}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:${c};">${esc(model.team.nameEn)}</div>
          <div style="font-size:30px;font-weight:900;color:#15171C;letter-spacing:-0.5px;">${esc(model.team.name)}</div>
        </div>
      </div>
      <div style="font-size:40px;font-weight:900;color:#15171C;line-height:1.2;letter-spacing:-1px;">${esc(t('aiReport.docTitle'))}</div>
      <div style="width:72px;height:5px;background:${FANCLUV_PRIMARY};margin:22px 0 30px;border-radius:3px;"></div>
      <table style="font-size:15px;color:#3A3F47;border-collapse:collapse;">
        <tr><td style="padding:6px 28px 6px 0;color:#8A9099;font-weight:700;">${esc(t('aiReport.period'))}</td><td style="font-weight:700;">${esc(model.periodLabel)}</td></tr>
        <tr><td style="padding:6px 28px 6px 0;color:#8A9099;font-weight:700;">${esc(t('aiReport.generated'))}</td><td style="font-weight:700;">${esc(model.generatedAtLabel)}</td></tr>
      </table>
    </div>
    <div style="position:absolute;bottom:56px;left:64px;right:64px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #E6E8EB;padding-top:18px;">
      <span style="font-size:12.5px;color:#8A9099;font-weight:700;">FANCLUV · ${esc(t('aiReport.confidential'))}</span>
      <span style="font-size:12.5px;color:${FANCLUV_PRIMARY};font-weight:800;">AI Fan Insight Report</span>
    </div>
  </div>`
}

function sectionTitle(text, color) {
  return `<div style="display:flex;align-items:center;gap:10px;margin:0 0 16px;">
    <span style="width:5px;height:20px;background:${color};border-radius:3px;display:inline-block;"></span>
    <span style="font-size:19px;font-weight:900;color:#15171C;letter-spacing:-0.3px;">${esc(text)}</span>
  </div>`
}

function sentimentHtml(model, t, color) {
  const s = model.sentiment
  const segs = [
    { label: t('aiReport.pos'), v: s.positive, color: color },
    { label: t('aiReport.neu'), v: s.neutral, color: '#C9CCD1' },
    { label: t('aiReport.neg'), v: s.negative, color: '#E05252' },
  ]
  const bar = segs.map(x => `<div style="width:${Math.max(0, x.v)}%;background:${x.color};"></div>`).join('')
  const legend = segs.map(x => `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="width:12px;height:12px;border-radius:3px;background:${x.color};display:inline-block;"></span>
      <span style="font-size:14px;color:#3A3F47;font-weight:700;">${esc(x.label)}</span>
      <span style="font-size:14px;color:#15171C;font-weight:900;margin-left:auto;">${x.v}%</span>
    </div>`).join('')
  return `
    <div style="display:flex;height:34px;border-radius:8px;overflow:hidden;margin-bottom:16px;">${bar}</div>
    <div style="display:flex;flex-direction:column;gap:9px;max-width:360px;">${legend}</div>`
}

function keywordsHtml(model, color) {
  const max = Math.max(1, ...model.keywords.map(k => k.count))
  return `<div style="display:flex;flex-direction:column;gap:9px;">` + model.keywords.map(k => `
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="width:22px;font-size:13px;font-weight:800;color:${color};">${k.rank}</span>
      <span style="width:120px;font-size:14px;font-weight:700;color:#15171C;">${esc(k.tag)}</span>
      <span style="flex:1;height:12px;background:#F1F2F4;border-radius:6px;overflow:hidden;"><span style="display:block;height:100%;width:${Math.round((k.count / max) * 100)}%;background:${color};"></span></span>
      <span style="width:56px;text-align:right;font-size:13px;font-weight:800;color:#3A3F47;">${k.count}</span>
    </div>`).join('') + `</div>`
}

function categoriesHtml(model, color) {
  if (!model.categories.length) return `<p style="font-size:14px;color:#8A9099;">-</p>`
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">` + model.categories.map(c => `
    <div style="border:1px solid #E6E8EB;border-left:4px solid ${color};border-radius:10px;padding:12px 14px;">
      <div style="font-size:14.5px;font-weight:800;color:#15171C;margin-bottom:3px;">${esc(c.name)}</div>
      <div style="font-size:12.5px;color:#6B7178;line-height:1.5;">${esc(c.note)}</div>
    </div>`).join('') + `</div>`
}

function satisfactionHtml(model, color) {
  const pct = Math.max(0, Math.min(100, model.satisfaction))
  return `
    <div style="display:flex;align-items:center;gap:26px;">
      <div style="font-size:52px;font-weight:900;color:${color};letter-spacing:-2px;">${pct}<span style="font-size:22px;color:#8A9099;font-weight:800;"> / 100</span></div>
      <div style="flex:1;">
        <div style="height:18px;background:#F1F2F4;border-radius:9px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:9px;"></div>
        </div>
      </div>
    </div>`
}

function suggestionsHtml(model, color) {
  if (!model.suggestions.length) return `<p style="font-size:14px;color:#8A9099;">-</p>`
  return `<div style="display:flex;flex-direction:column;gap:12px;">` + model.suggestions.map(s => `
    <div style="display:flex;gap:14px;">
      <span style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:${color};color:#fff;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;">${s.rank}</span>
      <div>
        <div style="font-size:15px;font-weight:800;color:#15171C;">${esc(s.title)}</div>
        ${s.desc ? `<div style="font-size:13px;color:#6B7178;line-height:1.55;margin-top:2px;">${esc(s.desc)}</div>` : ''}
      </div>
    </div>`).join('') + `</div>`
}

function kpiHtml(model, t, color) {
  const items = [
    { label: t('aiReport.kpiOpinions'), value: model.kpi.opinions.toLocaleString() },
    { label: t('aiReport.kpiComments'), value: model.kpi.comments.toLocaleString() },
    { label: t('aiReport.kpiFans'), value: model.kpi.members.toLocaleString() },
    { label: t('aiReport.kpiResponses'), value: model.kpi.responses.toLocaleString() },
    { label: t('aiReport.kpiAiDate'), value: model.kpi.aiRunDate },
  ]
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">` + items.map(it => `
    <div style="border:1px solid #E6E8EB;border-radius:12px;padding:16px;">
      <div style="font-size:22px;font-weight:900;color:${color};letter-spacing:-0.5px;">${esc(it.value)}</div>
      <div style="font-size:12.5px;color:#6B7178;font-weight:700;margin-top:4px;">${esc(it.label)}</div>
    </div>`).join('') + `</div>`
}

// ── 본문 HTML (여러 섹션, 높이 가변) ──
function bodyHtml(model, t) {
  const color = model.team.colorDeep || FANCLUV_PRIMARY
  const block = (title, inner) => `<section style="margin-bottom:34px;">${sectionTitle(title, color)}${inner}</section>`
  return `
  <div style="width:${A4.wPx}px;box-sizing:border-box;background:#fff;font-family:${FONT};padding:56px 64px 64px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid ${FANCLUV_PRIMARY};padding-bottom:12px;margin-bottom:32px;">
      <span style="font-size:16px;font-weight:900;color:#15171C;">${esc(model.team.name)} · AI Fan Insight</span>
      <span style="font-size:12.5px;color:#8A9099;font-weight:700;">${esc(model.periodLabel)}</span>
    </div>
    ${block(t('aiReport.summary'), `<p style="font-size:15px;color:#3A3F47;line-height:1.75;margin:0;background:#F7F5FF;border-radius:12px;padding:18px 20px;">${esc(model.summary)}</p>`)}
    ${block(t('aiReport.sentiment'), sentimentHtml(model, t, color))}
    ${block(t('aiReport.keywords'), keywordsHtml(model, color))}
    ${block(t('aiReport.complaints'), categoriesHtml(model, color))}
    ${block(t('aiReport.satisfaction'), satisfactionHtml(model, color))}
    ${block(t('aiReport.suggestions'), suggestionsHtml(model, color))}
    ${block(t('aiReport.kpi'), kpiHtml(model, t, color))}
    <div style="margin-top:40px;border-top:1px solid #E6E8EB;padding-top:14px;font-size:11.5px;color:#A0A5AC;text-align:center;">
      © ${new Date().getFullYear()} FANCLUV · ${esc(t('aiReport.confidential'))}
    </div>
  </div>`
}

// 오프스크린에 HTML 을 렌더해 html2canvas 로 캡처
async function captureHtml(html, html2canvas) {
  const holder = document.createElement('div')
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;'
  holder.innerHTML = html
  document.body.appendChild(holder)
  const target = holder.firstElementChild
  // 이미지 로드 대기
  await Promise.all([...holder.querySelectorAll('img')].map(img => img.complete
    ? Promise.resolve()
    : new Promise(r => { img.onload = r; img.onerror = r })))
  try {
    return await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })
  } finally {
    document.body.removeChild(holder)
  }
}

// 캔버스를 A4 PDF 페이지들에 추가 (세로로 길면 페이지 분할)
function addCanvasPaged(pdf, canvas, pageW, pageH) {
  const imgW = pageW
  const imgH = (canvas.height * imgW) / canvas.width
  const data = canvas.toDataURL('image/jpeg', 0.92)
  let heightLeft = imgH
  let position = 0
  pdf.addImage(data, 'JPEG', 0, position, imgW, imgH, '', 'FAST')
  heightLeft -= pageH
  while (heightLeft > 0) {
    position -= pageH
    pdf.addPage()
    pdf.addImage(data, 'JPEG', 0, position, imgW, imgH, '', 'FAST')
    heightLeft -= pageH
  }
}

// ── 메인: 리포트 모델 → PDF 다운로드 ──
export async function generateAiReportPdf(model, t) {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])
  const html2canvas = html2canvasMod.default
  const logo = await loadLogoDataUrl()

  const coverCanvas = await captureHtml(coverHtml(model, t, logo), html2canvas)
  const bodyCanvas = await captureHtml(bodyHtml(model, t), html2canvas)

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210, pageH = 297
  // 표지: 정확히 1페이지
  pdf.addImage(coverCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, pageH, '', 'FAST')
  // 본문: 새 페이지부터, 길면 분할
  pdf.addPage()
  addCanvasPaged(pdf, bodyCanvas, pageW, pageH)

  pdf.save(model.fileName)
  return { ok: true, fileName: model.fileName }
}
