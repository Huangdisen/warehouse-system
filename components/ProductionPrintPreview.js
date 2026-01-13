'use client'

export default function ProductionPrintPreview({ records, onClose, onPrint }) {
    const handlePrint = () => {
        window.print()
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

    return (
        <>
            {/* 打印预览弹窗 */}
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 no-print">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
                    <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-slate-800">打印预览 ({records.length} 条记录)</h2>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 text-sm"
                        >
                            关闭
                        </button>
                    </div>

                    {/* 滚动内容区 */}
                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                        <div className="print-container">
                            {records.map((record, index) => (
                                <div key={record.id} className="print-page bg-white mb-6 rounded-2xl shadow-sm p-8">
                                    {/* 页眉 */}
                                    <div className="text-center mb-8 border-b-2 border-slate-300 pb-4">
                                        <div className="flex justify-center mb-3">
                                            <img src="/logo.png" alt="百越" className="w-16 h-16" />
                                        </div>
                                        <h1 className="text-3xl font-bold text-slate-800 mb-2">百越仓库管理系统</h1>
                                        <p className="text-lg text-slate-600">生产记录单</p>
                                    </div>

                                    {/* 基本信息 */}
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

                                    {/* 产品明细表格 */}
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

                                    {/* 备注 */}
                                    {record.remark && (
                                        <div className="mb-6">
                                            <div className="text-slate-600 font-semibold mb-2">备注：</div>
                                            <div className="border border-slate-300 rounded p-3 bg-slate-50">
                                                {record.remark}
                                            </div>
                                        </div>
                                    )}

                                    {/* 驳回原因 */}
                                    {record.reject_reason && (
                                        <div className="mb-6">
                                            <div className="text-rose-600 font-semibold mb-2">驳回原因：</div>
                                            <div className="border border-rose-300 rounded p-3 bg-rose-50 text-rose-700">
                                                {record.reject_reason}
                                            </div>
                                        </div>
                                    )}

                                    {/* 页脚 */}
                                    <div className="mt-8 pt-4 border-t border-slate-300 text-xs text-slate-500 flex justify-between">
                                        <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
                                        <div>第 {index + 1} 页 / 共 {records.length} 页</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 底部操作按钮 */}
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

            {/* 打印专用样式 */}
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
