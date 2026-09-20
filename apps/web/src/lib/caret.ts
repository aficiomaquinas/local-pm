const MIRRORED: (keyof CSSStyleDeclaration & string)[] = [
  'boxSizing',
  'width',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'textIndent',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
]

export interface CaretPoint {
  top: number
  left: number
  height: number
}

export function caretPoint(el: HTMLTextAreaElement, position: number): CaretPoint {
  const computed = getComputedStyle(el)
  const mirror = document.createElement('div')

  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  mirror.style.overflow = 'hidden'
  mirror.style.top = '0'
  mirror.style.left = '-9999px'

  for (const property of MIRRORED) {
    mirror.style.setProperty(
      property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
      computed.getPropertyValue(property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)),
    )
  }

  mirror.textContent = el.value.slice(0, position)

  const marker = document.createElement('span')
  marker.textContent = el.value.slice(position) || '.'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  const top = marker.offsetTop - el.scrollTop
  const left = marker.offsetLeft - el.scrollLeft
  const height = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.4 || 20
  document.body.removeChild(mirror)

  return { top, left, height }
}
