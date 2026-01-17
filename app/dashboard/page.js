'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import StatCard, { StatCardSkeleton } from '@/components/dashboard/StatCard'
import ChartSkeleton from '@/components/charts/ChartSkeleton'

// 懒加载图表组件
const TrendChart = dynamic(() => import('@/components/charts/TrendChart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,
})

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalQuantity: 0,
    lowStockCount: 0,
    todayIn: 0,
    todayOut: 0,
  })
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [allStockProducts, setAllStockProducts] = useState([])
  const [recentRecords, setRecentRecords] = useState([])
  const [trendData, setTrendData] = useState([])
  const [loading, setLoading] = useState(true)
  const [trendLoading, setTrendLoading] = useState(true)
  const [expandedRecordId, setExpandedRecordId] = useState(null)
  const [showRecentRecords, setShowRecentRecords] = useState(true)
  const [stockViewType, setStockViewType] = useState('all') // 'all' | 'warning'
  const [recentRecordType, setRecentRecordType] = useState('all') // 'all' | 'in' | 'out'
  const [recentRecordsLoading, setRecentRecordsLoading] = useState(false)

  useEffect(() => {
    fetchDashboardData()
    fetchTrendData()
  }, [])

  useEffect(() => {
    fetchRecentRecords(recentRecordType)
  }, [recentRecordType])

  // 获取7日趋势数据
  const fetchTrendData = async () => {
    setTrendLoading(true)
    try {
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 6)

      const startStr = startDate.toISOString().split('T')[0]
      const endStr = endDate.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('stock_records')
        .select('type, quantity, stock_date, products!inner(warehouse)')
        .eq('products.warehouse', 'finished')
        .gte('stock_date', startStr)
        .lte('stock_date', endStr)

      if (error) throw error

      // 初始化7天数据
      const dateMap = {}
      for (let i = 0; i < 7; i++) {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        const dateStr = d.toISOString().split('T')[0]
        dateMap[dateStr] = { date: dateStr, in: 0, out: 0 }
      }

      // 填充数据
      data?.forEach((record) => {
        if (dateMap[record.stock_date]) {
          if (record.type === 'in') {
            dateMap[record.stock_date].in += record.quantity
          } else {
            dateMap[record.stock_date].out += record.quantity
          }
        }
      })

      setTrendData(Object.values(dateMap))
    } catch (err) {
      console.error('Failed to fetch trend data:', err)
    } finally {
      setTrendLoading(false)
    }
  }

  const fetchDashboardData = async () => {
    const today = new Date().toISOString().split('T')[0]

    // 获取产品统计
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', 'finished')

    const totalProducts = products?.length || 0
    const totalQuantity = products?.reduce((sum, p) => sum + p.quantity, 0) || 0
    const lowStockCount = products?.filter(p => p.quantity <= p.warning_qty).length || 0

    // 获取今日出入库
    const { data: todayRecords } = await supabase
      .from('stock_records')
      .select('type, quantity')
      .eq('stock_date', today)

    const todayIn = todayRecords?.filter(r => r.type === 'in').reduce((sum, r) => sum + r.quantity, 0) || 0
    const todayOut = todayRecords?.filter(r => r.type === 'out').reduce((sum, r) => sum + r.quantity, 0) || 0

    // 获取低库存产品
    const lowStock = products?.filter(p => p.quantity <= p.warning_qty) || []

    // 获取所有有库存的产品（按库存从多到少排序）
    const allStock = products?.filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity) || []

    setStats({ totalProducts, totalQuantity, lowStockCount, todayIn, todayOut })
    setLowStockProducts(lowStock)
    setAllStockProducts(allStock)
    setLoading(false)
  }

  const fetchRecentRecords = async (type) => {
    setRecentRecordsLoading(true)

    let query = supabase
      .from('stock_records')
      .select(`
        *,
        products (name, spec, warehouse, prize_type),
        profiles (name),
        customers (name)
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    if (type === 'out') {
      query = query.eq('type', 'out')
    } else if (type === 'in') {
      query = query.eq('type', 'in')
    }

    const { data } = await query
    setRecentRecords(data || [])
    setRecentRecordsLoading(false)
  }

  // 切换到预警视图
  const scrollToWarning = () => {
    setStockViewType('warning')
    document.getElementById('stock-section')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <DashboardLayout>
      {/* 标题 + 快捷操作 */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">仪表盘</h1>
          <p className="text-slate-500">成品仓库概览</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/in" className="btn-primary">
            手动入库
          </Link>
          <Link href="/stock/out" className="btn-secondary">
            出库
          </Link>
          <Link href="/products" className="btn-secondary">
            产品管理
          </Link>
          <Link href="/records" className="btn-ghost">
            出入库记录
          </Link>
        </div>
      </div>

      {/* 统计卡片 - 4列 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard title="产品种类" value={stats.totalProducts} icon={icons.box} />
            <StatCard title="库存总量" value={stats.totalQuantity} icon={icons.factory} />
            <StatCard title="今日入库" value={stats.todayIn} icon={icons.in} color="green" />
            <StatCard title="今日出库" value={stats.todayOut} icon={icons.out} color="orange" />
          </>
        )}
      </div>


      {/* 7日趋势图 */}
      <div className="chart-container mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">7日出入库趋势</h2>
            <p className="text-sm text-slate-500">最近一周的库存流转情况</p>
          </div>
        </div>
        <TrendChart data={trendData} loading={trendLoading} />
      </div>

      {/* 底部双栏布局 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="stock-section">
        {/* 库存概览 */}
        <div className="surface-card overflow-hidden">
          {/* 头部标题 + 胶囊Tab */}
          <div className="p-5 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center">
                  {icons.box}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">库存概览</h2>
                  <p className="text-xs text-slate-400">点击查看详情</p>
                </div>
              </div>
              {/* 胶囊切换 */}
              <div className="flex items-center bg-slate-100 rounded-full p-1">
                <button
                  onClick={() => setStockViewType('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    stockViewType === 'all'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  现货 {allStockProducts.length}
                </button>
                <button
                  onClick={() => setStockViewType('warning')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                    stockViewType === 'warning'
                      ? 'bg-white text-rose-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  预警 {lowStockProducts.length}
                </button>
              </div>
            </div>
          </div>

          {/* 列表内容 */}
          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 bg-slate-200 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 bg-slate-200 rounded" />
                      <div className="h-3 w-20 bg-slate-200 rounded" />
                    </div>
                    <div className="h-6 w-12 bg-slate-200 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : (stockViewType === 'all' ? allStockProducts : lowStockProducts).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm">{stockViewType === 'all' ? '暂无库存' : '暂无预警'}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {(stockViewType === 'all' ? allStockProducts : lowStockProducts).map((product, index) => {
                  const isLowStock = product.quantity <= product.warning_qty
                  const stockPercent = product.warning_qty > 0
                    ? Math.min(100, (product.quantity / (product.warning_qty * 2)) * 100)
                    : 100

                  return (
                    <div
                      key={product.id}
                      onClick={() => router.push(`/records?product_id=${product.id}&warehouse=finished`)}
                      className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:shadow-md ${
                        isLowStock
                          ? 'bg-gradient-to-r from-rose-50 to-orange-50/50 hover:from-rose-100 hover:to-orange-100/50'
                          : 'bg-slate-50/80 hover:bg-white'
                      }`}
                    >
                      {/* 序号/图标 */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                        isLowStock
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-slate-200/70 text-slate-500'
                      }`}>
                        {stockViewType === 'warning' ? '!' : index + 1}
                      </div>

                      {/* 产品信息 */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate group-hover:text-blue-600 transition">
                          {product.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400 truncate">{product.spec}</span>
                          {product.prize_type && (
                            <span className="text-xs px-1.5 py-0.5 bg-slate-200/60 text-slate-500 rounded">
                              {product.prize_type}
                            </span>
                          )}
                        </div>
                        {/* 库存条 */}
                        {stockViewType === 'warning' && (
                          <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                stockPercent < 30 ? 'bg-rose-500' : stockPercent < 60 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${stockPercent}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* 数量 */}
                      <div className="text-right shrink-0">
                        <p className={`text-lg font-bold ${isLowStock ? 'text-rose-600' : 'text-slate-800'}`}>
                          {product.quantity}
                        </p>
                        {stockViewType === 'warning' && (
                          <p className="text-[10px] text-slate-400">/ {product.warning_qty}</p>
                        )}
                      </div>

                      {/* 箭头 */}
                      <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 最近记录 */}
        <div className="surface-card overflow-hidden">
          {/* 头部 */}
          <div className="p-5 pb-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-amber-50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">最近记录</h2>
                  <p className="text-xs text-slate-400">
                    {recentRecordType === 'out' ? '出库记录' : recentRecordType === 'in' ? '入库记录' : '全部记录'}
                  </p>
                </div>
              </div>
              {/* 筛选按钮组 */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 rounded-full p-1">
                  <button
                    onClick={() => setRecentRecordType('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      recentRecordType === 'all'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    全部
                  </button>
                  <button
                    onClick={() => setRecentRecordType('in')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      recentRecordType === 'in'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    入库
                  </button>
                  <button
                    onClick={() => setRecentRecordType('out')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      recentRecordType === 'out'
                        ? 'bg-white text-amber-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    出库
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 记录列表 */}
          <div className="p-4">
            {recentRecordsLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 bg-slate-200 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-28 bg-slate-200 rounded" />
                      <div className="h-3 w-20 bg-slate-200 rounded" />
                    </div>
                    <div className="h-5 w-12 bg-slate-200 rounded" />
                  </div>
                ))}
              </div>
            ) : recentRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm">暂无记录</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {recentRecords.slice(0, showRecentRecords ? 20 : 5).map((record) => {
                  const isIn = record.type === 'in'
                  const isExpanded = expandedRecordId === record.id

                  return (
                    <div
                      key={record.id}
                      className={`rounded-xl overflow-hidden transition-all ${
                        isExpanded ? 'bg-slate-100/80 shadow-sm' : 'bg-slate-50/80 hover:bg-slate-100/60'
                      }`}
                    >
                      <div
                        onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                        className="flex items-center gap-3 p-3 cursor-pointer"
                      >
                        {/* 类型图标 */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          isIn ? 'bg-emerald-100' : 'bg-amber-100'
                        }`}>
                          <span className={isIn ? 'text-emerald-600' : 'text-amber-600'}>
                            {isIn ? icons.in : icons.out}
                          </span>
                        </div>

                        {/* 信息 */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-800 truncate">
                            {record.products?.name}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {record.stock_date} · {new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* 数量 */}
                        <div className={`px-2.5 py-1 rounded-lg text-sm font-bold shrink-0 ${
                          isIn
                            ? 'bg-emerald-100/80 text-emerald-700'
                            : 'bg-amber-100/80 text-amber-700'
                        }`}>
                          {isIn ? '+' : '-'}{record.quantity}
                        </div>

                        {/* 展开箭头 */}
                        <svg
                          className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {/* 展开详情 */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-white/60 rounded-lg p-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">规格</span>
                              <span className="text-slate-700 font-medium">{record.products?.spec}</span>
                            </div>
                            {record.products?.prize_type && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">奖项</span>
                                <span className="text-slate-700 font-medium">{record.products.prize_type}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">操作人</span>
                              <span className="text-slate-700 font-medium">{record.profiles?.name || '-'}</span>
                            </div>
                            {record.type === 'out' && record.customers?.name && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">客户</span>
                                <span className="text-slate-700 font-medium">{record.customers.name}</span>
                              </div>
                            )}
                            {record.type === 'out' && record.production_date && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">生产日期</span>
                                <span className="text-slate-700 font-medium">{record.production_date}</span>
                              </div>
                            )}
                            {record.remark && (
                              <div className="col-span-2 flex items-start gap-1.5">
                                <span className="text-slate-400 shrink-0">备注</span>
                                <span className="text-slate-700">{record.remark}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 查看更多 */}
            {recentRecords.length > 5 && (
              <button
                onClick={() => setShowRecentRecords(!showRecentRecords)}
                className="w-full mt-3 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition"
              >
                {showRecentRecords ? '收起' : `查看更多 (${recentRecords.length - 5})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

const icons = {
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  factory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M3 20h18" />
      <path d="M5 20V8l5 3V8l5 3V8l4 2v10" />
      <path d="M9 20v-4h4v4" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5">
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </svg>
  ),
  in: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  ),
  out: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4">
      <path d="M12 21V9" />
      <path d="M7 14l5-5 5 5" />
      <path d="M4 3h16" />
    </svg>
  ),
}
