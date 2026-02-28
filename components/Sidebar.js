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
  sales: (
    <Icon>
      <path d="M3 18l4-8 4 4 4-6 4 4" />
      <path d="M3 18h18" />
    </Icon>
  ),
  fire: (
    <Icon>
      <path d="M12 2c0 4-4 6-4 10a4 4 0 0 0 8 0c0-4-4-6-4-10z" />
      <path d="M12 12c0 2-1.5 3-1.5 4.5a1.5 1.5 0 0 0 3 0C13.5 15 12 14 12 12z" />
    </Icon>
  ),
  wrench: (
    <Icon>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Icon>
  ),
  dailyLog: (
    <Icon className="h-5 w-5">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="M9 5a2 2 0 0 1 4 0H9z" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </Icon>
  ),
  inspectionFolder: (
    <Icon className="h-6 w-6">
      <path d="M4 7h6l2 2h8v10H4z" />
      <path d="M4 7V5h6l2 2h8" />
    </Icon>
  ),
  inspection: (
    <Icon className="h-5 w-5">
      <path d="M7 4h7l5 5v11H7z" />
      <path d="M14 4v5h5" />
      <path d="M9 13l2 2 4-4" />
      <path d="M9 17h6" />
    </Icon>
  ),
  thirdParty: (
    <Icon className="h-5 w-5">
      <path d="M4 6h16v12H4z" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </Icon>
  ),
  productReport: (
    <Icon className="h-5 w-5">
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8" />
      <path d="M8 12h5" />
    </Icon>
  ),
  labelReport: (
    <Icon className="h-5 w-5">
      <path d="M6 4h12v6H6z" />
      <path d="M6 10h12v10H6z" />
      <path d="M9 14h6" />
    </Icon>
  ),
  customers: (
    <Icon>
      <path d="M16 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  ),
  cooking: (
    <Icon>
      <ellipse cx="12" cy="17" rx="7" ry="4" />
      <path d="M5 17V9a7 7 0 0 1 14 0v8" />
      <path d="M8 4c0-1 .5-2 2-2" />
      <path d="M12 4c0-1 .5-2 2-2" />
    </Icon>
  ),
  ledger: (
    <Icon className="h-5 w-5">
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M15 4v4h4" />
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
  { href: '/sales', label: '销售记录', icon: icons.sales },
  { href: '/cooking', label: '煮制记录', icon: icons.cooking },
  { href: '/customers', label: '客户管理', icon: icons.customers },
  {
    key: 'inspectionReports',
    label: '检验报告',
    icon: icons.inspectionFolder,
    toggleable: true,
    children: [
      { href: '/inspection-reports/outbound', label: '出厂检验报告', icon: icons.inspection },
      { href: '/inspection-reports/third-party/products', label: '产品第三方检验报告', icon: icons.productReport },
      { href: '/inspection-reports/third-party/labels', label: '标签第三方检验报告', icon: icons.labelReport },
    ],
  },
  {
    key: 'ledgers',
    label: '台账',
    icon: icons.ledger,
    toggleable: true,
    children: [
      { href: '/production/confirm', label: '入库台账', icon: icons.confirm },
      { href: '/cooking', label: '煮制台账', icon: icons.cooking },
    ],
  },
  {
    key: 'dailyLogs',
    label: '日常记录',
    icon: icons.dailyLog,
    toggleable: true,
    children: [
      { href: '/fire-inspection', label: '每日防火巡查', icon: icons.fire },
      { href: '/equipment-maintenance', label: '设备保养记录', icon: icons.wrench },
    ],
  },
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
  const [expandedMenus, setExpandedMenus] = useState({})

  useEffect(() => {
    fetchPendingCount()
    // 每30秒刷新一次待处理数量
    const interval = setInterval(fetchPendingCount, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setCanRenderPortal(true)
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/inspection-reports')) {
      setExpandedMenus((prev) => ({ ...prev, inspectionReports: true }))
    }
    if (pathname === '/cooking' || pathname.startsWith('/production/confirm')) {
      setExpandedMenus((prev) => ({ ...prev, ledgers: true }))
    }
    if (pathname === '/fire-inspection' || pathname === '/equipment-maintenance') {
      setExpandedMenus((prev) => ({ ...prev, dailyLogs: true }))
    }
  }, [pathname])

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
    '/cooking',
    '/inspection-reports/outbound',
    '/inspection-reports/third-party/products',
    '/inspection-reports/third-party/labels',
    '/customers',
  ])

  const filterMenuItems = (items) => (
    items
      .map((item) => {
        if (item.children) {
          const visibleChildren = filterMenuItems(item.children)
          if (visibleChildren.length === 0) return null
          return { ...item, children: visibleChildren }
        }
        if (item.adminOnly && !isAdmin) return null
        if (isViewer && !viewerAllowed.has(item.href)) return null
        return item
      })
      .filter(Boolean)
  )

  const isItemActive = (item) => {
    if (item.href) return pathname === item.href
    if (item.children) return item.children.some(isItemActive)
    return false
  }

  const renderNavItems = (items, onNavigate, depth = 0) => (
    <ul className={depth === 0 ? 'space-y-2' : 'mt-2 space-y-1'}>
      {items.map((item) => {
        if (item.children) {
          const labelClass = depth === 0
            ? 'flex items-center px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide'
            : 'flex items-center px-6 py-2 text-xs font-semibold text-slate-500'
          const isExpanded = item.toggleable ? !!expandedMenus[item.key] : true
          const hasActive = isItemActive(item)

          return (
            <li key={item.label}>
              {item.toggleable ? (
                <button
                  type="button"
                  onClick={() => setExpandedMenus((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                  className={`${labelClass} w-full text-left ${
                    hasActive ? 'text-slate-700' : ''
                  }`}
                >
                  <span className="mr-3">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
              ) : (
                <div className={labelClass}>
                  <span className="mr-3">{item.icon}</span>
                  {item.label}
                </div>
              )}
              {isExpanded && (
                <div className={depth === 0 ? 'pl-2' : 'pl-4'}>
                  {renderNavItems(item.children, onNavigate, depth + 1)}
                </div>
              )}
            </li>
          )
        }

        const isActive = pathname === item.href
        const paddingClass = depth === 0 ? 'px-4' : depth === 1 ? 'pl-10 pr-4' : 'pl-12 pr-4'

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center ${paddingClass} py-2.5 rounded-xl transition ${
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

  const visibleMenuItems = filterMenuItems(menuItems)

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
            {renderNavItems(visibleMenuItems, () => setMobileOpen(false))}
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

      <div className="hidden md:flex w-64 bg-white/85 backdrop-blur-md h-screen flex-col fixed left-0 top-0 overflow-y-auto border-r border-slate-200/70 z-30">
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
        {renderNavItems(visibleMenuItems)}
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
