'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const formatMoney = (n) => {
  if (n == null || n === 0) return '¥0.00'
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const getWarehouseLabel = (w) => {
  if (w === 'finished') return '成品'
  if (w === 'semi') return '半成品'
  if (w === 'label_semi') return '贴半成品'
  return w
}

export default function WagesPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [unmatchedSpecs, setUnmatchedSpecs] = useState([])
  const [rateList, setRateList] = useState([])
  const [showRateTable, setShowRateTable] = useState(false)

  useEffect(() => { fetchWages() }, [selectedMonth])

  const getMonthRange = () => {
    const [year, month] = selectedMonth.split('-')
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
    return {
      start: `${year}-${month}-01`,
      end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
    }
  }

  const fetchWages = async () => {
    setLoading(true)
    const { start, end } = getMonthRange()
    const [{ data: records }, { data: rates }] = await Promise.all([
      supabase
        .from('production_records')
        .select(`
          id, production_date,
          production_record_items (
            id, quantity, warehouse,
            products (id, name, spec)
          )
        `)
        .eq('status', 'confirmed')
        .gte('production_date', start)
        .lte('production_date', end)
        .order('production_date', { ascending: true }),
      supabase.from('piece_rates').select('*'),
    ])

    const rateMap = {}
    const sortedRates = (rates || []).slice().sort((a, b) => a.spec.localeCompare(b.spec))
    sortedRates.forEach((r) => { rateMap[r.spec] = r })
    setRateList(sortedRates)

    const result = []
    const unmatched = new Set()

    ;(records || []).forEach((record) => {
      const date = record.production_date || '-'
      ;(record.production_record_items || [])
        .filter((item) => item.warehouse !== 'label_semi_out')
        .forEach((item) => {
          const spec = item.products?.spec
          const rate = rateMap[spec]
          const isFinished = item.warehouse === 'finished'
          const unitPrice = rate
            ? (isFinished ? Number(rate.finished_price) : (rate.semi_price != null ? Number(rate.semi_price) : null))
            : null
          if (!rate) unmatched.add(spec)
          const amount = unitPrice != null ? item.quantity * unitPrice : null
          result.push({
            date,
            productName: item.products?.name || '-',
            spec: spec || '-',
            warehouse: item.warehouse,
            quantity: item.quantity || 0,
            unitPrice,
            amount,
          })
        })
    })

    setRows(result)
    setUnmatchedSpecs([...unmatched].filter(Boolean))
    setLoading(false)
  }

  const groupByDate = () => {
    const grouped = {}
    rows.forEach((row) => {
      if (!grouped[row.date]) grouped[row.date] = []
      grouped[row.date].push(row)
    })
    return grouped
  }

  const grouped = groupByDate()
  const sortedDates = Object.keys(grouped).sort()
  const totalAmount = rows.reduce((sum, r) => sum + (r.amount || 0), 0)
  const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0)

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

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) { alert('请允许弹出窗口以打印'); return }

    let tableRows = ''
    sortedDates.forEach((date) => {
      const dayRows = grouped[date]
      const dayAmount = dayRows.reduce((sum, r) => sum + (r.amount || 0), 0)
      const dayQty = dayRows.reduce((sum, r) => sum + r.quantity, 0)
      dayRows.forEach((row, idx) => {
        tableRows += `
          <tr>
            ${idx === 0 ? `<td rowspan="${dayRows.length}" class="date-cell">${date.slice(5)}</td>` : ''}
            <td>${row.productName}</td>
            <td>${row.spec}</td>
            <td>${getWarehouseLabel(row.warehouse)}</td>
            <td class="num">${row.quantity}</td>
            <td class="num">${row.unitPrice != null ? row.unitPrice.toFixed(2) : '—'}</td>
            <td class="num amt">${row.amount != null ? row.amount.toFixed(2) : '—'}</td>
            ${idx === 0 ? `<td rowspan="${dayRows.length}" class="num subtotal">${dayAmount.toFixed(2)}</td>` : ''}
            ${idx === 0 ? `<td rowspan="${dayRows.length}" class="remark-cell"></td>` : ''}
          </tr>`
      })
    })

    printWindow.document.write(`<!DOCTYPE html><html><head>
      <title>计件工资台账 - ${getMonthLabel()}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; }
        @page { size: A4 landscape; margin: 1cm 1.2cm; }
        .header { text-align: center; margin-bottom: 0.7rem; }
        .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 0.2rem; }
        .header p { font-size: 13px; color: #475569; }
        .stats { display: flex; gap: 4rem; justify-content: center; margin-bottom: 0.8rem; }
        .stat-item { text-align: center; }
        .stat-value { font-size: 16px; font-weight: 700; color: #0f172a; }
        .stat-label { color: #64748b; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        colgroup col.c-date   { width: 6%; }
        colgroup col.c-name   { width: 22%; }
        colgroup col.c-spec   { width: 10%; }
        colgroup col.c-type   { width: 8%; }
        colgroup col.c-qty    { width: 7%; }
        colgroup col.c-price  { width: 8%; }
        colgroup col.c-amt    { width: 11%; }
        colgroup col.c-sub    { width: 11%; }
        colgroup col.c-remark { width: 17%; }
        .remark-cell { background: #fff; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 7px; }
        th { background: #f1f5f9; font-weight: 600; }
        .num { text-align: right; }
        .date-cell { font-weight: 500; background: #f8fafc; text-align: center; vertical-align: middle; }
        .subtotal { background: #fef3c7; font-weight: 700; vertical-align: middle; }
        .amt { font-weight: 500; }
        .total-row { background: #1e293b; color: white; font-weight: 700; }
        .total-row td { border-color: #1e293b; }
        .footer { margin-top: 0.6rem; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
      </style>
    </head><body>
      <div class="header">
        <h1>计件工资台账</h1>
        <p>${getMonthLabel()} · 百越仓库管理系统</p>
      </div>
      <div class="stats">
        <div class="stat-item"><div class="stat-value">${formatMoney(totalAmount)}</div><div class="stat-label">月度工资合计</div></div>
        <div class="stat-item"><div class="stat-value">${totalQty.toLocaleString()}</div><div class="stat-label">总件数</div></div>
        <div class="stat-item"><div class="stat-value">${sortedDates.length}</div><div class="stat-label">生产天数</div></div>
      </div>
      <table>
        <colgroup>
          <col class="c-date"/><col class="c-name"/><col class="c-spec"/>
          <col class="c-type"/><col class="c-qty"/><col class="c-price"/>
          <col class="c-amt"/><col class="c-sub"/><col class="c-remark"/>
        </colgroup>
        <thead><tr>
          <th>日期</th><th>产品名称</th><th>规格</th><th>类型</th>
          <th class="num">数量</th><th class="num">单价</th>
          <th class="num">金额</th><th class="num">日小计</th><th>备注</th>
        </tr></thead>
        <tbody>
          ${tableRows}
          <tr class="total-row">
            <td colspan="4" style="text-align:right">月度合计</td>
            <td class="num">${totalQty.toLocaleString()}</td>
            <td></td>
            <td class="num">¥${totalAmount.toFixed(2)}</td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
      <div class="footer">
        <div>打印时间：${new Date().toLocaleString('zh-CN')}</div>
        <div>百越仓库管理系统</div>
      </div>
      <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
    </body></html>`)
    printWindow.document.close()
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">计件工资台账</h1>
          <p className="text-slate-500 text-sm mt-0.5">按生产确认入库自动计算计件工资</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input-field"
          >
            {getMonthOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={handlePrint}
            disabled={rows.length === 0}
            className="btn-primary disabled:opacity-50 whitespace-nowrap"
          >
            打印台账
          </button>
        </div>
      </div>

      {unmatchedSpecs.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 text-amber-700 text-sm">
          ⚠️ 以下规格未找到单价，对应记录金额显示「—」：{unmatchedSpecs.join('、')}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">月度工资合计</p>
          <p className="text-2xl font-bold text-blue-700">{formatMoney(totalAmount)}</p>
        </div>
        <div className="surface-card p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">总件数</p>
          <p className="text-2xl font-bold text-slate-800">{totalQty.toLocaleString()}</p>
        </div>
        <div className="surface-card p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">生产天数</p>
          <p className="text-2xl font-bold text-slate-700">{sortedDates.length}</p>
        </div>
      </div>

      {/* 计件单价表 */}
      <div className="surface-card mb-6">
        <button
          onClick={() => setShowRateTable((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-slate-700 hover:bg-slate-50 transition rounded-2xl"
        >
          <span>计件单价参考表（{rateList.length} 条规格）</span>
          <span className="text-slate-400 text-xs">{showRateTable ? '▲ 收起' : '▼ 展开'}</span>
        </button>
        {showRateTable && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {rateList.map((r) => (
                <div key={r.spec} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <span className="font-semibold text-slate-800 text-base">{r.spec}</span>
                  <div className="text-right leading-6">
                    <div className="text-emerald-700 font-semibold text-sm">成 ¥{Number(r.finished_price).toFixed(2)}</div>
                    {r.semi_price != null
                      ? <div className="text-sky-600 text-sm">半 ¥{Number(r.semi_price).toFixed(2)}</div>
                      : <div className="text-slate-300 text-sm">半 —</div>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="surface-card p-12 text-center text-slate-400">加载中...</div>
      ) : rows.length === 0 ? (
        <div className="surface-card p-12 text-center text-slate-400">{getMonthLabel()} 暂无确认入库记录</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600 w-24">日期</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">产品名称</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 w-28">规格</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600 w-24">类型</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 w-20">数量</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 w-20">单价</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 w-32">金额</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600 w-32">日小计</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDates.map((date) => {
                const dayRows = grouped[date]
                const dayAmount = dayRows.reduce((sum, r) => sum + (r.amount || 0), 0)
                return dayRows.map((row, idx) => (
                  <tr key={`${date}-${idx}`} className="hover:bg-slate-50">
                    {idx === 0 && (
                      <td rowSpan={dayRows.length} className="px-4 py-2 text-center font-medium text-slate-700 bg-slate-50 border-r border-slate-100 align-middle">
                        {date.slice(5)}
                      </td>
                    )}
                    <td className="px-4 py-2 text-slate-700">{row.productName}</td>
                    <td className="px-4 py-2 text-slate-500">{row.spec}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.warehouse === 'finished' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                      }`}>
                        {getWarehouseLabel(row.warehouse)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-700">{row.quantity}</td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {row.unitPrice != null ? `¥${row.unitPrice.toFixed(2)}` : <span className="text-amber-500">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-blue-700">
                      {row.amount != null ? formatMoney(row.amount) : <span className="text-amber-500">—</span>}
                    </td>
                    {idx === 0 && (
                      <td rowSpan={dayRows.length} className="px-4 py-2 text-right font-bold text-amber-700 bg-amber-50 border-l border-slate-100 align-middle">
                        {formatMoney(dayAmount)}
                      </td>
                    )}
                  </tr>
                ))
              })}
              <tr className="bg-slate-800 text-white font-bold">
                <td colSpan={4} className="px-4 py-3 text-right">月度合计</td>
                <td className="px-4 py-3 text-right">{totalQty.toLocaleString()}</td>
                <td></td>
                <td className="px-4 py-3 text-right">{formatMoney(totalAmount)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
