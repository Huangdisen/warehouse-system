'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import ProductionPrintPreview from '@/components/ProductionPrintPreview'

export default function ConfirmProductionPage() {
  const [pendingRecords, setPendingRecords] = useState([])
  const [historyRecords, setHistoryRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState(null)
  const [rejectModal, setRejectModal] = useState({ show: false, recordId: null, reason: '' })
  const [confirmModal, setConfirmModal] = useState({ show: false, record: null })
  // 批量打印相关状态
  const [selectedRecords, setSelectedRecords] = useState(new Set())
  const [showPrintPreview, setShowPrintPreview] = useState(false)

  useEffect(() => {
    fetchRecords()
  }, [])

  const fetchRecords = async () => {
    setLoading(true)

    // 获取待确认记录
    const { data: pending } = await supabase
      .from('production_records')
      .select(`
        *,
        profiles!production_records_submitted_by_fkey (name),
        production_record_items (
          id,
          product_id,
          quantity,
          warehouse,
          products (id, name, spec, prize_type)
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    // 获取已处理记录
    const { data: history } = await supabase
      .from('production_records')
      .select(`
        *,
        profiles!production_records_submitted_by_fkey (name),
        confirmed_profile:profiles!production_records_confirmed_by_fkey (name),
        production_record_items (
          id,
          quantity,
          warehouse,
          products (id, name, spec, prize_type)
        )
      `)
      .neq('status', 'pending')
      .order('confirmed_at', { ascending: false })
      .limit(50)

    setPendingRecords(pending || [])
    setHistoryRecords(history || [])
    setLoading(false)
  }

  const openConfirmModal = (record) => {
    setConfirmModal({ show: true, record })
  }

  const handleConfirm = async () => {
    const record = confirmModal.record
    if (!record) return

    setConfirmModal({ show: false, record: null })
    setProcessingId(record.id)

    const { data: { user } } = await supabase.auth.getUser()

    const allItems = record.production_record_items || []

    // 为每个产品创建库存记录
    // 先找到所有的贴半成品配对，用于生成详细备注
    const labelSemiPairs = new Map()

    // 收集 label_semi 和 label_semi_out 进行配对
    const labelSemiItems = allItems.filter(i => i.warehouse === 'label_semi')
    const outItems = allItems.filter(i => i.warehouse === 'label_semi_out')

    // 按顺序配对（同样数量的一起配对）
    const processedOutItems = new Set()
    for (const labelSemiItem of labelSemiItems) {
      const matchingOut = outItems.find(
        out => out.quantity === labelSemiItem.quantity && !processedOutItems.has(out)
      )
      if (matchingOut) {
        labelSemiPairs.set(matchingOut, labelSemiItem)
        labelSemiPairs.set(labelSemiItem, matchingOut)
        processedOutItems.add(matchingOut)
      }
    }

    // 为每个 item 创建库存记录
    for (const item of allItems) {
      const productId = item.product_id || item.products?.id
      if (!productId) {
        alert('入库失败：缺少产品信息')
        setProcessingId(null)
        return
      }

      // label_semi_out 类型创建出库记录（半成品出库）
      // 其他类型创建入库记录
      const isOutRecord = item.warehouse === 'label_semi_out'
      const recordType = isOutRecord ? 'out' : 'in'

      let remark = ''
      if (item.warehouse === 'label_semi_out') {
        // 半成品出库，显示目标成品
        const targetItem = labelSemiPairs.get(item)
        const targetName = targetItem?.products?.name || '成品'
        const targetSpec = targetItem?.products?.spec || ''
        remark = `贴半成品 - ${item.products?.name} ${item.products?.spec || ''} 出库转为 ${targetName} ${targetSpec}`.trim()
      } else if (item.warehouse === 'label_semi') {
        // 成品入库，显示来源半成品
        const sourceItem = labelSemiPairs.get(item)
        const sourceName = sourceItem?.products?.name || '半成品'
        const sourceSpec = sourceItem?.products?.spec || ''
        remark = `贴半成品 - 由 ${sourceName} ${sourceSpec} 加工入库`.trim()
      } else {
        remark = '生产入库 - 来自生产记录'
      }

      const { error } = await supabase
        .from('stock_records')
        .insert({
          product_id: productId,
          type: recordType,
          quantity: item.quantity,
          stock_date: record.production_date,
          operator_id: user.id,
          remark: remark,
        })

      if (error) {
        alert((isOutRecord ? '出库' : '入库') + '失败：' + error.message)
        setProcessingId(null)
        return
      }
    }

    // 更新生产记录状态
    const { error: updateError } = await supabase
      .from('production_records')
      .update({
        status: 'confirmed',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', record.id)

    if (updateError) {
      alert('状态更新失败：' + updateError.message)
    }

    setProcessingId(null)
    fetchRecords()
  }

  const openRejectModal = (recordId) => {
    setRejectModal({ show: true, recordId, reason: '' })
  }

  const handleReject = async () => {
    setProcessingId(rejectModal.recordId)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('production_records')
      .update({
        status: 'rejected',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        reject_reason: rejectModal.reason.trim() || null,
      })
      .eq('id', rejectModal.recordId)

    if (error) {
      alert('驳回失败：' + error.message)
    }

    setRejectModal({ show: false, recordId: null, reason: '' })
    setProcessingId(null)
    fetchRecords()
  }

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-100 text-amber-700',
      confirmed: 'bg-emerald-100 text-emerald-700',
      rejected: 'bg-rose-100 text-rose-700',
    }
    const labels = {
      pending: '待确认',
      confirmed: '已入库',
      rejected: '已驳回',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  // 过滤 items：排除 label_semi_out（用于显示）
  const getDisplayItems = (items) => {
    return (items || []).filter(item => item.warehouse !== 'label_semi_out')
  }

  const getTotalQuantity = (items) => {
    return getDisplayItems(items).reduce((sum, item) => sum + item.quantity, 0)
  }

  const getWarehouseLabel = (warehouse) => {
    const labels = {
      'finished': '成品',
      'semi': '半成品',
      'label_semi': '贴半成品',
      'label_semi_out': '半成品出库',
    }
    return labels[warehouse] || warehouse
  }

  const getWarehouseBadgeStyle = (warehouse) => {
    const styles = {
      'finished': 'bg-slate-100 text-slate-700',
      'semi': 'bg-violet-100 text-violet-700',
      'label_semi': 'bg-emerald-100 text-emerald-700',
      'label_semi_out': 'bg-amber-100 text-amber-700',
    }
    return styles[warehouse] || 'bg-gray-100 text-gray-800'
  }

  // 批量选择相关函数
  const toggleSelectRecord = (recordId) => {
    const newSelected = new Set(selectedRecords)
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId)
    } else {
      newSelected.add(recordId)
    }
    setSelectedRecords(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedRecords.size === historyRecords.length) {
      setSelectedRecords(new Set())
    } else {
      setSelectedRecords(new Set(historyRecords.map(r => r.id)))
    }
  }

  const handleOpenPrintPreview = () => {
    setShowPrintPreview(true)
  }

  const getSelectedRecordsData = () => {
    return historyRecords.filter(r => selectedRecords.has(r.id))
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">确认入库</h1>
        <p className="text-slate-500">审核生产记录并确认入库</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* 待确认列表 */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
              待确认
              {pendingRecords.length > 0 && (
                <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-1 rounded-full">
                  {pendingRecords.length}
                </span>
              )}
            </h2>

            {pendingRecords.length === 0 ? (
              <div className="surface-card p-8 text-center text-slate-500">
                暂无待确认的生产记录
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRecords.map((record) => (
                  <div
                    key={record.id}
                    className="surface-card p-6 border-l-4 border-amber-500"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center space-x-3">
                          <span className="text-lg font-semibold text-slate-900">
                            {record.production_date}
                          </span>
                          {getStatusBadge(record.status)}
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          提交人：{record.profiles?.name} ·
                          {new Date(record.created_at).toLocaleString('zh-CN')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">总数量</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {getTotalQuantity(record.production_record_items)}
                        </p>
                      </div>
                    </div>

                    {/* 产品明细 */}
                    <div className="surface-inset p-4 mb-4">
                      <table className="table-base table-compact">
                        <thead>
                          <tr className="text-slate-500">
                            <th className="text-left pb-2">类型</th>
                            <th className="text-left pb-2">产品</th>
                            <th className="text-left pb-2">规格</th>
                            <th className="text-left pb-2">奖项</th>
                            <th className="text-right pb-2">数量</th>
                          </tr>
                        </thead>
                          <tbody className="divide-y divide-slate-200">
                            {getDisplayItems(record.production_record_items).map((item) => (
                              <tr key={item.id}>
                                <td className="py-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getWarehouseBadgeStyle(item.warehouse)}`}>
                                    {getWarehouseLabel(item.warehouse)}
                                  </span>
                                </td>
                                <td className="py-2 font-medium text-slate-900">
                                  {item.products?.name}
                                </td>
                                <td className="py-2 text-slate-600">
                                  {item.products?.spec}
                                </td>
                                <td className="py-2 text-slate-600">
                                  {item.products?.prize_type || '-'}
                                </td>
                                <td className="py-2 text-right font-semibold text-slate-900 tabular-nums">
                                  {item.quantity}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                      </table>
                    </div>

                    {record.remark && (
                      <p className="text-sm text-slate-600 mb-4">
                        备注：{record.remark}
                      </p>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex justify-end space-x-3">
                      <button
                        onClick={() => openRejectModal(record.id)}
                        disabled={processingId === record.id}
                        className="btn-secondary text-rose-600 border-rose-200 hover:bg-rose-50 disabled:opacity-50"
                      >
                        驳回
                      </button>
                      <button
                        onClick={() => openConfirmModal(record)}
                        disabled={processingId === record.id}
                        className="btn-primary disabled:opacity-50"
                      >
                        {processingId === record.id ? '处理中...' : '确认入库'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 历史记录 */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-4">
                <h2 className="text-lg font-semibold text-slate-800">处理历史</h2>
                {historyRecords.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-sm text-slate-600 hover:text-slate-900"
                  >
                    {selectedRecords.size === historyRecords.length ? '取消全选' : '全选'}
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-3">
                {selectedRecords.size > 0 && (
                  <>
                    <button
                      onClick={() => setSelectedRecords(new Set())}
                      className="text-sm text-slate-600 hover:text-slate-900"
                    >
                      清除选择
                    </button>
                    <button
                      onClick={handleOpenPrintPreview}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <span>打印预览 ({selectedRecords.size})</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-slate-600 text-sm hover:text-slate-900"
                >
                  {showHistory ? '收起' : '展开'}
                </button>
              </div>
            </div>

            {showHistory && (
              historyRecords.length === 0 ? (
                <div className="surface-card p-8 text-center text-slate-500">
                  暂无处理记录
                </div>
              ) : (
                <div className="space-y-3">
                  {historyRecords.map((record) => {
                    const isExpanded = expandedHistoryId === record.id
                    return (
                      <div
                        key={record.id}
                        className={`surface-card overflow-hidden border-l-4 ${
                          record.status === 'confirmed' ? 'border-emerald-500' : 'border-rose-500'
                          } ${selectedRecords.has(record.id) ? 'ring-2 ring-slate-900/20' : ''
                          }`}
                      >
                        {/* 卡片头部 - 可点击 */}
                        <div className="flex">
                          {/* 复选框区域 */}
                          <div className="flex items-center justify-center w-12 bg-slate-50 border-r border-slate-200">
                            <input
                              type="checkbox"
                              checked={selectedRecords.has(record.id)}
                              onChange={() => toggleSelectRecord(record.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-5 h-5 text-slate-900 rounded focus:ring-2 focus:ring-slate-400 cursor-pointer"
                            />
                          </div>
                          {/* 原有内容 */}
                          <div
                            onClick={() => setExpandedHistoryId(isExpanded ? null : record.id)}
                            className="flex-1 p-4 cursor-pointer hover:bg-slate-50/70 transition"
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center space-x-3">
                                <span className="font-medium text-slate-900">
                                  {record.production_date}
                                </span>
                                {getStatusBadge(record.status)}
                              </div>
                              <div className="flex items-center space-x-3">
                                <span className="text-lg font-bold text-slate-600">
                                  {getTotalQuantity(record.production_record_items)}
                                </span>
                                <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                  ▼
                                </span>
                              </div>
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              提交：{record.profiles?.name} ·
                              处理：{record.confirmed_profile?.name} ·
                              {new Date(record.confirmed_at).toLocaleString('zh-CN')}
                            </div>
                          </div>
                        </div>

                        {/* 展开详情 */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-200/70">
                            <table className="table-base table-compact">
                              <thead>
                                <tr className="text-slate-500 text-xs">
                                  <th className="text-left pb-2">类型</th>
                                  <th className="text-left pb-2">产品</th>
                                  <th className="text-left pb-2">规格</th>
                                  <th className="text-left pb-2">奖项</th>
                                  <th className="text-right pb-2">数量</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {getDisplayItems(record.production_record_items).map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-2">
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getWarehouseBadgeStyle(item.warehouse)}`}>
                                        {getWarehouseLabel(item.warehouse)}
                                      </span>
                                    </td>
                                    <td className="py-2 font-medium text-slate-900">
                                      {item.products?.name}
                                    </td>
                                    <td className="py-2 text-slate-600">
                                      {item.products?.spec}
                                    </td>
                                    <td className="py-2 text-slate-600">
                                      {item.products?.prize_type || '-'}
                                    </td>
                                    <td className="py-2 text-right font-semibold text-slate-900 tabular-nums">
                                      {item.quantity}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {record.remark && (
                              <div className="mt-3 pt-2 border-t border-slate-200 text-sm text-slate-600">
                                <span className="text-slate-500">备注：</span>{record.remark}
                              </div>
                            )}
                            {record.reject_reason && (
                              <div className="mt-2 p-2 bg-rose-50 rounded text-sm text-rose-600">
                                <span className="font-medium">驳回原因：</span>{record.reject_reason}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* 确认入库弹窗 */}
      {confirmModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">确认入库</h2>
            <p className="text-slate-600 mb-6">确认将此生产记录入库？</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmModal({ show: false, record: null })}
                className="btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                className="btn-primary"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 驳回弹窗 */}
      {rejectModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">驳回生产记录</h2>
            <div className="mb-4">
              <label className="block text-slate-700 text-sm font-medium mb-2">
                驳回原因（可选）
              </label>
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                className="textarea-field focus:ring-rose-300"
                rows="3"
                placeholder="请说明驳回原因..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setRejectModal({ show: false, recordId: null, reason: '' })}
                className="btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={processingId}
                className="btn-danger"
              >
                确认驳回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打印预览弹窗 */}
      {showPrintPreview && (
        <ProductionPrintPreview
          records={getSelectedRecordsData()}
          onClose={() => setShowPrintPreview(false)}
          onPrint={() => setShowPrintPreview(false)}
        />
      )}
    </DashboardLayout>
  )
}
