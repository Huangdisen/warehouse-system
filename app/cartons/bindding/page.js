'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function CartonBindingPage() {
  const [products, setProducts] = useState([])
  const [cartons, setCartons] = useState([])
  const [bindings, setBindings] = useState({}) // { product_id: carton_id }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null) // 正在保存的 product_id
  const [profile, setProfile] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [warehouse, setWarehouse] = useState('finished')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all' | 'bindded' | 'unbindded'
  const [openDropdownId, setOpenDropdownId] = useState(null)
  const [dropdownSearch, setDropdownSearch] = useState('')
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 280 })
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (openDropdownId && searchInputRef.current) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 30)
      return () => clearTimeout(timer)
    }
  }, [openDropdownId])

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdownId(null)
        setDropdownSearch('')
      }
    }
    const handleScroll = () => { setOpenDropdownId(null); setDropdownSearch('') }
    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  useEffect(() => {
    fetchProfile()
  }, [])

  useEffect(() => {
    fetchData()
  }, [warehouse])

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

  const fetchData = async () => {
    setLoading(true)

    // 获取产品
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('warehouse', warehouse)
      .order('name', { ascending: true })

    // 获取纸箱
    const { data: cartonsData } = await supabase
      .from('cartons')
      .select('*')
      .order('name', { ascending: true })

    // 获取现有关联
    const { data: bindingsData } = await supabase
      .from('product_carton')
      .select('product_id, carton_id')

    const bindingsMap = {}
    if (bindingsData) {
      bindingsData.forEach(b => {
        bindingsMap[b.product_id] = b.carton_id
      })
    }

    setProducts(productsData || [])
    setCartons(cartonsData || [])
    setBindings(bindingsMap)
    setLoading(false)
  }

  const handleBindingChange = async (productId, cartonId) => {
    if (!isAdmin) {
      alert('只有管理员可以修改关联')
      return
    }

    setSaving(productId)

    const currentBinding = bindings[productId]

    if (cartonId === '') {
      // 取消关联
      if (currentBinding) {
        const { error } = await supabase
          .from('product_carton')
          .delete()
          .eq('product_id', productId)

        if (!error) {
          setBindings(prev => {
            const next = { ...prev }
            delete next[productId]
            return next
          })
        } else {
          alert('取消关联失败：' + error.message)
        }
      }
    } else {
      // 新增或更新关联
      if (currentBinding) {
        // 更新
        const { error } = await supabase
          .from('product_carton')
          .update({ carton_id: cartonId })
          .eq('product_id', productId)

        if (!error) {
          setBindings(prev => ({ ...prev, [productId]: cartonId }))
        } else {
          alert('更新关联失败：' + error.message)
        }
      } else {
        // 新增
        const { error } = await supabase
          .from('product_carton')
          .insert({ product_id: productId, carton_id: cartonId })

        if (!error) {
          setBindings(prev => ({ ...prev, [productId]: cartonId }))
        } else {
          alert('设置关联失败：' + error.message)
        }
      }
    }

    setSaving(null)
  }

  const openCartonDropdown = (productId, e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    })
    setOpenDropdownId(productId)
    setDropdownSearch('')
  }

  const prizeBadgeClass = (prizeType) => {
    const text = (prizeType || '').trim()
    const map = {
      '盖奖': 'bg-sky-100 text-sky-700',
      '标奖': 'bg-emerald-100 text-emerald-700',
      '无奖': 'bg-slate-200 text-slate-700',
      '圆奖': 'bg-amber-100 text-amber-700',
      '垫片奖': 'bg-violet-100 text-violet-700',
      '定制标奖': 'bg-rose-100 text-rose-700',
    }
    return map[text] || 'bg-indigo-100 text-indigo-700'
  }

  const filteredProducts = products.filter(product => {
    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const match = (
        product.name?.toLowerCase().includes(term) ||
        product.spec?.toLowerCase().includes(term) ||
        product.prize_type?.toLowerCase().includes(term)
      )
      if (!match) return false
    }

    // 关联状态过滤
    if (filterType === 'bindded') {
      return !!bindings[product.id]
    } else if (filterType === 'unbindded') {
      return !bindings[product.id]
    }

    return true
  })

  const stats = {
    total: products.length,
    bindded: products.filter(p => bindings[p.id]).length,
    unbindded: products.filter(p => !bindings[p.id]).length,
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link href="/cartons" className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 hover:text-slate-900 mb-3 transition">
            ← 返回纸箱管理
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">产品关联纸箱</h1>
          <p className="text-slate-500">设置产品与纸箱的对应关系，生产入库时自动扣减纸箱</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cartons" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            纸箱管理
          </Link>
          <Link href="/cartons/records" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            出入库记录
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500">总产品数</p>
          <p className="text-2xl font-semibold text-slate-900">{stats.total}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500">已关联</p>
          <p className="text-2xl font-semibold text-emerald-600">{stats.bindded}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500">未关联</p>
          <p className="text-2xl font-semibold text-amber-600">{stats.unbindded}</p>
        </div>
      </div>

      {/* 仓库切换 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setWarehouse('finished')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'finished'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          成品仓
        </button>
        <button
          onClick={() => setWarehouse('semi')}
          className={`px-4 py-2 rounded-xl font-medium transition ${
            warehouse === 'semi'
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white/70 text-slate-600 border border-slate-200 hover:bg-white'
          }`}
        >
          半成品仓
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索产品名称、规格、奖项..."
          className="w-full md:w-80 input-field"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterType === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            全部
          </button>
          <button
            onClick={() => setFilterType('bindded')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterType === 'bindded'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            已关联
          </button>
          <button
            onClick={() => setFilterType('unbindded')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterType === 'unbindded'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            未关联
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-slate-500">
            {searchTerm ? `未找到包含 "${searchTerm}" 的产品` : '暂无产品'}
          </p>
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">产品名称</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">规格</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">奖项</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">使用纸箱</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const currentCartonId = bindings[product.id]
                  const currentCarton = cartons.find(c => c.id === currentCartonId)
                  const isSaving = saving === product.id

                  return (
                    <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-900">{product.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-slate-600">{product.spec}</span>
                      </td>
                      <td className="py-3 px-4">
                        {product.prize_type ? (
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${prizeBadgeClass(product.prize_type)}`}>
                            {product.prize_type}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={(e) => isAdmin && !isSaving && openCartonDropdown(product.id, e)}
                          disabled={!isAdmin || isSaving}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-sm transition
                            ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-300'}
                            ${openDropdownId === product.id ? 'border-slate-400 ring-2 ring-slate-200' : 'border-slate-200'}
                            ${currentCarton ? 'text-slate-900 bg-white' : 'text-slate-400 bg-white'}`}
                        >
                          <span className="truncate text-left">
                            {currentCarton ? currentCarton.name : '-- 选择纸箱 --'}
                          </span>
                          <svg className={`w-4 h-4 flex-shrink-0 text-slate-400 transition-transform ${openDropdownId === product.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        {isSaving ? (
                          <span className="text-xs text-blue-600">保存中...</span>
                        ) : currentCartonId ? (
                          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                            已关联
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                            未关联
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 可搜索纸箱下拉（fixed 定位，不受 overflow 影响） */}
      {openDropdownId && (
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100">
            <input
              type="text"
              value={dropdownSearch}
              onChange={(e) => setDropdownSearch(e.target.value)}
              placeholder="搜索纸箱..."
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300"
              ref={searchInputRef}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { handleBindingChange(openDropdownId, ''); setOpenDropdownId(null) }}
              className={`w-full text-left px-3 py-2 text-sm transition hover:bg-slate-50 ${!bindings[openDropdownId] ? 'font-semibold text-slate-900 bg-slate-50' : 'text-slate-400'}`}
            >
              -- 不使用纸箱 --
            </button>
            {cartons
              .filter(c => !dropdownSearch || c.name.toLowerCase().includes(dropdownSearch.toLowerCase()) || (c.spec || '').toLowerCase().includes(dropdownSearch.toLowerCase()))
              .map(carton => (
                <button
                  key={carton.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { handleBindingChange(openDropdownId, carton.id); setOpenDropdownId(null) }}
                  className={`w-full text-left px-3 py-2 text-sm transition hover:bg-slate-50 flex items-center justify-between gap-2
                    ${bindings[openDropdownId] === carton.id ? 'font-semibold text-slate-900 bg-slate-50' : 'text-slate-700'}`}
                >
                  <span className="truncate">{carton.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{carton.spec} · {carton.quantity}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 提示信息 */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">使用说明</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 为产品选择对应的纸箱后，生产入库时会自动扣减该纸箱库存</li>
          <li>• 多个产品可以共用同一种纸箱（如不同奖项的同款产品）</li>
          <li>• 未关联纸箱的产品入库时不会触发纸箱扣减</li>
        </ul>
      </div>
    </DashboardLayout>
  )
}
