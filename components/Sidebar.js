'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const Icon = ({ children, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    className={`h-4 w-4 ${className}`}
  >
    {children}
  </svg>
)

const icons = {
  dashboard: (
    <Icon>
      <path d="M3 3h7v7H3z" />
      <path d="M14 3h7v4h-7z" />
      <path d="M14 10h7v11h-7z" />
      <path d="M3 12h7v9H3z" />
    </Icon>
  ),
  products: (
    <Icon>
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </Icon>
  ),
  cartons: (
    <Icon>
      <path d="M3 6h18v12H3z" />
      <path d="M3 6l3-3h12l3 3" />
      <path d="M12 6v12" />
      <path d="M8 9h2" />
      <path d="M14 9h2" />
    </Icon>
  ),
  inventory: (
    <Icon>
      <path d="M9 3h6l1 2h3v16H5V5h3l1-2z" />
      <path d="M9 3h6" />
      <path d="M8 10h8" />
      <path d="M8 14h8" />
    </Icon>
  ),
  production: (
    <Icon>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </Icon>
  ),
  confirm: (
    <Icon>
      <path d="M9 12l2 2 4-4" />
      <path d="M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18z" />
    </Icon>
  ),
  stockIn: (
    <Icon>
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </Icon>
  ),
  stockOut: (
    <Icon>
      <path d="M12 21V9" />
      <path d="M7 14l5-5 5 5" />
      <path d="M4 3h16" />
    </Icon>
  ),
  records: (
    <Icon>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h1" />
      <path d="M3 12h1" />
      <path d="M3 18h1" />
    </Icon>
  ),
  customers: (
    <Icon>
      <path d="M16 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  ),
  edit: (
    <Icon className="h-3.5 w-3.5">
      <path d="M4 20h4l10-10-4-4L4 16v4z" />
      <path d="M13 5l4 4" />
    </Icon>
  ),
  logout: (
    <Icon>
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
      <path d="M12 5H7a4 4 0 0 0-4 4v6a4 4 0 0 0 4 4h5" />
    </Icon>
  ),
  menu: (
    <Icon className="h-5 w-5">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Icon>
  ),
  close: (
    <Icon className="h-5 w-5">
      <path d="M6 6l12 12" />
      <path d="M18 6l-12 12" />
    </Icon>
  ),
}

const menuItems = [
  { href: '/dashboard', label: '仪表盘', icon: icons.dashboard },
  { href: '/products', label: '产品库存', icon: icons.products },
  { href: '/cartons', label: '纸箱仓', icon: icons.cartons },
  { href: '/inventory', label: '盘点', icon: icons.inventory },
  { href: '/production', label: '提交生产记录', icon: icons.production, adminOnly: true },
  { href: '/production/confirm', label: '确认入库', icon: icons.confirm, showPendingCount: true },
  { href: '/stock/in', label: '手动入库', icon: icons.stockIn },
  { href: '/stock/out', label: '出库', icon: icons.stockOut },
  { href: '/records', label: '出入库记录', icon: icons.records },
  { href: '/customers', label: '客户管理', icon: icons.customers },
]

export default function Sidebar({ user, profile, onProfileUpdate }) {
  const pathname = usePathname()
  const router = useRouter()
  const [pendingCount, setPendingCount] = useState(0)
  const [showNameModal, setShowNameModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [canRenderPortal, setCanRenderPortal] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    fetchPendingCount()
    // 每30秒刷新一次待处理数量
    const interval = setInterval(fetchPendingCount, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setCanRenderPortal(true)
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
  const isViewer = profile?.role === 'viewer'
  const viewerAllowed = new Set([
    '/dashboard',
    '/products',
    '/production/confirm',
    '/records',
    '/customers',
  ])

  const renderNavItems = (onNavigate) => (
    <ul className="space-y-2">
      {menuItems.map((item) => {
        if (item.adminOnly && !isAdmin) return null
        if (isViewer && !viewerAllowed.has(item.href)) return null
        const isActive = pathname === item.href
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center px-4 py-2.5 rounded-xl transition ${
                isActive
                  ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
                  : 'text-slate-600 hover:bg-slate-100/80'
              }`}
            >
              <span className="mr-3">{item.icon}</span>
              {item.label}
              {item.showPendingCount && pendingCount > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  const nameModal = showNameModal && canRenderPortal ? createPortal(
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">修改昵称</h2>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="input-field mb-4"
          placeholder="输入新昵称"
          autoFocus
        />
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setShowNameModal(false)}
            className="btn-ghost"
          >
            取消
          </button>
          <button
            onClick={handleSaveName}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/70">
        <div className="h-16 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="百越" className="w-9 h-9" />
            <div>
              <h1 className="text-slate-900 text-sm font-semibold">百越仓库管理系统</h1>
              <p className="text-[11px] text-slate-500">成品仓库管理</p>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100/70 transition"
            aria-label="打开菜单"
          >
            {icons.menu}
          </button>
        </div>
      </div>

      <div className={`md:hidden fixed inset-0 z-40 ${mobileOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity ${mobileOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={`absolute left-0 top-0 h-full w-72 bg-white/95 backdrop-blur-md border-r border-slate-200/70 shadow-2xl transition-transform ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-5 border-b border-slate-200/70 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <img src="/logo.png" alt="百越" className="w-10 h-10" />
              <div>
                <h1 className="text-slate-900 text-lg font-semibold">百越仓库管理系统</h1>
                <p className="text-xs text-slate-500">成品仓库管理</p>
              </div>
            </div>
            <button
              onClick={() => setMobileOpen(false)}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100/70 transition"
              aria-label="关闭菜单"
            >
              {icons.close}
            </button>
          </div>

          <nav className="flex-1 p-4 overflow-y-auto">
            {renderNavItems(() => setMobileOpen(false))}
          </nav>

          <div className="p-4 border-t border-slate-200/70">
            <div className="flex items-center justify-between">
              <div
                onClick={() => {
                  setMobileOpen(false)
                  openNameModal()
                }}
                className="cursor-pointer hover:bg-slate-100/70 rounded-lg px-2 py-1 -mx-2 -my-1 transition"
                title="点击修改昵称"
              >
                <p className="text-slate-900 text-sm flex items-center">
                  {profile?.name || user?.email}
                  <span className="ml-1 text-slate-400">{icons.edit}</span>
                </p>
                <p className="text-slate-500 text-xs">
                  {isAdmin ? '管理员' : isViewer ? '只读用户' : '仓管员'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-slate-900 transition"
                title="退出登录"
              >
                {icons.logout}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden md:flex w-64 bg-white/85 backdrop-blur-md h-screen flex-col fixed left-0 top-0 overflow-y-auto border-r border-slate-200/70">
      <div className="p-5 border-b border-slate-200/70">
        <div className="flex items-center space-x-3 mb-2">
          <img src="/logo.png" alt="百越" className="w-10 h-10" />
          <div>
            <h1 className="text-slate-900 text-lg font-semibold">百越仓库管理系统</h1>
            <p className="text-xs text-slate-500">成品仓库管理</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        {renderNavItems()}
      </nav>

      <div className="p-4 border-t border-slate-200/70">
        <div className="flex items-center justify-between">
          <div
            onClick={openNameModal}
            className="cursor-pointer hover:bg-slate-100/70 rounded-lg px-2 py-1 -mx-2 -my-1 transition"
            title="点击修改昵称"
          >
            <p className="text-slate-900 text-sm flex items-center">
              {profile?.name || user?.email}
              <span className="ml-1 text-slate-400">{icons.edit}</span>
            </p>
            <p className="text-slate-500 text-xs">
              {isAdmin ? '管理员' : isViewer ? '只读用户' : '仓管员'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-900 transition"
            title="退出登录"
          >
            {icons.logout}
          </button>
        </div>
      </div>

      {/* 修改昵称弹窗 */}
      {nameModal}
      </div>
    </>
  )
}
