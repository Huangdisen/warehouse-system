'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const menuItems = [
  { href: '/dashboard', label: '仪表盘', icon: '📊' },
  { href: '/products', label: '产品管理', icon: '📦', adminOnly: true },
  { href: '/production', label: '提交生产记录', icon: '📝' },
  { href: '/production/confirm', label: '确认入库', icon: '✅', showPendingCount: true },
  { href: '/stock/in', label: '入库', icon: '📥' },
  { href: '/stock/out', label: '出库', icon: '📤' },
  { href: '/records', label: '出入库记录', icon: '📋' },
  { href: '/customers', label: '客户管理', icon: '👥' },
]

export default function Sidebar({ user, profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    fetchPendingCount()
    // 每30秒刷新一次待处理数量
    const interval = setInterval(fetchPendingCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchPendingCount = async () => {
    const { count } = await supabase
      .from('production_records')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    setPendingCount(count || 0)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="w-64 bg-gray-800 min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-white text-xl font-bold">仓库管理系统</h1>
        <p className="text-gray-400 text-sm mt-1">成品仓库</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-4 py-2 rounded-lg transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.label}
                  {item.showPendingCount && pendingCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm">{profile?.name || user?.email}</p>
            <p className="text-gray-400 text-xs">
              {isAdmin ? '管理员' : '仓管员'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white transition"
            title="退出登录"
          >
            🚪
          </button>
        </div>
      </div>
    </div>
  )
}
