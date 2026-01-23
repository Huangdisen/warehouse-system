'use client'

import { useRef, useState } from 'react'
import { findInspectionTemplate } from '@/lib/inspectionTemplates'

const DEFAULT_HEADERS = ['检验项目', '标准要求', '单位', '检验结果', '单项结论']

const normalizeTitle = (value) => {
  const trimmed = String(value || '').trim()
  return trimmed ? trimmed.replace(/\s+/g, '') : '检验报告'
}

const normalizeText = (value) => {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .toLowerCase()
}

const normalizeSpec = (value) => {
  return normalizeText(value).replace(/[×xX＊*]/g, 'x')
}

export default function InspectionReportPreview({ records, onClose }) {
  const reportNoCache = useRef(new Map())
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [showSelectedOnly, setShowSelectedOnly] = useState(false)
  const [singlePageMode, setSinglePageMode] = useState(false)
  const [singlePageIndex, setSinglePageIndex] = useState(0)
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

  const formatDateForReport = (value) => {
    if (!value) return new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const text = String(value).trim()
    const parts = text.split('-')
    if (parts.length === 3) {
      return `${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`
    }
    return new Date().toISOString().slice(0, 10).replace(/-/g, '')
  }

  const getReportNo = (pageId, productionDate) => {
    if (reportNoCache.current.has(pageId)) {
      return reportNoCache.current.get(pageId)
    }
    const datePart = formatDateForReport(productionDate)
    const randomPart = Math.floor(Math.random() * 9000 + 1000)
    const reportNo = `${datePart}${randomPart}`
    reportNoCache.current.set(pageId, reportNo)
    return reportNo
  }

  const renderHeaderRow = (label, value) => {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-900">{value || '-'}</span>
      </div>
    )
  }

  const togglePage = (pageId) => {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageId)) {
        next.delete(pageId)
      } else {
        next.add(pageId)
      }
      if (singlePageMode) {
        setSinglePageIndex(0)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedPages.size === pages.length) {
      setSelectedPages(new Set())
      setSinglePageIndex(0)
      return
    }
    setSelectedPages(new Set(pages.map((page) => page.id)))
    setSinglePageIndex(0)
  }

  const handleClearSelection = () => {
    setSelectedPages(new Set())
    setSinglePageIndex(0)
  }

  const selectedList = pages.filter((page) => selectedPages.has(page.id))
  const visiblePages = showSelectedOnly ? selectedList : pages
  const clampedIndex = Math.min(singlePageIndex, Math.max(selectedList.length - 1, 0))
  const singlePage = selectedList.length > 0 ? [selectedList[clampedIndex]] : []

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 no-print">
        <div className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-[1400px] h-[105vh] flex flex-col">
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
            {singlePageMode && (
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSinglePageIndex((prev) => Math.max(prev - 1, 0))}
                    className="px-2 py-1 border border-slate-200 rounded hover:border-slate-300"
                    disabled={clampedIndex === 0}
                  >
                    上一页
                  </button>
                  <span>
                    {selectedList.length === 0 ? '未选择页' : `${clampedIndex + 1} / ${selectedList.length}`}
                  </span>
                  <button
                    onClick={() => setSinglePageIndex((prev) => Math.min(prev + 1, selectedList.length - 1))}
                    className="px-2 py-1 border border-slate-200 rounded hover:border-slate-300"
                    disabled={clampedIndex >= selectedList.length - 1}
                  >
                    下一页
                  </button>
                </div>
                <button
                  onClick={() => setSinglePageMode(false)}
                  className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                >
                  退出单页
                </button>
              </div>
            )}
            <div className={`flex gap-6 ${singlePageMode ? 'items-start' : ''}`}>
              {!singlePageMode && (
                <div className="w-64 shrink-0 bg-white border border-slate-200 rounded-2xl p-4 h-fit">
                <div className="text-sm font-semibold text-slate-800 mb-3">选择页数</div>
                <div className="flex flex-wrap gap-2 mb-4">
                  <button
                    onClick={handleSelectAll}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  >
                    {selectedPages.size === pages.length ? '取消全选' : '全选'}
                  </button>
                  <button
                    onClick={handleClearSelection}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  >
                    清空
                  </button>
                  <button
                    onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  >
                    {showSelectedOnly ? '查看全部' : '仅预览选中'}
                  </button>
                  <button
                    onClick={() => setSinglePageMode(!singlePageMode)}
                    className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  >
                    {singlePageMode ? '退出单页' : '单页模式'}
                  </button>
                </div>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {pages.map((page, index) => (
                    <label key={page.id} className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={selectedPages.has(page.id)}
                        onChange={() => togglePage(page.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      />
                      <span>
                        第 {index + 1} 页
                        <span className="block text-xs text-slate-500">
                          {page.item.products?.name || '-'} {page.item.products?.spec || ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              )}

              <div className={`print-container space-y-6 flex-1 min-w-0 ${singlePageMode ? 'flex justify-center' : ''}`}>
                {singlePageMode && selectedList.length === 0 && (
                  <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
                    请先选择需要预览的页
                  </div>
                )}
                {(singlePageMode ? singlePage : visiblePages).map((page, index) => {
                const template = page.template
                const recordDate = page.record.production_date
                const headers = template?.table?.headers?.length ? template.table.headers : DEFAULT_HEADERS
                const rows = template?.table?.rows || []
                const normalizedName = normalizeText(page.item.products?.name)
                const normalizedSpec = normalizeSpec(page.item.products?.spec)
                const overrideNetContent =
                  normalizedName === '凉拌汁' && (normalizedSpec === '1.83lx6' || normalizedSpec === '1.83x6')
                const displayRows = overrideNetContent
                  ? rows.map((row) => {
                      if (normalizeText(row.item).includes('净含量')) {
                        return { ...row, standard: '≥1830', result: '1830' }
                      }
                      return row
                    })
                  : rows

                return (
                  <div
                    key={page.id}
                    className={`print-page bg-white rounded-2xl shadow-sm p-8 ${singlePageMode ? 'single-page-scale' : ''}`}
                  >
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
                      {renderHeaderRow(
                        template?.labels?.reportNo || '报告编号',
                        getReportNo(page.id, recordDate)
                      )}
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
                        {displayRows.length > 0 ? (
                          displayRows.map((row, idx) => (
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

                    <div className="mt-6 flex justify-between text-sm text-slate-700 relative">
                      <div>
                        <span className="mr-2">{template?.inspector?.label || '检验员:'}</span>
                        <span className="font-medium">{template?.inspector?.name || '-'}</span>
                      </div>
                      <div>
                        <span className="mr-2">{template?.reviewer?.label || '审核:'}</span>
                        <span className="font-medium">{template?.reviewer?.name || '-'}</span>
                      </div>
                      <img
                        src="/inspection-stamp.png"
                        alt="检验印章"
                        className="absolute right-4 -top-24 w-72 opacity-80"
                      />
                    </div>

                    <div className="mt-6 pt-3 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
                      <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
                      <div>
                        第 {index + 1} 页 / 共 {singlePageMode ? selectedList.length : visiblePages.length} 页
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
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

        .single-page-scale {
          transform: scale(0.9);
          transform-origin: top center;
        }

        @media (max-height: 900px) {
          .single-page-scale {
            transform: scale(0.82);
          }
        }
      `}</style>
    </>
  )
}
