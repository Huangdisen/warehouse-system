'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouse, setWarehouse] = useState('finished')
  const [expandedId, setExpandedId] = useState(null)
  const [filters, setFilters] = useState({
    product_id: '',
    type: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    fetchProducts()
    fetchRecords()
  }, [warehouse])

  const fetchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, name, spec')
      .eq('warehouse', warehouse)
      .order('name')

    setProducts(data || [])
  }

  const fetchRecords = async () => {
    setLoading(true)

    // 先获取当前仓库的产品ID列表
    const { data: warehouseProducts } = await supabase
      .from('products')
      .select('id')
      .eq('warehouse', warehouse)
    
    const productIds = warehouseProducts?.map(p => p.id) || []
    
    if (productIds.length === 0) {
      setRecords([])
      setLoading(false)
      return
    }

    let query = supabase
      .from('stock_records')
      .select(`
        *,
        products (id, name, spec, warehouse, prize_type),
        profiles (name),
        customers (name)
      `)
      .in('product_id', productIds)
      .order('stock_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters.product_id) {
      query = query.eq('product_id', filters.product_id)
    }
    if (filters.type) {
      query = query.eq('type', filters.type)
    }
    if (filters.start_date) {
      query = query.gte('stock_date', filters.start_date)
    }
    if (filters.end_date) {
      query = query.lte('stock_date', filters.end_date)
    }

    const { data } = await query

    setRecords(data || [])
    setLoading(false)
  }

  const handleFilter = (e) => {
    e.preventDefault()
    fetchRecords()
  }

  const clearFilters = () => {
    setFilters({
      product_id: '',
      type: '',
      start_date: '',
      end_date: '',
    })
    fetchRecords()
  }

  const handleWarehouseChange = (w) => {
    setWarehouse(w)
    setFilters({ ...filters, product_id: '' })
  }

  // 合并同一客户的成品仓出库记录
  const groupedRecords = () => {
    if (warehouse !== 'finished') {
      return records
    }

    const grouped = []
    const processedIds = new Set()

    records.forEach(record => {
      if (processedIds.has(record.id)) return

      // 如果是成品仓出库且有客户，查找同一客户、同一日期、同一操作人的其他记录
      if (record.type === 'out' && record.customer_id) {
        const relatedRecords = records.filter(r => 
          r.type === 'out' &&
          r.customer_id === record.customer_id &&
          r.stock_date === record.stock_date &&
          r.operator_id === record.operator_id &&
          Math.abs(new Date(r.created_at) - new Date(record.created_at)) < 60000 // 1分钟内
        )

        if (relatedRecords.length > 1) {
          // 多个记录，合并显示
          relatedRecords.forEach(r => processedIds.add(r.id))
          grouped.push({
            ...record,
            isGroup: true,
            groupRecords: relatedRecords,
            totalQuantity: relatedRecords.reduce((sum, r) => sum + r.quantity, 0)
          })
        } else {
          // 单个记录
          processedIds.add(record.id)
          grouped.push(record)
        }
      } else {
        // 入库或无客户的出库，不合并
        processedIds.add(record.id)
        grouped.push(record)
      }
    })

    return grouped
  }

  const displayRecords = groupedRecords()

  // 统计
  const totalIn = records.filter(r => r.type === 'in').reduce((sum, r) => sum + r.quantity, 0)
  const totalOut = records.filter(r => r.type === 'out').reduce((sum, r) => sum + r.quantity, 0)

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">出入库记录</h1>
        <p className="text-gray-500">查看{warehouse === 'finished' ? '成品仓' : '半成品仓'}历史出入库记录</p>
      </div>

      {/* 仓库切换 */}
      <div className="mb-4 flex space-x-2">
        <button
          onClick={() => handleWarehouseChange('finished')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            warehouse === 'finished'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          成品仓
        </button>
        <button
          onClick={() => handleWarehouseChange('semi')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            warehouse === 'semi'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          半成品仓
        </button>
      </div>

      {/* 筛选器 */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
          <div className="w-64">
            <label className="block text-gray-600 text-sm mb-1">产品</label>
            <select
              value={filters.product_id}
              onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部产品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {product.spec}
                </option>
              ))}
            </select>
          </div>

          <div className="w-32">
            <label className="block text-gray-600 text-sm mb-1">类型</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="in">入库</option>
              <option value="out">出库</option>
            </select>
          </div>

          <div className="w-40">
            <label className="block text-gray-600 text-sm mb-1">开始日期</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="w-40">
            <label className="block text-gray-600 text-sm mb-1">结束日期</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            筛选
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            清除
          </button>
        </form>
      </div>

      {/* 统计摘要 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">记录数</p>
          <p className="text-2xl font-bold text-gray-800">{records.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 border border-green-200">
          <p className="text-sm text-gray-500">入库总量</p>
          <p className="text-2xl font-bold text-green-600">+{totalIn}</p>
        </div>
        <div className="bg-orange-50 rounded-lg shadow p-4 border border-orange-200">
          <p className="text-sm text-gray-500">出库总量</p>
          <p className="text-2xl font-bold text-orange-600">-{totalOut}</p>
        </div>
      </div>

      {/* 记录列表 - 卡片式 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">暂无记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayRecords.map((record) => {
            const isExpanded = expandedId === record.id
            const isInventoryAdjustment = record.remark?.startsWith('盘点调整')
            const isLabelSemiIn = record.type === 'in' && 
                                  warehouse === 'finished' && 
                                  record.remark?.includes('贴半成品')
            
            // 合并的记录组
            if (record.isGroup) {
              return (
                <div
                  key={record.id}
                  className="bg-white rounded-lg shadow overflow-hidden border-l-4 border-orange-500"
                >
                  {/* 卡片头部 - 显示客户信息 */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : record.id)}
                    className="p-4 cursor-pointer hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          📤 出库
                        </span>
                        <div>
                          <span className="font-medium text-gray-900">
                            {record.customers?.name || '未知客户'}
                          </span>
                          <span className="text-gray-500 ml-2">
                            ({record.groupRecords.length} 个产品)
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-xl font-bold text-orange-600">
                          -{record.totalQuantity}
                        </span>
                        <div className="text-right text-sm">
                          <div className="text-gray-900">{record.stock_date}</div>
                          <div className="text-gray-400">
                            {new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <span className={`text-gray-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}>
                          ▼
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 展开详情 - 显示所有产品 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
                      <div className="mb-3 pb-2 border-b border-gray-200">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">客户：</span>
                            <span className="text-gray-900 ml-1">{record.customers?.name}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">操作人：</span>
                            <span className="text-gray-900 ml-1">{record.profiles?.name || '-'}</span>
                          </div>
                          {record.production_date && (
                            <div>
                              <span className="text-gray-500">生产日期：</span>
                              <span className="text-gray-900 ml-1">{record.production_date}</span>
                            </div>
                          )}
                          {record.remark && (
                            <div className="col-span-2">
                              <span className="text-gray-500">备注：</span>
                              <span className="text-gray-900 ml-1">{record.remark}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 font-medium">产品明细：</p>
                        {record.groupRecords.map((item) => (
                          <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-gray-900">{item.products?.name}</span>
                              <span className="text-gray-500 text-sm">{item.products?.spec}</span>
                              {item.products?.prize_type && (
                                <span className="text-gray-400 text-xs">({item.products.prize_type})</span>
                              )}
                            </div>
                            <span className="font-bold text-orange-600">-{item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            // 单个记录
            return (
              <div
                key={record.id}
                className={`bg-white rounded-lg shadow overflow-hidden border-l-4 ${
                  isInventoryAdjustment ? 'border-purple-500' :
                  record.type === 'in' ? 'border-green-500' : 'border-orange-500'
                }`}
              >
                {/* 卡片头部 - 始终显示 */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {isInventoryAdjustment ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          📋 盘点调整
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          record.type === 'in' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {record.type === 'in' ? '📥 入库' : '📤 出库'}
                        </span>
                      )}
                      {isLabelSemiIn && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                          🏷️ 贴半成品
                        </span>
                      )}
                      <div>
                        <span className="font-medium text-gray-900">{record.products?.name}</span>
                        <span className="text-gray-500 ml-2">{record.products?.spec}</span>
                        {record.products?.prize_type && (
                          <span className="text-gray-400 ml-2">({record.products.prize_type})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className={`text-xl font-bold ${
                        record.type === 'in' ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        {record.type === 'in' ? '+' : '-'}{record.quantity}
                      </span>
                      <div className="text-right text-sm">
                        <div className="text-gray-900">{record.stock_date}</div>
                        <div className="text-gray-400">
                          {new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <span className={`text-gray-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}>
                        ▼
                      </span>
                    </div>
                  </div>
                </div>

                {/* 展开详情 */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {record.type === 'out' && (
                        <>
                          <div>
                            <span className="text-gray-500">客户：</span>
                            <span className="text-gray-900 ml-1">{record.customers?.name || '-'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">生产日期：</span>
                            <span className="text-gray-900 ml-1">{record.production_date || '-'}</span>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-gray-500">操作人：</span>
                        <span className="text-gray-900 ml-1">{record.profiles?.name || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">仓库：</span>
                        <span className="text-gray-900 ml-1">
                          {record.products?.warehouse === 'finished' ? '成品仓' : '半成品仓'}
                        </span>
                      </div>
                      {record.remark && (
                        <div className="col-span-2 md:col-span-4">
                          <span className="text-gray-500">备注：</span>
                          <span className="text-gray-900 ml-1">{record.remark}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </DashboardLayout>
  )
}
