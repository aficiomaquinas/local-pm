export const STICKY_HEADER_ATTR = 'data-sticky-header'

const GAP = 16

export function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    if (
      /(auto|scroll|overlay)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

export function stickyHeaderHeight(root: ParentNode): number {
  const header = root.querySelector<HTMLElement>(`[${STICKY_HEADER_ATTR}]`)
  if (!header) return 0
  const style = getComputedStyle(header)
  if (style.position !== 'sticky' && style.position !== 'fixed') return 0
  return header.getBoundingClientRect().height
}

export function offsetFromTop(el: HTMLElement): number {
  const container = scrollParent(el)
  const root = container ?? document.body
  const containerTop = container ? container.getBoundingClientRect().top : 0
  return el.getBoundingClientRect().top - containerTop - stickyHeaderHeight(root) - GAP
}

export function bringBelowHeader(el: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
  const delta = Math.round(offsetFromTop(el))
  if (Math.abs(delta) < 2) return

  const container = scrollParent(el)
  if (container) container.scrollBy({ top: delta, behavior })
  else window.scrollBy({ top: delta, behavior })
}
