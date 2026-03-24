'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const CATEGORIES = [
  { value: 'glass_bottle', label: '玻璃瓶', color: 'bg-sky-100 text-sky-700' },
  { value: 'plastic_bottle', label: '胶瓶', color: 'bg-violet-100 text-violet-700' },
  { value: 'cap', label: '盖子', color: 'bg-amber-100 text-amber-700' },
]

const getCategoryInfo = (value) => CATEGORIES.find(c => c.value === value) || { label: value, color: 'bg-slate-100 text-slate-600' }

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')
  const [formData, setFormData] = useState({
    name: '',
    category: 'glass_bottle',
    spec: '',
    warning_qty: 100,
    remark: '',
    init_quantity: '',
    init_total_amount: '',
    init_unit: '个',
    init_supplier: '',
    init_date: new Date().toISOString().split('T')[0],
  })
  const [submitting, setSubmitting] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ show: false, material: null })
  const [stockModal, setStockModal] = useState({ show: false, material: null, type: 'in' })
  const [stockForm, setStockForm] = useState({
    quantity: '',
    stock_date: new Date().toISOString().split('T')[0],
    total_amount: '',
    unit: '个',
    supplier: '',
    remark: '',
  })
  const [stockSubmitting, setStockSubmitting] = useState(false)

  useEffect(() => {
    fetchProfile()
    fetchMaterials()
  }, [])

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

  const fetchMaterials = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('category', { ascending: true })
      .order('quantity', { ascending: false })
      .order('name', { ascending: true })

    if (!error) {
      setMaterials(data || [])
    }
    setLoading(false)
  }

  const emptyFormData = () => ({
    name: '', category: 'glass_bottle', spec: '', warning_qty: 100, remark: '',
    init_quantity: '', init_total_amount: '', init_unit: '个',
    init_supplier: '', init_date: new Date().toISOString().split('T')[0],
  })

  const openModal = (material = null) => {
    if (material) {
      setEditingMaterial(material)
      setFormData({
        name: material.name,
        category: material.category,
        spec: material.spec || '',
        warning_qty: material.warning_qty,
        remark: material.remark || '',
        init_quantity: '', init_total_amount: '', init_unit: '个',
        init_supplier: '', init_date: new Date().toISOString().split('T')[0],
      })
    } else {
      setEditingMaterial(null)
      setFormData(emptyFormData())
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingMaterial(null)
    setFormData(emptyFormData())
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    if (editingMaterial) {
      const { error } = await supabase
        .from('materials')
        .update({
          name: formData.name,
          category: formData.category,
          spec: formData.spec,
          warning_qty: formData.warning_qty,
          remark: formData.remark,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMaterial.id)

      if (!error) {
        fetchMaterials()
        closeModal()
      } else {
        alert('保存失败：' + error.message)
      }
    } else {
      const initQty = parseInt(formData.init_quantity) || 0
      const initTotalAmt = parseFloat(formData.init_total_amount) || 0
      const initPrice = initQty > 0 ? initTotalAmt / initQty : 0

      const { data: { session } } = await supabase.auth.getSession()

      const { data: inserted, error } = await supabase
        .from('materials')
        .insert({
          name: formData.name,
          category: formData.category,
          spec: formData.spec,
          warning_qty: formData.warning_qty,
          remark: formData.remark,
          quantity: initQty,
        })
        .select()
        .single()

      if (error) {
        alert('添加失败：' + error.message)
        setSubmitting(false)
        return
      }

      // 有初始入库量，同步写入流水和采购成本
      if (initQty > 0) {
        await supabase.from('material_records').insert({
          material_id: inserted.id,
          type: 'in',
          quantity: initQty,
          stock_date: formData.init_date,
          operator_id: session?.user?.id,
          source_type: 'manual',
          remark: '添加物料初始入库',
        })

        if (initTotalAmt > 0) {
          await supabase.from('purchase_records').insert({
            category: 'material',
            item_id: inserted.id,
            item_name: formData.name,
            spec: formData.spec || null,
            quantity: initQty,
            unit: formData.init_unit.trim() || '个',
            unit_price: initPrice,
            supplier: formData.init_supplier.trim() || null,
            purchase_date: formData.init_date,
            remark: '添加物料初始采购',
            operator_id: session?.user?.id,
          })
        }
      }

      fetchMaterials()
      closeModal()
    }

    setSubmitting(false)
  }

  const openDeleteModal = (material) => {
    setDeleteModal({ show: true, material })
  }

  const handleDelete = async () => {
    if (!deleteModal.material) return

    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', deleteModal.material.id)

    if (!error) {
      fetchMaterials()
    } else {
      alert('删除失败：' + error.message)
    }
    setDeleteModal({ show: false, material: null })
  }

  const openStockModal = (material, type) => {
    setStockModal({ show: true, material, type })
    setStockForm({
      quantity: '',
      stock_date: new Date().toISOString().split('T')[0],
      total_amount: '',
      unit: '个',
      supplier: '',
      remark: '',
    })
  }

  const closeStockModal = () => {
    setStockModal({ show: false, material: null, type: 'in' })
  }

  const handleStockSubmit = async (e) => {
    e.preventDefault()
    if (!stockForm.quantity || parseInt(stockForm.quantity) <= 0) {
      alert('请输入有效数量')
      return
    }
    setStockSubmitting(true)

    const { data: { session } } = await supabase.auth.getSession()
    const { material, type } = stockModal
    const qty = parseInt(stockForm.quantity)

    const { error: recordError } = await supabase
      .from('material_records')
      .insert({
        material_id: material.id,
        type,
        quantity: qty,
        stock_date: stockForm.stock_date,
        operator_id: session?.user?.id,
        source_type: 'manual',
        remark: stockForm.remark || (type === 'in' ? '手动入库' : '手动出库'),
      })

    if (recordError) {
      alert('操作失败：' + recordError.message)
      setStockSubmitting(false)
      return
    }

    const newQuantity = type === 'in' ? material.quantity + qty : material.quantity - qty
    const { error: updateError } = await supabase
      .from('materials')
      .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
      .eq('id', material.id)

    if (updateError) {
      alert('更新库存失败：' + updateError.message)
    } else {
      // 进仓时若填写了金额和单位，同步写入采购成本
      if (type === 'in' && stockForm.total_amount && parseFloat(stockForm.total_amount) > 0 && (stockForm.unit || '个')) {
        const totalAmt = parseFloat(stockForm.total_amount)
        const unitPrice = totalAmt / qty
        await supabase.from('purchase_records').insert({
          category: 'material',
          item_id: material.id,
          item_name: material.name,
          spec: material.spec || null,
          quantity: qty,
          unit: stockForm.unit.trim() || '个',
          unit_price: unitPrice,
          supplier: stockForm.supplier.trim() || null,
          purchase_date: stockForm.stock_date,
          remark: stockForm.remark ? `进仓：${stockForm.remark}` : '物料进仓',
          operator_id: session?.user?.id,
        })
      }
      fetchMaterials()
      closeStockModal()
    }
    setStockSubmitting(false)
  }

  const filteredMaterials = materials.filter(material => {
    if (filterCategory !== 'all' && material.category !== filterCategory) return false
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      material.name?.toLowerCase().includes(term) ||
      material.spec?.toLowerCase().includes(term) ||
      getCategoryInfo(material.category).label.includes(term)
    )
  })

  // 分组：缺货、预警、正常
  const grouped = filteredMaterials.reduce(
    (acc, material) => {
      if (material.quantity <= 0) {
        acc.out.push(material)
      } else if (material.quantity <= material.warning_qty) {
        acc.low.push(material)
      } else {
        acc.ok.push(material)
      }
      return acc
    },
    { low: [], out: [], ok: [] }
  )

  const groups = [
    {
      key: 'out',
      title: `缺货 · ${grouped.out.length}`,
      tone: 'border-rose-200 bg-rose-50/70',
      badge: 'bg-rose-100 text-rose-700',
    },
    {
      key: 'low',
      title: `库存预警 · ${grouped.low.length}`,
      tone: 'border-amber-200 bg-amber-50/70',
      badge: 'bg-amber-100 text-amber-700',
    },
    {
      key: 'ok',
      title: `库存充足 · ${grouped.ok.length}`,
      tone: 'border-emerald-200 bg-emerald-50/70',
      badge: 'bg-emerald-100 text-emerald-700',
    },
  ]

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">物料仓</h1>
          <p className="text-slate-500">管理玻璃瓶、胶瓶、盖子等包装物料库存</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/materials/binding" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            产品关联
          </Link>
          <Link href="/materials/records" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            出入库记录
          </Link>
          <Link href="/materials/inventory" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            盘点
          </Link>
          {isAdmin && (
            <button
              onClick={() => openModal()}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition shadow-sm"
            >
              添加物料
            </button>
          )}
        </div>
      </div>

      {/* 搜索框 + 分类筛选 */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索物料名称、规格..."
          className="w-full md:w-96 input-field"
        />
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
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(filterCategory === cat.value ? 'all' : cat.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                filterCategory === cat.value
                  ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
              }`}
            >
              {cat.label}
            </button>
          ))}
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-600 transition"
            >
              × 清除
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-slate-500">
            {searchTerm ? `未找到包含 "${searchTerm}" 的物料` : '暂无物料，点击上方按钮添加'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const items = grouped[group.key]
            if (items.length === 0) return null
            return (
              <div key={group.key} className={`rounded-2xl border ${group.tone} p-4 md:p-5`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">{group.title}</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((material) => {
                    const catInfo = getCategoryInfo(material.category)
                    return (
                      <div
                        key={material.id}
                        className="surface-card hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
                      >
                        {/* ── 顶部：名称 + 规格 + 状态 ── */}
                        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-base font-bold text-slate-900 leading-snug">{material.name}</p>
                              <p className="text-xl font-extrabold text-slate-600 tracking-tight leading-tight mt-0.5">
                                {material.spec || <span className="text-base font-normal text-slate-400">无规格</span>}
                              </p>
                            </div>
                            <div className="shrink-0 mt-1 flex flex-col items-end gap-1">
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${group.badge}`}>
                                {group.key === 'low' ? '预警' : group.key === 'out' ? '缺货' : '正常'}
                              </span>
                              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${catInfo.color}`}>
                                {catInfo.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* ── 中部：库存数量居中 ── */}
                        <div className="flex flex-col items-center justify-center py-5">
                          <p className={`text-5xl font-black tabular-nums leading-none ${material.quantity < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                            {material.quantity.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-400 font-medium mt-2">当前库存</p>
                        </div>

                        {/* ── 底部：预警值 + 操作 ── */}
                        <div className="px-4 pb-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">预警 <span className="font-semibold text-slate-600">{material.warning_qty}</span></span>
                            <span className="text-slate-200">|</span>
                            <button
                              onClick={() => openStockModal(material, 'in')}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                            >
                              进仓
                            </button>
                            <button
                              onClick={() => openStockModal(material, 'out')}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition"
                            >
                              出仓
                            </button>
                            <Link
                              href={`/materials/records?material_id=${material.id}`}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                            >
                              流水
                            </Link>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-2 text-xs">
                              <button
                                onClick={() => openModal(material)}
                                className="text-slate-500 hover:text-slate-900 transition"
                              >
                                编辑
                              </button>
                              <button
                                onClick={() => openDeleteModal(material)}
                                className="text-rose-500 hover:text-rose-700 transition"
                              >
                                删除
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{editingMaterial ? '编辑物料' : '添加物料'}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{editingMaterial ? '修改物料信息' : '填写物料信息，可同步录入初始采购成本'}</p>
                </div>
                <button type="button" onClick={closeModal} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition text-lg leading-none">×</button>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">

                {/* 左列：物料基本信息 */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">物料信息</p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">物料分类</label>
                    <div className="flex gap-2">
                      {CATEGORIES.map((cat) => (
                        <label
                          key={cat.value}
                          className={`flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-xl border-2 cursor-pointer transition text-sm font-medium ${
                            formData.category === cat.value
                              ? 'border-slate-700 bg-slate-50 text-slate-900'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          <input type="radio" name="category" value={cat.value} checked={formData.category === cat.value} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="hidden" />
                          {cat.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">物料名称 <span className="text-rose-400">*</span></label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field" placeholder="例如：百越鸡汁玻璃瓶400ml" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">规格</label>
                      <input type="text" value={formData.spec} onChange={(e) => setFormData({ ...formData, spec: e.target.value })} className="input-field" placeholder="例如：400ml" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">库存预警值 <span className="text-rose-400">*</span></label>
                      <input type="number" value={formData.warning_qty} onChange={(e) => setFormData({ ...formData, warning_qty: parseInt(e.target.value) || 0 })} onWheel={(e) => e.target.blur()} className="input-field" min="0" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                    <input type="text" value={formData.remark} onChange={(e) => setFormData({ ...formData, remark: e.target.value })} className="input-field" placeholder="可选" />
                  </div>
                </div>

                {/* 右列：初始采购成本（仅新增时显示） */}
                {!editingMaterial && (
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">初始采购成本（可选）</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">初始数量</label>
                        <input type="number" value={formData.init_quantity} onChange={(e) => setFormData({ ...formData, init_quantity: e.target.value })} onWheel={(e) => e.target.blur()} className="input-field" min="0" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">单位</label>
                        <input type="text" value={formData.init_unit} onChange={(e) => setFormData({ ...formData, init_unit: e.target.value })} className="input-field" placeholder="个" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">总价 (¥)</label>
                      <input type="number" step="0.01" value={formData.init_total_amount} onChange={(e) => setFormData({ ...formData, init_total_amount: e.target.value })} onWheel={(e) => e.target.blur()} className="input-field" min="0" placeholder="0.00" />
                    </div>
                    {/* 自动计算单价 */}
                    {(() => {
                      const up = formData.init_quantity && formData.init_total_amount && parseInt(formData.init_quantity) > 0
                        ? (parseFloat(formData.init_total_amount) / parseInt(formData.init_quantity)).toFixed(4)
                        : null
                      return (
                        <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${up ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'}`}>
                          <span className={`text-sm ${up ? 'text-slate-300' : 'text-slate-400'}`}>自动计算单价</span>
                          <span className={`text-xl font-black tabular-nums ${up ? 'text-white' : 'text-slate-300'}`}>{up ? `¥${up}` : '—'}</span>
                        </div>
                      )
                    })()}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">供应商</label>
                        <input type="text" value={formData.init_supplier} onChange={(e) => setFormData({ ...formData, init_supplier: e.target.value })} className="input-field" placeholder="供应商名称" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">采购日期</label>
                        <input type="date" value={formData.init_date} onChange={(e) => setFormData({ ...formData, init_date: e.target.value })} className="input-field" />
                      </div>
                    </div>
                    {formData.init_quantity > 0 && (
                      <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">将自动创建入库记录并同步到「采购成本」</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-5 pb-1">
                <button type="button" onClick={closeModal} className="btn-ghost flex-1 py-3 border border-slate-200 rounded-xl">取消</button>
                <button type="submit" disabled={submitting} className="btn-primary flex-1 py-3">{submitting ? '保存中...' : editingMaterial ? '保存修改' : '确认添加'}</button>
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
              确定要删除物料 <span className="font-semibold">{deleteModal.material?.name}</span> 吗？
            </p>
            <p className="text-rose-500 text-sm mb-6">删除后相关流水记录也会被删除。</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModal({ show: false, material: null })}
                className="btn-ghost"
              >
                取消
              </button>
              <button onClick={handleDelete} className="btn-danger">删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 进仓/出仓弹窗 */}
      {stockModal.show && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* 头部 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${stockModal.type === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {stockModal.type === 'in' ? '进仓' : '出仓'}
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">{stockModal.material?.name}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {stockModal.material?.spec && `规格：${stockModal.material.spec} · `}当前库存 {stockModal.material?.quantity}
                  </p>
                </div>
                <button type="button" onClick={closeStockModal} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition text-lg leading-none">×</button>
              </div>
            </div>

            <form onSubmit={handleStockSubmit} className="px-6 py-5">
              {stockModal.type === 'in' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                  {/* 左列：数量与价格 */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">数量与价格</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">数量 <span className="text-rose-400">*</span></label>
                        <input
                          type="number"
                          value={stockForm.quantity}
                          onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                          onWheel={(e) => e.target.blur()}
                          className="input-field"
                          min="1"
                          placeholder="0"
                          required
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">单位</label>
                        <input
                          type="text"
                          value={stockForm.unit}
                          onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })}
                          className="input-field"
                          placeholder="个"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">总价 (¥)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={stockForm.total_amount}
                        onChange={(e) => setStockForm({ ...stockForm, total_amount: e.target.value })}
                        onWheel={(e) => e.target.blur()}
                        className="input-field text-lg font-semibold"
                        min="0"
                        placeholder="0.00"
                      />
                    </div>
                    {/* 自动计算单价 */}
                    {(() => {
                      const up = stockForm.quantity && stockForm.total_amount && parseInt(stockForm.quantity) > 0
                        ? (parseFloat(stockForm.total_amount) / parseInt(stockForm.quantity)).toFixed(4)
                        : null
                      return (
                        <div className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${up ? 'bg-slate-900 border-slate-900' : 'bg-slate-50 border-slate-200'}`}>
                          <span className={`text-sm ${up ? 'text-slate-300' : 'text-slate-400'}`}>自动计算单价</span>
                          <span className={`text-xl font-black tabular-nums ${up ? 'text-white' : 'text-slate-300'}`}>{up ? `¥${up}` : '—'}</span>
                        </div>
                      )
                    })()}
                  </div>

                  {/* 右列：采购信息 */}
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">采购信息</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">供应商</label>
                      <input
                        type="text"
                        value={stockForm.supplier}
                        onChange={(e) => setStockForm({ ...stockForm, supplier: e.target.value })}
                        className="input-field"
                        placeholder="供应商名称"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">采购日期 <span className="text-rose-400">*</span></label>
                      <input
                        type="date"
                        value={stockForm.stock_date}
                        onChange={(e) => setStockForm({ ...stockForm, stock_date: e.target.value })}
                        className="input-field"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                      <input
                        type="text"
                        value={stockForm.remark}
                        onChange={(e) => setStockForm({ ...stockForm, remark: e.target.value })}
                        className="input-field"
                        placeholder="可选"
                      />
                    </div>
                    {stockForm.total_amount && parseFloat(stockForm.total_amount) > 0 && (
                      <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">此次进仓记录将自动同步到「采购成本」</p>
                    )}
                  </div>
                </div>
              ) : (
                /* 出仓：简单表单 */
                <div className="rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4 space-y-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">出仓信息</p>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">数量 <span className="text-rose-400">*</span></label>
                    <input
                      type="number"
                      value={stockForm.quantity}
                      onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })}
                      onWheel={(e) => e.target.blur()}
                      className="input-field"
                      min="1"
                      placeholder="0"
                      required
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">日期 <span className="text-rose-400">*</span></label>
                      <input
                        type="date"
                        value={stockForm.stock_date}
                        onChange={(e) => setStockForm({ ...stockForm, stock_date: e.target.value })}
                        className="input-field"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">备注</label>
                      <input
                        type="text"
                        value={stockForm.remark}
                        onChange={(e) => setStockForm({ ...stockForm, remark: e.target.value })}
                        className="input-field"
                        placeholder="可选"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1 pb-2">
                <button type="button" onClick={closeStockModal} className="btn-ghost flex-1 py-3 border border-slate-200 rounded-xl">取消</button>
                <button
                  type="submit"
                  disabled={stockSubmitting}
                  className={`flex-1 py-3 ${stockModal.type === 'in' ? 'btn-primary' : 'btn-danger'}`}
                >
                  {stockSubmitting ? '提交中...' : stockModal.type === 'in' ? '确认进仓' : '确认出仓'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
