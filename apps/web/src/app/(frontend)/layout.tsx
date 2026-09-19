import { Sidebar } from '@/components/Sidebar'
import { AuthStatusBanner } from '@/components/auth/AuthStatusBanner'

export default function FrontendLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <AuthStatusBanner />
        {children}
      </main>
    </div>
  )
}
