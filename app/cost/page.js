'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const CATEGORIES = [
  { value: 'carton', label: '纸箱', color: 'bg-amber-100 text-amber-700', icon: '📦' },
  { value: 'material', label: '物料', color: 'bg-sky-100 text-sky-700', icon: '🧴' },
  { value: 'label', label: '标签', color: 'bg-violet-100 text-violet-700', icon: '🏷️' },
  { value: 'raw_material', label: '原材料', color: 'bg-emerald-100 text-emerald-700', icon: '🧪' },
]

const getCategoryInfo = (value) => CATEGORIES.find(c => c.value === value) || { label: value, color: 'bg-slate-100 text-slate-600', icon: '📋' }

export default function CostPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [cartons, setCartons] = useState([])
  const [materials, setMaterials] = useState([])
  const [rawMaterials, setRawMaterials] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [suppliers, setSuppliers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ show: false, record: null })
  const [profile, setProfile] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [formData, setFormData] = useState({
    category: 'carton',
    item_id: '',
    item_name: '',
    spec: '',
    quantity: '',
    unit: '个',
    total_amount: '',
    supplier: '',
    purchase_date: new Date().toISOString().split('T')[0],
    remark: '',
  })

  const [itemSearch, setItemSearch] = useState('')
  const [showItemDropdown, setShowItemDropdown] = useState(false)
  const itemDropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(e.target)) {
        setShowItemDropdown(false)
        setItemSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    fetchProfile()
    fetchCartons()
    fetchMaterials()
    fetchRawMaterials()
    fetchRecords()
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [filterCategory, filterSupplier, filterDateFrom, filterDateTo])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()
      setProfile(data)
      setIsAdmin(data?.role === 'admin')
    }
  }

  const fetchCartons = async () => {
    const { data } = await supabase.from('cartons').select('id, name, spec').order('name')
    setCartons(data || [])
  }

  const fetchMaterials = async () => {
    const { data } = await supabase.from('materials').select('id, name, spec, category').order('category').order('name')
    setMaterials(data || [])
  }

  const fetchRawMaterials = async () => {
    const { data } = await supabase
      .from('purchase_records')
      .select('item_name, spec')
      .eq('category', 'raw_material')
      .order('item_name')
    if (data) {
      const seen = new Set()
      const unique = data.filter(r => {
        const key = `${r.item_name}||${r.spec || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setRawMaterials(unique.map(r => ({ name: r.item_name, spec: r.spec || '' })))
    }
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('purchase_records')
      .select('*, operator:profiles(name)')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    if (filterCategory !== 'all') {
      query = query.eq('category', filterCategory)
    }
    if (filterSupplier) {
      query = query.eq('supplier', filterSupplier)
    }
    if (filterDateFrom) {
      query = query.gte('purchase_date', filterDateFrom)
    }
    if (filterDateTo) {
      query = query.lte('purchase_date', filterDateTo)
    }

    const { data, error } = await query
    if (!error) {
      setRecords(data || [])
      const uniqueSuppliers = [...new Set((data || []).map(r => r.supplier).filter(Boolean))]
      setSuppliers(prev => {
        const all = [...new Set([...prev, ...uniqueSuppliers])]
        return all.sort()
      })
    }
    setLoading(false)
  }

  const openModal = (record = null) => {
    if (record) {
      setEditingRecord(record)
      setFormData({
        category: record.category,
        item_id: record.item_id || '',
        item_name: record.item_name,
        spec: record.spec || '',
        quantity: String(record.quantity),
        unit: record.unit || '个',
        total_amount: record.unit_price && record.quantity ? String((record.unit_price * record.quantity).toFixed(2)) : '',
        supplier: record.supplier || '',
        purchase_date: record.purchase_date,
        remark: record.remark || '',
      })
    } else {
      setEditingRecord(null)
      setFormData({
        category: 'carton',
        item_id: '',
        item_name: '',
        spec: '',
        quantity: '',
        unit: '个',
        total_amount: '',
        supplier: '',
        purchase_date: new Date().toISOString().split('T')[0],
        remark: '',
      })
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingRecord(null)
  }

  const selectItem = (item) => {
    setFormData(prev => ({
      ...prev,
      item_id: item.id,
      item_name: item.name,
      spec: item.spec || '',
    }))
    setShowItemDropdown(false)
    setItemSearch('')
  }

  const getAvailableItems = () => {
    if (formData.category === 'carton') return cartons
    if (formData.category === 'material') return materials
    if (formData.category === 'raw_material') return rawMaterials
    return []
  }

  const filteredItems = getAvailableItems().filter(item => {
    if (!itemSearch) return true
    const term = itemSearch.toLowerCase()
    return item.name.toLowerCase().includes(term) || (item.spec || '').toLowerCase().includes(term)
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.item_name.trim()) {
      alert('请填写品名')
      return
    }
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      alert('请输入有效数量')
      return
    }
    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      alert('请输入有效总价')
      return
    }
    setSubmitting(true)

    const { data: { session } } = await supabase.auth.getSession()

    const payload = {
      category: formData.category,
      item_id: formData.item_id || null,
      item_name: formData.item_name.trim(),
      spec: formData.spec.trim() || null,
      quantity: parseInt(formData.quantity),
      unit: formData.unit.trim() || '个',
      unit_price: parseFloat((parseFloat(formData.total_amount) / parseInt(formData.quantity)).toFixed(6)),
      supplier: formData.supplier.trim() || null,
      purchase_date: formData.purchase_date,
      remark: formData.remark.trim() || null,
      operator_id: session?.user?.id,
    }

    let error
    if (editingRecord) {
      const { error: e } = await supabase
        .from('purchase_records')
        .update(payload)
        .eq('id', editingRecord.id)
      error = e
    } else {
      const { error: e } = await supabase
        .from('purchase_records')
        .insert(payload)
      error = e
    }

    if (error) {
      alert('保存失败：' + error.message)
    } else {
      fetchRecords()
      fetchRawMaterials()
      closeModal()
    }
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deleteModal.record) return
    const { error } = await supabase
      .from('purchase_records')
      .delete()
      .eq('id', deleteModal.record.id)
    if (error) {
      alert('删除失败：' + error.message)
    } else {
      fetchRecords()
    }
    setDeleteModal({ show: false, record: null })
  }

  const totalAmount = records.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0)
  const totalByCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: records.filter(r => r.category === cat.value).reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0),
    count: records.filter(r => r.category === cat.value).length,
  }))

  // 按品项汇总，计算平均单价（总金额/总数量，反映原料价格波动后的综合成本）
  const itemAvgMap = {}
  records.forEach(r => {
    const key = `${r.item_name}||${r.spec || ''}`
    if (!itemAvgMap[key]) itemAvgMap[key] = { name: r.item_name, spec: r.spec, category: r.category, total: 0, totalQty: 0 }
    itemAvgMap[key].total += parseFloat(r.total_amount || 0)
    itemAvgMap[key].totalQty += r.quantity
  })
  const itemAvgList = Object.values(itemAvgMap)
    .filter(i => i.totalQty > 0)
    .map(i => ({ ...i, avgUnitPrice: i.total / i.totalQty }))
    .sort((a, b) => b.total - a.total)

  const calculatedUnitPrice = formData.quantity && formData.total_amount && parseInt(formData.quantity) > 0
    ? (parseFloat(formData.total_amount) / parseInt(formData.quantity)).toFixed(4)
    : null

  const hasLinkedItems = formData.category === 'carton' || formData.category === 'material' || formData.category === 'raw_material'

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">采购成本</h1>
          <p className="text-slate-500">统计和录入纸箱、标签、物料、原厂料的采购成本</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cost/stats" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            成本统计
          </Link>
          <button
            onClick={() => openModal()}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition shadow-sm"
          >
            录入采购
          </button>
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 font-medium">筛选合计</p>
          <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-400 mt-1">{records.length} 条记录</p>
        </div>
        {totalByCategory.map(cat => (
          <div key={cat.value} className="surface-card p-4">
            <p className="text-xs text-slate-500 font-medium">{cat.icon} {cat.label}</p>
            <p className="text-lg font-bold text-slate-900 mt-1 tabular-nums">¥{cat.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-slate-400 mt-1">{cat.count} 条</p>
          </div>
        ))}
      </div>

      {/* 筛选 */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
              filterCategory === 'all'
                ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
            }`}
          >
            全部
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(filterCategory === cat.value ? 'all' : cat.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                filterCategory === cat.value
                  ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">全部供应商</option>
            {suppliers.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="开始日期"
          />
          <span className="text-slate-400 text-sm">至</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="结束日期"
          />
          {(filterSupplier || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterSupplier(''); setFilterDateFrom(''); setFilterDateTo('') }}
              className="px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-600 transition"
            >
              × 清除筛选
            </button>
          )}
        </div>
      </div>

      {/* 品项平均单价（反映原料价格波动后的综合成本） */}
      {itemAvgList.length > 0 && (
        <div className="surface-card p-4 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">品项平均单价</h3>
          <p className="text-xs text-slate-500 mb-3">同一品项多次采购的加权平均，用于参考原料价格波动后的综合成本</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-2 px-3 font-semibold text-slate-700">类别</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">品名</th>
                  <th className="py-2 px-3 font-semibold text-slate-700">规格</th>
                  <th className="py-2 px-3 text-right font-semibold text-slate-700">总采购量</th>
                  <th className="py-2 px-3 text-right font-semibold text-slate-700">总金额</th>
                  <th className="py-2 px-3 text-right font-semibold text-slate-700">平均单价</th>
                </tr>
              </thead>
              <tbody>
                {itemAvgList.map((item, idx) => {
                  const catInfo = getCategoryInfo(item.category)
                  return (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900">{item.name}</td>
                      <td className="py-2 px-3 text-slate-600">{item.spec || '-'}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{item.totalQty.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right tabular-nums">¥{item.total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-900 tabular-nums">¥{item.avgUnitPrice.toFixed(4)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 记录列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-slate-500">暂无采购记录，点击上方「录入采购」开始</p>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">日期</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">类别</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">品名</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">数量</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">单价</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">金额</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">供应商</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">备注</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">操作员</th>
                  {isAdmin && <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">操作</th>}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const catInfo = getCategoryInfo(record.category)
                  return (
                    <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-slate-900">{record.purchase_date}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${catInfo.color}`}>
                          {catInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-900">{record.item_name}</span>
                        {record.spec && <span className="text-xs text-slate-500 ml-1">({record.spec})</span>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">
                          {record.quantity.toLocaleString()} {record.unit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm text-slate-700 tabular-nums">
                          ¥{parseFloat(record.unit_price).toFixed(4)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-sm font-bold text-slate-900 tabular-nums">
                          ¥{parseFloat(record.total_amount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600">{record.supplier || '-'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600 max-w-[120px] truncate block">{record.remark || '-'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600">{record.operator?.name || '-'}</span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              onClick={() => openModal(record)}
                              className="text-slate-500 hover:text-slate-900 transition"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => setDeleteModal({ show: true, record })}
                              className="text-rose-500 hover:text-rose-700 transition"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td colSpan={5} className="py-3 px-4 text-right text-sm font-semibold text-slate-700">合计</td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-base font-black text-slate-900 tabular-nums">
                      ¥{totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td colSpan={isAdmin ? 4 : 3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 录入/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* 弹窗头部 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingRecord ? '编辑采购记录' : '录入采购'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">输入数量和总金额，单价自动计算</p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5">
              {/* 类别选择 */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">采购类别</label>
                <div className="grid grid-cols-4 gap-2">
                  {CATEGORIES.map(cat => (
                    <label
                      key={cat.value}
                      className={`flex flex-col items-center justify-center gap-1 py-3 px-1 rounded-xl border-2 cursor-pointer transition-all text-xs font-semibold select-none ${
                        formData.category === cat.value
                          ? 'border-slate-700 bg-slate-50 text-slate-900 shadow-sm'
                          : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={cat.value}
                        checked={formData.category === cat.value}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value, item_id: '', item_name: '', spec: '', unit: e.target.value === 'raw_material' ? 'KG' : (formData.unit === 'KG' ? '个' : formData.unit) })}
                        className="hidden"
                      />
                      <span className="text-base">{cat.icon}</span>
                      {cat.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* 主体两列 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                {/* 左列：品项信息 */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">品项信息</p>

                  {/* 品名 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      品名 <span className="text-rose-400">*</span>
                    </label>
                    {hasLinkedItems ? (
                      <div ref={itemDropdownRef} className="space-y-2">
                        <div
                          className="input-field cursor-pointer flex items-center justify-between"
                          onClick={() => { setShowItemDropdown(v => !v); setItemSearch('') }}
                        >
                          <span className={formData.item_name ? 'text-slate-900' : 'text-slate-400'}>
                            {formData.item_name || (formData.category === 'raw_material' ? '从历史记录中选择...' : `从${getCategoryInfo(formData.category).label}仓选择...`)}
                          </span>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${showItemDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {showItemDropdown && (
                          <div className="absolute z-20 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" style={{width: 'calc(50% - 2.5rem)'}}>
                            <div className="p-2 border-b border-slate-100">
                              <input
                                type="text"
                                value={itemSearch}
                                onChange={(e) => setItemSearch(e.target.value)}
                                placeholder="搜索品名..."
                                className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filteredItems.map(item => (
                                <button
                                  key={item.id || item.name}
                                  type="button"
                                  onClick={() => selectItem(item)}
                                  className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-slate-50 flex items-center justify-between ${
                                    formData.item_name === item.name ? 'font-semibold text-slate-900 bg-slate-50' : 'text-slate-600'
                                  }`}
                                >
                                  <span>{item.name}</span>
                                  {item.spec && <span className="text-xs text-slate-400 ml-2">{item.spec}</span>}
                                </button>
                              ))}
                              {filteredItems.length === 0 && (
                                <p className="px-4 py-3 text-sm text-slate-400 text-center">无匹配品项</p>
                              )}
                            </div>
                          </div>
                        )}
                        <input
                          type="text"
                          value={formData.item_name}
                          onChange={(e) => setFormData({ ...formData, item_name: e.target.value, item_id: '' })}
                          placeholder="或手动输入品名"
                          className="input-field"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={formData.item_name}
                        onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                        className="input-field"
                        placeholder={formData.category === 'label' ? '例如：百越鸡汁标签' : '例如：酱油原液'}
                        required
                      />
                    )}
                  </div>

                  {/* 规格 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">规格</label>
                    <input
                      type="text"
                      value={formData.spec}
                      onChange={(e) => setFormData({ ...formData, spec: e.target.value })}
                      className="input-field"
                      placeholder="可选，例如：500ml / A4"
                    />
                  </div>

                  {/* 供应商 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">供应商</label>
                    <input
                      type="text"
                      value={formData.supplier}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      className="input-field"
                      placeholder="供应商名称"
                      list="supplier-list"
                    />
                    <datalist id="supplier-list">
                      {suppliers.map(s => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  {/* 备注 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                    <input
                      type="text"
                      value={formData.remark}
                      onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                      className="input-field"
                      placeholder="可选"
                    />
                  </div>
                </div>

                {/* 右列：数量与价格 */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">数量与价格</p>

                  {/* 数量 + 单位 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        数量 <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="input-field"
                        min="1"
                        placeholder="0"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">单位</label>
                      <input
                        type="text"
                        value={formData.unit}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        className="input-field"
                        placeholder="个"
                      />
                    </div>
                  </div>

                  {/* 总价输入 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      总价 (¥) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                      onWheel={(e) => e.target.blur()}
                      className="input-field text-lg font-semibold"
                      min="0"
                      placeholder="0.00"
                      required
                    />
                  </div>

                  {/* 单价自动计算展示 */}
                  <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
                    calculatedUnitPrice
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    <span className={`text-sm ${calculatedUnitPrice ? 'text-slate-300' : 'text-slate-400'}`}>
                      自动计算单价
                    </span>
                    <span className={`text-xl font-black tabular-nums ${calculatedUnitPrice ? 'text-white' : 'text-slate-300'}`}>
                      {calculatedUnitPrice ? `¥${calculatedUnitPrice}` : '—'}
                    </span>
                  </div>

                  {/* 采购日期 */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      采购日期 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={formData.purchase_date}
                      onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                      className="input-field"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 mt-6 pb-1">
                <button type="button" onClick={closeModal} className="btn-ghost flex-1 py-3 border border-slate-200 rounded-xl">
                  取消
                </button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 py-3 text-base">
                  {submitting ? '保存中...' : editingRecord ? '保存修改' : '确认录入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">确认删除</h2>
            <p className="text-slate-600 mb-2">
              确定要删除 <span className="font-semibold">{deleteModal.record?.item_name}</span> 的采购记录吗？
            </p>
            <p className="text-sm text-slate-500 mb-1">
              金额：¥{parseFloat(deleteModal.record?.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-rose-500 text-sm mb-6">删除后不可恢复。</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setDeleteModal({ show: false, record: null })} className="btn-ghost">取消</button>
              <button onClick={handleDelete} className="btn-danger">删除</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
