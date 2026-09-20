import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] }],
      shadow: [{ shadow: ['e1', 'e2', 'e3', 'e4'] }],
      rounded: [{ rounded: ['xs', 'sm', 'md', 'lg', 'xl', 'full', 'none'] }],
      animate: [{ animate: ['fade-in', 'panel-in', 'dialog-in', 'toast-in', 'land', 'pulse-soft'] }],
      duration: [{ duration: ['micro', 'fast', 'standard', 'entrance', 'large'] }],
      ease: [{ ease: ['enter', 'exit', 'standard'] }],
    },
  },
})

type ClassValue = string | number | null | undefined | false | ClassValue[] | Record<string, boolean | undefined | null>

function flatten(inputs: ClassValue[], out: string[]): void {
  for (const input of inputs) {
    if (!input) continue
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input))
    } else if (Array.isArray(input)) {
      flatten(input, out)
    } else {
      for (const [key, value] of Object.entries(input)) {
        if (value) out.push(key)
      }
    }
  }
}

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []
  flatten(inputs, out)
  return twMerge(out.join(' '))
}
