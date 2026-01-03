import './globals.css'

export const metadata = {
  title: '百越仓库管理系统',
  description: '成品仓库出入库管理',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
