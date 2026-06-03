// src/app/bootcamp/layout.tsx
import type { Metadata } from 'next'
import { Inter, Source_Serif_4 } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600'],
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'Vibe Product & Coding Bootcamp — OAC Reskilling × Harari.ai',
  description: 'Bootcamp 2 buổi offline tại TP.HCM. Không cần biết code. Mang một ý tưởng đến — về với một sản phẩm thật.',
}

export default function BootcampLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${sourceSerif.variable}`}>
      {children}
    </div>
  )
}
