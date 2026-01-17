'use client'
import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function InventoryPage() {
  const router = useRouter()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouse, setWarehouse] = useState('finished')
  const [searchTerm, setSearchTerm] = useState('')
  const [inventoryData, setInventoryData] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [profile, setProfile] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState('all') // 'all' | 'filled' | 'diff'
  const [formData, setFormData] = useState({
    name: '',
    spec: '',
    warning_qty: 10,
    prize_type: '',
  })
  const [submittingProduct, setSubmittingProduct] = useState(false)

  useEffect(() => {
    fetchProfile()
    fetchProducts()
  }, [warehouse])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(data)
    }
  }

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', warehouse)
      .order('name', { ascending: true })

    if (!error) {
      setProducts(data || [])
      // 初始化盘点数据
      const initialData = {}
      data?.forEach(product => {
        initialData[product.id] = {
          actual_qty: '',
          remark: ''
        }
      })
      setInventoryData(initialData)
    }
    setLoading(false)
  }

  const handleInventoryChange = (productId, field, value) => {
    setInventoryData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }))
  }

  // 快速填充：将账面库存复制到实际库存
  const quickFill = (productId) => {
    const product = products.find(p => p.id === productId)
    if (product) {
      handleInventoryChange(productId, 'actual_qty', product.quantity.toString())
    }
  }

  // 全部填充
  const fillAllWithBookQty = () => {
    const newData = { ...inventoryData }
    products.forEach(p => {
      newData[p.id] = { ...newData[p.id], actual_qty: p.quantity.toString() }
    })
    setInventoryData(newData)
  }

  // 清空所有
  const clearAll = () => {
    const newData = {}
    products.forEach(p => {
      newData[p.id] = { actual_qty: '', remark: '' }
    })
    setInventoryData(newData)
  }

  const calculateDifference = (productId) => {
    const product = products.find(p => p.id === productId)
    const actualQty = parseInt(inventoryData[productId]?.actual_qty)
    if (!product || isNaN(actualQty)) return null
    return actualQty - product.quantity
  }

  // 统计信息
  const stats = useMemo(() => {
    let filled = 0
    let withDiff = 0
    let totalDiff = 0

    products.forEach(p => {
      const actualQty = parseInt(inventoryData[p.id]?.actual_qty)
      if (!isNaN(actualQty)) {
        filled++
        const diff = actualQty - p.quantity
        if (diff !== 0) {
          withDiff++
          totalDiff += diff
        }
      }
    })

    return {
      total: products.length,
      filled,
      withDiff,
      totalDiff,
      progress: products.length > 0 ? Math.round((filled / products.length) * 100) : 0
    }
  }, [products, inventoryData])

  const openModal = () => {
    setFormData({ name: '', spec: '', warning_qty: 10, prize_type: '' })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setFormData({ name: '', spec: '', warning_qty: 10, prize_type: '' })
  }

  const handleProductSubmit = async (e) => {
    e.preventDefault()
    setSubmittingProduct(true)

    const { error } = await supabase
      .from('products')
      .insert({
        name: formData.name,
        spec: formData.spec,
        warning_qty: formData.warning_qty,
        prize_type: formData.prize_type,
        warehouse: warehouse,
        quantity: 0,
      })

    if (!error) {
      fetchProducts()
      closeModal()
    } else {
      alert('添加失败：' + error.message)
    }

    setSubmittingProduct(false)
  }

  const handleSubmit = async () => {
    // 收集需要调整的产品
    const adjustments = products.filter(product => {
      const actualQty = parseInt(inventoryData[product.id]?.actual_qty)
      return !isNaN(actualQty) && actualQty !== product.quantity
    }).map(product => ({
      product,
      actual_qty: parseInt(inventoryData[product.id]?.actual_qty),
      difference: parseInt(inventoryData[product.id]?.actual_qty) - product.quantity,
      remark: inventoryData[product.id]?.remark || ''
    }))

    if (adjustments.length === 0) {
      alert('没有需要调整的库存')
      return
    }

    const confirmMessage = `即将调整 ${adjustments.length} 个产品的库存：\n\n` +
      adjustments.map(adj =>
        `${adj.product.name}: ${adj.product.quantity} → ${adj.actual_qty} (${adj.difference > 0 ? '+' : ''}${adj.difference})`
      ).join('\n') +
      '\n\n确认提交盘点结果吗？'

    if (!confirm(confirmMessage)) return

    setSubmitting(true)

    try {
      // 通过插入出入库记录，让触发器自动更新库存
      for (const adj of adjustments) {
        // 盘盈记为入库，盘亏记为出库
        const { error: recordError } = await supabase
          .from('stock_records')
          .insert({
            product_id: adj.product.id,
            type: adj.difference > 0 ? 'in' : 'out',
            quantity: Math.abs(adj.difference),
            stock_date: new Date().toISOString().split('T')[0],
            operator_id: profile?.id,
            remark: `盘点调整${adj.remark ? ': ' + adj.remark : ''}`,
          })

        if (recordError) throw recordError
      }

      alert('盘点完成，库存已更新')
      fetchProducts()
    } catch (error) {
      alert('提交失败：' + error.message)
    }

    setSubmitting(false)
  }

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // 搜索过滤
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchSearch = (
          product.name?.toLowerCase().includes(term) ||
          product.spec?.toLowerCase().includes(term) ||
          product.prize_type?.toLowerCase().includes(term)
        )
        if (!matchSearch) return false
      }

      // 状态过滤
      if (filterType === 'filled') {
        const actualQty = parseInt(inventoryData[product.id]?.actual_qty)
        return !isNaN(actualQty)
      }
      if (filterType === 'diff') {
        const diff = calculateDifference(product.id)
        return diff !== null && diff !== 0
      }

      return true
    })
  }, [products, searchTerm, filterType, inventoryData])

  return (
    <DashboardLayout>
      {/* 头部 */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">库存盘点</h1>
          <p className="text-slate-500">核对并调整{warehouse === 'finished' ? '成品' : '半成品'}仓库的实际库存</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openModal} className="btn-secondary">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            添加产品
          </button>
        </div>
      </div>

      {/* 仓库切换 + 进度卡片 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {/* 仓库选择 */}
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 mb-2">选择仓库</p>
          <div className="flex gap-2">
            <button
              onClick={() => setWarehouse('finished')}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition ${
                warehouse === 'finished'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              成品仓
            </button>
            <button
              onClick={() => setWarehouse('semi')}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition ${
                warehouse === 'semi'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              半成品仓
            </button>
          </div>
        </div>

        {/* 盘点进度 */}
        <div className="surface-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">盘点进度</p>
            <span className="text-sm font-bold text-slate-800">{stats.progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            已填 {stats.filled} / {stats.total} 项
          </p>
        </div>

        {/* 差异统计 */}
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 mb-2">差异项</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${stats.withDiff > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {stats.withDiff}
            </span>
            <span className="text-sm text-slate-400">项需调整</span>
          </div>
        </div>

        {/* 净差异 */}
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 mb-2">净差异数量</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${
              stats.totalDiff > 0 ? 'text-emerald-600' :
              stats.totalDiff < 0 ? 'text-rose-600' :
              'text-slate-800'
            }`}>
              {stats.totalDiff > 0 ? '+' : ''}{stats.totalDiff}
            </span>
            <span className="text-sm text-slate-400">件</span>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="surface-card p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* 搜索 */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索产品名称、规格、奖项..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:border-slate-400 focus:bg-white focus:outline-none transition"
            />
          </div>

          {/* 筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden lg:inline">筛选:</span>
            <div className="flex items-center bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  filterType === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                全部 ({products.length})
              </button>
              <button
                onClick={() => setFilterType('filled')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  filterType === 'filled' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                已填 ({stats.filled})
              </button>
              <button
                onClick={() => setFilterType('diff')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                  filterType === 'diff' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                有差异 ({stats.withDiff})
              </button>
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="flex items-center gap-2">
            <button
              onClick={fillAllWithBookQty}
              className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              全部填充账面值
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              清空
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-slate-500">
            {searchTerm ? `未找到包含 "${searchTerm}" 的产品` : '暂无产品'}
          </p>
        </div>
      ) : (
        <>
          {/* 桌面表格 */}
          <div className="surface-card overflow-hidden mb-4 hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">产品信息</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-28">账面库存</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-40">实际库存</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">差异</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product, index) => {
                  const difference = calculateDifference(product.id)
                  const isFilled = inventoryData[product.id]?.actual_qty !== ''
                  const hasDiff = difference !== null && difference !== 0

                  return (
                    <tr
                      key={product.id}
                      className={`group transition ${
                        hasDiff ? 'bg-amber-50/50' : isFilled ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 text-sm text-slate-400">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <button
                              onClick={() => router.push(`/records?product_id=${product.id}&warehouse=${warehouse}`)}
                              className="font-medium text-slate-900 hover:text-blue-600 transition"
                            >
                              {product.name}
                            </button>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-slate-500">{product.spec}</span>
                              {product.prize_type && (
                                <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                                  {product.prize_type}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-bold ${
                          product.quantity <= product.warning_qty ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          {product.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            value={inventoryData[product.id]?.actual_qty || ''}
                            onChange={(e) => handleInventoryChange(product.id, 'actual_qty', e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            className={`w-24 px-3 py-2 rounded-lg border text-center text-sm font-medium transition ${
                              hasDiff
                                ? 'border-amber-300 bg-amber-50 focus:border-amber-500'
                                : isFilled
                                  ? 'border-emerald-300 bg-emerald-50 focus:border-emerald-500'
                                  : 'border-slate-200 bg-white focus:border-slate-400'
                            } focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                              hasDiff ? 'focus:ring-amber-200' : 'focus:ring-slate-200'
                            }`}
                            placeholder="—"
                            min="0"
                          />
                          <button
                            onClick={() => quickFill(product.id)}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition opacity-0 group-hover:opacity-100"
                            title="填入账面值"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {difference !== null ? (
                          <span className={`inline-flex items-center justify-center min-w-[48px] px-2 py-1 rounded-full text-sm font-bold ${
                            difference > 0
                              ? 'bg-emerald-100 text-emerald-700'
                              : difference < 0
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {difference > 0 ? '+' : ''}{difference}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={inventoryData[product.id]?.remark || ''}
                          onChange={(e) => handleInventoryChange(product.id, 'remark', e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white/50 text-sm focus:border-slate-400 focus:outline-none transition"
                          placeholder="备注原因..."
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 移动端卡片 */}
          <div className="lg:hidden space-y-3 mb-4">
            {filteredProducts.map((product, index) => {
              const difference = calculateDifference(product.id)
              const isFilled = inventoryData[product.id]?.actual_qty !== ''
              const hasDiff = difference !== null && difference !== 0

              return (
                <div
                  key={product.id}
                  className={`surface-card p-4 ${
                    hasDiff ? 'ring-2 ring-amber-200' : isFilled ? 'ring-1 ring-emerald-200' : ''
                  }`}
                >
                  {/* 头部 */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">#{index + 1}</span>
                        <button
                          onClick={() => router.push(`/records?product_id=${product.id}&warehouse=${warehouse}`)}
                          className="font-semibold text-slate-900 hover:text-blue-600 truncate"
                        >
                          {product.name}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">{product.spec}</span>
                        {product.prize_type && (
                          <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                            {product.prize_type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">账面</p>
                      <p className={`text-xl font-bold ${
                        product.quantity <= product.warning_qty ? 'text-rose-600' : 'text-slate-800'
                      }`}>
                        {product.quantity}
                      </p>
                    </div>
                  </div>

                  {/* 输入区 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">实际库存</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={inventoryData[product.id]?.actual_qty || ''}
                          onChange={(e) => handleInventoryChange(product.id, 'actual_qty', e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          className={`flex-1 px-3 py-2.5 rounded-xl border text-center font-medium ${
                            hasDiff
                              ? 'border-amber-300 bg-amber-50'
                              : isFilled
                                ? 'border-emerald-300 bg-emerald-50'
                                : 'border-slate-200 bg-white'
                          } focus:outline-none`}
                          placeholder="—"
                          min="0"
                        />
                        <button
                          onClick={() => quickFill(product.id)}
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">差异</label>
                      <div className={`h-[42px] rounded-xl flex items-center justify-center font-bold ${
                        difference !== null
                          ? difference > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : difference < 0
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-100 text-slate-500'
                          : 'bg-slate-50 text-slate-300'
                      }`}>
                        {difference !== null ? `${difference > 0 ? '+' : ''}${difference}` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* 备注 */}
                  <div className="mt-3">
                    <input
                      type="text"
                      value={inventoryData[product.id]?.remark || ''}
                      onChange={(e) => handleInventoryChange(product.id, 'remark', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-slate-400"
                      placeholder="备注原因..."
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 底部提交栏 */}
          <div className="sticky bottom-0 surface-card p-4 mt-4 border-t border-slate-200 -mx-4 lg:mx-0 lg:rounded-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-500">
                  已填 <span className="font-bold text-slate-800">{stats.filled}</span> 项
                </span>
                {stats.withDiff > 0 && (
                  <span className="text-amber-600">
                    <span className="font-bold">{stats.withDiff}</span> 项有差异
                  </span>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || stats.withDiff === 0}
                className="btn-primary w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    提交中...
                  </>
                ) : (
                  <>提交盘点 ({stats.withDiff} 项调整)</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 添加产品弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">添加产品</h2>
            <form onSubmit={handleProductSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  产品名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  placeholder="例如：XX产品"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  规格 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.spec}
                  onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                  className="input-field"
                  placeholder="例如：500ml/瓶"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  奖项类型
                </label>
                <input
                  type="text"
                  value={formData.prize_type}
                  onChange={(e) => setFormData({ ...formData, prize_type: e.target.value })}
                  className="input-field"
                  placeholder="例如：盖奖、标奖、盖奖+标奖"
                />
              </div>
              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  库存预警值
                </label>
                <input
                  type="number"
                  value={formData.warning_qty}
                  onChange={(e) => setFormData({ ...formData, warning_qty: parseInt(e.target.value) || 0 })}
                  onWheel={(e) => e.target.blur()}
                  className="input-field"
                  min="0"
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeModal} className="btn-ghost">
                  取消
                </button>
                <button type="submit" disabled={submittingProduct} className="btn-primary">
                  {submittingProduct ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
