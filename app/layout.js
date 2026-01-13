import './globals.css'
import { Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google'

const bodyFont = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
})

const displayFont = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['600', '700', '900'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata = {
  title: '百越仓库管理系统',
  description: '成品仓库出入库管理',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        {children}
      </body>
    </html>
  )
}
