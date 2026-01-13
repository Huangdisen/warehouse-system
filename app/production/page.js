'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function ProductionPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0])
  const [remark, setRemark] = useState('')
  const [items, setItems] = useState([{ product_id: '', quantity: '', warehouse: 'finished', target_product_id: '' }])
  const [myRecords, setMyRecords] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [expandedRecordId, setExpandedRecordId] = useState(null)

  useEffect(() => {
    fetchProducts()
    fetchMyRecords()
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('warehouse')
      .order('name')
    setProducts(data || [])
    setLoading(false)
  }

  const fetchMyRecords = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('production_records')
      .select(`
        *,
        profiles!production_records_submitted_by_fkey (name),
        confirmed_profile:profiles!production_records_confirmed_by_fkey (name),
        production_record_items (
          id,
          quantity,
          warehouse,
          products (name, spec, prize_type)
        )
      `)
      .eq('submitted_by', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    setMyRecords(data || [])
  }

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: '', warehouse: 'finished', target_product_id: '' }])
  }

  const removeItem = (index) => {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index, field, value) => {
    const newItems = [...items]
    newItems[index][field] = value
    // 切换仓库类型时清空已选产品
    if (field === 'warehouse') {
      newItems[index].product_id = ''
      newItems[index].target_product_id = ''
    }
    setItems(newItems)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // 验证
    const validItems = items.filter(item => item.product_id && item.quantity > 0)
    if (validItems.length === 0) {
      alert('请至少添加一个有效的产品记录')
      return
    }
    // 贴半成品需要选择目标成品
    const labelSemiItems = validItems.filter(item => item.warehouse === 'label_semi')
    for (const item of labelSemiItems) {
      if (!item.target_product_id) {
        alert('贴半成品需要选择目标成品')
        return
      }
    }

    setSubmitting(true)
    setSuccess(false)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      alert('未登录，请先登录')
      setSubmitting(false)
      return
    }

    // 创建生产记录主表
    const { data: record, error: recordError } = await supabase
      .from('production_records')
      .insert({
        production_date: productionDate,
        warehouse: 'finished', // 默认值，实际以明细为准
        submitted_by: user.id,
        remark: remark || null,
      })
      .select()
      .single()

    if (recordError) {
      alert('提交失败：' + recordError.message)
      setSubmitting(false)
      return
    }

    // 创建明细
    const itemsToInsert = validItems.map(item => ({
      record_id: record.id,
      product_id: item.warehouse === 'label_semi' ? item.target_product_id : item.product_id,
      quantity: parseInt(item.quantity),
      warehouse: item.warehouse, // 保持原始 warehouse 值，包括 label_semi
    }))
    
    // 对于贴半成品，同时需要记录半成品出库
    const labelSemiOutItems = validItems
      .filter(item => item.warehouse === 'label_semi')
      .map(item => ({
        record_id: record.id,
        product_id: item.product_id, // 半成品
        quantity: parseInt(item.quantity),
        warehouse: 'label_semi_out', // 标记为贴半成品出库
      }))

    // 合并所有明细（包括贴半成品的出库记录）
    const allItems = [...itemsToInsert, ...labelSemiOutItems]

    const { error: itemsError } = await supabase
      .from('production_record_items')
      .insert(allItems)

    if (itemsError) {
      alert('提交失败：' + itemsError.message)
      setSubmitting(false)
      return
    }

    setSuccess(true)
    setItems([{ product_id: '', quantity: '', warehouse: 'finished', target_product_id: '' }])
    setProductionDate(new Date().toISOString().split('T')[0])
    setRemark('')
    fetchMyRecords()
    setTimeout(() => setSuccess(false), 3000)
    setSubmitting(false)
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    }
    const labels = {
      pending: '待确认',
      confirmed: '已入库',
      rejected: '已驳回',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">提交生产记录</h1>
        <p className="text-slate-500">生产完成后提交记录，等待仓管员确认入库</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 提交表单 */}
        <div className="surface-card p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">新建生产记录</h2>
          
          {success && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-emerald-700">
              提交成功，等待仓管员确认入库。
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  生产日期 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                  className="input-field"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">选择产品的实际生产日期（可与提交日期不同）</p>
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  产品明细 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="p-3 surface-inset">
                      <div className="flex space-x-2 mb-2">
                        <select
                          value={item.warehouse}
                          onChange={(e) => updateItem(index, 'warehouse', e.target.value)}
                          className="w-28 select-field text-sm bg-white"
                        >
                          <option value="finished">成品</option>
                          <option value="semi">半成品</option>
                          <option value="label_semi">贴半成品</option>
                        </select>
                        {item.warehouse === 'label_semi' ? (
                          <select
                            value={item.product_id}
                            onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                            className="flex-1 select-field text-sm"
                            required
                          >
                            <option value="">选择半成品</option>
                            {products
                              .filter(p => p.warehouse === 'semi')
                              .map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} - {product.spec}{product.prize_type ? ` (库存: ${product.quantity})` : ''}
                                </option>
                              ))}
                          </select>
                        ) : (
                          <select
                            value={item.product_id}
                            onChange={(e) => updateItem(index, 'product_id', e.target.value)}
                            className="flex-1 select-field text-sm"
                            required
                          >
                            <option value="">选择产品</option>
                            {products
                              .filter(p => p.warehouse === item.warehouse)
                              .map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} - {product.spec}{product.prize_type ? ` (${product.prize_type})` : ''}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                      {/* 贴半成品时选择目标成品 */}
                      {item.warehouse === 'label_semi' && (
                        <div className="mt-2">
                          <select
                            value={item.target_product_id}
                            onChange={(e) => updateItem(index, 'target_product_id', e.target.value)}
                            className="select-field text-sm"
                            required
                          >
                            <option value="">→ 选择目标成品</option>
                            {products
                              .filter(p => p.warehouse === 'finished')
                              .map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} - {product.spec}{product.prize_type ? ` (${product.prize_type})` : ''}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                      <div className="flex space-x-2 mt-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                          onWheel={(e) => e.target.blur()} // 防止鼠标滚轮误操作
                          className="flex-1 input-field text-sm"
                          placeholder="数量"
                          min="1"
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
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="mt-2 btn-ghost"
                >
                  添加更多产品
                </button>
              </div>

              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  备注
                </label>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  className="textarea-field"
                  rows="2"
                  placeholder="可选，备注信息"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full btn-primary py-3"
              >
                {submitting ? '提交中...' : '提交生产记录'}
              </button>
            </form>
          )}
        </div>

        {/* 我的提交记录 */}
        <div className="surface-card p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-slate-800">我的提交记录</h2>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-slate-600 text-sm hover:text-slate-900"
            >
              {showHistory ? '收起' : '展开'}
            </button>
          </div>

          {myRecords.length === 0 ? (
            <p className="text-slate-500 text-center py-8">暂无提交记录</p>
          ) : (
            <div className="space-y-3">
              {myRecords.slice(0, showHistory ? 20 : 5).map((record) => {
                const isExpanded = expandedRecordId === record.id
                // 不计入 label_semi_out 的数量（配套出库记录）
                const totalQty = record.production_record_items?.reduce((sum, item) => {
                  if (item.warehouse === 'label_semi_out') return sum
                  return sum + item.quantity
                }, 0) || 0
                return (
                  <div
                    key={record.id}
                    className={`surface-soft border-l-4 overflow-hidden ${
                      record.status === 'confirmed' ? 'border-emerald-500' : 
                      record.status === 'rejected' ? 'border-rose-500' : 'border-amber-500'
                    }`}
                  >
                    {/* 卡片头部 - 可点击 */}
                    <div
                      onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                      className="p-3 cursor-pointer hover:bg-slate-100/70 transition"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                          <span className="text-sm text-slate-900 font-medium">
                            {record.production_date}
                          </span>
                          {getStatusBadge(record.status)}
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-lg font-bold text-slate-600">{totalQty}</span>
                          <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {record.production_record_items?.filter(item => item.warehouse !== 'label_semi_out').length || 0} 个产品 · 提交于 {new Date(record.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>

                    {/* 展开详情 */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2 bg-white border-t border-slate-200/70">
                        <table className="table-base table-compact">
                          <thead>
                            <tr className="text-slate-500 text-xs">
                              <th className="text-left pb-2">类型</th>
                              <th className="text-left pb-2">产品</th>
                              <th className="text-left pb-2">规格</th>
                              <th className="text-right pb-2">数量</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {record.production_record_items?.filter(item => item.warehouse !== 'label_semi_out').map((item) => (
                              <tr key={item.id}>
                                <td className="py-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    item.warehouse === 'finished' 
                                      ? 'bg-slate-100 text-slate-700' 
                                      : item.warehouse === 'label_semi'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-violet-100 text-violet-700'
                                  }`}>
                                    {item.warehouse === 'finished' ? '成品' : item.warehouse === 'label_semi' ? '贴半成品' : '半成品'}
                                  </span>
                                </td>
                                <td className="py-1.5 font-medium text-slate-900">
                                  {item.products?.name}
                                </td>
                                <td className="py-1.5 text-slate-600">
                                  {item.products?.spec}
                                </td>
                                <td className="py-1.5 text-right font-semibold text-slate-900">
                                  {item.quantity}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {record.remark && (
                          <div className="mt-3 pt-2 border-t border-slate-100 text-sm text-slate-600">
                            <span className="text-slate-500">备注：</span>{record.remark}
                          </div>
                        )}
                        {record.status === 'rejected' && record.reject_reason && (
                          <div className="mt-2 p-2 bg-rose-50 rounded text-sm text-rose-600">
                            <span className="font-medium">驳回原因：</span>{record.reject_reason}
                          </div>
                        )}
                        {record.status === 'confirmed' && (
                          <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-400">
                            确认于 {new Date(record.confirmed_at).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
