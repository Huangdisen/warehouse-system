'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalQuantity: 0,
    lowStockCount: 0,
    todayIn: 0,
    todayOut: 0,
  })
  const [lowStockProducts, setLowStockProducts] = useState([])
  const [allStockProducts, setAllStockProducts] = useState([])
  const [recentRecords, setRecentRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRecordId, setExpandedRecordId] = useState(null)
  const [showRecentRecords, setShowRecentRecords] = useState(true)
  const [stockViewType, setStockViewType] = useState('all') // 'all' | 'warning'

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    const today = new Date().toISOString().split('T')[0]

    // 获取产品统计
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', 'finished')

    const totalProducts = products?.length || 0
    const totalQuantity = products?.reduce((sum, p) => sum + p.quantity, 0) || 0
    const lowStockCount = products?.filter(p => p.quantity <= p.warning_qty).length || 0

    // 获取今日出入库
    const { data: todayRecords } = await supabase
      .from('stock_records')
      .select('type, quantity')
      .eq('stock_date', today)

    const todayIn = todayRecords?.filter(r => r.type === 'in').reduce((sum, r) => sum + r.quantity, 0) || 0
    const todayOut = todayRecords?.filter(r => r.type === 'out').reduce((sum, r) => sum + r.quantity, 0) || 0

    // 获取低库存产品
    const lowStock = products?.filter(p => p.quantity <= p.warning_qty) || []

    // 获取所有有库存的产品（按库存从多到少排序）
    const allStock = products?.filter(p => p.quantity > 0).sort((a, b) => b.quantity - a.quantity) || []

    // 获取最近记录
    const { data: records } = await supabase
      .from('stock_records')
      .select(`
        *,
        products (name, spec, warehouse, prize_type),
        profiles (name),
        customers (name)
      `)
      .order('created_at', { ascending: false })
      .limit(20)

    setStats({ totalProducts, totalQuantity, lowStockCount, todayIn, todayOut })
    setLowStockProducts(lowStock)
    setAllStockProducts(allStock)
    setRecentRecords(records || [])
    setLoading(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
        <p className="text-gray-500">成品仓库概览</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard title="产品种类" value={stats.totalProducts} icon="📦" />
            <StatCard title="库存总量" value={stats.totalQuantity} icon="🏭" />
            <StatCard 
              title="库存预警" 
              value={stats.lowStockCount} 
              icon="⚠️" 
              highlight={stats.lowStockCount > 0}
            />
            <StatCard title="今日入库" value={stats.todayIn} icon="📥" color="green" />
            <StatCard title="今日出库" value={stats.todayOut} icon="📤" color="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 库存管理 - 可切换栏目 */}
            <div className="bg-white rounded-lg shadow p-6">
              {/* Tab切换 */}
              <div className="flex space-x-2 mb-4 border-b border-gray-200">
                <button
                  onClick={() => setStockViewType('all')}
                  className={`px-4 py-2 font-medium transition ${
                    stockViewType === 'all'
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  库存现货 ({allStockProducts.length})
                </button>
                <button
                  onClick={() => setStockViewType('warning')}
                  className={`px-4 py-2 font-medium transition ${
                    stockViewType === 'warning'
                      ? 'text-red-600 border-b-2 border-red-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  库存预警 ({lowStockProducts.length})
                </button>
              </div>

              {/* 库存现货 */}
              {stockViewType === 'all' && (
                allStockProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">暂无库存</p>
                ) : (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {allStockProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition"
                      >
                        <div>
                          <p className="font-medium text-gray-800">{product.name}</p>
                          <p className="text-sm text-gray-500">
                            {product.spec}
                            {product.prize_type && (
                              <span className="ml-2 text-blue-600">· {product.prize_type}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${
                            product.quantity <= product.warning_qty ? 'text-red-600' : 'text-gray-800'
                          }`}>
                            {product.quantity}
                          </p>
                          {product.quantity <= product.warning_qty && (
                            <p className="text-xs text-red-500">⚠️ 低库存</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 库存预警 */}
              {stockViewType === 'warning' && (
                lowStockProducts.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">暂无预警</p>
                ) : (
                  <div className="space-y-3">
                    {lowStockProducts.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200"
                      >
                        <div>
                          <p className="font-medium text-gray-800">{product.name}</p>
                          <p className="text-sm text-gray-500">
                            {product.spec}
                            {product.prize_type && (
                              <span className="ml-2 text-blue-600">· {product.prize_type}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-red-600 font-bold">{product.quantity}</p>
                          <p className="text-xs text-gray-500">预警值: {product.warning_qty}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* 最近出入库记录 - 折叠式 */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-800">最近记录</h2>
                <button
                  onClick={() => setShowRecentRecords(!showRecentRecords)}
                  className="text-blue-600 text-sm hover:text-blue-800"
                >
                  {showRecentRecords ? '收起' : '展开'}
                </button>
              </div>
              {recentRecords.length === 0 ? (
                <p className="text-gray-500 text-center py-4">暂无记录</p>
              ) : (
                <div className="space-y-2">
                  {recentRecords.slice(0, showRecentRecords ? 15 : 5).map((record) => {
                    const isExpanded = expandedRecordId === record.id
                    return (
                      <div 
                        key={record.id} 
                        className={`rounded-lg border-l-4 overflow-hidden ${
                          record.type === 'in' ? 'border-green-500' : 'border-orange-500'
                        }`}
                      >
                        <div 
                          onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                          className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition"
                        >
                          <div className="flex items-center">
                            <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                              record.type === 'in' ? 'bg-green-100' : 'bg-orange-100'
                            }`}>
                              {record.type === 'in' ? '📥' : '📤'}
                            </span>
                            <div>
                              <p className="font-medium text-gray-800">
                                {record.products?.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {record.stock_date} {new Date(record.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <span className={`font-bold mr-2 ${
                              record.type === 'in' ? 'text-green-600' : 'text-orange-600'
                            }`}>
                              {record.type === 'in' ? '+' : '-'}{record.quantity}
                            </span>
                            <span className={`text-gray-400 text-xs transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}>▼</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-gray-500">规格：</span>
                                <span className="text-gray-800 ml-1">{record.products?.spec}</span>
                              </div>
                              {record.products?.prize_type && (
                                <div>
                                  <span className="text-gray-500">奖项：</span>
                                  <span className="text-gray-800 ml-1">{record.products.prize_type}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-gray-500">仓库：</span>
                                <span className="text-gray-800 ml-1">
                                  {record.products?.warehouse === 'finished' ? '成品仓' : '半成品仓'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-500">操作人：</span>
                                <span className="text-gray-800 ml-1">{record.profiles?.name || '-'}</span>
                              </div>
                              {record.type === 'out' && record.customers?.name && (
                                <div>
                                  <span className="text-gray-500">客户：</span>
                                  <span className="text-gray-800 ml-1">{record.customers.name}</span>
                                </div>
                              )}
                              {record.type === 'out' && record.production_date && (
                                <div>
                                  <span className="text-gray-500">生产日期：</span>
                                  <span className="text-gray-800 ml-1">{record.production_date}</span>
                                </div>
                              )}
                              {record.remark && (
                                <div className="col-span-2">
                                  <span className="text-gray-500">备注：</span>
                                  <span className="text-gray-800 ml-1">{record.remark}</span>
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
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}

function StatCard({ title, value, icon, color, highlight }) {
  const bgColors = {
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    default: 'bg-white',
  }
  
  return (
    <div className={`p-4 rounded-lg shadow border ${
      highlight ? 'bg-red-50 border-red-300' : bgColors[color] || bgColors.default
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-2xl font-bold ${highlight ? 'text-red-600' : 'text-gray-800'}`}>
            {value}
          </p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  )
}
