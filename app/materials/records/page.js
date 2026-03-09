'use client'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const CATEGORIES = [
  { value: 'glass_bottle', label: '玻璃瓶' },
  { value: 'plastic_bottle', label: '胶瓶' },
  { value: 'cap', label: '盖子' },
]

export default function MaterialRecordsPage() {
  const searchParams = useSearchParams()
  const [records, setRecords] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [filterMaterial, setFilterMaterial] = useState(() => searchParams.get('material_id') || '')
  const [formData, setFormData] = useState({
    material_id: '',
    type: 'in',
    quantity: '',
    stock_date: new Date().toISOString().split('T')[0],
    remark: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [materialSearch, setMaterialSearch] = useState('')
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false)
  const materialDropdownRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (materialDropdownRef.current && !materialDropdownRef.current.contains(e.target)) {
        setShowMaterialDropdown(false)
        setMaterialSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    fetchMaterials()
    fetchRecords()
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [filterType, filterMaterial])

  const fetchMaterials = async () => {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
    setMaterials(data || [])
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('material_records')
      .select(`
        *,
        material:materials(id, name, spec, category),
        operator:profiles(id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (filterType !== 'all') {
      query = query.eq('type', filterType)
    }

    if (filterMaterial) {
      query = query.eq('material_id', filterMaterial)
    }

    const { data, error } = await query
    if (!error) {
      setRecords(data || [])
    }
    setLoading(false)
  }

  const openModal = () => {
    setFormData({
      material_id: '',
      type: 'in',
      quantity: '',
      stock_date: new Date().toISOString().split('T')[0],
      remark: '',
    })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.material_id) {
      alert('请选择物料')
      return
    }

    if (!formData.quantity || parseInt(formData.quantity) <= 0) {
      alert('请输入有效数量')
      return
    }

    setSubmitting(true)

    const { data: { session } } = await supabase.auth.getSession()

    const { error: recordError } = await supabase
      .from('material_records')
      .insert({
        material_id: formData.material_id,
        type: formData.type,
        quantity: parseInt(formData.quantity),
        stock_date: formData.stock_date,
        operator_id: session?.user?.id,
        source_type: 'manual',
        remark: formData.remark || (formData.type === 'in' ? '手动入库' : '手动出库'),
      })

    if (recordError) {
      alert('操作失败：' + recordError.message)
      setSubmitting(false)
      return
    }

    const material = materials.find(m => m.id === formData.material_id)
    const newQuantity = formData.type === 'in'
      ? material.quantity + parseInt(formData.quantity)
      : material.quantity - parseInt(formData.quantity)

    const { error: updateError } = await supabase
      .from('materials')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', formData.material_id)

    if (updateError) {
      alert('更新库存失败：' + updateError.message)
    } else {
      fetchRecords()
      fetchMaterials()
      setShowModal(false)
    }

    setSubmitting(false)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return dateStr.split('T')[0]
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getCategoryLabel = (cat) => {
    return CATEGORIES.find(c => c.value === cat)?.label || cat
  }

  const selectedMaterialName = filterMaterial
    ? (materials.find(m => m.id === filterMaterial)?.name || '全部物料')
    : '全部物料'

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link href="/materials" className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 hover:text-slate-900 mb-3 transition">
            ← 返回物料仓
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">物料出入库记录</h1>
          <p className="text-slate-500">查看玻璃瓶、胶瓶、盖子的采购入库和领用记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/materials" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            物料仓
          </Link>
          <button
            onClick={openModal}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition shadow-sm"
          >
            手动入库/出库
          </button>
        </div>
      </div>

      {/* 筛选 */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex gap-2">
          {[
            { value: 'all', label: '全部' },
            { value: 'in', label: '入库' },
            { value: 'out', label: '出库' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterType(value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filterType === value
                  ? value === 'in' ? 'bg-emerald-600 text-white'
                    : value === 'out' ? 'bg-rose-600 text-white'
                    : 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div ref={materialDropdownRef} className="relative w-full md:w-72">
          <button
            type="button"
            onClick={() => { setShowMaterialDropdown(v => !v); setMaterialSearch('') }}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-slate-300 transition"
          >
            <span className="truncate">{selectedMaterialName}</span>
            <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showMaterialDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showMaterialDropdown && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  placeholder="搜索物料..."
                  className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  autoFocus
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => { setFilterMaterial(''); setShowMaterialDropdown(false); setMaterialSearch('') }}
                  className={`w-full text-left px-3 py-2 text-sm transition hover:bg-slate-50 ${filterMaterial === '' ? 'font-semibold text-slate-900 bg-slate-50' : 'text-slate-600'}`}
                >
                  全部物料
                </button>
                {materials
                  .filter(m => !materialSearch || m.name.toLowerCase().includes(materialSearch.toLowerCase()) || (m.spec || '').toLowerCase().includes(materialSearch.toLowerCase()))
                  .map(material => (
                    <button
                      key={material.id}
                      type="button"
                      onClick={() => { setFilterMaterial(material.id); setShowMaterialDropdown(false); setMaterialSearch('') }}
                      className={`w-full text-left px-3 py-2 text-sm transition hover:bg-slate-50 ${filterMaterial === material.id ? 'font-semibold text-slate-900 bg-slate-50' : 'text-slate-600'}`}
                    >
                      <span className="text-xs text-slate-400 mr-1">[{getCategoryLabel(material.category)}]</span>
                      <span>{material.name}</span>
                      {material.spec && <span className="ml-1.5 text-xs text-slate-400">{material.spec}</span>}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-slate-500">暂无记录</p>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">时间</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">类型</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">物料</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">数量</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">备注</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">操作员</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatDate(record.stock_date)}</p>
                        <p className="text-xs text-slate-500">{formatTime(record.created_at)}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {record.type === 'in' ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">入库</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium">出库</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-medium text-slate-900">{record.material?.name || '-'}</span>
                        {record.material?.spec && (
                          <span className="text-xs text-slate-500 ml-1">({record.material.spec})</span>
                        )}
                        {record.material?.category && (
                          <p className="text-xs text-slate-400 mt-0.5">{getCategoryLabel(record.material.category)}</p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-lg font-semibold tabular-nums ${
                        record.type === 'in' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {record.type === 'in' ? '+' : '-'}{record.quantity.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-600 max-w-xs truncate block">
                        {record.remark || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-600">{record.operator?.name || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 手动入库/出库弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">物料入库/出库</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">选择物料</label>
                <select
                  value={formData.material_id}
                  onChange={(e) => setFormData({ ...formData, material_id: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="">-- 请选择 --</option>
                  {CATEGORIES.map(cat => {
                    const catMaterials = materials.filter(m => m.category === cat.value)
                    if (catMaterials.length === 0) return null
                    return (
                      <optgroup key={cat.value} label={cat.label}>
                        {catMaterials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} {m.spec ? `(${m.spec})` : ''} [库存: {m.quantity.toLocaleString()}]
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">操作类型</label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition ${
                    formData.type === 'in' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="type"
                      value="in"
                      checked={formData.type === 'in'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="hidden"
                    />
                    <span className={`font-medium ${formData.type === 'in' ? 'text-emerald-700' : 'text-slate-600'}`}>
                      📥 入库（采购）
                    </span>
                  </label>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition ${
                    formData.type === 'out' ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:border-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="type"
                      value="out"
                      checked={formData.type === 'out'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="hidden"
                    />
                    <span className={`font-medium ${formData.type === 'out' ? 'text-rose-700' : 'text-slate-600'}`}>
                      📤 出库（领用）
                    </span>
                  </label>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">数量</label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                  className="input-field"
                  min="1"
                  placeholder="输入数量"
                  required
                />
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">日期</label>
                <input
                  type="date"
                  value={formData.stock_date}
                  onChange={(e) => setFormData({ ...formData, stock_date: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">备注</label>
                <input
                  type="text"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="input-field"
                  placeholder="可选，如：采购批次号、领用原因等"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">取消</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? '提交中...' : '确认'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
