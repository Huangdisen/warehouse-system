'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const getPrizeBadgeStyle = (prizeType) => {
  const text = (prizeType || '').trim()
  const map = {
    '盖奖': 'bg-sky-100 text-sky-700',
    '标奖': 'bg-emerald-100 text-emerald-700',
    '无奖': 'bg-slate-200 text-slate-700',
    '圆奖': 'bg-amber-100 text-amber-700',
    '垫片奖': 'bg-violet-100 text-violet-700',
    '定制标奖（苏州）': 'bg-rose-100 text-rose-700',
  }
  return map[text] || 'bg-indigo-100 text-indigo-700'
}

function RecordsContent() {
  const searchParams = useSearchParams()
  const [records, setRecords] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouse, setWarehouse] = useState('finished')
  const [expandedId, setExpandedId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    product_id: '',
    type: '',
    start_date: '',
    end_date: '',
  })
  const [quickYear, setQuickYear] = useState('2026')
  const [quickMonth, setQuickMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'))
  const [initialized, setInitialized] = useState(false)

  // 初始化：从 URL 参数读取筛选条件
  useEffect(() => {
    const productId = searchParams.get('product_id')
    const warehouseParam = searchParams.get('warehouse')

    if (warehouseParam === 'finished' || warehouseParam === 'semi') {
      setWarehouse(warehouseParam)
    }
    if (productId) {
      setFilters(prev => ({ ...prev, product_id: productId }))
    }
    setInitialized(true)
  }, [searchParams])

  useEffect(() => {
    if (!initialized) return
    fetchProducts()
  }, [warehouse, initialized])

  useEffect(() => {
    if (!initialized) return
    fetchRecords()
  }, [warehouse, initialized, filters.product_id])

  const formatLocalDate = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const applyMonthRange = (year, month) => {
    const start = `${year}-${month}-01`
    const end = formatLocalDate(new Date(parseInt(year), parseInt(month), 0))
    const nextFilters = { ...filters, start_date: start, end_date: end }
    setFilters(nextFilters)
    fetchRecords(nextFilters)
  }

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, spec')
      .eq('warehouse', warehouse)
      .order('name')

    setProducts(data || [])
  }

  const fetchRecords = async (nextFilters = filters) => {
    setLoading(true)

    // 先获取当前仓库的产品ID列表
    const { data: warehouseProducts } = await supabase
      .from('products')
      .select('id')
      .eq('warehouse', warehouse)
    
    const productIds = warehouseProducts?.map(p => p.id) || []
    
    if (productIds.length === 0) {
      setRecords([])
      setLoading(false)
      return
    }

    let query = supabase
      .from('stock_records')
      .select(`
        *,
        products (id, name, spec, warehouse, prize_type),
        profiles (name),
        customers (name)
      `)
      .in('product_id', productIds)
      .order('stock_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (nextFilters.product_id) {
      query = query.eq('product_id', nextFilters.product_id)
    }
    if (nextFilters.type) {
      query = query.eq('type', nextFilters.type)
    }
    if (nextFilters.start_date) {
      query = query.gte('stock_date', nextFilters.start_date)
    }
    if (nextFilters.end_date) {
      query = query.lte('stock_date', nextFilters.end_date)
    }

    const { data } = await query

    setRecords(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!initialized) return
    if (!filters.start_date && !filters.end_date) {
      applyMonthRange(quickYear, quickMonth)
    }
  }, [initialized])

  const handleFilter = (e) => {
    e.preventDefault()
    fetchRecords(filters)
  }

  const clearFilters = () => {
    const nextFilters = {
      product_id: '',
      type: '',
      start_date: '',
      end_date: '',
    }
    setFilters(nextFilters)
    fetchRecords(nextFilters)
  }

  const handleWarehouseChange = (w) => {
    setWarehouse(w)
    setFilters({ ...filters, product_id: '' })
  }

  // 统计
  const filteredRecords = records.filter((record) => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true

    const fields = [
      record.products?.name,
      record.products?.spec,
      record.customers?.name,
      record.remark,
    ]

    return fields.some((field) => (field || '').toLowerCase().includes(term))
  })

  const totalIn = filteredRecords.filter(r => r.type === 'in').reduce((sum, r) => sum + r.quantity, 0)
  const totalOut = filteredRecords.filter(r => r.type === 'out').reduce((sum, r) => sum + r.quantity, 0)

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">出入库记录</h1>
        <p className="text-slate-500">查看{warehouse === 'finished' ? '成品仓' : '半成品仓'}历史出入库记录</p>
      </div>

      {/* 仓库切换 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => handleWarehouseChange('finished')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'finished'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          成品仓
        </button>
        <button
          onClick={() => handleWarehouseChange('semi')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'semi'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          半成品仓
        </button>
      </div>

      {/* 筛选器 */}
      <div className="surface-card p-4 mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
          <div className="w-full md:w-auto">
            <label className="block text-slate-600 text-sm mb-1">快速区间</label>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <select
                value={quickYear}
                onChange={(e) => {
                  const nextYear = e.target.value
                  setQuickYear(nextYear)
                  applyMonthRange(nextYear, quickMonth)
                }}
                className="select-field w-28 !py-1.5"
              >
                {Array.from({ length: 11 }, (_, i) => 2020 + i).map((year) => (
                  <option key={year} value={String(year)}>
                    {year}年
                  </option>
                ))}
              </select>
              <select
                value={quickMonth}
                onChange={(e) => {
                  const nextMonth = e.target.value
                  setQuickMonth(nextMonth)
                  applyMonthRange(quickYear, nextMonth)
                }}
                className="select-field w-24 !py-1.5"
              >
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((month) => (
                  <option key={month} value={month}>
                    {parseInt(month)}月
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-400">自动应用</span>
            </div>
          </div>

          <div className="w-64">
            <label className="block text-slate-600 text-sm mb-1">产品</label>
            <select
              value={filters.product_id}
              onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
              className="select-field"
            >
              <option value="">全部产品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {product.spec}
                </option>
              ))}
            </select>
          </div>

          <div className="w-32">
            <label className="block text-slate-600 text-sm mb-1">类型</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="select-field"
            >
              <option value="">全部</option>
              <option value="in">入库</option>
              <option value="out">出库</option>
            </select>
          </div>

          <div className="w-40">
            <label className="block text-slate-600 text-sm mb-1">开始日期</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="w-40">
            <label className="block text-slate-600 text-sm mb-1">结束日期</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="input-field"
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
          >
            筛选
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="btn-ghost"
          >
            清除
          </button>
        </form>
        <div className="mt-4">
          <label className="block text-slate-600 text-sm mb-1">模糊搜索</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-96 input-field"
            placeholder="搜索产品名/规格/客户/备注"
          />
        </div>
      </div>

      {/* 统计摘要 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-4">
          <p className="text-sm text-slate-500">记录数</p>
          <p className="text-2xl font-bold text-slate-800">{filteredRecords.length}</p>
        </div>
        <div className="rounded-2xl shadow-sm p-4 border border-emerald-200 bg-emerald-50/70">
          <p className="text-sm text-slate-500">入库总量</p>
          <p className="text-2xl font-bold text-emerald-600">+{totalIn}</p>
        </div>
        <div className="rounded-2xl shadow-sm p-4 border border-amber-200 bg-amber-50/70">
          <p className="text-sm text-slate-500">出库总量</p>
          <p className="text-2xl font-bold text-amber-600">-{totalOut}</p>
        </div>
      </div>

      {/* 记录列表 - 卡片式 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : records.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-slate-500">暂无记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => {
            const isExpanded = expandedId === record.id
            // 检查是否为盘点调整
            const isInventoryAdjustment = record.remark?.startsWith('盘点调整')
            // 检查是否为贴半成品入库
            const isLabelSemiIn = record.type === 'in' && 
                                  warehouse === 'finished' && 
                                  record.remark?.includes('贴半成品')
            return (
              <div
                key={record.id}
                className={`surface-card overflow-hidden border-l-4 ${
                  isInventoryAdjustment ? 'border-violet-500' :
                  record.type === 'in' ? 'border-emerald-500' : 'border-amber-500'
                }`}
              >
                {/* 卡片头部 - 始终显示 */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  className="p-4 cursor-pointer hover:bg-slate-50/70 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {isInventoryAdjustment ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                          盘点调整
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          record.type === 'in' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {record.type === 'in' ? '入库' : '出库'}
                        </span>
                      )}
                      {isLabelSemiIn && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                          贴半成品
                        </span>
                      )}
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-medium text-slate-900">{record.products?.name}</span>
                        <span className="text-slate-500">{record.products?.spec}</span>
                        {record.products?.prize_type && (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${getPrizeBadgeStyle(record.products.prize_type)}`}>
                            {record.products.prize_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`text-xl font-bold ${
                        record.type === 'in' ? 'text-emerald-600' : 'text-amber-600'
                      }`}>
                        {record.type === 'in' ? '+' : '-'}{record.quantity}
                      </span>
                      <div className="text-right text-sm">
                        <div className="text-slate-900">{record.stock_date}</div>
                        <div className="text-slate-400">
                          {new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <span className={`text-slate-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}>
                        ▼
                      </span>
                    </div>
                  </div>
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-200/70">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {record.type === 'out' && (
                        <>
                          <div>
                            <span className="text-slate-500">客户：</span>
                            <span className="text-slate-900 ml-1">{record.customers?.name || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">生产日期：</span>
                            <span className="text-slate-900 ml-1">{record.production_date || '-'}</span>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-slate-500">操作人：</span>
                        <span className="text-slate-900 ml-1">{record.profiles?.name || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">仓库：</span>
                        <span className="text-slate-900 ml-1">
                          {record.products?.warehouse === 'finished' ? '成品仓' : '半成品仓'}
                        </span>
                      </div>
                      {record.remark && (
                        <div className="col-span-2 md:col-span-4">
                          <span className="text-slate-500">备注：</span>
                          <span className="text-slate-900 ml-1">{record.remark}</span>
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
    </DashboardLayout>
  )
}

export default function RecordsPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    }>
      <RecordsContent />
    </Suspense>
  )
}
