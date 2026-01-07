'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

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
  const [items, setItems] = useState([{ product_id: '', quantity: '', target_product_id: '' }])
  const [formData, setFormData] = useState({
    stock_date: new Date().toISOString().split('T')[0],
    production_date: '',
    customer_id: '',
    remark: '',
  })

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
    setItems([{ product_id: '', quantity: '', target_product_id: '' }])
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
    setItems([...items, { product_id: '', quantity: '', target_product_id: '' }])
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
    setSubmitting(true)
    setSuccess(false)
    setError('')

    // 验证至少有一个有效的产品
    const validItems = items.filter(item => item.product_id && item.quantity > 0)
    if (validItems.length === 0) {
      setError('请至少添加一个有效的产品记录')
      setSubmitting(false)
      return
    }

    // 前端校验库存
    for (const item of validItems) {
      const product = products.find(p => p.id === item.product_id)
      if (product && parseInt(item.quantity) > product.quantity) {
        setError(`${product.name} - ${product.spec} 库存不足！当前库存 ${product.quantity} 件，无法出库 ${item.quantity} 件`)
        setSubmitting(false)
        return
      }

      // 半成品转移时需要选择目标成品
      if (warehouse === 'semi' && !item.target_product_id) {
        setError('请为所有半成品选择要转入的成品')
        setSubmitting(false)
        return
      }
    }

    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser()

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
        production_date: formData.production_date || null,
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
    setItems([{ product_id: '', quantity: '', target_product_id: '' }])
    setFormData({
      stock_date: new Date().toISOString().split('T')[0],
      production_date: '',
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
        <h1 className="text-2xl font-bold text-gray-800">出库</h1>
        <p className="text-gray-500">
          {warehouse === 'finished' ? '成品出库给客户' : '半成品转移到成品仓'}
        </p>
      </div>

      {/* 仓库切换 */}
      <div className="mb-4 flex space-x-2">
        <button
          onClick={() => setWarehouse('finished')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            warehouse === 'finished'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          成品仓
        </button>
        <button
          onClick={() => setWarehouse('semi')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            warehouse === 'semi'
              ? 'bg-orange-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          半成品仓
        </button>
      </div>

      <div className="max-w-2xl">
        <div className="bg-white rounded-lg shadow p-6">
          {success && (
            <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
              ✅ {warehouse === 'finished' ? '出库成功！' : '转移成功！'}
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
              ❌ {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              暂无产品，请先添加产品
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  {warehouse === 'finished' ? '产品明细' : '半成品明细'} <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const selectedProduct = products.find(p => p.id === item.product_id)
                    return (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg border">
                        <div className="flex space-x-2 mb-2">
                          <select
                            value={item.product_id}
                            onChange={(e) => {
                              updateItem(index, 'product_id', e.target.value)
                              setError('')
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            required
                          >
                            <option value="">选择产品</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} - {product.spec}{product.prize_type ? ` - ${product.prize_type}` : ''} (库存: {product.quantity})
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        {selectedProduct && (
                          <div className={`mb-2 p-2 rounded text-xs ${
                            selectedProduct.quantity <= selectedProduct.warning_qty 
                              ? 'bg-red-50 text-red-600' 
                              : 'bg-white text-gray-600'
                          }`}>
                            库存: {selectedProduct.quantity} 件
                            {selectedProduct.quantity <= selectedProduct.warning_qty && ' ⚠️ 低库存'}
                          </div>
                        )}

                        {/* 半成品转移：选择目标成品 */}
                        {warehouse === 'semi' && (
                          <div className="mb-2">
                            <select
                              value={item.target_product_id}
                              onChange={(e) => updateItem(index, 'target_product_id', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              required
                            >
                              <option value="">→ 选择目标成品</option>
                              {finishedProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} - {product.spec}{product.prize_type ? ` - ${product.prize_type}` : ''}
                                </option>
                              ))}
                            </select>
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
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="数量"
                            min="1"
                            max={selectedProduct?.quantity || undefined}
                            required
                          />
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              ✕ 删除
                            </button>
                          )}
                        </div>
                        {selectedProduct && item.quantity && parseInt(item.quantity) > selectedProduct.quantity && (
                          <p className="mt-1 text-xs text-red-500">
                            超出库存！最多 {selectedProduct.quantity} 件
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 text-blue-600 text-sm hover:text-blue-800"
                >
                  + 添加更多产品
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  {warehouse === 'finished' ? '出库日期' : '转移日期'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.stock_date}
                  onChange={(e) => setFormData({ ...formData, stock_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {warehouse === 'finished' && (
                <>
                  <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      生产日期
                    </label>
                    <input
                      type="date"
                      value={formData.production_date}
                      onChange={(e) => setFormData({ ...formData, production_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-medium mb-2">
                      客户
                    </label>
                    <div className="flex space-x-2">
                      <select
                        value={formData.customer_id}
                        onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">请选择客户</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex space-x-2">
                      <input
                        type="text"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="输入新客户名称"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomer}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  备注
                </label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="可选，备注信息"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {submitting ? '提交中...' : (warehouse === 'finished' ? '📤 确认出库' : '📦 转移到成品仓')}
              </button>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
