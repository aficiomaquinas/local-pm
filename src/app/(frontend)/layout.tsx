import { AppShell } from '@/components/shell/AppShell'
import { ShortcutProvider } from '@/lib/shortcuts'
import { ToastProvider } from '@/components/ui/Toast'

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShortcutProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </ShortcutProvider>
  )
}
