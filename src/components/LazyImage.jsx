import { useState } from 'react'

// FANCLUV — 지연 로딩 이미지.
//
// - loading="lazy" + decoding="async" 로 뷰포트 밖 이미지는 늦게 로드(성능).
// - 로딩 실패 시(onError) placeholder(대체 노드)를 표시 → 깨진 이미지 아이콘 방지.
//   placeholder 를 주지 않으면 기본 회색 자리표시자(fc-img-ph)를 그린다.
// - alt 는 접근성을 위해 항상 전달(장식용이면 빈 문자열).
//
// 프로필 이미지 · 뉴스 이미지 등 "외부/사용자 업로드 이미지"에 사용한다.
export default function LazyImage({
  src,
  alt = '',
  className = '',
  placeholder,
  width,
  height,
  ...rest
}) {
  const [failed, setFailed] = useState(false)

  // src 자체가 없거나 로딩 실패 → placeholder.
  if (!src || failed) {
    if (placeholder !== undefined) return placeholder
    return (
      <span
        className={`fc-img-ph ${className}`}
        style={{ width, height }}
        aria-hidden="true"
      />
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      {...rest}
    />
  )
}
