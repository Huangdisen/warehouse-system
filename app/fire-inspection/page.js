'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const FIRE_ITEMS = [
  '安全疏散通道、安全出口情况',
  '疏散指示标志、应急照明情况',
  '消防车道、消防水源情况',
  '灭火器材配置及有效情况',
  '用火用电有无违章情况',
  '是否落实每日巡查及即时排除火灾隐患情况',
  '室外消防栓、喷淋末端试水压力是否达到要求',
  '火灾自动报警系统测试是否正常',
  '防火门、防火卷帘、防排烟系统测试是否正常',
  '消防水泵手动自动测试是否正常',
  '火灾隐患的整改以及防范措施的落实',
]
const ITEM_KEYS = ['item1','item2','item3','item4','item5','item6','item7','item8','item9','item10','item11']

const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const toDateStr = (y, m, d) =>
  `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`

// ── 格子：null=空 true=✓ false=✗，整个 td 可点击 ──
function Cell({ value, onClick }) {
  const style =
    value === true  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
    value === false ? 'bg-red-50 text-red-500 hover:bg-red-100' :
                     'bg-white text-slate-300 hover:bg-slate-50'
  return (
    <td
      onClick={onClick}
      className={`border border-slate-100 text-center text-sm font-bold cursor-pointer select-none transition-colors ${style}`}
      style={{ minWidth: 32, height: 32 }}
    >
      {value === true ? '✓' : value === false ? '✗' : '·'}
    </td>
  )
}

export default function FireInspectionPage() {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth() + 1)
  const [inspector, setInspector] = useState('峰')
  const [dayData, setDayData] = useState({})       // dateStr → record
  const [prodDays, setProdDays] = useState(new Set())
  const [loading, setLoading]   = useState(true)
  const [autoFilling, setAutoFilling] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printYear, setPrintYear] = useState(new Date().getFullYear())
  const [printMonths, setPrintMonths] = useState(new Set([new Date().getMonth() + 1]))
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null))
  }, [])

  useEffect(() => { fetchData() }, [year, month])

  const fetchData = async () => {
    setLoading(true)
    const start = toDateStr(year, month, 1)
    const end   = toDateStr(year, month, daysInMonth(year, month))

    const [{ data: recs }, { data: stocks }] = await Promise.all([
      supabase.from('fire_inspections').select('*').gte('check_date', start).lte('check_date', end),
      supabase.from('stock_records').select('stock_date').eq('type', 'in').gte('stock_date', start).lte('stock_date', end),
    ])

    const map = {}
    for (const r of recs || []) map[r.check_date] = r

    const stockDays = new Set((stocks || []).map(r => r.stock_date))
    const allTrue = ITEM_KEYS.reduce((a, k) => ({ ...a, [k]: true }), {})
    const missingDays = [...stockDays].filter(d => !map[d])
    if (missingDays.length > 0) {
      const rows = missingDays.map(date => ({
        check_date: date, inspector: '峰', ...allTrue, auto_filled: true,
      }))
      await supabase.from('fire_inspections').upsert(rows, { onConflict: 'check_date' })
      for (const r of rows) map[r.check_date] = r
    }

    setDayData(map)
    setProdDays(stockDays)
    setLoading(false)
  }

  const cycle = v => (v === null || v === undefined) ? true : v === true ? false : null

  const toggleCell = async (date, key) => {
    const next = cycle(dayData[date]?.[key])
    const updated = { ...(dayData[date] || {}), check_date: date, [key]: next }
    setDayData(prev => ({ ...prev, [date]: updated }))
    await save(date, { [key]: next })
  }

  const save = async (date, patch) => {
    const base = dayData[date] || {}
    const record = {
      check_date: date,
      inspector: base.inspector || inspector || null,
      ...ITEM_KEYS.reduce((a, k) => ({ ...a, [k]: base[k] ?? null }), {}),
      abnormal_note: base.abnormal_note || null,
      auto_filled: base.auto_filled || false,
      created_by: currentUser?.id || null,
      ...patch,
    }
    delete record.id; delete record.created_at
    const { error } = await supabase.from('fire_inspections').upsert(record, { onConflict: 'check_date' })
    if (error) console.error(error)
  }

  const buildMonthHtml = (y, m, data, isLast) => {
    const total = daysInMonth(y, m)
    const days = Array.from({ length: total }, (_, i) => i + 1)
    const dayHeaders = days.map(d =>
      `<th style="width:26px;min-width:26px;text-align:center;font-size:12px;border:1px solid #999;padding:3px 1px">${d}</th>`
    ).join('')
    const bodyRows = FIRE_ITEMS.map((label, idx) => {
      const cells = days.map(d => {
        const ds = toDateStr(y, m, d)
        const v = data[ds]?.[ITEM_KEYS[idx]]
        const sym = v === true ? '✓' : v === false ? '✗' : ''
        const color = v === true ? '#16a34a' : v === false ? '#dc2626' : ''
        return `<td style="text-align:center;border:1px solid #999;font-size:14px;height:26px;color:${color}">${sym}</td>`
      }).join('')
      return `<tr><td style="border:1px solid #999;padding:3px 6px;font-size:12px;white-space:nowrap">${idx+1}. ${label}</td>${cells}</tr>`
    }).join('')
    const noteRow = days.map(d => {
      const ds = toDateStr(y, m, d)
      return `<td style="border:1px solid #999;font-size:12px;text-align:center;height:26px">${data[ds]?.abnormal_note || ''}</td>`
    }).join('')
    return `
      <div style="page-break-after:${isLast ? 'auto' : 'always'}">
        <h2 style="text-align:center;font-size:18px;margin:0 0 6px">博罗县园洲镇三乐食品厂每日防火巡查记录表</h2>
        <div style="text-align:center;margin-bottom:10px;font-size:14px">${y}年 &nbsp; ${m}月 &nbsp;&nbsp;&nbsp; 记录人：${inspector || '峰'}</div>
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr style="background:#f0f0f0">
              <th style="text-align:left;border:1px solid #999;padding:3px 6px;font-size:12px;min-width:200px">检查项目</th>
              ${dayHeaders}
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            <tr><td style="border:1px solid #999;padding:3px 6px;font-size:12px">异常记录</td>${noteRow}</tr>
          </tbody>
        </table>
        <div style="margin-top:16px;font-size:13px;display:flex;gap:60px">
          <span>巡查人签名：${inspector || '峰'}</span>
          <span>负责人签名：___________</span>
          <span>日期：${y}年${m}月</span>
        </div>
      </div>`
  }

  const handlePrint = useCallback(async () => {
    if (printMonths.size === 0) return alert('请至少选择一个月份')
    setPrinting(true)
    const sortedMonths = [...printMonths].sort((a, b) => a - b)
    const pages = []
    for (const m of sortedMonths) {
      const start = toDateStr(printYear, m, 1)
      const end   = toDateStr(printYear, m, daysInMonth(printYear, m))
      const { data } = await supabase.from('fire_inspections').select('*').gte('check_date', start).lte('check_date', end)
      const map = {}
      for (const r of data || []) map[r.check_date] = r
      pages.push(buildMonthHtml(printYear, m, map, m === sortedMonths[sortedMonths.length - 1]))
    }
    setPrinting(false)
    setShowPrintModal(false)

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>防火巡查记录 ${printYear}年</title>
      <style>
        @page { size: A3 landscape; margin: 12mm; }
        body { font-family: SimSun, '宋体', serif; }
      </style>
    </head><body>${pages.join('')}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
  }, [printYear, printMonths, inspector])

  const handleAutoFill = async () => {
    if (prodDays.size === 0) return alert('本月暂无入库记录')
    setAutoFilling(true)
    const allTrue = ITEM_KEYS.reduce((a, k) => ({ ...a, [k]: true }), {})
    const rows = []
    const newData = { ...dayData }

    for (const date of prodDays) {
      if (!dayData[date]) {
        const r = { check_date: date, inspector: inspector || null, ...allTrue, auto_filled: true, created_by: currentUser?.id || null }
        rows.push(r)
        newData[date] = r
      }
    }

    if (rows.length === 0) { alert('所有入库日期已有记录'); setAutoFilling(false); return }

    const { error } = await supabase.from('fire_inspections').upsert(rows, { onConflict: 'check_date' })
    if (error) alert('自动填入失败：' + error.message)
    else { setDayData(newData); alert(`已自动填入 ${rows.length} 天`) }
    setAutoFilling(false)
  }

  const totalDays = daysInMonth(year, month)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const filledCount = Object.keys(dayData).filter(d => parseInt(d.slice(8)) <= totalDays).length

  return (
    <DashboardLayout>
      {/* 页头 */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">每日防火巡查记录</h1>
          <p className="text-slate-500 text-sm mt-0.5">三乐食品厂每日防火巡查记录表</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={e => setYear(+e.target.value)} className="select-field w-24">
            {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(+e.target.value)} className="select-field w-20">
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
          <input
            type="text" value={inspector}
            onChange={e => setInspector(e.target.value)}
            placeholder="记录人" className="input-field w-28"
          />
          <button
            onClick={handleAutoFill} disabled={autoFilling}
            className="btn-primary whitespace-nowrap"
          >
            {autoFilling ? '填入中...' : `根据入库自动填入（${prodDays.size} 天）`}
          </button>
          <button onClick={() => setShowPrintModal(true)} className="btn-secondary whitespace-nowrap">打印</button>
        </div>
      </div>

      {/* 统计条 */}
      <div className="flex gap-6 mb-4 text-sm">
        <span className="text-slate-500">已填 <strong className="text-slate-800">{filledCount}</strong> 天</span>
        <span className="text-slate-500">入库日 <strong className="text-emerald-600">{prodDays.size}</strong> 天</span>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: 32 * totalDays + 220 + 'px' }}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-3 py-2 text-left text-slate-600 sticky left-0 bg-slate-50 z-10 w-52">检查项目</th>
                  {days.map(d => {
                    const ds = toDateStr(year, month, d)
                    const isProd = prodDays.has(ds)
                    return (
                      <th key={d} className={`border border-slate-200 w-8 text-center font-medium ${isProd ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
                        {d}
                        {isProd && <div className="w-1 h-1 rounded-full bg-emerald-500 mx-auto mt-0.5"/>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {FIRE_ITEMS.map((label, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40">
                    <td className="border border-slate-200 px-3 py-1.5 sticky left-0 bg-white z-10 text-slate-700 whitespace-nowrap" style={{ maxWidth: 208, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span title={label}>{idx + 1}. {label}</span>
                    </td>
                    {days.map(d => {
                      const ds = toDateStr(year, month, d)
                      return <Cell key={d} value={dayData[ds]?.[ITEM_KEYS[idx]]} onClick={() => toggleCell(ds, ITEM_KEYS[idx])} />
                    })}
                  </tr>
                ))}

                {/* 异常记录 */}
                <tr className="bg-amber-50/30">
                  <td className="border border-slate-200 px-3 py-1.5 sticky left-0 bg-amber-50/40 z-10 font-medium text-slate-700">异常记录</td>
                  {days.map(d => {
                    const ds = toDateStr(year, month, d)
                    return (
                      <td key={d} className="border border-slate-100 p-0">
                        <input
                          type="text"
                          value={dayData[ds]?.abnormal_note || ''}
                          onChange={e => setDayData(prev => ({ ...prev, [ds]: { ...(prev[ds]||{}), check_date: ds, abnormal_note: e.target.value } }))}
                          onBlur={e => save(ds, { abnormal_note: e.target.value || null })}
                          className="w-8 h-8 text-center text-xs border-none outline-none bg-transparent"
                          title={dayData[ds]?.abnormal_note || '点击输入异常情况'}
                        />
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
            点击格子切换：<span className="text-emerald-600 font-medium">✓ 正常</span> → <span className="text-red-500 font-medium">✗ 异常</span> → 空 · 绿色列 = 当日有生产入库
          </p>
        </div>
      )}
      {/* 打印选择弹窗 */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">选择打印月份</h3>

            {/* 年份 */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-slate-500 shrink-0">年份</span>
              <select
                value={printYear}
                onChange={e => setPrintYear(+e.target.value)}
                className="select-field flex-1"
              >
                {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}年</option>)}
              </select>
            </div>

            {/* 月份多选 */}
            <div className="grid grid-cols-4 gap-2 mb-5">
              {Array.from({length:12},(_,i)=>i+1).map(m => {
                const selected = printMonths.has(m)
                return (
                  <button
                    key={m}
                    onClick={() => setPrintMonths(prev => {
                      const next = new Set(prev)
                      next.has(m) ? next.delete(m) : next.add(m)
                      return next
                    })}
                    className={`py-1.5 rounded-lg text-sm font-medium transition border ${
                      selected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m}月
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowPrintModal(false)}
                className="flex-1 btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handlePrint}
                disabled={printing || printMonths.size === 0}
                className="flex-1 btn-primary"
              >
                {printing ? '生成中...' : `打印 ${printMonths.size} 个月`}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
