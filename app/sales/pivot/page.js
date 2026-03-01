'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const now = new Date()
const CURRENT_FISCAL_YEAR = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1
const FISCAL_YEARS = Array.from({ length: CURRENT_FISCAL_YEAR - 2020 }, (_, i) => 2021 + i).reverse()

function fiscalRange(year) {
  const lastDay = new Date(year + 1, 2, 0).getDate()
  return { start: `${year}-03-01`, end: `${year + 1}-02-${String(lastDay).padStart(2, '0')}` }
}

const TABS = [
  { key: 'product_month',    label: '产品 × 月份',   row: 'product_name', col: 'month',        hint: '每个产品每月出货量' },
  { key: 'province_quarter', label: '省份 × 季度',   row: 'province',     col: 'quarter',      hint: '各省份季度出货量' },
  { key: 'customer_product', label: '客户 × 产品',   row: 'customer',     col: 'product_name', hint: '每个客户各产品出货量' },
]

const fmt = (v) => (v == null || v === 0) ? '—' : Number(v).toLocaleString('zh-CN')

function PivotTable({ rowKeys, colKeys, dataMap }) {
  const rowTotal = (rk) => colKeys.reduce((s, ck) => s + (dataMap[rk]?.[ck] || 0), 0)
  const colTotal = (ck) => rowKeys.reduce((s, rk) => s + (dataMap[rk]?.[ck] || 0), 0)
  const grand = rowKeys.reduce((s, rk) => s + rowTotal(rk), 0)

  if (rowKeys.length === 0) return (
    <div className="p-12 text-center text-slate-400 text-sm">没有符合条件的数据</div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="text-left px-4 py-3 text-slate-500 font-medium sticky left-0 bg-slate-50 min-w-[140px] whitespace-nowrap" />
            {colKeys.map(ck => (
              <th key={ck} className="text-right px-4 py-3 text-slate-600 font-medium whitespace-nowrap min-w-[88px]">{ck}</th>
            ))}
            <th className="text-right px-4 py-3 text-slate-900 font-semibold whitespace-nowrap min-w-[88px] border-l border-slate-200 sticky right-0 bg-slate-50">合计</th>
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk, i) => (
            <tr key={rk} className={`border-b border-slate-100 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
              <td className={`px-4 py-2.5 font-medium text-slate-700 sticky left-0 whitespace-nowrap ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>{rk}</td>
              {colKeys.map(ck => (
                <td key={ck} className="text-right px-4 py-2.5 text-slate-600 tabular-nums">{fmt(dataMap[rk]?.[ck])}</td>
              ))}
              <td className="text-right px-4 py-2.5 font-semibold text-slate-900 border-l border-slate-200 tabular-nums sticky right-0 bg-white">{fmt(rowTotal(rk))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-100 border-t-2 border-slate-200">
            <td className="px-4 py-3 font-semibold text-slate-900 sticky left-0 bg-slate-100">合计</td>
            {colKeys.map(ck => (
              <td key={ck} className="text-right px-4 py-3 font-semibold text-slate-900 tabular-nums">{fmt(colTotal(ck))}</td>
            ))}
            <td className="text-right px-4 py-3 font-bold text-slate-900 border-l border-slate-200 tabular-nums sticky right-0 bg-slate-100">{fmt(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function PivotPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [year, setYear] = useState(CURRENT_FISCAL_YEAR)
  const [province, setProvince] = useState('')
  const [loading, setLoading] = useState(false)
  const [colKeys, setColKeys] = useState([])
  const [rowKeys, setRowKeys] = useState([])
  const [dataMap, setDataMap] = useState({})

  const tab = TABS[activeTab]

  const load = useCallback(async (tabIdx, yr, prov) => {
    const t = TABS[tabIdx]
    const { start, end } = fiscalRange(yr)
    setLoading(true)
    const { data, error } = await supabase.rpc('get_sales_pivot', {
      p_row_dim:      t.row,
      p_col_dim:      t.col,
      p_value:        'outbound',
      p_start_date:   start,
      p_end_date:     end,
      p_province:     prov || null,
      p_customer:     null,
      p_product_name: null,
    })
    setLoading(false)
    if (error) { alert('加载失败：' + error.message); return }
    const rows = data || []
    const colSet = new Set()
    const map = {}
    for (const r of rows) {
      colSet.add(r.col_key)
      if (!map[r.row_key]) map[r.row_key] = {}
      map[r.row_key][r.col_key] = Number(r.value)
    }
    setColKeys([...colSet].sort())
    setRowKeys(Object.keys(map).sort())
    setDataMap(map)
  }, [])

  useEffect(() => { load(activeTab, year, province) }, [])

  const handleTabChange = (i) => { setActiveTab(i); load(i, year, province) }
  const handleYearChange = (yr) => { setYear(yr); load(activeTab, yr, province) }
  const handleProvince = (e) => { setProvince(e.target.value) }
  const handleProvinceSearch = () => load(activeTab, year, province)

  const exportCsv = () => {
    const header = [tab.row === 'product_name' ? '产品' : tab.row === 'province' ? '省份' : '客户', ...colKeys, '合计'].join(',')
    const rowTotal = (rk) => colKeys.reduce((s, ck) => s + (dataMap[rk]?.[ck] || 0), 0)
    const colTotal = (ck) => rowKeys.reduce((s, rk) => s + (dataMap[rk]?.[ck] || 0), 0)
    const grand = rowKeys.reduce((s, rk) => s + rowTotal(rk), 0)
    const body = rowKeys.map(rk => [rk, ...colKeys.map(ck => dataMap[rk]?.[ck] || 0), rowTotal(rk)].join(','))
    const foot = ['合计', ...colKeys.map(ck => colTotal(ck)), grand].join(',')
    const csv = [header, ...body, foot].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${tab.label}_${year}年度.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout>
      {/* 页头 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">数据透视表</h1>
          <p className="text-slate-500 text-sm mt-0.5">{tab.hint}</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary">导出 CSV</button>
      </div>

      {/* Tab + 筛选 */}
      <div className="surface-card p-4 mb-6">
        {/* Tab */}
        <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
          {TABS.map((t, i) => (
            <button key={t.key} onClick={() => handleTabChange(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === i ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 年份 + 省份筛选 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {FISCAL_YEARS.map(y => (
              <button key={y} onClick={() => handleYearChange(y)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  year === y ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>
                {y}年度
              </button>
            ))}
          </div>
          {activeTab === 2 && (
            <div className="flex items-center gap-2 ml-2">
              <input type="text" value={province} onChange={handleProvince}
                placeholder="省份筛选" className="input-field w-28 text-sm" />
              <button onClick={handleProvinceSearch} className="btn-secondary text-sm px-3 py-1.5">筛选</button>
            </div>
          )}
        </div>
      </div>

      {/* 表格 */}
      <div className="surface-card">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">加载中…</div>
        ) : (
          <PivotTable rowKeys={rowKeys} colKeys={colKeys} dataMap={dataMap} />
        )}
      </div>
    </DashboardLayout>
  )
}
