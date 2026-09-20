import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { THEME_INIT_SCRIPT } from '@/lib/theme'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  axes: ['opsz'],
  preload: true,
  adjustFontFallback: true,
  fallback: [
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
})

export const metadata: Metadata = {
  title: 'local-pm',
  description: 'Keyboard-first project management: kanban boards, tickets, projects and teams.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfcfd' },
    { media: '(prefers-color-scheme: dark)', color: '#111113' },
  ],
}

/**
 * Shared document shell for BOTH route groups (upstream #17 split theirs —
 * one root per group — but this fork keeps the root layout serving the html
 * document; adding a second <html> per group duplicated the tree in dev).
 * The (payload)/layout.tsx mounts the admin under this document exactly as
 * Payload's blank template generates it; (frontend)/layout.tsx layers the
 * app shell.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
