'use client'

import { findInspectionTemplate } from '@/lib/inspectionTemplates'

const DEFAULT_HEADERS = ['检验项目', '标准要求', '单位', '检验结果', '单项结论']

const normalizeTitle = (value) => {
  const trimmed = String(value || '').trim()
  return trimmed ? trimmed.replace(/\s+/g, '') : '检验报告'
}

export default function InspectionReportPreview({ records, onClose }) {
  const pages = []

  records.forEach((record) => {
    const items = (record.production_record_items || []).filter(
      (item) => item.warehouse !== 'label_semi_out'
    )

    items.forEach((item) => {
      const productName = item.products?.name || ''
      const productSpec = item.products?.spec || ''
      const template = findInspectionTemplate(productName, productSpec)

      pages.push({
        id: `${record.id}-${item.id}`,
        record,
        item,
        template,
      })
    })
  })

  const handlePrint = () => {
    window.print()
  }

  const renderHeaderRow = (label, value) => {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{value || '-'}</span>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 no-print">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800">检验报告预览 ({pages.length} 页)</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-sm"
            >
              关闭
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="print-container space-y-6">
              {pages.map((page, index) => {
                const template = page.template
                const recordDate = page.record.production_date
                const headers = template?.table?.headers?.length ? template.table.headers : DEFAULT_HEADERS
                const rows = template?.table?.rows || []

                return (
                  <div key={page.id} className="print-page bg-white rounded-2xl shadow-sm p-8">
                    <div className="text-center mb-6">
                      <div className="text-lg font-semibold text-slate-800">
                        {template?.company || '博罗县园洲镇三乐食品厂'}
                      </div>
                      <div className="text-2xl font-bold tracking-[0.3em] mt-1">
                        {normalizeTitle(template?.title)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                      {renderHeaderRow(template?.labels?.product || '产品名称', page.item.products?.name)}
                      {renderHeaderRow(template?.labels?.spec || '规格型号', page.item.products?.spec)}
                      {renderHeaderRow(template?.labels?.productionDate || '生产日期', recordDate)}
                      {renderHeaderRow(template?.labels?.inspectionDate || '检验日期', recordDate)}
                      {renderHeaderRow(template?.labels?.reportNo || '报告编号', template?.reportNo || '-')}
                    </div>

                    {!template && (
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                        未找到该产品的检验模板，请确认产品名称与规格是否匹配。
                      </div>
                    )}

                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          {headers.map((header, idx) => (
                            <th
                              key={`${page.id}-header-${idx}`}
                              className="border border-slate-300 px-3 py-2 text-left font-medium"
                            >
                              {header || DEFAULT_HEADERS[idx]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length > 0 ? (
                          rows.map((row, idx) => (
                            <tr key={`${page.id}-row-${idx}`}>
                              <td className="border border-slate-300 px-3 py-2">{row.item}</td>
                              <td className="border border-slate-300 px-3 py-2">{row.standard}</td>
                              <td className="border border-slate-300 px-3 py-2">{row.unit}</td>
                              <td className="border border-slate-300 px-3 py-2">{row.result}</td>
                              <td className="border border-slate-300 px-3 py-2">{row.conclusion}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                              未加载到检验项目
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    <div className="mt-6 flex justify-between text-sm text-slate-700">
                      <div>
                        <span className="mr-2">{template?.inspector?.label || '检验员:'}</span>
                        <span className="font-medium">{template?.inspector?.name || '-'}</span>
                      </div>
                      <div>
                        <span className="mr-2">{template?.reviewer?.label || '审核:'}</span>
                        <span className="font-medium">{template?.reviewer?.name || '-'}</span>
                      </div>
                    </div>

                    <div className="mt-6 pt-3 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
                      <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
                      <div>第 {index + 1} 页 / 共 {pages.length} 页</div>
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

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container,
          .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .print-page {
            page-break-after: always;
            margin: 0;
            padding: 1.5cm;
            box-shadow: none;
            border-radius: 0;
          }
          .print-page:last-child {
            page-break-after: auto;
          }
          .no-print {
            display: none !important;
          }
          table {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  )
}
