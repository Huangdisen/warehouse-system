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
  const [recentRecords, setRecentRecords] = useState([])
  const [loading, setLoading] = useState(true)

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

    // 获取最近记录
    const { data: records } = await supabase
      .from('stock_records')
      .select(`
        *,
        products (name, spec),
        profiles (name)
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    setStats({ totalProducts, totalQuantity, lowStockCount, todayIn, todayOut })
    setLowStockProducts(lowStock)
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
            {/* 低库存预警 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">库存预警</h2>
              {lowStockProducts.length === 0 ? (
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
                        <p className="text-sm text-gray-500">{product.spec}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-red-600 font-bold">{product.quantity}</p>
                        <p className="text-xs text-gray-500">预警值: {product.warning_qty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 最近出入库记录 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">最近记录</h2>
              {recentRecords.length === 0 ? (
                <p className="text-gray-500 text-center py-4">暂无记录</p>
              ) : (
                <div className="space-y-3">
                  {recentRecords.slice(0, 5).map((record) => (
                    <div 
                      key={record.id} 
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
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
                          <p className="text-sm text-gray-500">
                            {record.stock_date} · {record.profiles?.name}
                          </p>
                        </div>
                      </div>
                      <span className={`font-bold ${
                        record.type === 'in' ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        {record.type === 'in' ? '+' : '-'}{record.quantity}
                      </span>
                    </div>
                  ))}
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
