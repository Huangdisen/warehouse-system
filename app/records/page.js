'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function RecordsPage() {
  const [records, setRecords] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [warehouse, setWarehouse] = useState('finished')
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

    let query = supabase
      .from('stock_records')
      .select(`
        *,
        products!inner (id, name, spec, warehouse, prize_type),
        profiles (name)
      `)
      .eq('products.warehouse', warehouse)
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
          <div>
            <label className="block text-gray-600 text-sm mb-1">产品</label>
            <select
              value={filters.product_id}
              onChange={(e) => setFilters({ ...filters, product_id: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部产品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {product.spec}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-600 text-sm mb-1">类型</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="in">入库</option>
              <option value="out">出库</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-600 text-sm mb-1">开始日期</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-gray-600 text-sm mb-1">结束日期</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* 记录列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">暂无记录</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">产品</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">规格</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">奖项</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">数量</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作人</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                    {record.stock_date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      record.type === 'in' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {record.type === 'in' ? '📥 入库' : '📤 出库'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                    {record.products?.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {record.products?.spec}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {record.products?.prize_type || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`font-semibold ${
                      record.type === 'in' ? 'text-green-600' : 'text-orange-600'
                    }`}>
                      {record.type === 'in' ? '+' : '-'}{record.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                    {record.profiles?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-gray-500 max-w-xs truncate">
                    {record.remark || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
