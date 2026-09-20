import { Sidebar } from '@/components/Sidebar'
import { AnonymousBanner } from '@/components/auth/AuthStatusBanner'

export default function FrontendLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {/* SPC-007 v2: topbar banner for the anonymous state only. An
            authenticated session is indicated exclusively by the sidebar
            user block (UserMenu, hosted by Sidebar bottom-left). */}
        <AnonymousBanner />
        {children}
      </main>
    </div>
  )
}
