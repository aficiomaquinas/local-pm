interface IconProps {
  className?: string
}

const BARS = [
  { x: 3, y: 14, height: 7 },
  { x: 10, y: 9.5, height: 11.5 },
  { x: 17, y: 5, height: 16 },
] as const

function Bars({ filled, className }: { filled: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
      className={className}
      focusable="false"
      aria-hidden
    >
      {BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.y}
          width={4}
          height={bar.height}
          rx={1.5}
          fill={index < filled ? 'currentColor' : 'none'}
          opacity={index < filled ? 1 : 0.35}
        />
      ))}
    </svg>
  )
}

export function PriorityNone({ className }: IconProps) {
  return <Bars filled={0} className={className} />
}

export function PriorityLow({ className }: IconProps) {
  return <Bars filled={1} className={className} />
}

export function PriorityMedium({ className }: IconProps) {
  return <Bars filled={2} className={className} />
}

export function PriorityHigh({ className }: IconProps) {
  return <Bars filled={3} className={className} />
}

export function PriorityUrgent({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      aria-hidden
    >
      <rect x={3} y={3} width={18} height={18} rx={4} fill="currentColor" stroke="none" />
      <path d="M12 7.5v6" stroke="var(--color-bg)" />
      <path d="M12 16.75h.01" stroke="var(--color-bg)" />
    </svg>
  )
}
