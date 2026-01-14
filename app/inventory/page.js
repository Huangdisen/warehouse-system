'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouse, setWarehouse] = useState('finished')
  const [searchTerm, setSearchTerm] = useState('')
  const [inventoryData, setInventoryData] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [profile, setProfile] = useState(null)
  const [showModal, setShowModal] = useState(false)
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

  const calculateDifference = (productId) => {
    const product = products.find(p => p.id === productId)
    const actualQty = parseInt(inventoryData[productId]?.actual_qty)
    if (!product || isNaN(actualQty)) return null
    return actualQty - product.quantity
  }

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

  const filteredProducts = products.filter(product => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      product.name?.toLowerCase().includes(term) ||
      product.spec?.toLowerCase().includes(term) ||
      product.prize_type?.toLowerCase().includes(term)
    )
  })

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">库存盘点</h1>
          <p className="text-slate-500">核对并调整{warehouse === 'finished' ? '成品' : '半成品'}仓库的实际库存</p>
        </div>
        <button
          onClick={openModal}
          className="btn-primary w-full md:w-auto"
        >
          添加产品
        </button>
      </div>

      {/* 仓库切换 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setWarehouse('finished')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'finished'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          成品仓
        </button>
        <button
          onClick={() => setWarehouse('semi')}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-xl font-medium transition ${
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

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-slate-500">
            {searchTerm ? `未找到包含 "${searchTerm}" 的产品` : '暂无产品'}
          </p>
        </div>
      ) : (
        <>
          <div className="surface-card overflow-x-auto mb-4 hidden md:block">
            <table className="table-base table-compact table-row-hover">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">产品名称</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">规格</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">奖项</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">账面库存</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">实际库存</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">差异</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70">
                {filteredProducts.map((product) => {
                  const difference = calculateDifference(product.id)
                  return (
                    <tr key={product.id} className="hover:bg-slate-50/80">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                        {product.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {product.spec}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {product.prize_type || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-slate-900 font-semibold">
                        {product.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <input
                          type="number"
                          value={inventoryData[product.id]?.actual_qty || ''}
                          onChange={(e) => handleInventoryChange(product.id, 'actual_qty', e.target.value)}
                          className="w-32 input-field input-compact text-center"
                          placeholder="实际数量"
                          min="0"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {difference !== null && (
                          <span className={`font-bold ${
                            difference > 0 ? 'text-emerald-600' :
                            difference < 0 ? 'text-rose-600' :
                            'text-slate-500'
                          }`}>
                            {difference > 0 ? '+' : ''}{difference}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={inventoryData[product.id]?.remark || ''}
                          onChange={(e) => handleInventoryChange(product.id, 'remark', e.target.value)}
                          className="w-full input-field input-compact"
                          placeholder="备注"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredProducts.map((product) => {
              const difference = calculateDifference(product.id)
              return (
                <div key={product.id} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900">{product.name}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        规格：{product.spec || '—'}
                      </div>
                      <div className="text-xs text-slate-500">
                        奖项：{product.prize_type || '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">账面库存</div>
                      <div className="text-lg font-semibold text-slate-900">{product.quantity}</div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        实际库存
                      </label>
                      <input
                        type="number"
                        value={inventoryData[product.id]?.actual_qty || ''}
                        onChange={(e) => handleInventoryChange(product.id, 'actual_qty', e.target.value)}
                        className="input-field input-compact text-center"
                        placeholder="实际数量"
                        min="0"
                      />
                    </div>
                    <div>
                      <div className="block text-xs font-medium text-slate-600 mb-1">差异</div>
                      <div className={`h-10 rounded-xl border border-slate-200 bg-slate-50/80 flex items-center justify-center text-sm font-semibold ${
                        difference > 0 ? 'text-emerald-600' :
                        difference < 0 ? 'text-rose-600' :
                        'text-slate-500'
                      }`}>
                        {difference !== null ? `${difference > 0 ? '+' : ''}${difference}` : '--'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      备注
                    </label>
                    <input
                      type="text"
                      value={inventoryData[product.id]?.remark || ''}
                      onChange={(e) => handleInventoryChange(product.id, 'remark', e.target.value)}
                      className="input-field input-compact"
                      placeholder="备注"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary w-full md:w-auto"
            >
              {submitting ? '提交中...' : '提交盘点结果'}
            </button>
          </div>
        </>
      )}

      {/* 添加产品弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">添加产品</h2>
            <form onSubmit={handleProductSubmit}>
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
                  disabled={submittingProduct}
                  className="btn-primary"
                >
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
