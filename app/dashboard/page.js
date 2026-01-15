'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function DashboardPage() {
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
  const [loading, setLoading] = useState(true)
  const [expandedRecordId, setExpandedRecordId] = useState(null)
  const [showRecentRecords, setShowRecentRecords] = useState(true)
  const [stockViewType, setStockViewType] = useState('all') // 'all' | 'warning'
  const [recentRecordType, setRecentRecordType] = useState('all') // 'all' | 'out'
  const [recentRecordsLoading, setRecentRecordsLoading] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  useEffect(() => {
    fetchRecentRecords(recentRecordType)
  }, [recentRecordType])

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
    }

    const { data } = await query
    setRecentRecords(data || [])
    setRecentRecordsLoading(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">仪表盘</h1>
        <p className="text-slate-500">成品仓库概览</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          <div className="surface-card p-6 mb-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-500">今日概览</p>
                <h2 className="text-xl font-semibold text-slate-900 mt-1">
                  库存与流转保持稳定
                </h2>
                <p className="text-sm text-slate-500 mt-2">
                  今日入库 {stats.todayIn} · 今日出库 {stats.todayOut} · 预警 {stats.lowStockCount}
                </p>
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
          </div>

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard title="产品种类" value={stats.totalProducts} icon={icons.box} />
            <StatCard title="库存总量" value={stats.totalQuantity} icon={icons.factory} />
            <StatCard
              title="库存预警"
              value={stats.lowStockCount}
              icon={icons.alert}
              highlight={stats.lowStockCount > 0}
            />
            <StatCard title="今日入库" value={stats.todayIn} icon={icons.in} color="green" />
            <StatCard title="今日出库" value={stats.todayOut} icon={icons.out} color="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 库存管理 - 可切换栏目 */}
            <div className="surface-card p-6">
              {/* Tab切换 */}
              <div className="flex space-x-2 mb-4 border-b border-slate-200/70">
                <button
                  onClick={() => setStockViewType('all')}
                  className={`px-4 py-2 font-medium transition ${
                    stockViewType === 'all'
                      ? 'text-slate-900 border-b-2 border-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  库存现货 ({allStockProducts.length})
                </button>
                <button
                  onClick={() => setStockViewType('warning')}
                  className={`px-4 py-2 font-medium transition ${
                    stockViewType === 'warning'
                      ? 'text-rose-600 border-b-2 border-rose-500'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  库存预警 ({lowStockProducts.length})
                </button>
              </div>

              {/* 库存现货 */}
              {stockViewType === 'all' && (
                allStockProducts.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">暂无库存</p>
                ) : (
                  <div className="space-y-2">
                    {allStockProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 surface-inset hover:border-slate-300 transition"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{product.name}</p>
                          <p className="text-sm text-slate-500">
                            {product.spec}
                            {product.prize_type && (
                              <span className="ml-2 text-slate-700">· {product.prize_type}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${
                            product.quantity <= product.warning_qty ? 'text-rose-600' : 'text-slate-800'
                          }`}>
                            {product.quantity}
                          </p>
                          {product.quantity <= product.warning_qty && (
                            <p className="text-xs text-rose-500">库存偏低</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 库存预警 */}
              {stockViewType === 'warning' && (
                lowStockProducts.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">暂无预警</p>
                ) : (
                  <div className="space-y-3">
                    {lowStockProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-rose-200 bg-rose-50/70"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{product.name}</p>
                          <p className="text-sm text-slate-500">
                            {product.spec}
                            {product.prize_type && (
                              <span className="ml-2 text-slate-700">· {product.prize_type}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-rose-600 font-bold">{product.quantity}</p>
                          <p className="text-xs text-slate-500">预警值: {product.warning_qty}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* 最近出入库记录 - 折叠式 */}
            <div className="surface-card p-6">
              <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">最近记录</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {recentRecordType === 'out' ? '最新出库记录' : '最新出入库记录'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden text-sm">
                    <button
                      onClick={() => setRecentRecordType('all')}
                      className={`px-3 py-1.5 transition ${
                        recentRecordType === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      全部
                    </button>
                    <button
                      onClick={() => setRecentRecordType('out')}
                      className={`px-3 py-1.5 transition ${
                        recentRecordType === 'out'
                          ? 'bg-amber-500 text-white'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      出库
                    </button>
                  </div>
                  <button
                    onClick={() => setShowRecentRecords(!showRecentRecords)}
                    className="text-slate-600 text-sm hover:text-slate-900"
                  >
                    {showRecentRecords ? '收起' : '展开'}
                  </button>
                </div>
              </div>
              {recentRecordsLoading ? (
                <p className="text-slate-500 text-center py-4">加载中...</p>
              ) : recentRecords.length === 0 ? (
                <p className="text-slate-500 text-center py-4">暂无记录</p>
              ) : (
                <div className="space-y-2">
                  {recentRecords.slice(0, showRecentRecords ? recentRecords.length : 5).map((record) => {
                    const isExpanded = expandedRecordId === record.id
                    return (
                      <div 
                        key={record.id} 
                        className={`rounded-xl border-l-4 overflow-hidden ${
                          record.type === 'in' ? 'border-emerald-500' : 'border-amber-500'
                        }`}
                      >
                        <div 
                          onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                          className="flex items-center justify-between p-3 bg-slate-50 cursor-pointer hover:bg-slate-100/70 transition"
                        >
                          <div className="flex items-center">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                              record.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {record.type === 'in' ? icons.in : icons.out}
                            </span>
                            <div>
                              <p className="font-medium text-slate-800">
                                {record.products?.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {record.stock_date} {new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <span className={`font-bold mr-2 ${
                              record.type === 'in' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              {record.type === 'in' ? '+' : '-'}{record.quantity}
                            </span>
                            <span className={`text-slate-400 text-xs transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}>▼</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 bg-slate-50 border-t border-slate-200/70">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-slate-500">规格：</span>
                                <span className="text-slate-800 ml-1">{record.products?.spec}</span>
                              </div>
                              {record.products?.prize_type && (
                                <div>
                                  <span className="text-slate-500">奖项：</span>
                                  <span className="text-slate-800 ml-1">{record.products.prize_type}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-slate-500">仓库：</span>
                                <span className="text-slate-800 ml-1">
                                  {record.products?.warehouse === 'finished' ? '成品仓' : '半成品仓'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">操作人：</span>
                                <span className="text-slate-800 ml-1">{record.profiles?.name || '-'}</span>
                              </div>
                              {record.type === 'out' && record.customers?.name && (
                                <div>
                                  <span className="text-slate-500">客户：</span>
                                  <span className="text-slate-800 ml-1">{record.customers.name}</span>
                                </div>
                              )}
                              {record.type === 'out' && record.production_date && (
                                <div>
                                  <span className="text-slate-500">生产日期：</span>
                                  <span className="text-slate-800 ml-1">{record.production_date}</span>
                                </div>
                              )}
                              {record.remark && (
                                <div className="col-span-2">
                                  <span className="text-slate-500">备注：</span>
                                  <span className="text-slate-800 ml-1">{record.remark}</span>
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
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}

function StatCard({ title, value, icon, color, highlight }) {
  const bgColors = {
    green: 'bg-emerald-50 border-emerald-200',
    orange: 'bg-amber-50 border-amber-200',
    default: 'bg-white',
  }
  
  return (
    <div className={`p-4 rounded-2xl shadow-sm border ${
      highlight ? 'bg-rose-50 border-rose-200' : bgColors[color] || bgColors.default
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className={`text-2xl font-bold ${highlight ? 'text-rose-600' : 'text-slate-800'}`}>
            {value}
          </p>
        </div>
        <span className="text-slate-700">{icon}</span>
      </div>
    </div>
  )
}

const icons = {
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  ),
  factory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6">
      <path d="M3 20h18" />
      <path d="M5 20V8l5 3V8l5 3V8l4 2v10" />
      <path d="M9 20v-4h4v4" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6">
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
