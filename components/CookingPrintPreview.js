'use client'

import { useRef } from 'react'

export default function CookingPrintPreview({ records, onClose }) {
  const printRef = useRef(null)

  // 按日期分组
  const groupedByDate = records.reduce((acc, record) => {
    const date = record.cooking_date
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(record)
    return acc
  }, {})

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a))

  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      alert('请允许弹出窗口以打印')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>煮制记录单</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; background: white; }
          .print-page { padding: 1.5cm; background: white; page-break-after: always; }
          .print-page:last-child { page-break-after: auto; }
          .header { text-align: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 2px solid #cbd5e1; }
          .header img { width: 4rem; height: 4rem; margin-bottom: 0.75rem; }
          .header h1 { font-size: 1.875rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem; }
          .header p { font-size: 1.125rem; color: #475569; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; font-size: 0.875rem; }
          .info-grid div span:first-child { color: #475569; }
          .info-grid div span.value { font-weight: 600; font-size: 1.125rem; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
          th, td { border: 1px solid #d1d5db; padding: 0.5rem 1rem; text-align: left; }
          th { background: #1e293b; color: white; }
          .total-row { background: #f1f5f9; font-weight: 700; }
          .total-row td:nth-child(1), .total-row td:nth-child(2) { text-align: right; }
          .amber { color: #d97706; }
          .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #cbd5e1; font-size: 0.75rem; color: #64748b; display: flex; justify-content: space-between; }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
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
    <>
      {/* 隐藏的打印内容 */}
      <div ref={printRef} style={{ display: 'none' }}>
        {sortedDates.map((date, dateIndex) => {
          const dayRecords = groupedByDate[date]
          const totalPots = dayRecords.reduce((sum, r) => sum + r.pot_count, 0)
          const totalWeight = dayRecords.reduce((sum, r) => sum + (r.weight_kg || 0), 0)

          return (
            <div key={date} className="print-page">
              <div className="header">
                <img src="/logo.png" alt="百越" />
                <h1>百越仓库管理系统</h1>
                <p>煮制记录单</p>
              </div>

              <div className="info-grid">
                <div>
                  <span>煮制日期：</span>
                  <span className="value">{date}</span>
                </div>
                <div>
                  <span>记录数量：</span>
                  <span className="value">{dayRecords.length} 条</span>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>产品名称</th>
                    <th style={{ textAlign: 'right' }}>锅数</th>
                    <th style={{ textAlign: 'right' }}>重量(kg)</th>
                    <th>操作员</th>
                    <th>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRecords.map((record, idx) => (
                    <tr key={record.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500 }}>{record.product_name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{record.pot_count}</td>
                      <td style={{ textAlign: 'right' }}>{record.weight_kg || '-'}</td>
                      <td>{record.profiles?.name || '-'}</td>
                      <td style={{ color: '#475569' }}>{record.remark || '-'}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan="2">合计：</td>
                    <td style={{ textAlign: 'right' }} className="amber">{totalPots} 锅</td>
                    <td style={{ textAlign: 'right' }}>{totalWeight > 0 ? `${totalWeight.toFixed(2)} kg` : '-'}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tbody>
              </table>

              <div className="footer">
                <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
                <div>第 {dateIndex + 1} 页 / 共 {sortedDates.length} 页</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 预览弹窗 */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800">
              打印预览 ({records.length} 条记录)
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
              关闭
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="space-y-6">
              {sortedDates.map((date, dateIndex) => {
                const dayRecords = groupedByDate[date]
                const totalPots = dayRecords.reduce((sum, r) => sum + r.pot_count, 0)
                const totalWeight = dayRecords.reduce((sum, r) => sum + (r.weight_kg || 0), 0)

                return (
                  <div key={date} className="bg-white rounded-2xl shadow-sm p-8">
                    <div className="text-center mb-8 border-b-2 border-slate-300 pb-4">
                      <div className="flex justify-center mb-3">
                        <img src="/logo.png" alt="百越" className="w-16 h-16" />
                      </div>
                      <h1 className="text-3xl font-bold text-slate-800 mb-2">百越仓库管理系统</h1>
                      <p className="text-lg text-slate-600">煮制记录单</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                      <div>
                        <span className="text-slate-600">煮制日期：</span>
                        <span className="font-semibold text-lg">{date}</span>
                      </div>
                      <div>
                        <span className="text-slate-600">记录数量：</span>
                        <span className="font-semibold">{dayRecords.length} 条</span>
                      </div>
                    </div>

                    <table className="w-full border-collapse mb-6">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="border border-gray-300 px-4 py-3 text-left">序号</th>
                          <th className="border border-gray-300 px-4 py-3 text-left">产品名称</th>
                          <th className="border border-gray-300 px-4 py-3 text-right">锅数</th>
                          <th className="border border-gray-300 px-4 py-3 text-right">重量(kg)</th>
                          <th className="border border-gray-300 px-4 py-3 text-left">操作员</th>
                          <th className="border border-gray-300 px-4 py-3 text-left">备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayRecords.map((record, idx) => (
                          <tr key={record.id} className="hover:bg-slate-50">
                            <td className="border border-gray-300 px-4 py-2 text-center">
                              {idx + 1}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 font-medium">
                              {record.product_name}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                              {record.pot_count}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right">
                              {record.weight_kg || '-'}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              {record.profiles?.name || '-'}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-slate-600">
                              {record.remark || '-'}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-bold">
                          <td colSpan="2" className="border border-gray-300 px-4 py-2 text-right">
                            合计：
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-right text-amber-600">
                            {totalPots} 锅
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-right">
                            {totalWeight > 0 ? `${totalWeight.toFixed(2)} kg` : '-'}
                          </td>
                          <td colSpan="2" className="border border-gray-300 px-4 py-2"></td>
                        </tr>
                      </tbody>
                    </table>

                    <div className="mt-8 pt-4 border-t border-slate-300 text-xs text-slate-500 flex justify-between">
                      <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
                      <div>第 {dateIndex + 1} 页 / 共 {sortedDates.length} 页</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 text-slate-600 hover:text-slate-800 border border-slate-300 rounded-xl hover:bg-slate-50 transition"
            >
              取消
            </button>
            <button
              onClick={handlePrint}
              className="px-6 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition"
            >
              打印
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
