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

      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索纸箱名称、规格..."
          className="w-full md:w-96 input-field"
        />
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
                      className="surface-card p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-base font-semibold text-slate-900">{carton.name}</p>
                          {carton.spec && (
                            <span className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {carton.spec}
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${group.badge}`}>
                          {group.key === 'low' ? '预警' : group.key === 'out' ? '缺货' : '正常'}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-500">当前库存</p>
                          <p className={`text-2xl font-semibold tabular-nums ${carton.quantity < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {carton.quantity}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">预警值</p>
                          <p className="text-sm font-semibold text-slate-700 tabular-nums">
                            {carton.warning_qty}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-2">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); openStockModal(carton, 'in') }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                          >
                            进仓
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openStockModal(carton, 'out') }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                          >
                            出仓
                          </button>
                          <Link
                            href={`/cartons/records?carton_id=${carton.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                          >
                            流水
                          </Link>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-3 text-sm">
                            <button
                              onClick={(e) => { e.stopPropagation(); openModal(carton) }}
                              className="text-slate-600 hover:text-slate-900"
                            >
                              编辑
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openDeleteModal(carton) }}
                              className="text-rose-600 hover:text-rose-700"
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingCarton ? '编辑纸箱' : '添加纸箱'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  纸箱名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  placeholder="例如：一品鸡汁1000箱"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  规格尺寸
                </label>
                <input
                  type="text"
                  value={formData.spec}
                  onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                  className="input-field"
                  placeholder="例如：1000X6"
                />
              </div>
              <div className="mb-4">
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
              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  备注
                </label>
                <input
                  type="text"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="input-field"
                  placeholder="可选"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-ghost"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? '保存中...' : '保存'}
                </button>
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
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">
              {stockModal.type === 'in' ? '📥 进仓' : '📤 出仓'}
            </h2>
            <p className="text-slate-500 text-sm mb-5">{stockModal.carton?.name} {stockModal.carton?.spec && `· ${stockModal.carton.spec}`}</p>
            <form onSubmit={handleStockSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">数量</label>
                <input
                  type="number"
                  value={stockForm.quantity}
                  onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                  className="input-field"
                  min="1"
                  placeholder="输入数量"
                  required
                  autoFocus
                />
              </div>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">日期</label>
                <input
                  type="date"
                  value={stockForm.stock_date}
                  onChange={(e) => setStockForm({ ...stockForm, stock_date: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">备注</label>
                <input
                  type="text"
                  value={stockForm.remark}
                  onChange={(e) => setStockForm({ ...stockForm, remark: e.target.value })}
                  className="input-field"
                  placeholder="可选"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={closeStockModal} className="btn-ghost">取消</button>
                <button
                  type="submit"
                  disabled={stockSubmitting}
                  className={stockModal.type === 'in' ? 'btn-primary' : 'btn-danger'}
                >
                  {stockSubmitting ? '提交中...' : '确认'}
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
