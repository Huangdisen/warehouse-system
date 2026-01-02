'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function StockOutPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [warehouse, setWarehouse] = useState('finished')
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    stock_date: new Date().toISOString().split('T')[0],
    remark: '',
  })

  useEffect(() => {
    fetchProducts()
  }, [warehouse])

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', warehouse)
      .order('name')

    setProducts(data || [])
    setFormData(prev => ({ ...prev, product_id: '' }))
    setLoading(false)
  }

  const selectedProduct = products.find(p => p.id === formData.product_id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSuccess(false)
    setError('')

    const quantity = parseInt(formData.quantity)

    // 前端校验库存
    if (selectedProduct && quantity > selectedProduct.quantity) {
      setError(`库存不足！当前库存 ${selectedProduct.quantity} 件，无法出库 ${quantity} 件`)
      setSubmitting(false)
      return
    }

    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser()

    const { error: insertError } = await supabase
      .from('stock_records')
      .insert({
        product_id: formData.product_id,
        type: 'out',
        quantity: quantity,
        stock_date: formData.stock_date,
        operator_id: user.id,
        remark: formData.remark || null,
      })

    if (insertError) {
      setError('出库失败：' + insertError.message)
    } else {
      setSuccess(true)
      setFormData({
        product_id: '',
        quantity: '',
        stock_date: new Date().toISOString().split('T')[0],
        remark: '',
      })
      fetchProducts()
      setTimeout(() => setSuccess(false), 3000)
    }

    setSubmitting(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">出库</h1>
        <p className="text-gray-500">记录产品出库</p>
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
              ✅ 出库成功！
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
                  选择产品 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.product_id}
                  onChange={(e) => {
                    setFormData({ ...formData, product_id: e.target.value })
                    setError('')
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">请选择产品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} - {product.spec} (库存: {product.quantity})
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct && (
                <div className={`mb-4 p-4 rounded-lg ${
                  selectedProduct.quantity <= selectedProduct.warning_qty 
                    ? 'bg-red-50 border border-red-200' 
                    : 'bg-gray-50'
                }`}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">当前库存</span>
                    <span className={`font-semibold ${
                      selectedProduct.quantity <= selectedProduct.warning_qty 
                        ? 'text-red-600' 
                        : 'text-gray-800'
                    }`}>
                      {selectedProduct.quantity} 件
                      {selectedProduct.quantity <= selectedProduct.warning_qty && (
                        <span className="ml-2 text-red-500">⚠️ 库存不足</span>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  出库数量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => {
                    setFormData({ ...formData, quantity: e.target.value })
                    setError('')
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入数量"
                  min="1"
                  max={selectedProduct?.quantity || undefined}
                  required
                />
                {selectedProduct && formData.quantity && parseInt(formData.quantity) > selectedProduct.quantity && (
                  <p className="mt-1 text-sm text-red-500">
                    超出当前库存！最多可出库 {selectedProduct.quantity} 件
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  出库日期 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.stock_date}
                  onChange={(e) => setFormData({ ...formData, stock_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

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
                disabled={submitting || (selectedProduct && parseInt(formData.quantity) > selectedProduct.quantity)}
                className="w-full bg-orange-600 text-white py-3 px-4 rounded-lg hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {submitting ? '提交中...' : '📤 确认出库'}
              </button>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
