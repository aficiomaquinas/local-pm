'use client'

export function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 shrink-0 text-text-muted" />}
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-muted">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}
