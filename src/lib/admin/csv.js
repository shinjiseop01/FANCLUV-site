// FANCLUV — CSV export helper (관리자 데이터 다운로드).
//
// buildCsv(columns, rows) → CSV 문자열, downloadCsv(filename, csv) → 브라우저 다운로드.
// columns: [{ key, label }]. rows: 객체 배열(row[key] 로 값 추출).
// Excel 한글 깨짐 방지를 위해 UTF-8 BOM 을 붙인다.

// 값 1개를 CSV 셀로 이스케이프 (쉼표/따옴표/줄바꿈 포함 시 큰따옴표로 감싼다).
function escapeCell(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildCsv(columns, rows) {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const lines = rows.map(row => columns.map(c => escapeCell(row[c.key])).join(','))
  return [header, ...lines].join('\r\n')
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// 파일명에 날짜 접미사 (fancluv_members_2026-07-06.csv)
export function dateSuffix() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// columns + rows + 파일 베이스명을 받아 바로 다운로드.
export function exportCsv(baseName, columns, rows) {
  downloadCsv(`${baseName}_${dateSuffix()}`, buildCsv(columns, rows))
}
