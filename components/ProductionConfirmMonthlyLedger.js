'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ProductionConfirmMonthlyLedger({ onClose }) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchMonthlyRecords()
  }, [selectedMonth])

  const fetchMonthlyRecords = async () => {
    setLoading(true)
    const [year, month] = selectedMonth.split('-')
    const startDate = `${year}-${month}-01T00:00:00`
    const endDate = `${year}-${month}-${String(new Date(parseInt(year), parseInt(month), 0).getDate()).padStart(2, '0')}T23:59:59`

    const { data } = await supabase
      .from('production_records')
      .select(`
        *,
        confirmed_profile:profiles!production_records_confirmed_by_fkey (name),
        production_record_items (
          id,
          quantity,
          warehouse,
          products (id, name, spec, prize_type)
        )
      `)
      .eq('status', 'confirmed')
      .gte('confirmed_at', startDate)
      .lte('confirmed_at', endDate)
      .order('confirmed_at', { ascending: true })

    setRecords(data || [])
    setLoading(false)
  }

  const getMonthLabel = () => {
    const [year, month] = selectedMonth.split('-')
    return `${year}年${parseInt(month)}月`
  }

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

  const getDisplayItems = (items) => {
    return (items || []).filter(item => item.warehouse !== 'label_semi_out')
  }

  const getConfirmedDate = (record) => {
    if (!record.confirmed_at) return record.production_date || '-'
    return record.confirmed_at.split('T')[0]
  }

  const getWarehouseLabel = (warehouse) => {
    const labels = {
      'finished': '成品',
      'semi': '半成品',
      'label_semi': '贴半成品',
      'label_semi_out': '半成品出库',
    }
    return labels[warehouse] || warehouse
  }

  const getFlattenedRows = () => {
    const rows = []
    records.forEach((record) => {
      const date = getConfirmedDate(record)
      const items = getDisplayItems(record.production_record_items)
      items.forEach((item) => {
        rows.push({
          date,
          recordId: record.id,
          productName: item.products?.name || '-',
          productSpec: item.products?.spec || '-',
          warehouse: item.warehouse,
          quantity: item.quantity || 0,
          prizeType: item.products?.prize_type || '-',
        })
      })
    })
    return rows
  }

  const groupByDate = (rows) => {
    const grouped = {}
    rows.forEach((row) => {
      if (!grouped[row.date]) grouped[row.date] = []
      grouped[row.date].push(row)
    })
    return grouped
  }

  const rows = getFlattenedRows()
  const grouped = groupByDate(rows)
  const sortedDates = Object.keys(grouped).sort()

  const totals = {
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    recordCount: records.length,
    dayCount: sortedDates.length,
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('请允许弹出窗口以打印')
      return
    }

    let dailyRows = ''
    sortedDates.forEach((date) => {
      const dayRows = grouped[date]
      const dayTotal = dayRows.reduce((sum, row) => sum + row.quantity, 0)
      dayRows.forEach((row, idx) => {
        dailyRows += `
          <tr>
            ${idx === 0 ? `<td rowspan="${dayRows.length}" class="date-cell">${date.slice(5)}</td>` : ''}
            <td>${row.productName}</td>
            <td>${row.productSpec}</td>
            <td>${getWarehouseLabel(row.warehouse)}</td>
            <td>${row.prizeType}</td>
            <td class="num">${row.quantity}</td>
            ${idx === 0 ? `<td rowspan="${dayRows.length}" class="num subtotal">${dayTotal}</td>` : ''}
          </tr>
        `
      })
    })

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>确认入库台账 - ${getMonthLabel()}</title>
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
          .footer { margin-top: 0.5rem; font-size: 8px; color: #64748b; display: flex; justify-content: space-between; }
          .stats { display: flex; gap: 1.5rem; justify-content: center; margin-top: 0.5rem; font-size: 10px; }
          .stat-item { text-align: center; }
          .stat-value { font-size: 14px; font-weight: 700; color: #0f172a; }
          .stat-label { color: #64748b; }
        </style>
      </head>
      <body>
        <div class="ledger">
          <div class="header">
            <h1>确认入库台账</h1>
            <p>${getMonthLabel()}</p>
          </div>

          <div class="stats">
            <div class="stat-item">
              <div class="stat-value">${totals.quantity}</div>
              <div class="stat-label">总数量</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${totals.recordCount}</div>
              <div class="stat-label">确认记录</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">${totals.dayCount}</div>
              <div class="stat-label">处理天数</div>
            </div>
          </div>

          <div class="section" style="margin-top: 0.8rem;">
            <div class="section-title">每日明细</div>
            <table>
              <thead>
                <tr>
                  <th style="width: 45px;">日期</th>
                  <th>产品名称</th>
                  <th style="width: 70px;">规格</th>
                  <th style="width: 55px;">类型</th>
                  <th style="width: 55px;">奖项</th>
                  <th style="width: 50px;">数量</th>
                  <th style="width: 50px;">当日小计</th>
                </tr>
              </thead>
              <tbody>
                ${dailyRows}
                <tr class="total-row">
                  <td colspan="5" style="text-align: right;">月度合计</td>
                  <td class="num">${totals.quantity}</td>
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

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-[1100px] max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-slate-800">月度确认入库台账</h2>
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
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {getMonthLabel()} 暂无确认入库记录
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-800">{totals.quantity}</div>
                  <div className="text-slate-500 text-sm">总数量</div>
                </div>
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-700">{totals.recordCount}</div>
                  <div className="text-slate-500 text-sm">确认记录</div>
                </div>
                <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-slate-700">{totals.dayCount}</div>
                  <div className="text-slate-500 text-sm">处理天数</div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">日期</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">产品名称</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">规格</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">类型</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">奖项</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">数量</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-600">当日小计</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedDates.map((date) => {
                      const dayRows = grouped[date]
                      const dayTotal = dayRows.reduce((sum, row) => sum + row.quantity, 0)
                      return dayRows.map((row, idx) => (
                        <tr key={`${row.recordId}-${row.productName}-${idx}`} className="hover:bg-slate-50">
                          {idx === 0 && (
                            <td
                              rowSpan={dayRows.length}
                              className="px-4 py-2 font-medium text-slate-700 bg-slate-50 border-r border-slate-100"
                            >
                              {date.slice(5)}
                            </td>
                          )}
                          <td className="px-4 py-2 text-slate-700">{row.productName}</td>
                          <td className="px-4 py-2 text-slate-500">{row.productSpec}</td>
                          <td className="px-4 py-2 text-slate-500">{getWarehouseLabel(row.warehouse)}</td>
                          <td className="px-4 py-2 text-slate-500">{row.prizeType}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-800">
                            {row.quantity}
                          </td>
                          {idx === 0 && (
                            <td
                              rowSpan={dayRows.length}
                              className="px-4 py-2 text-right font-bold text-amber-700 bg-amber-50 border-l border-slate-100"
                            >
                              {dayTotal}
                            </td>
                          )}
                        </tr>
                      ))
                    })}
                    <tr className="bg-slate-800 text-white font-bold">
                      <td colSpan={5} className="px-4 py-3 text-right">
                        月度合计
                      </td>
                      <td className="px-4 py-3 text-right">{totals.quantity}</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
          <button onClick={onClose} className="btn-ghost">
            关闭
          </button>
          <button
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            打印台账
          </button>
        </div>
      </div>
    </div>
  )
}
