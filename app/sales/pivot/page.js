'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const ROW_OPTIONS = [
  { value: 'product_name', label: '产品名称' },
  { value: 'province',     label: '省份' },
  { value: 'customer',     label: '客户' },
  { value: 'area',         label: '地区' },
]
const COL_OPTIONS = [
  { value: 'month',   label: '月份' },
  { value: 'quarter', label: '季度' },
  { value: 'year',    label: '年份' },
]
const VAL_OPTIONS = [
  { value: 'outbound',    label: '出货量（件）' },
  { value: 'inbound',     label: '进货量（件）' },
  { value: 'total_price', label: '销售金额（元）' },
]

const fmt = (v, isPrice) => {
  if (v == null || v === 0) return '—'
  return isPrice
    ? '¥' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : Number(v).toLocaleString('zh-CN')
}

export default function PivotPage() {
  const [rowDim,  setRowDim]  = useState('product_name')
  const [colDim,  setColDim]  = useState('month')
  const [valDim,  setValDim]  = useState('outbound')
  const [startDate, setStartDate] = useState('')
  const [endDate,   setEndDate]   = useState('')
  const [province,  setProvince]  = useState('')
  const [customer,  setCustomer]  = useState('')
  const [productName, setProductName] = useState('')

  const [loading,  setLoading]  = useState(false)
  const [colKeys,  setColKeys]  = useState([])
  const [rowMap,   setRowMap]   = useState({})   // { rowKey: { colKey: value } }
  const [rowKeys,  setRowKeys]  = useState([])
  const [generated, setGenerated] = useState(false)

  const isPrice = valDim === 'total_price'

  const generate = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_sales_pivot', {
      p_row_dim:      rowDim,
      p_col_dim:      colDim,
      p_value:        valDim,
      p_start_date:   startDate || null,
      p_end_date:     endDate   || null,
      p_province:     province  || null,
      p_customer:     customer  || null,
      p_product_name: productName || null,
    })
    setLoading(false)
    if (error) { alert('查询失败：' + error.message); return }

    const rows = data || []
    const colSet = new Set()
    const map = {}
    for (const r of rows) {
      colSet.add(r.col_key)
      if (!map[r.row_key]) map[r.row_key] = {}
      map[r.row_key][r.col_key] = Number(r.value)
    }
    const sortedCols = [...colSet].sort()
    const sortedRows = Object.keys(map).sort()
    setColKeys(sortedCols)
    setRowMap(map)
    setRowKeys(sortedRows)
    setGenerated(true)
  }

  const rowTotal = (rowKey) =>
    colKeys.reduce((s, c) => s + (rowMap[rowKey]?.[c] || 0), 0)

  const colTotal = (colKey) =>
    rowKeys.reduce((s, r) => s + (rowMap[r]?.[colKey] || 0), 0)

  const grandTotal = rowKeys.reduce((s, r) => s + rowTotal(r), 0)

  const exportCsv = () => {
    const colLabel = COL_OPTIONS.find(o => o.value === colDim)?.label || colDim
    const rowLabel = ROW_OPTIONS.find(o => o.value === rowDim)?.label || rowDim
    const valLabel = VAL_OPTIONS.find(o => o.value === valDim)?.label || valDim
    const header = [rowLabel, ...colKeys, '合计'].join(',')
    const bodyRows = rowKeys.map(rk =>
      [rk, ...colKeys.map(ck => rowMap[rk]?.[ck] || 0), rowTotal(rk)].join(',')
    )
    const totalRow = ['合计', ...colKeys.map(ck => colTotal(ck)), grandTotal].join(',')
    const csv = [header, ...bodyRows, totalRow].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `数据透视表_${rowLabel}x${colLabel}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">数据透视表</h1>
          <p className="text-slate-500 text-sm mt-0.5">自由组合行列维度，分析销售数据</p>
        </div>
        {generated && (
          <button onClick={exportCsv} className="btn-secondary">导出 CSV</button>
        )}
      </div>

      {/* 维度选择 */}
      <div className="surface-card p-4 mb-6">
        <div className="flex flex-wrap gap-6 mb-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">行维度</label>
            <div className="flex gap-2">
              {ROW_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setRowDim(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                    rowDim === o.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">列维度</label>
            <div className="flex gap-2">
              {COL_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setColDim(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                    colDim === o.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">统计值</label>
            <div className="flex gap-2">
              {VAL_OPTIONS.map(o => (
                <button key={o.value} onClick={() => setValDim(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
                    valDim === o.value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 筛选条件 */}
        <div className="flex flex-wrap gap-3 items-end border-t border-slate-100 pt-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field w-36" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field w-36" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">省份</label>
            <input type="text" value={province} onChange={e => setProvince(e.target.value)} placeholder="全部" className="input-field w-28" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">客户</label>
            <input type="text" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="全部" className="input-field w-32" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">产品名称</label>
            <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="全部" className="input-field w-32" />
          </div>
          <button onClick={generate} disabled={loading}
            className="btn-primary px-6">
            {loading ? '生成中…' : '生成'}
          </button>
        </div>
      </div>

      {/* 透视表 */}
      {generated && (
        rowKeys.length === 0 ? (
          <div className="surface-card p-8 text-center text-slate-400 text-sm">没有符合条件的数据</div>
        ) : (
          <div className="surface-card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-4 py-3 text-slate-600 font-medium border-b border-slate-200 sticky left-0 bg-slate-50 min-w-[140px]">
                    {ROW_OPTIONS.find(o => o.value === rowDim)?.label}
                  </th>
                  {colKeys.map(ck => (
                    <th key={ck} className="text-right px-4 py-3 text-slate-600 font-medium border-b border-slate-200 whitespace-nowrap min-w-[90px]">
                      {ck}
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-slate-900 font-semibold border-b border-slate-200 border-l border-slate-200 whitespace-nowrap min-w-[90px] sticky right-0 bg-slate-50">
                    合计
                  </th>
                </tr>
              </thead>
              <tbody>
                {rowKeys.map((rk, i) => (
                  <tr key={rk} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className={`px-4 py-2.5 text-slate-700 font-medium border-b border-slate-100 sticky left-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      {rk}
                    </td>
                    {colKeys.map(ck => (
                      <td key={ck} className="text-right px-4 py-2.5 text-slate-600 border-b border-slate-100 tabular-nums">
                        {fmt(rowMap[rk]?.[ck], isPrice)}
                      </td>
                    ))}
                    <td className="text-right px-4 py-2.5 font-semibold text-slate-900 border-b border-slate-100 border-l border-slate-200 tabular-nums sticky right-0 bg-white">
                      {fmt(rowTotal(rk), isPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-slate-100">合计</td>
                  {colKeys.map(ck => (
                    <td key={ck} className="text-right px-4 py-3 font-semibold text-slate-900 tabular-nums">
                      {fmt(colTotal(ck), isPrice)}
                    </td>
                  ))}
                  <td className="text-right px-4 py-3 font-bold text-slate-900 border-l border-slate-200 tabular-nums sticky right-0 bg-slate-100">
                    {fmt(grandTotal, isPrice)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </DashboardLayout>
  )
}
