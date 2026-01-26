'use client'

import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
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

// 微调数值函数：在原值基础上 ±0.01~0.02
const adjustValue = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return value

  // 随机 ±0.01 到 ±0.02
  const adjustment = (Math.random() * 0.01 + 0.01) * (Math.random() > 0.5 ? 1 : -1)
  const adjusted = num + adjustment

  // 保持原来的小数位数
  const decimalPlaces = (value.toString().split('.')[1] || '').length
  return adjusted.toFixed(decimalPlaces)
}

export default function SingleInspectionReport({ productName, productSpec, productionDate, onClose }) {
  const reportNoCache = useRef(null)
  const reportRef = useRef(null)
  const adjustedRowsCache = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  const template = findInspectionTemplate(productName, productSpec)

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = async () => {
    if (!reportRef.current || downloading) return

    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      })

      const link = document.createElement('a')
      link.download = `检验报告_${productName}_${productSpec}_${productionDate || '无日期'}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (error) {
      console.error('下载失败:', error)
      alert('下载失败，请重试')
    } finally {
      setDownloading(false)
    }
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

  const getReportNo = () => {
    if (reportNoCache.current) {
      return reportNoCache.current
    }
    const datePart = formatDateForReport(productionDate)
    const randomPart = Math.floor(Math.random() * 9000 + 1000)
    const reportNo = `${datePart}${randomPart}`
    reportNoCache.current = reportNo
    return reportNo
  }

  const renderHeaderRow = (label, value) => (
    <div className="flex items-center gap-2">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value || '-'}</span>
    </div>
  )

  const headers = template?.table?.headers?.length ? template.table.headers : DEFAULT_HEADERS
  const rows = template?.table?.rows || []
  const normalizedName = normalizeText(productName)
  const normalizedSpecVal = normalizeSpec(productSpec)
  const overrideNetContent =
    normalizedName === '凉拌汁' && (normalizedSpecVal === '1.83lx6' || normalizedSpecVal === '1.83x6')

  // 使用缓存确保同一份报告的微调值一致
  if (!adjustedRowsCache.current) {
    adjustedRowsCache.current = rows.map((row) => {
      const itemText = normalizeText(row.item)
      // 对食盐和氨基酸态氮进行微调
      if (itemText.includes('食盐') || itemText.includes('氨基酸态氮')) {
        return { ...row, result: adjustValue(row.result) }
      }
      return row
    })
  }

  const displayRows = overrideNetContent
    ? adjustedRowsCache.current.map((row) => {
        if (normalizeText(row.item).includes('净含量')) {
          return { ...row, standard: '>=1830', result: '1830' }
        }
        return row
      })
    : adjustedRowsCache.current

  const ReportContent = ({ forDownload = false }) => (
    <div
      ref={forDownload ? reportRef : null}
      className="print-page bg-white rounded-2xl shadow-sm p-8"
      style={forDownload ? { width: '800px' } : {}}
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
        {renderHeaderRow(template?.labels?.product || '产品名称', productName)}
        {renderHeaderRow(template?.labels?.spec || '规格型号', productSpec)}
        {renderHeaderRow(template?.labels?.productionDate || '生产日期', productionDate)}
        {renderHeaderRow(template?.labels?.inspectionDate || '检验日期', productionDate)}
        {renderHeaderRow(template?.labels?.reportNo || '报告编号', getReportNo())}
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
              <th key={`header-${idx}`} className="border border-slate-300 px-3 py-2 text-left font-medium">
                {header || DEFAULT_HEADERS[idx]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayRows.length > 0 ? (
            displayRows.map((row, idx) => (
              <tr key={`row-${idx}`}>
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
      </div>
    </div>
  )

  // 打印容器通过 Portal 渲染到 body
  const PrintPortal = () => {
    if (!mounted) return null
    return createPortal(
      <div id="single-inspection-print" className="hidden print:block fixed inset-0 bg-white z-[9999]">
        <ReportContent />
      </div>,
      document.body
    )
  }

  return (
    <>
      <PrintPortal />

      {/* 弹窗预览 */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 print:hidden">
        <div className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-[900px] max-h-[95vh] flex flex-col">
          <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-lg md:text-xl font-semibold text-slate-800">检验报告预览</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">
              关闭
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
            <ReportContent forDownload={true} />
          </div>

          <div className="p-4 md:p-6 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 border border-slate-300 rounded-xl hover:bg-slate-50 transition order-3 sm:order-1"
            >
              关闭
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition disabled:opacity-50 order-1 sm:order-2"
            >
              {downloading ? '生成中...' : '保存图片'}
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition order-2 sm:order-3 hidden sm:block"
            >
              打印
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          html, body {
            height: auto !important;
            overflow: visible !important;
          }
          body > *:not(#single-inspection-print) {
            display: none !important;
          }
          #single-inspection-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            height: auto !important;
          }
          #single-inspection-print .print-page {
            padding: 1.5cm;
            box-shadow: none !important;
            border-radius: 0;
            background: white !important;
          }
          table {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </>
  )
}
