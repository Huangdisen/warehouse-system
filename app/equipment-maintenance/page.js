'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const MAINT_ITEMS = [
  '设备是否清洁正常',
  '电气线路是否正常',
  '需润滑点是否加油',
  '设备运行是否正常',
]
const ITEM_KEYS = ['item1', 'item2', 'item3', 'item4']
const EQUIPMENT_LIST = ['燃烧机', '升降机', '胶体磨', '搅拌机']
const MAINTAINER_BY_EQUIPMENT = {
  '燃烧机': '平',
  '升降机': '平',
  '胶体磨': '广',
  '搅拌机': '广',
}

const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const toDateStr = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const buildEmptyEquipmentMap = () =>
  EQUIPMENT_LIST.reduce((acc, name) => ({ ...acc, [name]: {} }), {})
const buildEmptyNoteMap = () =>
  EQUIPMENT_LIST.reduce((acc, name) => ({ ...acc, [name]: '' }), {})
const isAllItemsEmpty = (record) => !record || ITEM_KEYS.every(key => record[key] === null || record[key] === undefined)
const getFirstMonthNote = (dataMap) => {
  const dates = Object.keys(dataMap).sort()
  const noteDate = dates.find(date => dataMap[date]?.abnormal_note)
  return noteDate ? dataMap[noteDate]?.abnormal_note || '' : ''
}
const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

function Cell({ value, onClick }) {
  const style =
    value === true ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' :
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
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [recordsByEquipment, setRecordsByEquipment] = useState(buildEmptyEquipmentMap)
  const [monthlyNotes, setMonthlyNotes] = useState(buildEmptyNoteMap)
  const [prodDays, setProdDays] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [autoFilling, setAutoFilling] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [printYear, setPrintYear] = useState(now.getFullYear())
  const [printMonths, setPrintMonths] = useState(new Set([now.getMonth() + 1]))
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null))
  }, [])

  const getMonthNoteDate = useCallback((dataMap, stockDates, targetYear, targetMonth) => {
    const existingDates = Object.keys(dataMap || {}).sort()
    if (existingDates.length > 0) return existingDates[0]

    const sortedStockDates = [...(stockDates || [])].sort()
    if (sortedStockDates.length > 0) return sortedStockDates[0]

    return toDateStr(targetYear, targetMonth, 1)
  }, [])

  const buildAutoFillRows = useCallback((recordsMap, stockDaysSet) => {
    const allTrue = ITEM_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {})
    const rows = []
    const nextRecords = buildEmptyEquipmentMap()
    const nextNotes = buildEmptyNoteMap()

    for (const equipmentName of EQUIPMENT_LIST) {
      const equipmentData = { ...(recordsMap[equipmentName] || {}) }

      for (const date of stockDaysSet) {
        const currentRecord = equipmentData[date]
        const shouldFillItems = isAllItemsEmpty(currentRecord)
        const shouldFillMaintainer = currentRecord?.maintainer !== MAINTAINER_BY_EQUIPMENT[equipmentName]
        if (!shouldFillItems && !shouldFillMaintainer) continue

        const row = {
          ...(currentRecord || {}),
          check_date: date,
          equipment_name: equipmentName,
          maintainer: MAINTAINER_BY_EQUIPMENT[equipmentName],
          ...(shouldFillItems ? allTrue : {}),
          auto_filled: true,
          created_by: currentRecord?.created_by || currentUser?.id || null,
        }
        equipmentData[date] = row
        rows.push(row)
      }

      nextRecords[equipmentName] = equipmentData
      nextNotes[equipmentName] = getFirstMonthNote(equipmentData)
    }

    return { rows, nextRecords, nextNotes }
  }, [currentUser])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const start = toDateStr(year, month, 1)
    const end = toDateStr(year, month, daysInMonth(year, month))

    const [{ data: recs }, { data: stocks }] = await Promise.all([
      supabase.from('equipment_maintenances').select('*')
        .gte('check_date', start).lte('check_date', end)
        .in('equipment_name', EQUIPMENT_LIST),
      supabase.from('stock_records').select('stock_date')
        .eq('type', 'in').gte('stock_date', start).lte('stock_date', end),
    ])

    const groupedRecords = buildEmptyEquipmentMap()
    for (const record of recs || []) {
      if (groupedRecords[record.equipment_name]) {
        groupedRecords[record.equipment_name][record.check_date] = record
      }
    }

    const stockDaysSet = new Set((stocks || []).map(record => record.stock_date))
    const { rows, nextRecords, nextNotes } = buildAutoFillRows(groupedRecords, stockDaysSet)

    if (rows.length > 0) {
      const { error } = await supabase.from('equipment_maintenances')
        .upsert(rows, { onConflict: 'check_date,equipment_name' })

      if (error) {
        console.error(error)
        setRecordsByEquipment(groupedRecords)
        setMonthlyNotes(EQUIPMENT_LIST.reduce((acc, equipmentName) => ({
          ...acc,
          [equipmentName]: getFirstMonthNote(groupedRecords[equipmentName]),
        }), {}))
      } else {
        setRecordsByEquipment(nextRecords)
        setMonthlyNotes(nextNotes)
      }
    } else {
      setRecordsByEquipment(groupedRecords)
      setMonthlyNotes(EQUIPMENT_LIST.reduce((acc, equipmentName) => ({
        ...acc,
        [equipmentName]: getFirstMonthNote(groupedRecords[equipmentName]),
      }), {}))
    }

    setProdDays(stockDaysSet)
    setLoading(false)
  }, [buildAutoFillRows, month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const cycle = value => (value === null || value === undefined) ? true : value === true ? false : null

  const save = async (equipmentName, date, patch) => {
    const equipmentData = recordsByEquipment[equipmentName] || {}
    const base = equipmentData[date] || {}
    const record = {
      check_date: date,
      equipment_name: equipmentName,
      equipment_no: base.equipment_no || null,
      responsible_person: base.responsible_person || null,
      maintainer: base.maintainer || MAINTAINER_BY_EQUIPMENT[equipmentName] || null,
      ...ITEM_KEYS.reduce((acc, key) => ({ ...acc, [key]: base[key] ?? null }), {}),
      abnormal_note: base.abnormal_note || null,
      auto_filled: base.auto_filled || false,
      created_by: base.created_by || currentUser?.id || null,
      ...patch,
    }
    delete record.id
    delete record.created_at

    const { error } = await supabase.from('equipment_maintenances')
      .upsert(record, { onConflict: 'check_date,equipment_name' })
    if (error) console.error(error)
  }

  const toggleCell = async (equipmentName, date, key) => {
    const next = cycle(recordsByEquipment[equipmentName]?.[date]?.[key])
    setRecordsByEquipment(prev => ({
      ...prev,
      [equipmentName]: {
        ...prev[equipmentName],
        [date]: {
          ...(prev[equipmentName]?.[date] || {}),
          check_date: date,
          equipment_name: equipmentName,
          [key]: next,
        },
      },
    }))
    await save(equipmentName, date, { [key]: next })
  }

  const saveMonthlyAbnormalNote = async (equipmentName, value) => {
    const equipmentData = recordsByEquipment[equipmentName] || {}
    const noteDate = getMonthNoteDate(equipmentData, prodDays, year, month)

    setMonthlyNotes(prev => ({ ...prev, [equipmentName]: value }))
    setRecordsByEquipment(prev => ({
      ...prev,
      [equipmentName]: {
        ...prev[equipmentName],
        [noteDate]: {
          ...(prev[equipmentName]?.[noteDate] || {}),
          check_date: noteDate,
          equipment_name: equipmentName,
          abnormal_note: value,
        },
      },
    }))

    await save(equipmentName, noteDate, { abnormal_note: value || null })
  }

  const handleAutoFill = async () => {
    if (prodDays.size === 0) return alert('本月暂无入库记录')

    setAutoFilling(true)
    const { rows, nextRecords, nextNotes } = buildAutoFillRows(recordsByEquipment, prodDays)

    if (rows.length === 0) {
      alert('所有设备的入库日期都已填写')
      setAutoFilling(false)
      return
    }

    const { error } = await supabase.from('equipment_maintenances')
      .upsert(rows, { onConflict: 'check_date,equipment_name' })
    if (error) {
      alert('自动填入失败：' + error.message)
    } else {
      setRecordsByEquipment(nextRecords)
      setMonthlyNotes(nextNotes)
      alert(`已自动填入 ${rows.length} 条记录`)
    }
    setAutoFilling(false)
  }

  const buildEquipmentTableHtml = (equipmentName, y, m, data, stockDaysSet) => {
    const total = daysInMonth(y, m)
    const days = Array.from({ length: total }, (_, i) => i + 1)
    const noteText = getFirstMonthNote(data)
    const dayHeaders = days.map(day => {
      const date = toDateStr(y, m, day)
      const isProd = stockDaysSet.has(date)
      return `<th style="width:24px;min-width:24px;text-align:center;font-size:11px;border:1px solid #999;padding:2px 1px;background:${isProd ? '#ecfdf5' : '#f8fafc'};color:${isProd ? '#047857' : '#64748b'}">${day}</th>`
    }).join('')
    const bodyRows = MAINT_ITEMS.map((label, index) => {
      const cells = days.map(day => {
        const date = toDateStr(y, m, day)
        const value = data[date]?.[ITEM_KEYS[index]]
        const symbol = value === true ? '✓' : value === false ? '✗' : ''
        const color = value === true ? '#16a34a' : value === false ? '#dc2626' : ''
        return `<td style="text-align:center;border:1px solid #999;font-size:13px;height:24px;color:${color}">${symbol}</td>`
      }).join('')
      return `<tr><td style="border:1px solid #999;padding:3px 6px;font-size:11px;white-space:nowrap">${index + 1}. ${escapeHtml(label)}</td>${cells}</tr>`
    }).join('')
    const maintainerRow = days.map(day => {
      const date = toDateStr(y, m, day)
      const maintainer = data[date]?.maintainer || (stockDaysSet.has(date) ? MAINTAINER_BY_EQUIPMENT[equipmentName] : '')
      return `<td style="border:1px solid #999;font-size:9px;text-align:center;height:24px">${escapeHtml(maintainer)}</td>`
    }).join('')

    return `
      <div style="margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;margin:0 0 4px">${escapeHtml(equipmentName)}</div>
        <table style="border-collapse:collapse;width:100%">
          <thead>
            <tr>
              <th style="text-align:left;border:1px solid #999;padding:3px 6px;font-size:11px;min-width:180px;background:#f8fafc">保养项目</th>
              ${dayHeaders}
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
            <tr>
              <td style="border:1px solid #999;padding:3px 6px;font-size:11px;background:#f8fafc">保养人</td>
              ${maintainerRow}
            </tr>
            <tr>
              <td style="border:1px solid #999;padding:3px 6px;font-size:11px;background:#fffbeb">异常记录</td>
              <td colspan="${days.length}" style="border:1px solid #999;padding:6px 8px;font-size:11px;height:30px;vertical-align:top">${escapeHtml(noteText)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `
  }

  const buildMonthHtml = (y, m, recordsMap, stockDaysSet, isLast) => {
    const sections = EQUIPMENT_LIST.map(equipmentName =>
      buildEquipmentTableHtml(equipmentName, y, m, recordsMap[equipmentName] || {}, stockDaysSet)
    ).join('')

    return `
      <div style="page-break-after:${isLast ? 'auto' : 'always'}">
        <h2 style="text-align:center;font-size:18px;margin:0 0 6px">设备日常维护保养记录表</h2>
        <div style="text-align:center;margin-bottom:10px;font-size:14px">${y}年 &nbsp; ${m}月</div>
        ${sections}
      </div>
    `
  }

  const handlePrint = async () => {
    if (printMonths.size === 0) return alert('请至少选择一个月份')

    setPrinting(true)
    const sortedMonths = [...printMonths].sort((a, b) => a - b)
    const pages = []

    for (const selectedMonth of sortedMonths) {
      const start = toDateStr(printYear, selectedMonth, 1)
      const end = toDateStr(printYear, selectedMonth, daysInMonth(printYear, selectedMonth))
      const [{ data: recs }, { data: stocks }] = await Promise.all([
        supabase.from('equipment_maintenances').select('*')
          .gte('check_date', start).lte('check_date', end)
          .in('equipment_name', EQUIPMENT_LIST),
        supabase.from('stock_records').select('stock_date')
          .eq('type', 'in').gte('stock_date', start).lte('stock_date', end),
      ])

      const groupedRecords = buildEmptyEquipmentMap()
      for (const record of recs || []) {
        if (groupedRecords[record.equipment_name]) {
          groupedRecords[record.equipment_name][record.check_date] = record
        }
      }
      const stockDaysSet = new Set((stocks || []).map(record => record.stock_date))
      pages.push(buildMonthHtml(printYear, selectedMonth, groupedRecords, stockDaysSet, selectedMonth === sortedMonths[sortedMonths.length - 1]))
    }

    setPrinting(false)
    setShowPrintModal(false)

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>设备保养记录 ${printYear}年</title>
      <style>
        @page { size: A3 landscape; margin: 10mm; }
        body { font-family: SimSun, '宋体', serif; }
      </style>
    </head><body>${pages.join('')}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`

    const printWindow = window.open('', '_blank')
    printWindow.document.write(html)
    printWindow.document.close()
  }

  const totalDays = daysInMonth(year, month)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const totalFilled = EQUIPMENT_LIST.reduce((sum, equipmentName) => {
    const equipmentData = recordsByEquipment[equipmentName] || {}
    return sum + Object.keys(equipmentData).filter(date => parseInt(date.slice(8), 10) <= totalDays).length
  }, 0)

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">设备日常维护保养记录</h1>
          <p className="mt-0.5 text-sm text-slate-500">4 台设备按入库日自动补全的月度保养记录表</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={year} onChange={e => setYear(+e.target.value)} className="select-field w-24">
            {[2023, 2024, 2025, 2026, 2027].map(value => <option key={value} value={value}>{value}年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(+e.target.value)} className="select-field w-20">
            {Array.from({ length: 12 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}月</option>)}
          </select>
          <button onClick={handleAutoFill} disabled={autoFilling} className="btn-primary whitespace-nowrap">
            {autoFilling ? '填入中...' : `根据入库自动填入（${prodDays.size} 天）`}
          </button>
          <button onClick={() => setShowPrintModal(true)} className="btn-secondary whitespace-nowrap">打印</button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-6 text-sm">
        <span className="text-slate-500">已填 <strong className="text-slate-800">{totalFilled}</strong> 条</span>
        <span className="text-slate-500">入库日 <strong className="text-emerald-600">{prodDays.size}</strong> 天</span>
        <span className="text-slate-500">设备 <strong className="text-slate-800">{EQUIPMENT_LIST.length}</strong> 台</span>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="space-y-5">
          {EQUIPMENT_LIST.map(equipmentName => {
            const equipmentData = recordsByEquipment[equipmentName] || {}
            const filledCount = Object.keys(equipmentData).filter(date => parseInt(date.slice(8), 10) <= totalDays).length

            return (
              <div key={equipmentName} className="surface-card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{equipmentName}</h2>
                    <p className="text-xs text-slate-500">已填 {filledCount} 条，保养人按设备自动带出</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse" style={{ minWidth: 32 * totalDays + 220 + 'px' }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="sticky left-0 z-10 w-52 border border-slate-200 bg-slate-50 px-3 py-2 text-left text-slate-600">保养项目</th>
                        {days.map(day => {
                          const date = toDateStr(year, month, day)
                          const isProd = prodDays.has(date)
                          return (
                            <th key={day} className={`w-8 border border-slate-200 text-center font-medium ${isProd ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
                              {day}
                              {isProd && <div className="mx-auto mt-0.5 h-1 w-1 rounded-full bg-emerald-500" />}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {MAINT_ITEMS.map((label, index) => (
                        <tr key={label} className="hover:bg-slate-50/40">
                          <td className="sticky left-0 z-10 max-w-[208px] overflow-hidden border border-slate-200 bg-white px-3 py-1.5 text-slate-700" style={{ textOverflow: 'ellipsis' }}>
                            <span title={label}>{index + 1}. {label}</span>
                          </td>
                          {days.map(day => {
                            const date = toDateStr(year, month, day)
                            return (
                              <Cell
                                key={day}
                                value={equipmentData[date]?.[ITEM_KEYS[index]]}
                                onClick={() => toggleCell(equipmentName, date, ITEM_KEYS[index])}
                              />
                            )
                          })}
                        </tr>
                      ))}

                      <tr className="bg-slate-50/50">
                        <td className="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700">保养人</td>
                        {days.map(day => {
                          const date = toDateStr(year, month, day)
                          return (
                            <td key={day} className="border border-slate-100 px-0 text-center text-[10px] text-slate-600">
                              {equipmentData[date]?.maintainer || (prodDays.has(date) ? MAINTAINER_BY_EQUIPMENT[equipmentName] : '')}
                            </td>
                          )
                        })}
                      </tr>

                      <tr className="bg-amber-50/30">
                        <td className="sticky left-0 z-10 border border-slate-200 bg-amber-50/40 px-3 py-1.5 font-medium text-slate-700">异常记录</td>
                        <td colSpan={days.length} className="border border-slate-200 p-0">
                          <textarea
                            value={monthlyNotes[equipmentName] || ''}
                            onChange={e => setMonthlyNotes(prev => ({ ...prev, [equipmentName]: e.target.value }))}
                            onBlur={e => saveMonthlyAbnormalNote(equipmentName, e.target.value)}
                            rows={2}
                            className="w-full resize-none border-none bg-transparent px-3 py-2 text-sm text-slate-700 outline-none"
                            placeholder="输入本月异常情况说明"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
                  点击格子切换：<span className="font-medium text-emerald-600">✓ 正常</span> → <span className="font-medium text-red-500">✗ 异常</span> → 空 · 绿色列 = 当日有生产入库
                </p>
              </div>
            )
          })}
        </div>
      )}

      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">选择打印月份</h3>

            <div className="mb-4 flex items-center gap-2">
              <span className="shrink-0 text-sm text-slate-500">年份</span>
              <select
                value={printYear}
                onChange={e => setPrintYear(+e.target.value)}
                className="select-field flex-1"
              >
                {[2023, 2024, 2025, 2026, 2027].map(value => <option key={value} value={value}>{value}年</option>)}
              </select>
            </div>

            <div className="mb-5 grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, index) => index + 1).map(value => {
                const selected = printMonths.has(value)
                return (
                  <button
                    key={value}
                    onClick={() => setPrintMonths(prev => {
                      const next = new Set(prev)
                      next.has(value) ? next.delete(value) : next.add(value)
                      return next
                    })}
                    className={`rounded-lg border py-1.5 text-sm font-medium transition ${
                      selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {value}月
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowPrintModal(false)} className="btn-secondary flex-1">取消</button>
              <button
                onClick={handlePrint}
                disabled={printing || printMonths.size === 0}
                className="btn-primary flex-1"
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
