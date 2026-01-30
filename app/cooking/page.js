'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import CookingPrintPreview from '@/components/CookingPrintPreview'
import CookingInspectionReportPreview from '@/components/CookingInspectionReportPreview'
import CookingMonthlyLedger from '@/components/CookingMonthlyLedger'

const STORAGE_KEY = 'cooking_product_history'

// 获取历史产品列表
const getProductHistory = () => {
  if (typeof window === 'undefined') return []
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : []
}

// 保存新产品到历史
const saveProductToHistory = (productName) => {
  if (typeof window === 'undefined') return
  const history = getProductHistory()
  const filtered = history.filter((name) => name !== productName)
  const updated = [productName, ...filtered].slice(0, 20)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export default function CookingPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [productHistory, setProductHistory] = useState([])
  const [role, setRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ show: false, record: null })
  const [activeDropdown, setActiveDropdown] = useState(null)

  // 选择和打印相关状态
  const [selectedRecords, setSelectedRecords] = useState(new Set())
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [showInspectionPreview, setShowInspectionPreview] = useState(false)
  const [showMonthlyLedger, setShowMonthlyLedger] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const [cookingDate, setCookingDate] = useState(today)
  const [items, setItems] = useState([
    { product_name: '', pot_count: '', weight_kg: '', remark: '' }
  ])

  useEffect(() => {
    fetchRecords()
    fetchRole()
    setProductHistory(getProductHistory())
  }, [])

  const fetchRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    setRole(profile?.role || 'staff')
  }

  const fetchRecords = async () => {
    const { data } = await supabase
      .from('cooking_records')
      .select(`
        *,
        profiles (name)
      `)
      .order('cooking_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100)

    setRecords(data || [])
    setLoading(false)
  }

  const addItem = () => {
    setItems([...items, { product_name: '', pot_count: '', weight_kg: '', remark: '' }])
  }

  const removeItem = (index) => {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index, field, value) => {
    const newItems = [...items]
    newItems[index][field] = value
    setItems(newItems)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // 过滤有效项目
    const validItems = items.filter(
      (item) => item.product_name.trim() && item.pot_count && parseInt(item.pot_count) > 0
    )

    if (validItems.length === 0) {
      alert('请至少添加一个有效的煮制记录')
      return
    }

    setSubmitting(true)

    // 批量插入
    const recordsToInsert = validItems.map((item) => ({
      cooking_date: cookingDate,
      product_name: item.product_name.trim(),
      pot_count: parseInt(item.pot_count),
      weight_kg: item.weight_kg ? parseFloat(item.weight_kg) : null,
      operator_id: userId,
      remark: item.remark.trim() || null,
    }))

    const { error } = await supabase
      .from('cooking_records')
      .insert(recordsToInsert)

    if (error) {
      alert('提交失败：' + error.message)
    } else {
      // 保存所有产品名到历史记录
      validItems.forEach((item) => {
        saveProductToHistory(item.product_name.trim())
      })
      setProductHistory(getProductHistory())

      // 重置表单
      setItems([{ product_name: '', pot_count: '', weight_kg: '', remark: '' }])
      fetchRecords()
    }

    setSubmitting(false)
  }

  const handleProductSelect = (index, productName) => {
    updateItem(index, 'product_name', productName)
    setActiveDropdown(null)
  }

  const getFilteredSuggestions = (inputValue) => {
    if (!inputValue) return productHistory
    return productHistory.filter((name) =>
      name.toLowerCase().includes(inputValue.toLowerCase())
    )
  }

  const openDeleteModal = (record) => {
    setDeleteModal({ show: true, record })
  }

  const handleDelete = async () => {
    const record = deleteModal.record
    if (!record) return

    const { error } = await supabase
      .from('cooking_records')
      .delete()
      .eq('id', record.id)

    if (error) {
      alert('删除失败：' + error.message)
    } else {
      fetchRecords()
      setDeleteModal({ show: false, record: null })
    }
  }

  // 选择相关函数
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
    if (selectedRecords.size === records.length) {
      setSelectedRecords(new Set())
    } else {
      setSelectedRecords(new Set(records.map(r => r.id)))
    }
  }

  const getSelectedRecordsData = () => {
    return records.filter(r => selectedRecords.has(r.id))
  }

  const isViewer = role === 'viewer'
  const isAdmin = role === 'admin'

  // 按日期分组记录
  const groupedRecords = records.reduce((acc, record) => {
    const date = record.cooking_date
    if (!acc[date]) {
      acc[date] = []
    }
    acc[date].push(record)
    return acc
  }, {})

  const sortedDates = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a))

  return (
    <DashboardLayout>
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">煮制记录</h1>
          <p className="text-slate-500">记录每日煮制生产情况</p>
        </div>
        <button
          onClick={() => setShowMonthlyLedger(true)}
          className="btn-secondary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          月度台账
        </button>
      </div>

      {/* 添加记录表单 */}
      {!isViewer && (
        <div className="surface-card p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">添加煮制记录</h2>
          <form onSubmit={handleSubmit}>
            {/* 煮制日期 */}
            <div className="mb-4">
              <label className="block text-slate-700 text-sm font-medium mb-2">
                煮制日期 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={cookingDate}
                onChange={(e) => setCookingDate(e.target.value)}
                className="input-field w-full md:w-48"
                required
              />
            </div>

            {/* 产品列表 */}
            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 bg-slate-50 rounded-xl"
                >
                  {/* 产品名称 */}
                  <div className="md:col-span-4 relative">
                    <label className="block text-slate-600 text-xs mb-1">
                      产品 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.product_name}
                      onChange={(e) => {
                        updateItem(index, 'product_name', e.target.value)
                        setActiveDropdown(index)
                      }}
                      onFocus={() => setActiveDropdown(index)}
                      onBlur={() => setTimeout(() => setActiveDropdown(null), 200)}
                      className="input-field w-full"
                      placeholder="输入或选择产品"
                      autoComplete="off"
                    />
                    {activeDropdown === index && getFilteredSuggestions(item.product_name).length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {getFilteredSuggestions(item.product_name).map((name, i) => (
                          <li
                            key={i}
                            onMouseDown={() => handleProductSelect(index, name)}
                            className="px-4 py-2 hover:bg-slate-100 cursor-pointer text-slate-700"
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* 锅数 */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-600 text-xs mb-1">
                      锅数 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={item.pot_count}
                      onChange={(e) => updateItem(index, 'pot_count', e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      className="input-field w-full"
                      placeholder="锅数"
                      min="1"
                    />
                  </div>

                  {/* 重量 */}
                  <div className="md:col-span-2">
                    <label className="block text-slate-600 text-xs mb-1">重量(kg)</label>
                    <input
                      type="number"
                      value={item.weight_kg}
                      onChange={(e) => updateItem(index, 'weight_kg', e.target.value)}
                      onWheel={(e) => e.target.blur()}
                      className="input-field w-full"
                      placeholder="可选"
                      step="0.01"
                      min="0"
                    />
                  </div>

                  {/* 备注 */}
                  <div className="md:col-span-3">
                    <label className="block text-slate-600 text-xs mb-1">备注</label>
                    <input
                      type="text"
                      value={item.remark}
                      onChange={(e) => updateItem(index, 'remark', e.target.value)}
                      className="input-field w-full"
                      placeholder="可选"
                    />
                  </div>

                  {/* 删除按钮 */}
                  <div className="md:col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                      className={`w-full py-2 rounded-lg text-sm ${
                        items.length === 1
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'text-red-500 hover:bg-red-50'
                      }`}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="mt-4 flex flex-wrap gap-3 justify-between items-center">
              <button
                type="button"
                onClick={addItem}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + 添加一行
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? '提交中...' : `提交 ${items.filter(i => i.product_name && i.pot_count).length} 条记录`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 记录列表 */}
      <div className="surface-card p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-slate-800">最近记录</h2>
            {records.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                {selectedRecords.size === records.length ? '取消全选' : '全选'}
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
                  onClick={() => setShowPrintPreview(true)}
                  className="btn-primary flex items-center space-x-2"
                >
                  <span>打印预览 ({selectedRecords.size})</span>
                </button>
                <button
                  onClick={() => setShowInspectionPreview(true)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <span>检验报告 ({selectedRecords.size})</span>
                </button>
              </>
            )}
            <button
              onClick={fetchRecords}
              className="text-sm text-slate-500 hover:text-slate-700"
            >
              刷新
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : records.length === 0 ? (
          <p className="text-slate-500 text-center py-8">暂无煮制记录</p>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => {
              const dayRecords = groupedRecords[date]
              const totalPots = dayRecords.reduce((sum, r) => sum + r.pot_count, 0)
              const totalWeight = dayRecords.reduce((sum, r) => sum + (r.weight_kg || 0), 0)

              return (
                <div key={date} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 flex justify-between items-center">
                    <div>
                      <span className="font-medium text-slate-800">{date}</span>
                      <span className="text-slate-500 text-sm ml-4">
                        共 {dayRecords.length} 条记录
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-amber-600 font-semibold">{totalPots} 锅</span>
                      {totalWeight > 0 && (
                        <span className="text-slate-500 ml-3">{totalWeight.toFixed(2)} kg</span>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table-base table-compact table-row-hover">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase w-12">
                            <span className="sr-only">选择</span>
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">产品</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">锅数</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">重量(kg)</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">操作员</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">备注</th>
                          {isAdmin && (
                            <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {dayRecords.map((record) => (
                          <tr
                            key={record.id}
                            className={`hover:bg-slate-50 ${selectedRecords.has(record.id) ? 'bg-slate-100' : ''}`}
                          >
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={selectedRecords.has(record.id)}
                                onChange={() => toggleSelectRecord(record.id)}
                                className="w-4 h-4 text-slate-900 rounded focus:ring-2 focus:ring-slate-400 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap font-medium text-slate-900">
                              {record.product_name}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-amber-600 font-semibold">
                              {record.pot_count} 锅
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                              {record.weight_kg ? `${record.weight_kg} kg` : '-'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-slate-500">
                              {record.profiles?.name || '-'}
                            </td>
                            <td className="px-4 py-2 text-slate-500 max-w-xs truncate">
                              {record.remark || '-'}
                            </td>
                            {isAdmin && (
                              <td className="px-4 py-2 whitespace-nowrap">
                                <button
                                  onClick={() => openDeleteModal(record)}
                                  className="text-xs text-slate-400 hover:text-rose-600"
                                >
                                  删除
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">删除记录</h2>
            <p className="text-slate-600 mb-6">
              确认删除 <span className="font-bold">{deleteModal.record?.cooking_date}</span> 的
              <span className="font-bold"> {deleteModal.record?.product_name}</span> 煮制记录吗？
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModal({ show: false, record: null })}
                className="btn-ghost"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 打印预览弹窗 */}
      {showPrintPreview && (
        <CookingPrintPreview
          records={getSelectedRecordsData()}
          onClose={() => setShowPrintPreview(false)}
        />
      )}

      {/* 检验报告预览弹窗 */}
      {showInspectionPreview && (
        <CookingInspectionReportPreview
          records={getSelectedRecordsData()}
          onClose={() => setShowInspectionPreview(false)}
        />
      )}

      {/* 月度台账弹窗 */}
      {showMonthlyLedger && (
        <CookingMonthlyLedger onClose={() => setShowMonthlyLedger(false)} />
      )}
    </DashboardLayout>
  )
}
