'use client'

import { useRef } from 'react'

export default function ProductionPrintPreview({ records, onClose, onPrint }) {
  const printRef = useRef(null)

  const getWarehouseLabel = (warehouse) => {
    const labels = {
      'finished': '成品',
      'semi': '半成品',
      'label_semi': '贴半成品',
      'label_semi_out': '半成品出库',
    }
    return labels[warehouse] || warehouse
  }

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
        <title>生产记录单</title>
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
          .info-grid div span:last-child { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
          th, td { border: 1px solid #d1d5db; padding: 0.75rem 1rem; text-align: left; }
          th { background: #1e293b; color: white; }
          .total-row { background: #f1f5f9; font-weight: 700; }
          .total-row td:first-child { text-align: right; }
          .remark { margin-bottom: 1.5rem; }
          .remark-title { color: #475569; font-weight: 600; margin-bottom: 0.5rem; }
          .remark-content { border: 1px solid #cbd5e1; border-radius: 0.25rem; padding: 0.75rem; background: #f8fafc; }
          .reject { margin-top: 0.5rem; padding: 0.5rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.25rem; color: #dc2626; }
          .reject-title { font-weight: 500; }
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
        {records.map((record, index) => (
          <div key={record.id} className="print-page">
            <div className="header">
              <img src="/logo.png" alt="百越" />
              <h1>百越仓库管理系统</h1>
              <p>生产记录单</p>
            </div>

            <div className="info-grid">
              <div>
                <span>生产日期：</span>
                <span>{record.production_date}</span>
              </div>
              <div>
                <span>记录编号：</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{record.id.slice(0, 8)}</span>
              </div>
              <div>
                <span>提交人：</span>
                <span>{record.profiles?.name}</span>
              </div>
              <div>
                <span>提交时间：</span>
                <span>{new Date(record.created_at).toLocaleString('zh-CN')}</span>
              </div>
              {record.confirmed_profile && (
                <>
                  <div>
                    <span>确认人：</span>
                    <span>{record.confirmed_profile.name}</span>
                  </div>
                  <div>
                    <span>确认时间：</span>
                    <span>{new Date(record.confirmed_at).toLocaleString('zh-CN')}</span>
                  </div>
                </>
              )}
            </div>

            <table>
              <thead>
                <tr>
                  <th>序号</th>
                  <th>类型</th>
                  <th>产品名称</th>
                  <th>规格</th>
                  <th>奖项</th>
                  <th style={{ textAlign: 'right' }}>数量</th>
                </tr>
              </thead>
              <tbody>
                {record.production_record_items
                  ?.filter(item => item.warehouse !== 'label_semi_out')
                  .map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                      <td>{getWarehouseLabel(item.warehouse)}</td>
                      <td style={{ fontWeight: 500 }}>{item.products?.name}</td>
                      <td>{item.products?.spec}</td>
                      <td>{item.products?.prize_type || '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                    </tr>
                  ))}
                <tr className="total-row">
                  <td colSpan="5">合计：</td>
                  <td style={{ textAlign: 'right' }}>
                    {record.production_record_items
                      ?.filter(item => item.warehouse !== 'label_semi_out')
                      .reduce((sum, item) => sum + item.quantity, 0)}
                  </td>
                </tr>
              </tbody>
            </table>

            {record.remark && (
              <div className="remark">
                <div className="remark-title">备注：</div>
                <div className="remark-content">{record.remark}</div>
              </div>
            )}

            {record.reject_reason && (
              <div className="reject">
                <span className="reject-title">驳回原因：</span>{record.reject_reason}
              </div>
            )}

            <div className="footer">
              <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
              <div>第 {index + 1} 页 / 共 {records.length} 页</div>
            </div>
          </div>
        ))}
      </div>

      {/* 预览弹窗 */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800">打印预览 ({records.length} 条记录)</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
              关闭
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="space-y-6">
              {records.map((record, index) => (
                <div key={record.id} className="bg-white rounded-2xl shadow-sm p-8">
                  <div className="text-center mb-8 border-b-2 border-slate-300 pb-4">
                    <div className="flex justify-center mb-3">
                      <img src="/logo.png" alt="百越" className="w-16 h-16" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">百越仓库管理系统</h1>
                    <p className="text-lg text-slate-600">生产记录单</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div>
                      <span className="text-slate-600">生产日期：</span>
                      <span className="font-semibold">{record.production_date}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">记录编号：</span>
                      <span className="font-mono text-xs">{record.id.slice(0, 8)}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">提交人：</span>
                      <span className="font-semibold">{record.profiles?.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-600">提交时间：</span>
                      <span>{new Date(record.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                    {record.confirmed_profile && (
                      <>
                        <div>
                          <span className="text-slate-600">确认人：</span>
                          <span className="font-semibold">{record.confirmed_profile.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-600">确认时间：</span>
                          <span>{new Date(record.confirmed_at).toLocaleString('zh-CN')}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <table className="w-full border-collapse mb-6">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="border border-gray-300 px-4 py-3 text-left">序号</th>
                        <th className="border border-gray-300 px-4 py-3 text-left">类型</th>
                        <th className="border border-gray-300 px-4 py-3 text-left">产品名称</th>
                        <th className="border border-gray-300 px-4 py-3 text-left">规格</th>
                        <th className="border border-gray-300 px-4 py-3 text-left">奖项</th>
                        <th className="border border-gray-300 px-4 py-3 text-right">数量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.production_record_items
                        ?.filter(item => item.warehouse !== 'label_semi_out')
                        .map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="border border-gray-300 px-4 py-2 text-center">{idx + 1}</td>
                            <td className="border border-gray-300 px-4 py-2">
                              {getWarehouseLabel(item.warehouse)}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 font-medium">
                              {item.products?.name}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              {item.products?.spec}
                            </td>
                            <td className="border border-gray-300 px-4 py-2">
                              {item.products?.prize_type || '-'}
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                              {item.quantity}
                            </td>
                          </tr>
                        ))}
                      <tr className="bg-slate-100 font-bold">
                        <td colSpan="5" className="border border-gray-300 px-4 py-2 text-right">
                          合计：
                        </td>
                        <td className="border border-gray-300 px-4 py-2 text-right">
                          {record.production_record_items
                            ?.filter(item => item.warehouse !== 'label_semi_out')
                            .reduce((sum, item) => sum + item.quantity, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {record.remark && (
                    <div className="mb-6">
                      <div className="text-slate-600 font-semibold mb-2">备注：</div>
                      <div className="border border-slate-300 rounded p-3 bg-slate-50">
                        {record.remark}
                      </div>
                    </div>
                  )}

                  {record.reject_reason && (
                    <div className="mb-6">
                      <div className="text-rose-600 font-semibold mb-2">驳回原因：</div>
                      <div className="border border-rose-300 rounded p-3 bg-rose-50 text-rose-700">
                        {record.reject_reason}
                      </div>
                    </div>
                  )}

                  <div className="mt-8 pt-4 border-t border-slate-300 text-xs text-slate-500 flex justify-between">
                    <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
                    <div>第 {index + 1} 页 / 共 {records.length} 页</div>
                  </div>
                </div>
              ))}
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
              className="px-6 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition flex items-center space-x-2"
            >
              <span>打印</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
