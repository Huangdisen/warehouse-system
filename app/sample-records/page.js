'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const toDateStr = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// 计算到期日期（月份加法）
const addMonths = (dateStr, months) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function SampleRecordsPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [year, month])

  const fetchData = async () => {
    setLoading(true)
    const start = toDateStr(year, month, 1)
    const end = toDateStr(year, month, daysInMonth(year, month))

    const { data } = await supabase
      .from('stock_records')
      .select(`
        id,
        stock_date,
        production_date,
        products (name, spec, warehouse)
      `)
      .eq('type', 'in')
      .eq('products.warehouse', 'finished')
      .gte('stock_date', start)
      .lte('stock_date', end)
      .order('stock_date', { ascending: true })
      .order('created_at', { ascending: true })

    // 按 (stock_date, product_id) 去重，每品一瓶
    const seen = new Set()
    const deduped = (data || []).filter(r => {
      if (!r.products) return false
      const key = `${r.stock_date}__${r.products.name}__${r.products.spec}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    setRecords(deduped)
    setLoading(false)
  }

  const handlePrint = () => {
    const rows = records.map((r, i) => {
      const sampleDate = r.stock_date || ''
      const expiryDate = addMonths(r.production_date || r.stock_date, 18)
      const keepUntil = addMonths(r.production_date || r.stock_date, 24)
      return `
        <tr>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">${i + 1}</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">${sampleDate}</td>
          <td style="border:1px solid #999;padding:5px 8px">${r.products?.name || ''}</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">${r.products?.spec || ''}</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">1瓶</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">${r.production_date || '-'}</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">${expiryDate}</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">${keepUntil}</td>
          <td style="border:1px solid #999;padding:5px 8px;text-align:center">黄</td>
          <td style="border:1px solid #999;padding:5px 8px"></td>
        </tr>
      `
    }).join('')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>留样记录表 ${year}年${month}月</title>
        <style>
          body { font-family: SimSun, 宋体, serif; font-size: 12px; margin: 20px; }
          h2 { text-align: center; font-size: 18px; margin: 0 0 4px }
          .subtitle { text-align: center; margin-bottom: 12px; font-size: 13px }
          table { border-collapse: collapse; width: 100%; }
          th { border: 1px solid #999; padding: 5px 8px; background: #f0f0f0; font-size: 12px; text-align: center; }
          td { font-size: 12px; }
          @media print { body { margin: 10px } }
        </style>
      </head>
      <body>
        <h2>博罗县园洲镇三乐食品厂留样记录表</h2>
        <div class="subtitle">${year}年 &nbsp; ${month}月</div>
        <table>
          <thead>
            <tr>
              <th style="width:36px">序号</th>
              <th style="width:90px">留样日期</th>
              <th>产品名称</th>
              <th style="width:80px">规格</th>
              <th style="width:60px">留样数量</th>
              <th style="width:90px">生产日期/批号</th>
              <th style="width:90px">保质期至</th>
              <th style="width:90px">保存期限至</th>
              <th style="width:50px">留样人</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="10" style="text-align:center;border:1px solid #999;padding:20px">本月暂无入库记录</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top:20px;font-size:12px">
          说明：保质期 18 个月，保存期限 24 个月。
        </div>
      </body>
      </html>
    `

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print() }, 300)
  }

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">留样记录</h1>
          <p className="text-slate-500">关联每日入库成品，保质期 18 个月，保存期限 24 个月，留样人：黄</p>
        </div>
        <button onClick={handlePrint} className="btn-primary self-start md:self-auto">
          打印本月
        </button>
      </div>

      {/* 月份切换 */}
      <div className="surface-card p-4 mb-6 flex items-center gap-4">
        <button onClick={prevMonth} className="btn-ghost px-3">‹</button>
        <span className="font-semibold text-slate-800 w-24 text-center">{year} 年 {month} 月</span>
        <button onClick={nextMonth} className="btn-ghost px-3">›</button>
        <span className="text-slate-400 text-sm ml-4">共 {records.length} 条留样</span>
      </div>

      {loading ? (
        <div className="surface-card p-12 text-center text-slate-500">加载中...</div>
      ) : records.length === 0 ? (
        <div className="surface-card p-12 text-center text-slate-500">本月暂无入库记录</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base table-comfy">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-center w-10">序号</th>
                  <th className="px-4 py-3 text-center">留样日期</th>
                  <th className="px-4 py-3">产品名称</th>
                  <th className="px-4 py-3 text-center">规格</th>
                  <th className="px-4 py-3 text-center">留样数量</th>
                  <th className="px-4 py-3 text-center">生产日期/批号</th>
                  <th className="px-4 py-3 text-center">保质期至</th>
                  <th className="px-4 py-3 text-center">保存期限至</th>
                  <th className="px-4 py-3 text-center">留样人</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {records.map((r, i) => {
                  const expiryDate = addMonths(r.production_date || r.stock_date, 18)
                  const keepUntil = addMonths(r.production_date || r.stock_date, 24)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-center text-slate-400 text-sm">{i + 1}</td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-slate-700">{r.stock_date}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.products?.name}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{r.products?.spec}</td>
                      <td className="px-4 py-3 text-center text-slate-600">1瓶</td>
                      <td className="px-4 py-3 text-center text-slate-500">{r.production_date || '-'}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{expiryDate}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{keepUntil}</td>
                      <td className="px-4 py-3 text-center text-slate-600">黄</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
