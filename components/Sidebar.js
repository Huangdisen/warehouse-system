'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const menuItems = [
  { href: '/dashboard', label: '仪表盘', icon: '📊' },
  { href: '/products', label: '产品管理', icon: '📦' },
  { href: '/production', label: '提交生产记录', icon: '📝' },
  { href: '/production/confirm', label: '确认入库', icon: '✅', showPendingCount: true },
  { href: '/stock/in', label: '入库', icon: '📥' },
  { href: '/stock/out', label: '出库', icon: '📤' },
  { href: '/records', label: '出入库记录', icon: '📋' },
  { href: '/customers', label: '客户管理', icon: '👥' },
]

export default function Sidebar({ user, profile, onProfileUpdate }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)
  const [showNameModal, setShowNameModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

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

  const openNameModal = () => {
    setNewName(profile?.name || '')
    setShowNameModal(true)
  }

  const handleSaveName = async () => {
    if (!newName.trim()) {
      alert('请输入昵称')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ name: newName.trim() })
      .eq('id', user.id)

    if (error) {
      alert('保存失败：' + error.message)
    } else {
      setShowNameModal(false)
      if (onProfileUpdate) {
        onProfileUpdate({ ...profile, name: newName.trim() })
      }
    }
    setSaving(false)
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
                  className={`flex items-center px-4 py-2 rounded-lg transition ${isActive
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
          <div
            onClick={openNameModal}
            className="cursor-pointer hover:bg-gray-700 rounded px-2 py-1 -mx-2 -my-1 transition"
            title="点击修改昵称"
          >
            <p className="text-white text-sm flex items-center">
              {profile?.name || user?.email}
              <span className="ml-1 text-gray-500 text-xs">✏️</span>
            </p>
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

      {/* 修改昵称弹窗 */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">修改昵称</h2>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              placeholder="输入新昵称"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={handleSaveName}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
