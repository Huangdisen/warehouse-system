'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function CartonsPage() {
  const [cartons, setCartons] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCarton, setEditingCarton] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    spec: '',
    warning_qty: 50,
    remark: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ show: false, carton: null })
  const [detailModal, setDetailModal] = useState({ show: false, carton: null, products: [] })
  const [stockModal, setStockModal] = useState({ show: false, carton: null, type: 'in' })
  const [stockForm, setStockForm] = useState({
    quantity: '',
    stock_date: new Date().toISOString().split('T')[0],
    total_amount: '',
    unit: '个',
    remark: '',
  })
  const [stockSubmitting, setStockSubmitting] = useState(false)

  useEffect(() => {
    fetchProfile()
    fetchCartons()
  }, [])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      setProfile(data)
      setIsAdmin(data?.role === 'admin')
    }
  }

  const fetchCartons = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cartons')
      .select('*')
      .order('quantity', { ascending: false })
      .order('name', { ascending: true })

    if (!error) {
      setCartons(data || [])
    }
    setLoading(false)
  }

  const openModal = (carton = null) => {
    if (carton) {
      setEditingCarton(carton)
      setFormData({
        name: carton.name,
        spec: carton.spec || '',
        warning_qty: carton.warning_qty,
        remark: carton.remark || '',
      })
    } else {
      setEditingCarton(null)
      setFormData({ name: '', spec: '', warning_qty: 50, remark: '' })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCarton(null)
    setFormData({ name: '', spec: '', warning_qty: 50, remark: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    if (editingCarton) {
      const { error } = await supabase
        .from('cartons')
        .update({
          name: formData.name,
          spec: formData.spec,
          warning_qty: formData.warning_qty,
          remark: formData.remark,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingCarton.id)

      if (!error) {
        fetchCartons()
        closeModal()
      } else {
        alert('保存失败：' + error.message)
      }
    } else {
      const { error } = await supabase
        .from('cartons')
        .insert({
          name: formData.name,
          spec: formData.spec,
          warning_qty: formData.warning_qty,
          remark: formData.remark,
          quantity: 0,
        })

      if (!error) {
        fetchCartons()
        closeModal()
      } else {
        alert('添加失败：' + error.message)
      }
    }

    setSubmitting(false)
  }

  const openDeleteModal = (carton) => {
    setDeleteModal({ show: true, carton })
  }

  const handleDelete = async () => {
    if (!deleteModal.carton) return

    const { error } = await supabase
      .from('cartons')
      .delete()
      .eq('id', deleteModal.carton.id)

    if (!error) {
      fetchCartons()
    } else {
      alert('删除失败：' + error.message)
    }
    setDeleteModal({ show: false, carton: null })
  }

  const openStockModal = (carton, type) => {
    setStockModal({ show: true, carton, type })
    setStockForm({
      quantity: '',
      stock_date: new Date().toISOString().split('T')[0],
      total_amount: '',
      unit: '个',
      supplier: '',
      remark: '',
    })
  }

  const closeStockModal = () => {
    setStockModal({ show: false, carton: null, type: 'in' })
  }

  const handleStockSubmit = async (e) => {
    e.preventDefault()
    if (!stockForm.quantity || parseInt(stockForm.quantity) <= 0) {
      alert('请输入有效数量')
      return
    }
    if (stockModal.type === 'in' && (!stockForm.total_amount || parseFloat(stockForm.total_amount) < 0)) {
      alert('请输入采购总金额')
      return
    }
    setStockSubmitting(true)

    const { data: { session } } = await supabase.auth.getSession()
    const { carton, type } = stockModal
    const qty = parseInt(stockForm.quantity)

    const { error: recordError } = await supabase
      .from('carton_records')
      .insert({
        carton_id: carton.id,
        type,
        quantity: qty,
        stock_date: stockForm.stock_date,
        operator_id: session?.user?.id,
        source_type: 'manual',
        remark: stockForm.remark || (type === 'in' ? '手动入库' : '手动出库'),
      })

    if (recordError) {
      alert('操作失败：' + recordError.message)
      setStockSubmitting(false)
      return
    }

    const newQuantity = type === 'in' ? carton.quantity + qty : carton.quantity - qty
    const { error: updateError } = await supabase
      .from('cartons')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', carton.id)

    if (updateError) {
      alert('更新库存失败：' + updateError.message)
    } else {
      // 进仓时同步写入采购成本
      if (type === 'in') {
        const totalAmt = parseFloat(stockForm.total_amount) || 0
        const unitPrice = totalAmt / qty
        await supabase.from('purchase_records').insert({
          category: 'carton',
          item_id: carton.id,
          item_name: carton.name,
          spec: carton.spec || null,
          quantity: qty,
          unit: stockForm.unit.trim() || '个',
          unit_price: parseFloat(unitPrice.toFixed(6)),
          supplier: stockForm.supplier.trim() || null,
          purchase_date: stockForm.stock_date,
          remark: stockForm.remark ? `进仓：${stockForm.remark}` : '纸箱进仓',
          operator_id: session?.user?.id,
        })
      }
      fetchCartons()
      closeStockModal()
    }
    setStockSubmitting(false)
  }

  const openDetailModal = async (carton) => {
    // 查询关联的产品
    const { data: relations } = await supabase
      .from('product_carton')
      .select('product_id')
      .eq('carton_id', carton.id)

    let products = []
    if (relations && relations.length > 0) {
      const productIds = relations.map(r => r.product_id)
      const { data } = await supabase
        .from('products')
        .select('id, name, spec, prize_type, warehouse')
        .in('id', productIds)
      products = data || []
    }

    setDetailModal({ show: true, carton, products })
  }

  const filteredCartons = cartons.filter(carton => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      carton.name?.toLowerCase().includes(term) ||
      carton.spec?.toLowerCase().includes(term)
    )
  })

  // 分组：预警、正常
  const grouped = filteredCartons.reduce(
    (acc, carton) => {
      if (carton.quantity <= 0) {
        acc.out.push(carton)
      } else if (carton.quantity <= carton.warning_qty) {
        acc.low.push(carton)
      } else {
        acc.ok.push(carton)
      }
      return acc
    },
    { low: [], out: [], ok: [] }
  )

  const groups = [
    {
      key: 'out',
      title: `缺货 · ${grouped.out.length}`,
      tone: 'border-rose-200 bg-rose-50/70',
      badge: 'bg-rose-100 text-rose-700',
    },
    {
      key: 'low',
      title: `库存预警 · ${grouped.low.length}`,
      tone: 'border-amber-200 bg-amber-50/70',
      badge: 'bg-amber-100 text-amber-700',
    },
    {
      key: 'ok',
      title: `库存充足 · ${grouped.ok.length}`,
      tone: 'border-emerald-200 bg-emerald-50/70',
      badge: 'bg-emerald-100 text-emerald-700',
    },
  ]

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">纸箱管理</h1>
          <p className="text-slate-500">管理纸箱库存，关联产品自动扣减</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cartons/bindding" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            产品关联
          </Link>
          <Link href="/cartons/records" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            出入库记录
          </Link>
          <Link href="/cartons/inventory" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            盘点
          </Link>
          {isAdmin && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition shadow-sm"
            >
              添加纸箱
            </button>
          )}
        </div>
      </div>

      {/* 搜索框 + 快捷筛选 */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索纸箱名称、规格..."
          className="w-full md:w-96 input-field"
        />
        <div className="flex flex-wrap gap-2">
          {['600', '580', '500', '1000', '430', '380', '250', '280', '百越', '珍利厨', '莆田'].map((tag) => (
            <button
              key={tag}
              onClick={() => setSearchTerm(searchTerm === tag ? '' : tag)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                searchTerm === tag
                  ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
              }`}
            >
              {tag}
            </button>
          ))}
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-600 transition"
            >
              × 清除
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredCartons.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-slate-500">
            {searchTerm ? `未找到包含 "${searchTerm}" 的纸箱` : '暂无纸箱，点击上方按钮添加'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const items = grouped[group.key]
            if (items.length === 0) return null
            return (
              <div key={group.key} className={`rounded-2xl border ${group.tone} p-4 md:p-5`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">{group.title}</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((carton) => (
                    <div
                      key={carton.id}
                      onClick={() => openDetailModal(carton)}
                      className="surface-card cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
                    >
                      {/* ── 顶部：名称 + 规格 + 状态 ── */}
                      <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-base font-bold text-slate-900 leading-snug">{carton.name}</p>
                            <p className="text-xl font-extrabold text-slate-600 tracking-tight leading-tight mt-0.5">
                              {carton.spec || <span className="text-base font-normal text-slate-400">无规格</span>}
                            </p>
                          </div>
                          <span className={`shrink-0 mt-1 px-2 py-0.5 text-xs font-semibold rounded-full ${group.badge}`}>
                            {group.key === 'low' ? '预警' : group.key === 'out' ? '缺货' : '正常'}
                          </span>
                        </div>
                      </div>

                      {/* ── 中部：库存数量居中 ── */}
                      <div className="relative flex flex-col items-center justify-center py-5">
                        <p className={`text-5xl font-black tabular-nums leading-none ${carton.quantity < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          {carton.quantity}
                        </p>
                        <p className="text-xs text-slate-400 font-medium mt-2">当前库存</p>
                        {(() => {
                          const match = carton.spec?.match(/[Xx](\d+)/)
                          const perBox = match ? parseInt(match[1]) : null
                          if (!perBox || carton.quantity <= 0) return null
                          return (
                            <div className="absolute right-4 bottom-3 text-right">
                              <p className="text-sm font-bold text-slate-700">{Math.floor(carton.quantity / perBox).toLocaleString()} 件</p>
                              <p className="text-xs text-slate-400">可做</p>
                            </div>
                          )
                        })()}
                      </div>

                      {/* ── 底部：预警值 + 操作 ── */}
                      <div className="px-4 pb-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">预警 <span className="font-semibold text-slate-600">{carton.warning_qty}</span></span>
                          <span className="text-slate-200">|</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); openStockModal(carton, 'in') }}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                          >
                            进仓
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openStockModal(carton, 'out') }}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                          >
                            出仓
                          </button>
                          <Link
                            href={`/cartons/records?carton_id=${carton.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                          >
                            流水
                          </Link>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-2 text-xs">
                            <button
                              onClick={(e) => { e.stopPropagation(); openModal(carton) }}
                              className="text-slate-500 hover:text-slate-900 transition"
                            >
                              编辑
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openDeleteModal(carton) }}
                              className="text-rose-500 hover:text-rose-700 transition"
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{editingCarton ? '编辑纸箱' : '添加纸箱'}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">填写纸箱信息</p>
                </div>
                <button type="button" onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">纸箱信息</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">纸箱名称 <span className="text-rose-400">*</span></label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" placeholder="例如：一品鸡汁1000箱" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">规格尺寸</label>
                    <input type="text" value={formData.spec} onChange={(e) => setFormData({ ...formData, spec: e.target.value })} className="input-field" placeholder="例如：1000X6" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">库存预警值 <span className="text-rose-400">*</span></label>
                    <input type="number" value={formData.warning_qty} onChange={(e) => setFormData({ ...formData, warning_qty: parseInt(e.target.value) || 0 })} onWheel={(e) => e.target.blur()} className="input-field" min="0" required />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                    <input type="text" value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} className="input-field" placeholder="可选" />
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={closeModal} className="btn-ghost flex-1 py-3 border border-slate-200 rounded-xl">取消</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 py-3">{submitting ? '保存中...' : editingCarton ? '保存修改' : '确认添加'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">确认删除</h2>
            <p className="text-slate-600 mb-2">
              确定要删除纸箱 <span className="font-semibold">{deleteModal.carton?.name}</span> 吗？
            </p>
            <p className="text-rose-500 text-sm mb-6">相关的关联记录也会被删除。</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModal({ show: false, carton: null })}
                className="btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 进仓/出仓弹窗 */}
      {stockModal.show && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            {/* 头部 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${stockModal.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {stockModal.type === 'in' ? '进仓' : '出仓'}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">{stockModal.carton?.name}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {stockModal.carton?.spec && `规格：${stockModal.carton.spec} · `}当前库存 {stockModal.carton?.quantity}
                  </p>
                </div>
                <button type="button" onClick={closeStockModal} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition text-lg leading-none">×</button>
              </div>
            </div>

            <form onSubmit={handleStockSubmit} className="px-6 py-5 space-y-4">
              {stockModal.type === 'in' ? (
                <>
                  {/* 进仓：数量与采购金额 */}
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 space-y-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">数量与价格</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">数量 <span className="text-rose-400">*</span></label>
                        <input
                          type="number"
                          value={stockForm.quantity}
                          onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="input-field"
                          min="1"
                          placeholder="0"
                          required
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">单位</label>
                        <input
                          type="text"
                          value={stockForm.unit}
                          onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })}
                          className="input-field"
                          placeholder="个"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">总金额 (¥) <span className="text-rose-400">*</span></label>
                      <input
                        type="number"
                        step="0.01"
                        value={stockForm.total_amount}
                        onChange={(e) => setStockForm({ ...stockForm, total_amount: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="input-field text-lg font-semibold"
                        min="0"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    {/* 自动计算单价 */}
                    {(() => {
                      const up = stockForm.quantity && stockForm.total_amount && parseFloat(stockForm.quantity) > 0
                        ? (parseFloat(stockForm.total_amount) / parseFloat(stockForm.quantity)).toFixed(4)
                        : null
                      return (
                        <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${up ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'}`}>
                          <span className={`text-sm ${up ? 'text-slate-300' : 'text-slate-400'}`}>自动计算单价</span>
                          <span className={`text-xl font-black tabular-nums ${up ? 'text-white' : 'text-slate-300'}`}>{up ? `¥${up}` : '—'}</span>
                        </div>
                      )
                    })()}
                  </div>

                  {/* 进仓：采购信息 */}
                  <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 space-y-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">采购信息</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">供应商</label>
                        <input
                          type="text"
                          value={stockForm.supplier}
                          onChange={(e) => setStockForm({ ...stockForm, supplier: e.target.value })}
                          className="input-field"
                          placeholder="供应商名称"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">采购日期 <span className="text-rose-400">*</span></label>
                        <input
                          type="date"
                          value={stockForm.stock_date}
                          onChange={(e) => setStockForm({ ...stockForm, stock_date: e.target.value })}
                          className="input-field"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                      <input
                        type="text"
                        value={stockForm.remark}
                        onChange={(e) => setStockForm({ ...stockForm, remark: e.target.value })}
                        className="input-field"
                        placeholder="可选"
                      />
                    </div>
                    <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">此次进仓记录将自动同步到「采购成本」</p>
                  </div>
                </>
              ) : (
                /* 出仓：简单表单 */
                <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 space-y-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">出仓信息</p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">数量 <span className="text-rose-400">*</span></label>
                    <input
                      type="number"
                      value={stockForm.quantity}
                      onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                      onWheel={(e) => e.target.blur()}
                      className="input-field"
                      min="1"
                      placeholder="0"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">日期 <span className="text-rose-400">*</span></label>
                      <input
                        type="date"
                        value={stockForm.stock_date}
                        onChange={(e) => setStockForm({ ...stockForm, stock_date: e.target.value })}
                        className="input-field"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                      <input
                        type="text"
                        value={stockForm.remark}
                        onChange={(e) => setStockForm({ ...stockForm, remark: e.target.value })}
                        className="input-field"
                        placeholder="可选"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={closeStockModal} className="btn-ghost flex-1 py-3 border border-slate-200 rounded-xl">取消</button>
                <button
                  type="submit"
                  disabled={stockSubmitting}
                  className={`flex-1 py-3 text-base font-semibold rounded-xl text-white transition ${stockModal.type === 'in' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20' : 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20'} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  {stockSubmitting ? '提交中...' : stockModal.type === 'in' ? '确认进仓' : '确认出仓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 详情弹窗 - 查看关联产品 */}
      {detailModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {detailModal.carton?.name}
            </h2>
            <p className="text-slate-500 text-sm mb-4">
              库存：{detailModal.carton?.quantity} | 预警值：{detailModal.carton?.warning_qty}
            </p>

            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">关联产品</h3>
              {detailModal.products.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center bg-slate-50 rounded-lg">
                  暂无关联产品，请到「产品关联」页面设置
                </p>
              ) : (
                <div className="space-y-2">
                  {detailModal.products.map((product) => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-500">
                          {product.spec} {product.prize_type && `· ${product.prize_type}`}
                        </p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-600">
                        {product.warehouse === 'finished' ? '成品' : '半成品'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setDetailModal({ show: false, carton: null, products: [] })}
                className="btn-ghost"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
