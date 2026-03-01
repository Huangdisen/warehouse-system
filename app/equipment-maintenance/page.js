'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const MAINT_ITEMS = [
  '设备是否清洁正常',
  '电气线路是否正常',
  '需润滑点是否加油',
  '设备运行是否正常',
]
const ITEM_KEYS = ['item1','item2','item3','item4']

const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const toDateStr = (y, m, d) =>
  `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`

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

export default function EquipmentMaintenancePage() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [equipName, setEquipName]   = useState('生产设备')
  const [equipNo, setEquipNo]       = useState('')
  const [responsible, setResponsible] = useState('')
  const [dayData, setDayData]   = useState({})
  const [prodDays, setProdDays] = useState(new Set())
  const [loading, setLoading]   = useState(true)
  const [autoFilling, setAutoFilling] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null))
  }, [])

  useEffect(() => { fetchData() }, [year, month, equipName])

  const fetchData = async () => {
    setLoading(true)
    const start = toDateStr(year, month, 1)
    const end   = toDateStr(year, month, daysInMonth(year, month))

    const [{ data: recs }, { data: stocks }] = await Promise.all([
      supabase.from('equipment_maintenances').select('*')
        .gte('check_date', start).lte('check_date', end)
        .eq('equipment_name', equipName),
      supabase.from('stock_records').select('stock_date')
        .eq('type', 'in').gte('stock_date', start).lte('stock_date', end),
    ])

    const map = {}
    for (const r of recs || []) map[r.check_date] = r
    setDayData(map)
    setProdDays(new Set((stocks || []).map(r => r.stock_date)))
    setLoading(false)
  }

  const cycle = v => (v === null || v === undefined) ? true : v === true ? false : null

  const toggleCell = async (date, key) => {
    const next = cycle(dayData[date]?.[key])
    setDayData(prev => ({ ...prev, [date]: { ...(prev[date]||{}), check_date: date, [key]: next } }))
    await save(date, { [key]: next })
  }

  const save = async (date, patch) => {
    const base = dayData[date] || {}
    const record = {
      check_date: date,
      equipment_name: equipName,
      equipment_no: base.equipment_no || equipNo || null,
      responsible_person: base.responsible_person || responsible || null,
      maintainer: base.maintainer || null,
      ...ITEM_KEYS.reduce((a, k) => ({ ...a, [k]: base[k] ?? null }), {}),
      abnormal_note: base.abnormal_note || null,
      auto_filled: base.auto_filled || false,
      created_by: currentUser?.id || null,
      ...patch,
    }
    delete record.id; delete record.created_at
    const { error } = await supabase.from('equipment_maintenances')
      .upsert(record, { onConflict: 'check_date,equipment_name' })
    if (error) console.error(error)
  }

  const handleAutoFill = async () => {
    if (prodDays.size === 0) return alert('本月暂无入库记录')
    setAutoFilling(true)
    const allTrue = ITEM_KEYS.reduce((a, k) => ({ ...a, [k]: true }), {})
    const rows = []
    const newData = { ...dayData }

    for (const date of prodDays) {
      if (!dayData[date]) {
        const r = {
          check_date: date, equipment_name: equipName,
          equipment_no: equipNo || null, responsible_person: responsible || null,
          ...allTrue, auto_filled: true, created_by: currentUser?.id || null,
        }
        rows.push(r)
        newData[date] = r
      }
    }

    if (rows.length === 0) { alert('所有入库日期已有记录'); setAutoFilling(false); return }

    const { error } = await supabase.from('equipment_maintenances')
      .upsert(rows, { onConflict: 'check_date,equipment_name' })
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
          <h1 className="text-2xl font-semibold text-slate-900">设备日常维护保养记录</h1>
          <p className="text-slate-500 text-sm mt-0.5">设备日常维护保养记录表</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={e => setYear(+e.target.value)} className="select-field w-24">
            {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(+e.target.value)} className="select-field w-20">
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
          <button onClick={handleAutoFill} disabled={autoFilling} className="btn-primary whitespace-nowrap">
            {autoFilling ? '填入中...' : `根据入库自动填入（${prodDays.size} 天）`}
          </button>
        </div>
      </div>

      {/* 设备信息 */}
      <div className="surface-card p-4 mb-4 flex flex-wrap gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">设备名称</label>
          <input type="text" value={equipName} onChange={e => setEquipName(e.target.value)} className="input-field w-36" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">设备编号</label>
          <input type="text" value={equipNo} onChange={e => setEquipNo(e.target.value)} placeholder="选填" className="input-field w-28" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">设备负责人</label>
          <input type="text" value={responsible} onChange={e => setResponsible(e.target.value)} placeholder="选填" className="input-field w-28" />
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
            <table className="text-xs border-collapse" style={{ minWidth: 32 * totalDays + 180 + 'px' }}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-3 py-2 text-left text-slate-600 sticky left-0 bg-slate-50 z-10 w-44">保养项目</th>
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
                {MAINT_ITEMS.map((label, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40">
                    <td className="border border-slate-200 px-3 py-1.5 sticky left-0 bg-white z-10 text-slate-700 whitespace-nowrap">
                      {idx + 1}. {label}
                    </td>
                    {days.map(d => {
                      const ds = toDateStr(year, month, d)
                      return <Cell key={d} value={dayData[ds]?.[ITEM_KEYS[idx]]} onClick={() => toggleCell(ds, ITEM_KEYS[idx])} />
                    })}
                  </tr>
                ))}

                {/* 保养人 */}
                <tr className="bg-slate-50/50">
                  <td className="border border-slate-200 px-3 py-1.5 sticky left-0 bg-slate-50 z-10 font-medium text-slate-700">保养人</td>
                  {days.map(d => {
                    const ds = toDateStr(year, month, d)
                    return (
                      <td key={d} className="border border-slate-100 p-0">
                        <input
                          type="text"
                          value={dayData[ds]?.maintainer || ''}
                          onChange={e => setDayData(prev => ({ ...prev, [ds]: { ...(prev[ds]||{}), check_date: ds, maintainer: e.target.value } }))}
                          onBlur={e => save(ds, { maintainer: e.target.value || null })}
                          className="w-8 h-8 text-center text-xs border-none outline-none bg-transparent"
                          title={dayData[ds]?.maintainer || '点击输入保养人'}
                        />
                      </td>
                    )
                  })}
                </tr>

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
    </DashboardLayout>
  )
}
