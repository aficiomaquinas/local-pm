import { AppShell } from '@/components/shell/AppShell'
import { ShortcutProvider } from '@/lib/shortcuts'
import { ToastProvider } from '@/components/ui/Toast'
import { TooltipProvider } from '@/components/ui/Tooltip'

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShortcutProvider>
      <ToastProvider>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </ToastProvider>
    </ShortcutProvider>
  )
}
