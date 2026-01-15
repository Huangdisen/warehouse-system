'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import SearchableSelect from '@/components/SearchableSelect'

export default function StockInPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [warehouse, setWarehouse] = useState('finished')
  const [showConfirm, setShowConfirm] = useState(false)
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
    if (!formData.product_id || !formData.quantity) return
    setShowConfirm(true)
  }

  const handleConfirmSubmit = async () => {
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
    setShowConfirm(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">手动入库</h1>
        <p className="text-slate-500">记录手动入库，更新库存</p>
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
              入库成功，库存已更新。
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
                  选择产品 <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={formData.product_id}
                  onChange={(val) => setFormData({ ...formData, product_id: val })}
                  options={products}
                  placeholder="请选择产品"
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

              {selectedProduct && (
                <div className="mb-4 p-4 surface-inset">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">当前库存</span>
                    <span className="font-semibold text-slate-800">{selectedProduct.quantity} 件</span>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  入库数量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  onWheel={(e) => e.target.blur()} // 防止鼠标滚轮误操作
                  className="input-field"
                  placeholder="请输入数量"
                  min="1"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  入库日期 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.stock_date}
                  onChange={(e) => setFormData({ ...formData, stock_date: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

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
                {submitting ? '提交中...' : '确认入库'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 确认弹窗 */}
      {showConfirm && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">确认入库</h2>
            <p className="text-sm text-slate-500 mb-4">请核对以下入库信息</p>

            <div className="space-y-3 mb-6">
              <div className="surface-inset p-4">
                <div className="text-xs text-slate-500 mb-1">产品</div>
                <div className="font-semibold text-slate-900">{selectedProduct.name}</div>
                <div className="text-sm text-slate-600">{selectedProduct.spec}{selectedProduct.prize_type ? ` · ${selectedProduct.prize_type}` : ''}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="surface-inset p-4">
                  <div className="text-xs text-slate-500 mb-1">当前库存</div>
                  <div className="text-lg font-semibold text-slate-700">{selectedProduct.quantity} 件</div>
                </div>
                <div className="surface-inset p-4">
                  <div className="text-xs text-slate-500 mb-1">入库数量</div>
                  <div className="text-lg font-semibold text-emerald-600">+{formData.quantity} 件</div>
                </div>
              </div>

              <div className="surface-inset p-4">
                <div className="text-xs text-slate-500 mb-1">入库后库存</div>
                <div className="text-xl font-bold text-slate-900">
                  {selectedProduct.quantity + parseInt(formData.quantity || 0)} 件
                </div>
              </div>

              <div className="surface-inset p-4">
                <div className="text-xs text-slate-500 mb-1">入库日期</div>
                <div className="text-sm font-medium text-slate-900">{formData.stock_date}</div>
              </div>

              {formData.remark && (
                <div className="surface-inset p-4">
                  <div className="text-xs text-slate-500 mb-1">备注</div>
                  <div className="text-sm text-slate-700">{formData.remark}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
                className="btn-ghost"
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? '入库中...' : '确认入库'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
