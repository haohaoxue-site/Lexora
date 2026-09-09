interface EditorSize {
  width: number
  height: number
}

const callbacks = new Map<Element, (size: EditorSize) => void>()
const pending = new Map<Element, EditorSize>()
let observer: ResizeObserver | null = null
let frame: number | null = null

function flush() {
  frame = null
  const updates = [...pending]
  pending.clear()
  for (const [element, size] of updates)
    callbacks.get(element)?.(size)
}

export function observeDesktopMonacoLayout(element: HTMLElement, layout: (size: EditorSize) => void): () => void {
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0)
        pending.set(entry.target, { width, height })
    }
    if (pending.size && frame === null)
      frame = requestAnimationFrame(flush)
  })
  callbacks.set(element, layout)
  observer.observe(element)
  return () => {
    observer?.unobserve(element)
    callbacks.delete(element)
    pending.delete(element)
    if (!callbacks.size) {
      observer?.disconnect()
      observer = null
      if (frame !== null)
        cancelAnimationFrame(frame)
      frame = null
    }
  }
}
