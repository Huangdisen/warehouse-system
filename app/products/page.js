'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [warehouse, setWarehouse] = useState('finished') // 'finished' | 'semi'
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    spec: '',
    warning_qty: 10,
    prize_type: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ show: false, product: null })

  useEffect(() => {
    fetchProfile()
    fetchProducts()
  }, [warehouse])

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

  const fetchProducts = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', warehouse)
      .order('quantity', { ascending: false }) // 按库存从高到低排列
      .order('name', { ascending: true }) // 数量相同时按名称排序

    if (!error) {
      setProducts(data || [])
    }
    setLoading(false)
  }

  const openModal = (product = null) => {
    if (product) {
      setEditingProduct(product)
      setFormData({
        name: product.name,
        spec: product.spec,
        warning_qty: product.warning_qty,
        prize_type: product.prize_type || '',
      })
    } else {
      setEditingProduct(null)
      setFormData({ name: '', spec: '', warning_qty: 10, prize_type: '' })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingProduct(null)
    setFormData({ name: '', spec: '', warning_qty: 10, prize_type: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    if (editingProduct) {
      // 更新
      const { error } = await supabase
        .from('products')
        .update({
          name: formData.name,
          spec: formData.spec,
          warning_qty: formData.warning_qty,
          prize_type: formData.prize_type,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingProduct.id)

      if (!error) {
        fetchProducts()
        closeModal()
      }
    } else {
      // 新增
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
      }
    }

    setSubmitting(false)
  }

  const openDeleteModal = (product) => {
    setDeleteModal({ show: true, product })
  }

  const prizeBadgeClass = (prizeType) => {
    const text = (prizeType || '').trim()
    const map = {
      '盖奖': 'bg-sky-100 text-sky-700',
      '标奖': 'bg-emerald-100 text-emerald-700',
      '无奖': 'bg-slate-200 text-slate-700',
      '圆奖': 'bg-amber-100 text-amber-700',
      '垫片奖': 'bg-violet-100 text-violet-700',
      '定制标奖': 'bg-rose-100 text-rose-700',
    }
    return map[text] || 'bg-indigo-100 text-indigo-700'
  }

  const handleDelete = async () => {
    if (!deleteModal.product) return

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', deleteModal.product.id)

    if (!error) {
      fetchProducts()
    } else {
      alert('删除失败：' + error.message)
    }
    setDeleteModal({ show: false, product: null })
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">产品管理</h1>
          <p className="text-slate-500">管理{warehouse === 'finished' ? '成品' : '半成品'}仓库的产品</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => openModal()}
            className="btn-primary"
          >
            添加产品
          </button>
        )}
      </div>

      {/* 仓库切换 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setWarehouse('finished')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'finished'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          成品仓
        </button>
        <button
          onClick={() => setWarehouse('semi')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'semi'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          半成品仓
        </button>
      </div>

      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索产品名称、规格、奖项..."
          className="w-full md:w-96 input-field"
        />
      </div>

      {
        loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (() => {
          const filteredProducts = products.filter(product => {
            if (!searchTerm) return true
            const term = searchTerm.toLowerCase()
            return (
              product.name?.toLowerCase().includes(term) ||
              product.spec?.toLowerCase().includes(term) ||
              product.prize_type?.toLowerCase().includes(term)
            )
          })

          if (filteredProducts.length === 0) {
            return (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <p className="text-slate-500">
                  {searchTerm ? `未找到包含 "${searchTerm}" 的产品` : '暂无产品，点击上方按钮添加'}
                </p>
              </div>
            )
          }

          const grouped = filteredProducts.reduce(
            (acc, product) => {
              if (product.quantity <= 0) {
                acc.out.push(product)
              } else if (product.quantity <= product.warning_qty) {
                acc.low.push(product)
              } else {
                acc.ok.push(product)
              }
              return acc
            },
            { low: [], out: [], ok: [] }
          )

          const groups = [
            {
              key: 'ok',
              title: `库存充足 · ${grouped.ok.length}`,
              description: '状态稳定',
              tone: 'border-emerald-200 bg-emerald-50/70',
              badge: 'bg-emerald-100 text-emerald-700',
            },
            {
              key: 'low',
              title: `库存预警 · ${grouped.low.length}`,
              description: '建议优先补货',
              tone: 'border-rose-200 bg-rose-50/70',
              badge: 'bg-rose-100 text-rose-700',
            },
            {
              key: 'out',
              title: `缺货 · ${grouped.out.length}`,
              description: '当前无可用库存',
              tone: 'border-slate-200 bg-slate-50/70',
              badge: 'bg-slate-200 text-slate-700',
            },
          ]

          return (
            <div className="space-y-6">
              {groups.map((group) => {
                const items = grouped[group.key]
                if (items.length === 0) return null
                return (
                  <div key={group.key} className={`rounded-2xl border ${group.tone} p-4 md:p-5`}>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{group.title}</h3>
                        <p className="text-sm text-slate-500">{group.description}</p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((product) => (
                        <div key={product.id} className="surface-card p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-base font-semibold text-slate-900">{product.name}</p>
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                  规格 · {product.spec}
                                </span>
                                {product.prize_type && (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${prizeBadgeClass(product.prize_type)}`}>
                                    {product.prize_type}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${group.badge}`}>
                              {group.key === 'low' ? '预警' : group.key === 'out' ? '缺货' : '正常'}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <div>
                              <p className="text-xs text-slate-500">当前库存</p>
                              <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                                {product.quantity}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500">预警值</p>
                              <p className="text-sm font-semibold text-slate-700 tabular-nums">
                                {product.warning_qty}
                              </p>
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="mt-4 flex items-center justify-end gap-3 text-sm">
                              <button
                                onClick={() => openModal(product)}
                                className="text-slate-600 hover:text-slate-900"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => openDeleteModal(product)}
                                className="text-rose-600 hover:text-rose-700"
                              >
                                删除
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()
      }

      {/* 添加/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
                {editingProduct ? '编辑产品' : '添加产品'}
              </h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-slate-700 text-sm font-medium mb-2">
                    产品名称
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
                    规格
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
                  onWheel={(e) => e.target.blur()} // 防止鼠标滚轮误操作
                  className="input-field"
                  min="0"
                  required
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
            <p className="text-slate-600 mb-2">确定要删除产品 <span className="font-semibold">{deleteModal.product?.name}</span> 吗？</p>
            <p className="text-rose-500 text-sm mb-6">相关的出入库记录也会被删除。</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModal({ show: false, product: null })}
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
    </DashboardLayout >
  )
}
