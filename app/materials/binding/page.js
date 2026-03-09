'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const CATEGORIES = [
  { value: 'glass_bottle', label: '玻璃瓶', color: 'bg-sky-100 text-sky-700' },
  { value: 'plastic_bottle', label: '胶瓶', color: 'bg-violet-100 text-violet-700' },
  { value: 'cap', label: '盖子', color: 'bg-amber-100 text-amber-700' },
]
const getCategoryInfo = (v) => CATEGORIES.find(c => c.value === v) || { label: v, color: 'bg-slate-100 text-slate-600' }

export default function MaterialBindingPage() {
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [bindings, setBindings] = useState([]) // product_material rows
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [warehouseFilter, setWarehouseFilter] = useState('finished')
  const [searchTerm, setSearchTerm] = useState('')

  // 编辑状态：{ [productId]: { materialId, qty }[] }
  const [editState, setEditState] = useState({})
  // 展开哪个产品
  const [expandedProduct, setExpandedProduct] = useState(null)

  useEffect(() => {
    fetchProfile()
    fetchMaterials()
  }, [])

  useEffect(() => {
    fetchProducts()
    fetchBindings()
  }, [warehouseFilter])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setIsAdmin(data?.role === 'admin')
    }
  }

  const fetchProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, spec, prize_type, warehouse')
      .eq('warehouse', warehouseFilter)
      .order('name', { ascending: true })
    setProducts(data || [])
    setLoading(false)
  }

  const fetchMaterials = async () => {
    const { data } = await supabase
      .from('materials')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })
    setMaterials(data || [])
  }

  const fetchBindings = async () => {
    const { data } = await supabase
      .from('product_material')
      .select('id, product_id, material_id, quantity_per_unit')
    setBindings(data || [])
  }

  // 获取某产品的当前绑定
  const getProductBindings = (productId) => {
    return bindings.filter(b => b.product_id === productId)
  }

  // 打开某产品的编辑面板
  const openEdit = (product) => {
    if (expandedProduct === product.id) {
      setExpandedProduct(null)
      return
    }
    const current = getProductBindings(product.id).map(b => ({
      _key: b.id,
      bindingId: b.id,
      materialId: b.material_id,
      qty: String(b.quantity_per_unit),
    }))
    setEditState(prev => ({ ...prev, [product.id]: current }))
    setExpandedProduct(product.id)
  }

  const addMaterialRow = (productId) => {
    setEditState(prev => ({
      ...prev,
      [productId]: [
        ...(prev[productId] || []),
        { _key: Date.now(), bindingId: null, materialId: '', qty: '1' }
      ]
    }))
  }

  const removeRow = (productId, key) => {
    setEditState(prev => ({
      ...prev,
      [productId]: prev[productId].filter(r => r._key !== key)
    }))
  }

  const updateRow = (productId, key, field, value) => {
    setEditState(prev => ({
      ...prev,
      [productId]: prev[productId].map(r => r._key === key ? { ...r, [field]: value } : r)
    }))
  }

  const handleSave = async (productId) => {
    setSaving(true)
    const rows = editState[productId] || []

    // 验证
    for (const row of rows) {
      if (!row.materialId) { alert('请选择物料'); setSaving(false); return }
      if (!row.qty || parseFloat(row.qty) <= 0) { alert('每单位消耗量必须大于0'); setSaving(false); return }
    }

    // 检查重复
    const materialIds = rows.map(r => r.materialId)
    if (new Set(materialIds).size !== materialIds.length) {
      alert('同一产品不能重复关联同一物料')
      setSaving(false)
      return
    }

    try {
      // 删除该产品所有旧绑定
      await supabase.from('product_material').delete().eq('product_id', productId)

      // 插入新绑定
      if (rows.length > 0) {
        const { error } = await supabase.from('product_material').insert(
          rows.map(r => ({
            product_id: productId,
            material_id: r.materialId,
            quantity_per_unit: parseFloat(r.qty),
          }))
        )
        if (error) throw error
      }

      await fetchBindings()
      setExpandedProduct(null)
    } catch (err) {
      alert('保存失败：' + err.message)
    }
    setSaving(false)
  }

  const filteredProducts = products.filter(p => {
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return p.name?.toLowerCase().includes(t) || p.spec?.toLowerCase().includes(t) || p.prize_type?.toLowerCase().includes(t)
  })

  const boundCount = new Set(bindings.filter(b => products.some(p => p.id === b.product_id)).map(b => b.product_id)).size

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link href="/materials" className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 hover:text-slate-900 mb-3 transition">
            ← 返回物料仓
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">产品物料关联</h1>
          <p className="text-slate-500">设置每个产品入库时自动扣减的物料及数量</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/materials" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            物料仓
          </Link>
        </div>
      </div>

      {/* 统计 + 筛选 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center mb-4">
        <div className="flex gap-2">
          <div className="surface-card px-4 py-2 text-sm">
            <span className="text-slate-500">产品总数</span>
            <span className="ml-2 font-bold text-slate-900">{products.length}</span>
          </div>
          <div className="surface-card px-4 py-2 text-sm">
            <span className="text-slate-500">已关联</span>
            <span className="ml-2 font-bold text-emerald-600">{boundCount}</span>
          </div>
          <div className="surface-card px-4 py-2 text-sm">
            <span className="text-slate-500">未关联</span>
            <span className="ml-2 font-bold text-slate-400">{products.length - boundCount}</span>
          </div>
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setWarehouseFilter('finished')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${warehouseFilter === 'finished' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            成品
          </button>
          <button
            onClick={() => setWarehouseFilter('semi')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${warehouseFilter === 'semi' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            半成品
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索产品名称、规格..."
          className="w-full md:w-96 input-field"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">产品</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">规格 / 奖项</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">关联物料</th>
                {isAdmin && <th className="text-right py-3 px-4 text-sm font-semibold text-slate-700">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const productBindings = getProductBindings(product.id)
                const isExpanded = expandedProduct === product.id
                const rows = editState[product.id] || []

                return (
                  <>
                    <tr
                      key={product.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/50 transition ${isExpanded ? 'bg-slate-50' : ''}`}
                    >
                      <td className="py-3 px-4 font-medium text-slate-900">{product.name}</td>
                      <td className="py-3 px-4 text-slate-500 text-sm">
                        {product.spec || '-'}
                        {product.prize_type && <span className="ml-1 text-slate-400">· {product.prize_type}</span>}
                      </td>
                      <td className="py-3 px-4">
                        {productBindings.length === 0 ? (
                          <span className="text-xs text-slate-400">未关联</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {productBindings.map(b => {
                              const m = materials.find(m => m.id === b.material_id)
                              if (!m) return null
                              const cat = getCategoryInfo(m.category)
                              return (
                                <span key={b.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cat.color}`}>
                                  {m.name}
                                  {b.quantity_per_unit !== 1 && (
                                    <span className="opacity-70">×{b.quantity_per_unit}</span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => openEdit(product)}
                            className="text-sm text-slate-500 hover:text-slate-900 transition"
                          >
                            {isExpanded ? '收起' : '编辑'}
                          </button>
                        </td>
                      )}
                    </tr>

                    {/* 展开编辑区 */}
                    {isExpanded && (
                      <tr key={`${product.id}-edit`} className="border-b border-slate-200">
                        <td colSpan={4} className="px-4 py-4 bg-slate-50">
                          <div className="max-w-2xl">
                            <p className="text-sm font-medium text-slate-700 mb-3">
                              设置 <span className="text-slate-900">{product.name} {product.spec}</span> 入库时自动扣减的物料：
                            </p>

                            {rows.length === 0 ? (
                              <p className="text-sm text-slate-400 mb-3">暂无关联，点击下方添加</p>
                            ) : (
                              <div className="space-y-2 mb-3">
                                {rows.map((row) => (
                                  <div key={row._key} className="flex items-center gap-2">
                                    <select
                                      value={row.materialId}
                                      onChange={(e) => updateRow(product.id, row._key, 'materialId', e.target.value)}
                                      className="flex-1 input-field py-1.5 text-sm"
                                    >
                                      <option value="">-- 选择物料 --</option>
                                      {CATEGORIES.map(cat => {
                                        const catMaterials = materials.filter(m => m.category === cat.value)
                                        if (catMaterials.length === 0) return null
                                        return (
                                          <optgroup key={cat.value} label={cat.label}>
                                            {catMaterials.map(m => (
                                              <option key={m.id} value={m.id}>{m.name}{m.spec ? ` (${m.spec})` : ''}</option>
                                            ))}
                                          </optgroup>
                                        )
                                      })}
                                    </select>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-xs text-slate-500">每件消耗</span>
                                      <input
                                        type="number"
                                        value={row.qty}
                                        onChange={(e) => updateRow(product.id, row._key, 'qty', e.target.value)}
                                        onWheel={(e) => e.target.blur()}
                                        className="w-20 input-field py-1.5 text-sm text-center"
                                        min="0.0001"
                                        step="0.1"
                                      />
                                      <span className="text-xs text-slate-500">个</span>
                                    </div>
                                    <button
                                      onClick={() => removeRow(product.id, row._key)}
                                      className="text-rose-400 hover:text-rose-600 transition text-lg leading-none"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => addMaterialRow(product.id)}
                                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                              >
                                + 添加物料
                              </button>
                              <button
                                onClick={() => handleSave(product.id)}
                                disabled={saving}
                                className="btn-primary py-1.5 text-sm"
                              >
                                {saving ? '保存中...' : '保存'}
                              </button>
                              <button
                                onClick={() => setExpandedProduct(null)}
                                className="btn-ghost py-1.5 text-sm"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="p-12 text-center text-slate-500">
              {searchTerm ? `未找到包含 "${searchTerm}" 的产品` : '暂无产品'}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
