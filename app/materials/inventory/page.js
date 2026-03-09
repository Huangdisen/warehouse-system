'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const CATEGORIES = [
  { value: 'glass_bottle', label: '玻璃瓶' },
  { value: 'plastic_bottle', label: '胶瓶' },
  { value: 'cap', label: '盖子' },
]

export default function MaterialInventoryPage() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [inventoryData, setInventoryData] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [profile, setProfile] = useState(null)
  const [filterType, setFilterType] = useState('all') // 'all' | 'filled' | 'diff'
  const [filterCategory, setFilterCategory] = useState('all')

  useEffect(() => {
    fetchProfile()
    fetchMaterials()
  }, [])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(data)
    }
  }

  const fetchMaterials = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (!error) {
      setMaterials(data || [])
      const initialData = {}
      data?.forEach(m => {
        initialData[m.id] = { actual_qty: '', remark: '' }
      })
      setInventoryData(initialData)
    }
    setLoading(false)
  }

  const handleInventoryChange = (materialId, field, value) => {
    setInventoryData(prev => ({
      ...prev,
      [materialId]: { ...prev[materialId], [field]: value }
    }))
  }

  const quickFill = (materialId) => {
    const material = materials.find(m => m.id === materialId)
    if (material) {
      handleInventoryChange(materialId, 'actual_qty', material.quantity.toString())
    }
  }

  const fillAllWithBookQty = () => {
    const newData = { ...inventoryData }
    materials.forEach(m => {
      newData[m.id] = { ...newData[m.id], actual_qty: m.quantity.toString() }
    })
    setInventoryData(newData)
  }

  const clearAll = () => {
    const newData = {}
    materials.forEach(m => {
      newData[m.id] = { actual_qty: '', remark: '' }
    })
    setInventoryData(newData)
  }

  const calculateDifference = (materialId) => {
    const material = materials.find(m => m.id === materialId)
    const actualQty = parseInt(inventoryData[materialId]?.actual_qty)
    if (!material || isNaN(actualQty)) return null
    return actualQty - material.quantity
  }

  const stats = useMemo(() => {
    let filled = 0
    let withDiff = 0
    let totalDiff = 0

    materials.forEach(m => {
      const actualQty = parseInt(inventoryData[m.id]?.actual_qty)
      if (!isNaN(actualQty)) {
        filled++
        const diff = actualQty - m.quantity
        if (diff !== 0) {
          withDiff++
          totalDiff += diff
        }
      }
    })

    return {
      total: materials.length,
      filled,
      withDiff,
      totalDiff,
      progress: materials.length > 0 ? Math.round((filled / materials.length) * 100) : 0
    }
  }, [materials, inventoryData])

  const handleSubmit = async () => {
    const adjustments = materials.filter(m => {
      const actualQty = parseInt(inventoryData[m.id]?.actual_qty)
      return !isNaN(actualQty) && actualQty !== m.quantity
    }).map(m => ({
      material: m,
      actual_qty: parseInt(inventoryData[m.id]?.actual_qty),
      difference: parseInt(inventoryData[m.id]?.actual_qty) - m.quantity,
      remark: inventoryData[m.id]?.remark || ''
    }))

    if (adjustments.length === 0) {
      alert('没有需要调整的库存')
      return
    }

    const confirmMessage = `即将调整 ${adjustments.length} 种物料的库存：\n\n` +
      adjustments.map(adj =>
        `${adj.material.name}: ${adj.material.quantity} → ${adj.actual_qty} (${adj.difference > 0 ? '+' : ''}${adj.difference})`
      ).join('\n') +
      '\n\n确认提交盘点结果吗？'

    if (!confirm(confirmMessage)) return

    setSubmitting(true)

    try {
      for (const adj of adjustments) {
        const { error: recordError } = await supabase
          .from('material_records')
          .insert({
            material_id: adj.material.id,
            type: adj.difference > 0 ? 'in' : 'out',
            quantity: Math.abs(adj.difference),
            stock_date: new Date().toISOString().split('T')[0],
            operator_id: profile?.id,
            source_type: 'manual',
            remark: `盘点调整${adj.remark ? ': ' + adj.remark : ''}`,
          })

        if (recordError) throw recordError

        const { error: updateError } = await supabase
          .from('materials')
          .update({ quantity: adj.actual_qty, updated_at: new Date().toISOString() })
          .eq('id', adj.material.id)

        if (updateError) throw updateError
      }

      alert('盘点完成，物料库存已更新')
      fetchMaterials()
    } catch (error) {
      alert('提交失败：' + error.message)
    }

    setSubmitting(false)
  }

  const getCategoryLabel = (cat) => CATEGORIES.find(c => c.value === cat)?.label || cat

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (filterCategory !== 'all' && m.category !== filterCategory) return false

      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (!m.name?.toLowerCase().includes(term) && !m.spec?.toLowerCase().includes(term)) return false
      }

      if (filterType === 'filled') {
        const actualQty = parseInt(inventoryData[m.id]?.actual_qty)
        return !isNaN(actualQty)
      }
      if (filterType === 'diff') {
        const diff = calculateDifference(m.id)
        return diff !== null && diff !== 0
      }

      return true
    })
  }, [materials, searchTerm, filterType, filterCategory, inventoryData])

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <Link href="/materials" className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 hover:text-slate-900 mb-3 transition">
            ← 返回物料仓
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">物料盘点</h1>
          <p className="text-slate-500">核对并调整物料的实际库存</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/materials" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            物料仓
          </Link>
          <Link href="/materials/records" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            出入库记录
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 mb-2">物料种类</p>
          <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
        </div>
        <div className="surface-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-500">盘点进度</p>
            <span className="text-sm font-bold text-slate-800">{stats.progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">已填 {stats.filled} / {stats.total} 项</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 mb-2">差异项</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${stats.withDiff > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
              {stats.withDiff}
            </span>
            <span className="text-sm text-slate-400">项需调整</span>
          </div>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 mb-2">净差异数量</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${
              stats.totalDiff > 0 ? 'text-emerald-600' :
              stats.totalDiff < 0 ? 'text-rose-600' : 'text-slate-800'
            }`}>
              {stats.totalDiff > 0 ? '+' : ''}{stats.totalDiff}
            </span>
            <span className="text-sm text-slate-400">个</span>
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="surface-card p-4 mb-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索物料名称、规格..."
              className="w-full pl-10 pr-4 py-2 input-field"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              全部
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setFilterCategory(filterCategory === cat.value ? 'all' : cat.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterCategory === cat.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterType === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              全部
            </button>
            <button
              onClick={() => setFilterType('filled')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterType === 'filled' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              已填
            </button>
            <button
              onClick={() => setFilterType('diff')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filterType === 'diff' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              有差异
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fillAllWithBookQty}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            >
              全部填充
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
            >
              清空
            </button>
          </div>
        </div>
      </div>

      {/* 盘点表格 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="surface-card p-12 text-center">
          <p className="text-slate-500">
            {searchTerm ? `未找到包含 "${searchTerm}" 的物料` : '暂无物料'}
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">物料名称</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">分类</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">规格</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">账面库存</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">实际库存</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-slate-700">差异</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">备注</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((material) => {
                  const diff = calculateDifference(material.id)
                  const hasDiff = diff !== null && diff !== 0

                  return (
                    <tr
                      key={material.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/50 ${hasDiff ? 'border-l-4 border-l-amber-400' : ''}`}
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-900">{material.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-500">{getCategoryLabel(material.category)}</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{material.spec || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-semibold tabular-nums ${material.quantity < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                          {material.quantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            value={inventoryData[material.id]?.actual_qty || ''}
                            onChange={(e) => handleInventoryChange(material.id, 'actual_qty', e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            className="w-28 input-field text-center text-sm py-1.5"
                            placeholder="填写"
                          />
                          <button
                            onClick={() => quickFill(material.id)}
                            className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition"
                            title="填充账面库存"
                          >
                            =
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {diff !== null ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            diff > 0 ? 'bg-emerald-100 text-emerald-700' :
                            diff < 0 ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={inventoryData[material.id]?.remark || ''}
                          onChange={(e) => handleInventoryChange(material.id, 'remark', e.target.value)}
                          className="w-full input-field text-sm py-1.5"
                          placeholder="可选"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 底部提交栏 */}
      {stats.withDiff > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg p-4 z-40">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="text-sm text-slate-600">
              <span className="font-medium text-amber-600">{stats.withDiff}</span> 项有差异，
              净差异 <span className={`font-medium ${stats.totalDiff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {stats.totalDiff > 0 ? '+' : ''}{stats.totalDiff}
              </span> 个
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? '提交中...' : '提交盘点结果'}
            </button>
          </div>
        </div>
      )}

      {stats.withDiff > 0 && <div className="h-20" />}
    </DashboardLayout>
  )
}
