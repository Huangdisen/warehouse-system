'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function StockInPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: '',
    stock_date: new Date().toISOString().split('T')[0],
    remark: '',
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', 'finished')
      .order('name')

    setProducts(data || [])
    setLoading(false)
  }

  const selectedProduct = products.find(p => p.id === formData.product_id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setSuccess(false)

    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('stock_records')
      .insert({
        product_id: formData.product_id,
        type: 'in',
        quantity: parseInt(formData.quantity),
        stock_date: formData.stock_date,
        operator_id: user.id,
        remark: formData.remark || null,
      })

    if (!error) {
      setSuccess(true)
      setFormData({
        product_id: '',
        quantity: '',
        stock_date: new Date().toISOString().split('T')[0],
        remark: '',
      })
      // 刷新产品列表以获取最新库存
      fetchProducts()
      setTimeout(() => setSuccess(false), 3000)
    }

    setSubmitting(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">入库</h1>
        <p className="text-gray-500">记录产品入库</p>
      </div>

      <div className="max-w-2xl">
        <div className="bg-white rounded-lg shadow p-6">
          {success && (
            <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-lg">
              ✅ 入库成功！
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
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">请选择产品</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} - {product.spec}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct && (
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">当前库存</span>
                    <span className="font-semibold text-gray-800">{selectedProduct.quantity} 件</span>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  入库数量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入数量"
                  min="1"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  入库日期 <span className="text-red-500">*</span>
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
                disabled={submitting}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {submitting ? '提交中...' : '📥 确认入库'}
              </button>
            </form>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
