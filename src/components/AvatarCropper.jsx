import { useState, useRef, useEffect, useCallback } from 'react'
import { useLang } from '../contexts/LanguageContext.jsx'

// 프로필 이미지 1:1 크롭 모달.
// - 정사각형 프레임 안에서 이미지를 드래그(이동) + 줌(슬라이더)으로 배치
// - 원형 오버레이로 실제 원형 프로필 미리보기 제공
// - 확인 시 보이는 정사각 영역을 canvas 로 그려 PNG blob 반환(onCropped)
const FRAME = 260   // 화면 프레임 px
const OUTPUT = 400  // 저장 해상도 px

export default function AvatarCropper({ src, onCancel, onCropped }) {
  const { t } = useLang()
  const [img, setImg] = useState(null)          // HTMLImageElement
  const [zoom, setZoom] = useState(1)           // 1 ~ 3
  const [offset, setOffset] = useState({ x: 0, y: 0 }) // 프레임 기준 이미지 좌상단 위치(px)
  const baseScaleRef = useRef(1)
  const dragRef = useRef(null)

  // 이미지 로드 → 프레임을 "cover" 하는 기본 스케일 계산 + 중앙 정렬
  useEffect(() => {
    const image = new Image()
    image.onload = () => {
      const base = Math.max(FRAME / image.naturalWidth, FRAME / image.naturalHeight)
      baseScaleRef.current = base
      setImg(image)
      setZoom(1)
      centerAt(image, base, 1)
    }
    image.src = src
  }, [src])

  function centerAt(image, base, z) {
    const scale = base * z
    const w = image.naturalWidth * scale
    const h = image.naturalHeight * scale
    setOffset({ x: (FRAME - w) / 2, y: (FRAME - h) / 2 })
  }

  const scale = baseScaleRef.current * zoom
  const dispW = img ? img.naturalWidth * scale : 0
  const dispH = img ? img.naturalHeight * scale : 0

  // 이미지가 항상 프레임을 덮도록 offset 제한
  const clamp = useCallback((o, w, h) => ({
    x: Math.min(0, Math.max(FRAME - w, o.x)),
    y: Math.min(0, Math.max(FRAME - h, o.y)),
  }), [])

  useEffect(() => {
    if (!img) return
    setOffset(o => clamp(o, dispW, dispH))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img])

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
  }
  function onPointerMove(e) {
    if (!dragRef.current) return
    const d = dragRef.current
    setOffset(clamp({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }, dispW, dispH))
  }
  function onPointerUp() { dragRef.current = null }

  function confirm() {
    if (!img) return
    // 프레임(FRAME) → 이미지 좌표계 매핑 후 OUTPUT 캔버스에 그린다.
    const srcSize = FRAME / scale
    const srcX = (-offset.x) / scale
    const srcY = (-offset.y) / scale
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob(blob => { if (blob) onCropped(blob) }, 'image/png', 0.92)
  }

  return (
    <div className="crop-overlay" role="dialog" aria-modal="true" aria-label={t('profile.cropTitle')}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="crop-modal">
        <h3 className="crop-title">{t('profile.cropTitle')}</h3>
        <p className="crop-desc">{t('profile.cropDesc')}</p>

        <div className="crop-stage" style={{ width: FRAME, height: FRAME }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {img && (
            <img
              className="crop-img"
              src={src}
              alt=""
              draggable={false}
              style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          )}
          <div className="crop-ring" aria-hidden="true" />
        </div>

        <div className="crop-zoom">
          <span aria-hidden="true" className="crop-zoom-ic small">＋</span>
          <input type="range" min="1" max="3" step="0.01" value={zoom}
            aria-label={t('profile.cropZoom')}
            onChange={e => setZoom(Number(e.target.value))} />
        </div>

        <div className="crop-actions">
          <button type="button" className="crop-cancel" onClick={onCancel}>{t('common.cancel')}</button>
          <button type="button" className="crop-confirm" onClick={confirm} disabled={!img}>{t('profile.cropApply')}</button>
        </div>
      </div>
    </div>
  )
}
