'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const CATEGORIES = [
  { value: 'carton', label: '纸箱', color: 'bg-amber-500', textColor: 'text-amber-700', lightColor: 'bg-amber-100', icon: '📦' },
  { value: 'material', label: '物料', color: 'bg-sky-500', textColor: 'text-sky-700', lightColor: 'bg-sky-100', icon: '🧴' },
  { value: 'label', label: '标签', color: 'bg-violet-500', textColor: 'text-violet-700', lightColor: 'bg-violet-100', icon: '🏷️' },
  { value: 'raw_material', label: '原材料', color: 'bg-emerald-500', textColor: 'text-emerald-700', lightColor: 'bg-emerald-100', icon: '🧪' },
]

const getCategoryInfo = (value) => CATEGORIES.find(c => c.value === value) || { label: value, color: 'bg-slate-500' }

export default function CostStatsPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('monthly')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(null)

  useEffect(() => {
    fetchAllRecords()
  }, [])

  const fetchAllRecords = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('purchase_records')
      .select('*')
      .order('purchase_date', { ascending: true })

    if (!error) {
      setRecords(data || [])
    }
    setLoading(false)
  }

  const years = [...new Set(records.map(r => new Date(r.purchase_date).getFullYear()))].sort((a, b) => b - a)
  if (years.length === 0) years.push(new Date().getFullYear())

  const yearRecords = records.filter(r => new Date(r.purchase_date).getFullYear() === selectedYear)

  // 按月汇总
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const monthRecords = yearRecords.filter(r => new Date(r.purchase_date).getMonth() === i)
    const byCategory = CATEGORIES.map(cat => ({
      ...cat,
      total: monthRecords.filter(r => r.category === cat.value).reduce((s, r) => s + parseFloat(r.total_amount || 0), 0),
    }))
    return {
      month,
      label: `${month}月`,
      total: monthRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0),
      count: monthRecords.length,
      byCategory,
    }
  })

  const yearTotal = yearRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0)
  const maxMonthTotal = Math.max(...monthlyData.map(m => m.total), 1)

  // 按类别年度汇总
  const yearByCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: yearRecords.filter(r => r.category === cat.value).reduce((s, r) => s + parseFloat(r.total_amount || 0), 0),
    count: yearRecords.filter(r => r.category === cat.value).length,
  }))

  // 按供应商汇总
  const supplierMap = {}
  yearRecords.forEach(r => {
    const key = r.supplier || '未填写'
    if (!supplierMap[key]) supplierMap[key] = { name: key, total: 0, count: 0 }
    supplierMap[key].total += parseFloat(r.total_amount || 0)
    supplierMap[key].count++
  })
  const supplierRanking = Object.values(supplierMap).sort((a, b) => b.total - a.total)

  // 按品项汇总（Top 15）
  const itemMap = {}
  yearRecords.forEach(r => {
    const key = `${r.item_name}||${r.spec || ''}`
    if (!itemMap[key]) itemMap[key] = { name: r.item_name, spec: r.spec, category: r.category, total: 0, count: 0, totalQty: 0 }
    itemMap[key].total += parseFloat(r.total_amount || 0)
    itemMap[key].count++
    itemMap[key].totalQty += r.quantity
  })
  const itemRanking = Object.values(itemMap).sort((a, b) => b.total - a.total).slice(0, 15)

  // 选中月份的详情
  const selectedMonthRecords = selectedMonth
    ? yearRecords.filter(r => new Date(r.purchase_date).getMonth() === selectedMonth - 1)
    : []

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link href="/cost" className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 hover:text-slate-900 mb-3 transition">
            ← 返回采购成本
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">成本统计</h1>
          <p className="text-slate-500">按月、按类别、按供应商分析采购成本</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setSelectedMonth(null) }}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 年度总览 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="surface-card p-4 md:col-span-1">
              <p className="text-xs text-slate-500 font-medium">{selectedYear}年合计</p>
              <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
                ¥{yearTotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-400 mt-1">{yearRecords.length} 条记录</p>
            </div>
            {yearByCategory.map(cat => (
              <div key={cat.value} className="surface-card p-4">
                <p className="text-xs text-slate-500 font-medium">{cat.icon} {cat.label}</p>
                <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                  ¥{cat.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {yearTotal > 0 ? ((cat.total / yearTotal) * 100).toFixed(1) : 0}%
                </p>
              </div>
            ))}
          </div>

          {/* 类别占比条 */}
          {yearTotal > 0 && (
            <div className="surface-card p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">类别占比</h3>
              <div className="flex rounded-full overflow-hidden h-6">
                {yearByCategory.filter(c => c.total > 0).map(cat => (
                  <div
                    key={cat.value}
                    className={`${cat.color} flex items-center justify-center transition-all duration-300`}
                    style={{ width: `${(cat.total / yearTotal) * 100}%` }}
                    title={`${cat.label}: ¥${cat.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
                  >
                    {(cat.total / yearTotal) > 0.08 && (
                      <span className="text-xs font-bold text-white">
                        {cat.label} {((cat.total / yearTotal) * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mt-3">
                {yearByCategory.filter(c => c.total > 0).map(cat => (
                  <div key={cat.value} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded-full ${cat.color}`}></div>
                    <span className="text-xs text-slate-600">{cat.label}</span>
                    <span className="text-xs font-semibold text-slate-900">¥{cat.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 月度趋势（柱状图） */}
          <div className="surface-card p-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">月度趋势</h3>
            <div className="flex items-end gap-1.5 h-48 md:h-56">
              {monthlyData.map((m) => (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center justify-end h-full cursor-pointer group"
                  onClick={() => setSelectedMonth(selectedMonth === m.month ? null : m.month)}
                >
                  <div className="w-full flex flex-col items-center justify-end flex-1">
                    {m.total > 0 && (
                      <span className="text-[10px] font-semibold text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition tabular-nums">
                        ¥{(m.total / 10000).toFixed(1)}万
                      </span>
                    )}
                    <div className="w-full flex flex-col justify-end" style={{ height: `${(m.total / maxMonthTotal) * 100}%`, minHeight: m.total > 0 ? '4px' : '0' }}>
                      {m.byCategory.filter(c => c.total > 0).reverse().map(cat => (
                        <div
                          key={cat.value}
                          className={`w-full ${cat.color} first:rounded-t-md transition-all duration-300`}
                          style={{ height: m.total > 0 ? `${(cat.total / m.total) * 100}%` : '0', minHeight: cat.total > 0 ? '2px' : '0' }}
                        ></div>
                      ))}
                    </div>
                  </div>
                  <span className={`text-xs mt-2 font-medium ${
                    selectedMonth === m.month ? 'text-slate-900 font-bold' : 'text-slate-500'
                  }`}>
                    {m.month}月
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 月度明细（点击柱子展开） */}
          {selectedMonth && (
            <div className="surface-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">
                  {selectedYear}年{selectedMonth}月明细
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {selectedMonthRecords.length} 条 · ¥{selectedMonthRecords.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </span>
                </h3>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 transition"
                >
                  收起
                </button>
              </div>
              {selectedMonthRecords.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">该月暂无记录</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">日期</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">类别</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">品名</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">数量</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">单价</th>
                        <th className="text-right py-2 px-3 text-xs font-semibold text-slate-700">金额</th>
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-700">供应商</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMonthRecords
                        .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
                        .map(r => {
                          const catInfo = getCategoryInfo(r.category)
                          return (
                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-sm text-slate-900">{r.purchase_date}</td>
                              <td className="py-2 px-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catInfo.lightColor} ${catInfo.textColor}`}>
                                  {catInfo.label}
                                </span>
                              </td>
                              <td className="py-2 px-3">
                                <span className="text-sm font-medium text-slate-900">{r.item_name}</span>
                                {r.spec && <span className="text-xs text-slate-500 ml-1">({r.spec})</span>}
                              </td>
                              <td className="py-2 px-3 text-right text-sm tabular-nums">{r.quantity.toLocaleString()} {r.unit}</td>
                              <td className="py-2 px-3 text-right text-sm tabular-nums">¥{parseFloat(r.unit_price).toFixed(4)}</td>
                              <td className="py-2 px-3 text-right text-sm font-semibold tabular-nums">¥{parseFloat(r.total_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
                              <td className="py-2 px-3 text-sm text-slate-600">{r.supplier || '-'}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* 供应商排行 */}
            <div className="surface-card p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">供应商排行</h3>
              {supplierRanking.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
              ) : (
                <div className="space-y-3">
                  {supplierRanking.map((s, idx) => (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-900 truncate">{s.name}</span>
                          <span className="text-sm font-bold text-slate-900 tabular-nums ml-2">
                            ¥{s.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-slate-400 rounded-full transition-all duration-300"
                            style={{ width: `${(s.total / (supplierRanking[0]?.total || 1)) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 品项排行 Top 15（含平均单价） */}
            <div className="surface-card p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">品项成本 Top 15</h3>
              {itemRanking.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
              ) : (
                <div className="space-y-2.5">
                  {itemRanking.map((item, idx) => {
                    const catInfo = getCategoryInfo(item.category)
                    const avgUnitPrice = item.totalQty > 0 ? item.total / item.totalQty : 0
                    return (
                      <div key={idx} className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${catInfo.lightColor} ${catInfo.textColor}`}>
                                {catInfo.label}
                              </span>
                              <span className="text-sm font-medium text-slate-900 truncate">{item.name}</span>
                              {item.spec && <span className="text-xs text-slate-400 hidden md:inline">({item.spec})</span>}
                            </div>
                            <div className="flex flex-col items-end shrink-0 ml-2">
                              <span className="text-sm font-bold text-slate-900 tabular-nums">
                                ¥{item.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                              </span>
                              {item.totalQty > 0 && (
                                <span className="text-xs text-slate-500 tabular-nums">
                                  平均 ¥{avgUnitPrice.toFixed(4)}/单位
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${catInfo.color} rounded-full transition-all duration-300`}
                              style={{ width: `${(item.total / (itemRanking[0]?.total || 1)) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
