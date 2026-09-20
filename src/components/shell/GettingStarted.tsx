'use client'

import { ArrowRight, FolderKanban, LayoutDashboard, Search, Ticket, Users } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { LinkButton } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Kbd'

const steps = [
  {
    icon: FolderKanban,
    title: 'Give your work a home',
    description:
      'Create a project for a goal, client, or area of work. Its short prefix makes every ticket easy to recognize.',
    href: '/projects/new',
    action: 'Create a project',
  },
  {
    icon: Ticket,
    title: 'Start with one small next step',
    description:
      'A title and a project are all you need. Add an owner, a due date, or a checklist when they help.',
    href: '/tickets/new',
    action: 'Create a ticket',
  },
  {
    icon: LayoutDashboard,
    title: 'Keep the next step visible',
    description:
      'Move tickets from Todo to In Progress to Done. Drag a card, or use its menu to move it with your keyboard.',
    href: '/board',
    action: 'Open the board',
  },
]

export function GettingStarted({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Make room for your best work"
      description="A small workspace. A clear next step. Start here."
      size="md"
      initialFocus="heading"
    >
      <ol className="flex flex-col gap-6">
        {steps.map((step, index) => (
          <li key={step.href} className="flex gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle text-text-muted">
              <step.icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-md font-medium">
                {index + 1}. {step.title}
              </h3>
              <p className="mt-1 text-base text-text-muted">{step.description}</p>
              <LinkButton
                href={step.href}
                variant="link"
                trailingIcon={ArrowRight}
                onClick={onClose}
                className="mt-2"
              >
                {step.action}
              </LinkButton>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-3 rounded-lg bg-bg-subtle p-4 text-sm text-text-muted">
        <p className="flex items-center gap-2">
          <Search className="size-4 shrink-0" aria-hidden />
          <span>Find a ticket by title or key, anywhere.</span>
          <Kbd keys="mod+k" className="ml-auto" />
        </p>
        <p className="flex items-center gap-2">
          <Users className="size-4 shrink-0" aria-hidden />
          <span>Teams are optional. Start simple and organize as you grow.</span>
        </p>
      </div>
    </Dialog>
  )
}
