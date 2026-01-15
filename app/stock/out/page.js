'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import SearchableSelect from '@/components/SearchableSelect'

export default function StockOutPage() {
  const [products, setProducts] = useState([])
  const [finishedProducts, setFinishedProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [warehouse, setWarehouse] = useState('finished')
  const [newCustomerName, setNewCustomerName] = useState('')
  const [items, setItems] = useState([{ product_id: '', quantity: '', production_date: '', target_product_id: '' }])
  const [formData, setFormData] = useState({
    stock_date: new Date().toISOString().split('T')[0],
    customer_id: '',
    remark: '',
  })
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmData, setConfirmData] = useState(null)

  useEffect(() => {
    fetchProducts()
    fetchCustomers()
    if (warehouse === 'semi') {
      fetchFinishedProducts()
    }
  }, [warehouse])

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', warehouse)
      .order('name')

    // 按库存从多到少排序
    const sortedData = (data || []).sort((a, b) => {
      if (b.quantity !== a.quantity) {
        return b.quantity - a.quantity
      }
      return a.name.localeCompare(b.name)
    })

    setProducts(sortedData)
    setItems([{ product_id: '', quantity: '', production_date: '', target_product_id: '' }])
    setLoading(false)
  }

  const fetchFinishedProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', 'finished')
      .order('name')
    
    // 按库存从多到少排序
    const sortedData = (data || []).sort((a, b) => {
      if (b.quantity !== a.quantity) {
        return b.quantity - a.quantity
      }
      return a.name.localeCompare(b.name)
    })
    
    setFinishedProducts(sortedData)
  }

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name')
    setCustomers(data || [])
  }

  const handleAddCustomer = async () => {
    if (!newCustomerName.trim()) return
    const { data, error } = await supabase
      .from('customers')
      .insert({ name: newCustomerName.trim() })
      .select()
      .single()
    if (!error && data) {
      setCustomers([...customers, data].sort((a, b) => a.name.localeCompare(b.name)))
      setFormData({ ...formData, customer_id: data.id })
      setNewCustomerName('')
    }
  }

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: '', production_date: '', target_product_id: '' }])
  }

  const removeItem = (index) => {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index, field, value) => {
    const newItems = [...items]
    newItems[index][field] = value
    setItems(newItems)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSuccess(false)
    setError('')

    // 成品出库必须选择客户
    if (warehouse === 'finished' && !formData.customer_id) {
      setError('请选择客户')
      return
    }

    // 验证至少有一个有效的产品
    const validItems = items.filter(item => item.product_id && item.quantity > 0)
    if (validItems.length === 0) {
      setError('请至少添加一个有效的产品记录')
      return
    }

    // 前端校验库存
    for (const item of validItems) {
      const product = products.find(p => p.id === item.product_id)
      if (product && parseInt(item.quantity) > product.quantity) {
        setError(`${product.name} - ${product.spec} 库存不足！当前库存 ${product.quantity} 件，无法出库 ${item.quantity} 件`)
        return
      }

      // 半成品转移时需要选择目标成品
      if (warehouse === 'semi' && !item.target_product_id) {
        setError('请为所有半成品选择要转入的成品')
        return
      }
    }

    // 成品仓出库：显示确认弹窗
    if (warehouse === 'finished') {
      const itemsWithDetails = validItems.map(item => {
        const product = products.find(p => p.id === item.product_id)
        return {
          ...item,
          product_name: product?.name,
          product_spec: product?.spec,
          prize_type: product?.prize_type,
        }
      })
      const customer = customers.find(c => c.id === formData.customer_id)
      setConfirmData({
        items: itemsWithDetails,
        customer_name: customer?.name,
        stock_date: formData.stock_date,
        remark: formData.remark,
      })
      setShowConfirmModal(true)
      return
    }

    // 半成品转移：直接执行（保持原逻辑）
    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser()
    setSubmitting(true)

    if (warehouse === 'semi') {
      // 半成品转移
      for (const item of validItems) {
        const { error: transferError } = await supabase
          .rpc('transfer_semi_to_finished', {
            p_semi_product_id: item.product_id,
            p_finished_product_id: item.target_product_id,
            p_quantity: parseInt(item.quantity),
            p_stock_date: formData.stock_date,
            p_remark: formData.remark || null,
          })

        if (transferError) {
          setError('转移失败：' + transferError.message)
          setSubmitting(false)
          return
        }
      }
    } else {
      // 成品出库 - 批量创建出库记录
      const recordsToInsert = validItems.map(item => ({
        product_id: item.product_id,
        type: 'out',
        quantity: parseInt(item.quantity),
        stock_date: formData.stock_date,
        production_date: item.production_date || null,
        customer_id: formData.customer_id || null,
        operator_id: user.id,
        remark: formData.remark || null,
      }))

      const { error: insertError } = await supabase
        .from('stock_records')
        .insert(recordsToInsert)

      if (insertError) {
        setError('出库失败：' + insertError.message)
        setSubmitting(false)
        return
      }
    }

    // 成功
    setSuccess(true)
    setItems([{ product_id: '', quantity: '', production_date: '', target_product_id: '' }])
    setFormData({
      stock_date: new Date().toISOString().split('T')[0],
      customer_id: '',
      remark: '',
    })
    fetchProducts()
    setTimeout(() => setSuccess(false), 3000)
    setSubmitting(false)
  }

  // 确认出库（从弹窗触发）
  const handleConfirmSubmit = async () => {
    setSubmitting(true)
    setShowConfirmModal(false)

    const validItems = items.filter(item => item.product_id && item.quantity > 0)

    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser()

    // 成品出库 - 批量创建出库记录
    const recordsToInsert = validItems.map(item => ({
      product_id: item.product_id,
      type: 'out',
      quantity: parseInt(item.quantity),
      stock_date: formData.stock_date,
      production_date: item.production_date || null,
      customer_id: formData.customer_id || null,
      operator_id: user.id,
      remark: formData.remark || null,
    }))

    const { error: insertError } = await supabase
      .from('stock_records')
      .insert(recordsToInsert)

    if (insertError) {
      setError('出库失败：' + insertError.message)
      setSubmitting(false)
      return
    }

    // 成功
    setSuccess(true)
    setItems([{ product_id: '', quantity: '', production_date: '', target_product_id: '' }])
    setFormData({
      stock_date: new Date().toISOString().split('T')[0],
      customer_id: '',
      remark: '',
    })
    fetchProducts()
    setTimeout(() => setSuccess(false), 3000)
    setSubmitting(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">出库</h1>
        <p className="text-slate-500">
          {warehouse === 'finished' ? '成品出库给客户' : '半成品转移到成品仓'}
        </p>
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

      <div className="max-w-2xl">
        <div className="surface-card p-6">
          {success && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-emerald-700">
              {warehouse === 'finished' ? '出库成功！' : '转移成功！'}
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              暂无产品，请先添加产品
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  {warehouse === 'finished' ? '产品明细' : '半成品明细'} <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const selectedProduct = products.find(p => p.id === item.product_id)
                    return (
                      <div key={index} className="p-3 surface-inset">
                        <div className="mb-2">
                          <SearchableSelect
                            value={item.product_id}
                            onChange={(val) => {
                              updateItem(index, 'product_id', val)
                              setError('')
                            }}
                            options={products}
                            placeholder="选择产品"
                            valueKey="id"
                            displayKey={(p) => `${p.name} - ${p.spec}${p.prize_type ? ` (${p.prize_type})` : ''}`}
                            renderOption={(p) => (
                              <div>
                                <div className="text-sm font-medium text-slate-900">{p.name} - {p.spec}</div>
                                <div className="text-xs mt-0.5">
                                  {p.prize_type && <span className="text-blue-600 mr-2">{p.prize_type}</span>}
                                  <span className={p.quantity <= p.warning_qty ? 'text-rose-500' : 'text-slate-500'}>
                                    库存: {p.quantity}
                                  </span>
                                </div>
                              </div>
                            )}
                          />
                        </div>
                        
                        {selectedProduct && (
                          <div className={`mb-2 p-2 rounded text-xs ${
                            selectedProduct.quantity <= selectedProduct.warning_qty 
                              ? 'bg-rose-50 text-rose-600' 
                              : 'bg-white text-slate-600'
                          }`}>
                            库存: {selectedProduct.quantity} 件
                            {selectedProduct.quantity <= selectedProduct.warning_qty && ' · 库存偏低'}
                          </div>
                        )}

                        {/* 半成品转移：选择目标成品 */}
                        {warehouse === 'semi' && (
                          <div className="mb-2">
                            <SearchableSelect
                              value={item.target_product_id}
                              onChange={(val) => updateItem(index, 'target_product_id', val)}
                              options={finishedProducts}
                              placeholder="→ 选择目标成品"
                              valueKey="id"
                              displayKey={(p) => `${p.name} - ${p.spec}${p.prize_type ? ` (${p.prize_type})` : ''}`}
                              renderOption={(p) => (
                                <div>
                                  <div className="text-sm font-medium text-slate-900">{p.name} - {p.spec}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {p.prize_type && <span className="text-blue-600 mr-2">{p.prize_type}</span>}
                                    <span>库存: {p.quantity}</span>
                                  </div>
                                </div>
                              )}
                            />
                          </div>
                        )}

                        <div className="flex space-x-2">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => {
                              updateItem(index, 'quantity', e.target.value)
                              setError('')
                            }}
                            onWheel={(e) => e.target.blur()}
                            className="flex-1 input-field text-sm"
                            placeholder="数量"
                            min="1"
                            max={selectedProduct?.quantity || undefined}
                            required
                          />
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                            >
                              删除
                            </button>
                          )}
                        </div>
                        {selectedProduct && item.quantity && parseInt(item.quantity) > selectedProduct.quantity && (
                          <p className="mt-1 text-xs text-red-500">
                            超出库存！最多 {selectedProduct.quantity} 件
                          </p>
                        )}

                        {/* 成品仓：生产日期 */}
                        {warehouse === 'finished' && (
                          <div className="mt-2">
                            <input
                              type="date"
                              value={item.production_date}
                              onChange={(e) => updateItem(index, 'production_date', e.target.value)}
                              className="input-field text-sm"
                              placeholder="生产日期（可选）"
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 btn-ghost"
                >
                  添加更多产品
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  {warehouse === 'finished' ? '出库日期' : '转移日期'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.stock_date}
                  onChange={(e) => setFormData({ ...formData, stock_date: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              {warehouse === 'finished' && (
                <div className="mb-4">
                    <label className="block text-slate-700 text-sm font-medium mb-2">
                      客户 <span className="text-red-500">*</span>
                    </label>
                    <SearchableSelect
                      value={formData.customer_id}
                      onChange={(val) => setFormData({ ...formData, customer_id: val })}
                      options={customers}
                      placeholder="请选择客户"
                      valueKey="id"
                      displayKey={(c) => c.name}
                      renderOption={(c) => (
                        <span className="text-sm">{c.name}</span>
                      )}
                    />
                    <div className="mt-2 flex space-x-2">
                      <input
                        type="text"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        className="flex-1 input-field"
                        placeholder="输入新客户名称"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomer}
                        className="btn-secondary"
                      >
                        添加
                      </button>
                    </div>
                  </div>
              )}

              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  备注
                </label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="textarea-field"
                  rows="3"
                  placeholder="可选，备注信息"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary py-3"
              >
                {submitting ? '提交中...' : (warehouse === 'finished' ? '确认出库' : '转移到成品仓')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 出库确认弹窗 */}
      {showConfirmModal && confirmData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6">
              <h2 className="text-xl font-semibold text-slate-900">确认出库明细</h2>
              <p className="text-sm text-slate-500 mt-1">请仔细核对以下出库信息</p>
            </div>

            <div className="p-6">
              {/* 基本信息 */}
              <div className="surface-inset p-4 mb-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-600">出库日期：</span>
                    <span className="font-medium text-slate-800">{confirmData.stock_date}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">客户：</span>
                    <span className="font-medium text-slate-800">{confirmData.customer_name || '无'}</span>
                  </div>
                  {confirmData.remark && (
                    <div className="col-span-2">
                      <span className="text-slate-600">备注：</span>
                      <span className="font-medium text-slate-800">{confirmData.remark}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 产品明细表 */}
              <div className="mb-6">
                <h3 className="font-semibold text-slate-800 mb-3">出库产品清单</h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="table-base table-compact table-row-hover">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">序号</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">产品名称</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">规格</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">奖项</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">生产日期</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase">出库数量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {confirmData.items.map((item, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm text-slate-800">{index + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.product_name}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.product_spec}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.prize_type || '-'}</td>
                          <td className="px-4 py-3 text-sm text-center text-slate-600">{item.production_date || '-'}</td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="font-bold text-amber-600">{item.quantity}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50">
                      <tr>
                        <td colSpan="5" className="px-4 py-3 text-sm font-medium text-slate-800 text-right">
                          合计出库数量：
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-lg font-bold text-amber-600">
                            {confirmData.items.reduce((sum, item) => sum + parseInt(item.quantity), 0)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={submitting}
                  className="btn-secondary disabled:opacity-50"
                >
                  返回修改
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSubmit}
                  disabled={submitting}
                  className="btn-primary disabled:opacity-50"
                >
                  {submitting ? '出库中...' : '确认出库'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
