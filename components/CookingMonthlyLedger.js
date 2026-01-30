'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function CookingMonthlyLedger({ onClose }) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('daily') // 'daily' or 'summary'

  useEffect(() => {
    fetchMonthlyRecords()
  }, [selectedMonth])

  const fetchMonthlyRecords = async () => {
    setLoading(true)
    const [year, month] = selectedMonth.split('-')
    const startDate = `${year}-${month}-01`
    const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]

    const { data } = await supabase
      .from('cooking_records')
      .select('*')
      .gte('cooking_date', startDate)
      .lte('cooking_date', endDate)
      .order('cooking_date', { ascending: true })

    setRecords(data || [])
    setLoading(false)
  }

  // 按日期分组数据
  const groupByDate = () => {
    const grouped = {}
    records.forEach((record) => {
      const date = record.cooking_date
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(record)
    })
    return grouped
  }

  // 按产品汇总
  const groupByProduct = () => {
    const summary = {}
    records.forEach((record) => {
      const name = record.product_name
      if (!summary[name]) {
        summary[name] = { pot_count: 0, weight_kg: 0, days: new Set() }
      }
      summary[name].pot_count += record.pot_count
      summary[name].weight_kg += record.weight_kg || 0
      summary[name].days.add(record.cooking_date)
    })
    return Object.entries(summary)
      .map(([name, data]) => ({
        product_name: name,
        pot_count: data.pot_count,
        weight_kg: data.weight_kg,
        day_count: data.days.size,
      }))
      .sort((a, b) => b.pot_count - a.pot_count)
  }

  const getMonthLabel = () => {
    const [year, month] = selectedMonth.split('-')
    return `${year}年${parseInt(month)}月`
  }

  // 生成月份选项（最近12个月）
  const getMonthOptions = () => {
    const options = []
    const now = new Date()
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const label = `${date.getFullYear()}年${date.getMonth() + 1}月`
      options.push({ value, label })
    }
    return options
  }

  // 计算总计
  const totals = {
    pot_count: records.reduce((sum, r) => sum + r.pot_count, 0),
    weight_kg: records.reduce((sum, r) => sum + (r.weight_kg || 0), 0),
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('请允许弹出窗口以打印')
      return
    }

    const groupedData = groupByDate()
    const sortedDates = Object.keys(groupedData).sort()
    const productSummary = groupByProduct()

    // 生成每日明细表格
    let dailyRows = ''
    let rowIndex = 0
    sortedDates.forEach((date) => {
      const dayRecords = groupedData[date]
      const dayTotal = dayRecords.reduce((sum, r) => sum + r.pot_count, 0)
      const dayWeight = dayRecords.reduce((sum, r) => sum + (r.weight_kg || 0), 0)

      dayRecords.forEach((record, idx) => {
        rowIndex++
        dailyRows += `
          <tr>
            ${idx === 0 ? `<td rowspan="${dayRecords.length}" class="date-cell">${date.slice(5)}</td>` : ''}
            <td>${record.product_name}</td>
            <td class="num">${record.pot_count}</td>
            <td class="num">${record.weight_kg || '-'}</td>
            ${idx === 0 ? `<td rowspan="${dayRecords.length}" class="num subtotal">${dayTotal}</td>` : ''}
          </tr>
        `
      })
    })

    // 生成产品汇总表格
    let summaryRows = productSummary.map((item, idx) => `
      <tr>
        <td class="num">${idx + 1}</td>
        <td>${item.product_name}</td>
        <td class="num">${item.pot_count}</td>
        <td class="num">${item.weight_kg > 0 ? item.weight_kg.toFixed(2) : '-'}</td>
        <td class="num">${item.day_count}</td>
      </tr>
    `).join('')

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>煮制台账 - ${getMonthLabel()}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; background: white; font-size: 10px; }
          @page { margin: 0.8cm; size: A4; }
          .ledger { padding: 0.5cm; }
          .header { text-align: center; margin-bottom: 0.8rem; }
          .header h1 { font-size: 16px; font-weight: 700; margin-bottom: 0.2rem; }
          .header p { font-size: 12px; color: #475569; }
          .section { margin-bottom: 0.8rem; }
          .section-title { font-size: 11px; font-weight: 600; color: #1e293b; margin-bottom: 0.3rem; padding-bottom: 0.2rem; border-bottom: 1px solid #e2e8f0; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; }
          th, td { border: 1px solid #cbd5e1; padding: 2px 4px; text-align: left; }
          th { background: #f1f5f9; font-weight: 600; font-size: 8px; }
          .num { text-align: right; }
          .date-cell { font-weight: 500; background: #f8fafc; text-align: center; }
          .subtotal { background: #fef3c7; font-weight: 600; }
          .total-row { background: #1e293b; color: white; font-weight: 700; }
          .total-row td { border-color: #1e293b; }
          .summary-table { width: 60%; margin: 0 auto; }
          .footer { margin-top: 0.5rem; font-size: 8px; color: #64748b; display: flex; justify-content: space-between; }
          .stats { display: flex; gap: 1.5rem; justify-content: center; margin-top: 0.5rem; font-size: 10px; }
          .stat-item { text-align: center; }
          .stat-value { font-size: 14px; font-weight: 700; color: #d97706; }
          .stat-label { color: #64748b; }
        </style>
      </head>
      <body>
        <div class="ledger">
          <div class="header">
            <h1>煮制生产台账</h1>
            <p>${getMonthLabel()}</p>
          </div>

          <div class="stats">
            <div class="stat-item">
              <div class="stat-value">${totals.pot_count}</div>
              <div class="stat-label">总锅数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${totals.weight_kg > 0 ? totals.weight_kg.toFixed(2) : '-'}</div>
              <div class="stat-label">总重量(kg)</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${sortedDates.length}</div>
              <div class="stat-label">生产天数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${productSummary.length}</div>
              <div class="stat-label">产品种类</div>
            </div>
          </div>

          <div class="section" style="margin-top: 0.8rem;">
            <div class="section-title">产品汇总</div>
            <table class="summary-table">
              <thead>
                <tr>
                  <th style="width: 30px;">序号</th>
                  <th>产品名称</th>
                  <th style="width: 50px;">锅数</th>
                  <th style="width: 60px;">重量(kg)</th>
                  <th style="width: 40px;">天数</th>
                </tr>
              </thead>
              <tbody>
                ${summaryRows}
                <tr class="total-row">
                  <td colspan="2" style="text-align: right;">合计</td>
                  <td class="num">${totals.pot_count}</td>
                  <td class="num">${totals.weight_kg > 0 ? totals.weight_kg.toFixed(2) : '-'}</td>
                  <td class="num">${sortedDates.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">每日明细</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 45px;">日期</th>
                  <th>产品名称</th>
                  <th style="width: 40px;">锅数</th>
                  <th style="width: 50px;">重量(kg)</th>
                  <th style="width: 45px;">当日合计</th>
                </tr>
              </thead>
              <tbody>
                ${dailyRows}
                <tr class="total-row">
                  <td colspan="2" style="text-align: right;">月度合计</td>
                  <td class="num">${totals.pot_count}</td>
                  <td class="num">${totals.weight_kg > 0 ? totals.weight_kg.toFixed(2) : '-'}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <div>打印时间：${new Date().toLocaleString('zh-CN')}</div>
            <div>百越仓库管理系统</div>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() { window.close(); };
          };
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
  }

  const groupedData = groupByDate()
  const sortedDates = Object.keys(groupedData).sort()
  const productSummary = groupByProduct()

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-[1000px] max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-800">月度煮制台账</h2>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-field"
            >
              {getMonthOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {getMonthLabel()} 暂无煮制记录
            </div>
          ) : (
            <div className="space-y-6">
              {/* 统计卡片 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-amber-600">{totals.pot_count}</div>
                  <div className="text-slate-500 text-sm">总锅数</div>
                </div>
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-700">
                    {totals.weight_kg > 0 ? totals.weight_kg.toFixed(2) : '-'}
                  </div>
                  <div className="text-slate-500 text-sm">总重量(kg)</div>
                </div>
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-700">{sortedDates.length}</div>
                  <div className="text-slate-500 text-sm">生产天数</div>
                </div>
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-700">{productSummary.length}</div>
                  <div className="text-slate-500 text-sm">产品种类</div>
                </div>
              </div>

              {/* 视图切换 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('daily')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'daily'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  每日明细
                </button>
                <button
                  onClick={() => setViewMode('summary')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    viewMode === 'summary'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  产品汇总
                </button>
              </div>

              {/* 表格内容 */}
              {viewMode === 'daily' ? (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">日期</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">产品名称</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">锅数</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">重量(kg)</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">当日小计</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedDates.map((date) => {
                        const dayRecords = groupedData[date]
                        const dayTotal = dayRecords.reduce((sum, r) => sum + r.pot_count, 0)
                        return dayRecords.map((record, idx) => (
                          <tr key={record.id} className="hover:bg-slate-50">
                            {idx === 0 && (
                              <td
                                rowSpan={dayRecords.length}
                                className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-100"
                              >
                                {date.slice(5)}
                              </td>
                            )}
                            <td className="px-4 py-2 text-slate-700">{record.product_name}</td>
                            <td className="px-4 py-2 text-right font-semibold text-amber-600">
                              {record.pot_count}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-500">
                              {record.weight_kg || '-'}
                            </td>
                            {idx === 0 && (
                              <td
                                rowSpan={dayRecords.length}
                                className="px-4 py-2 text-right font-bold text-amber-700 bg-amber-50 border-l border-slate-100"
                              >
                                {dayTotal}
                              </td>
                            )}
                          </tr>
                        ))
                      })}
                      <tr className="bg-slate-800 text-white font-bold">
                        <td colSpan={2} className="px-4 py-3 text-right">
                          月度合计
                        </td>
                        <td className="px-4 py-3 text-right">{totals.pot_count}</td>
                        <td className="px-4 py-3 text-right">
                          {totals.weight_kg > 0 ? totals.weight_kg.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-center font-medium text-slate-600 w-16">序号</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-600">产品名称</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">总锅数</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">总重量(kg)</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-600">生产天数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {productSummary.map((item, idx) => (
                        <tr key={item.product_name} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-center text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium text-slate-700">{item.product_name}</td>
                          <td className="px-4 py-2 text-right font-semibold text-amber-600">
                            {item.pot_count}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-500">
                            {item.weight_kg > 0 ? item.weight_kg.toFixed(2) : '-'}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-500">{item.day_count}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-800 text-white font-bold">
                        <td colSpan={2} className="px-4 py-3 text-right">
                          合计
                        </td>
                        <td className="px-4 py-3 text-right">{totals.pot_count}</td>
                        <td className="px-4 py-3 text-right">
                          {totals.weight_kg > 0 ? totals.weight_kg.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">{sortedDates.length}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
          <button onClick={onClose} className="btn-ghost">
            关闭
          </button>
          <button
            onClick={handlePrint}
            disabled={records.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            打印台账
          </button>
        </div>
      </div>
    </div>
  )
}
