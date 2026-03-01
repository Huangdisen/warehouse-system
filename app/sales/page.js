'use client'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const PAGE_SIZE = 200

// 财年：每年3月1日～次年2月最后一天
const now = new Date()
const CURRENT_FISCAL_YEAR = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1

function fiscalRange(year) {
  const lastDay = new Date(year + 1, 2, 0).getDate()
  return { start_date: `${year}-03-01`, end_date: `${year + 1}-02-${String(lastDay).padStart(2, '0')}` }
}

// 财年季度：Q1=03-05, Q2=06-08, Q3=09-11, Q4=12-次年02
function quarterRange(year, q) {
  if (q === 0) return { start_date: `${year}-03-01`, end_date: `${year}-05-31` }
  if (q === 1) return { start_date: `${year}-06-01`, end_date: `${year}-08-31` }
  if (q === 2) return { start_date: `${year}-09-01`, end_date: `${year}-11-30` }
  const lastDay = new Date(year + 1, 2, 0).getDate()
  return { start_date: `${year}-12-01`, end_date: `${year + 1}-02-${String(lastDay).padStart(2, '0')}` }
}

const formatDate = (d) => (d ? d.slice(0, 10) : '-')
const formatNumber = (n) => (n == null ? '-' : Number(n).toLocaleString('zh-CN'))
const formatMoney = (n) => {
  const num = Number(n)
  if (!num) return '-'
  return '¥' + num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const EMPTY_FORM = {
  sale_date: new Date().toISOString().slice(0, 10),
  province: '', area: '', product_code: '', product_name: '',
  product_spec: '', unit: '件', unit_price: '', total_price: '',
  inbound: '', outbound: '', customer: '', remark: '', contact: '',
}

// ── 搜索下拉组件（Portal 渲染，不受父层 overflow 限制）──
function SearchDropdown({ value, onChange, options, placeholder, className = '' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(value)
  const [dropStyle, setDropStyle] = useState({})
  const inputRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => { setSearch(value) }, [value])

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // 打开时计算下拉位置
  const handleOpen = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      })
    }
    setOpen(true)
  }

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options

  const handleSelect = (val) => { setSearch(val); onChange(val); setOpen(false) }
  const handleClear = () => { setSearch(''); onChange(''); setOpen(false) }

  const dropdown = open && filtered.length > 0 && typeof document !== 'undefined'
    ? createPortal(
        <ul style={dropStyle} className="max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl text-sm">
          {filtered.map((opt) => (
            <li key={opt}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(opt) }}
                className={`w-full text-left px-3 py-2 hover:bg-slate-50 transition truncate ${
                  opt === value ? 'font-medium text-slate-900' : 'text-slate-700'
                }`}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>,
        document.body
      )
    : null

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); handleOpen() }}
          onFocus={handleOpen}
          placeholder={placeholder}
          className="input-field pr-8"
        />
        {search ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
          >×</button>
        ) : (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none">▼</span>
        )}
      </div>
      {dropdown}
    </div>
  )
}

// ── 主页面 ──────────────────────────────────────────────
export default function SalesPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const [stats, setStats] = useState({ total_inbound: 0, total_outbound: 0, total_revenue: 0, total_count: 0 })
  const [chartData, setChartData] = useState([])
  const [drillProvince, setDrillProvince] = useState(null)
  const [customerChartData, setCustomerChartData] = useState([])
  const [drillCustomer, setDrillCustomer] = useState(null)
  const [productChartData, setProductChartData] = useState([])
  const [provinces, setProvinces] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)))
    }
  }
  const clearSelection = () => setSelectedIds(new Set())

  const [filters, setFilters] = useState({
    ...fiscalRange(CURRENT_FISCAL_YEAR),
    province: '', product_name: '', customer: '', type: 'out',
  })
  const [quickYear, setQuickYear] = useState(String(CURRENT_FISCAL_YEAR))
  const [quickQuarter, setQuickQuarter] = useState(null)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importInputRef = useRef(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null))
    fetchProvinces()
    fetchProducts()
    loadAll(filters)
  }, [])

  // 省份变化时拉取对应客户列表
  useEffect(() => {
    fetchCustomers(filters.province || null)
  }, [filters.province])

  const rpcParams = (f) => ({
    p_start_date: f.start_date || null,
    p_end_date: f.end_date || null,
    p_province: f.province || null,
    p_product_name: f.product_name || null,
    p_customer: f.customer || null,
    p_type: f.type || null,
  })

  const fetchProvinces = async () => {
    const { data } = await supabase.rpc('get_sales_provinces')
    setProvinces((data || []).map((r) => r.province).filter(Boolean))
  }

  const fetchProducts = async () => {
    const { data } = await supabase.rpc('get_sales_products')
    setProducts((data || []).map((r) => r.product_name).filter(Boolean))
  }

  const fetchCustomers = async (province) => {
    const { data } = await supabase.rpc('get_sales_customers', {
      p_province: province || null,
    })
    setCustomers((data || []).map((r) => r.customer).filter(Boolean))
  }

  const fetchStats = async (f) => {
    const { data } = await supabase.rpc('get_sales_stats', rpcParams(f))
    setStats(data || { total_inbound: 0, total_outbound: 0, total_revenue: 0, total_count: 0 })
  }

  const fetchChart = async (f) => {
    const { data } = await supabase.rpc('get_sales_by_province', rpcParams(f))
    setChartData(data || [])
    setDrillProvince(null)
    setCustomerChartData([])
    setDrillCustomer(null)
    setProductChartData([])
  }

  const drillIntoProvince = async (province) => {
    setDrillProvince(province)
    setDrillCustomer(null)
    setProductChartData([])
    const { data } = await supabase.rpc('get_sales_by_customer', {
      p_start_date: filters.start_date || null,
      p_end_date: filters.end_date || null,
      p_province: province,
      p_product_name: filters.product_name || null,
      p_type: filters.type || null,
    })
    setCustomerChartData(data || [])
  }

  const drillIntoCustomer = async (customer) => {
    setDrillCustomer(customer)
    const { data } = await supabase.rpc('get_sales_by_product', {
      p_start_date: filters.start_date || null,
      p_end_date: filters.end_date || null,
      p_province: drillProvince || null,
      p_customer: customer,
      p_type: filters.type || null,
    })
    setProductChartData(data || [])
  }

  const fetchRecords = async (f, newOffset = 0) => {
    if (newOffset === 0) setLoading(true)
    else setLoadingMore(true)

    let query = supabase
      .from('sales_records').select('*')
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(newOffset, newOffset + PAGE_SIZE - 1)

    if (f.start_date) query = query.gte('sale_date', f.start_date)
    if (f.end_date) query = query.lte('sale_date', f.end_date)
    if (f.province) query = query.eq('province', f.province)
    if (f.product_name) query = query.ilike('product_name', `%${f.product_name}%`)
    if (f.customer) query = query.ilike('customer', `%${f.customer}%`)
    if (f.type === 'in') query = query.gt('inbound', 0)
    if (f.type === 'out') query = query.gt('outbound', 0)

    const { data } = await query
    const rows = data || []
    if (newOffset === 0) setRecords(rows)
    else setRecords((prev) => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    setOffset(newOffset + rows.length)

    if (newOffset === 0) setLoading(false)
    else setLoadingMore(false)
  }

  const loadAll = (f) => {
    fetchStats(f)
    fetchChart(f)
    fetchRecords(f, 0)
  }

  const applyYear = (year) => {
    const next = { ...filters, ...fiscalRange(year) }
    setFilters(next)
    setQuickQuarter(null)
    loadAll(next)
  }

  const applyQuarter = (q) => {
    const year = parseInt(quickYear) || CURRENT_FISCAL_YEAR
    const next = { ...filters, ...quarterRange(year, q) }
    setFilters(next)
    setQuickQuarter(q)
    loadAll(next)
  }

  const handleProvinceChange = (val) => {
    // 省份变化时清空客户筛选
    const next = { ...filters, province: val, customer: '' }
    setFilters(next)
  }

  const handleFilter = (e) => { e.preventDefault(); loadAll(filters) }

  const clearFilters = () => {
    const next = {
      ...fiscalRange(CURRENT_FISCAL_YEAR),
      province: '', product_name: '', customer: '', type: 'out',
    }
    setFilters(next)
    setQuickYear(String(CURRENT_FISCAL_YEAR))
    loadAll(next)
  }

  const handleLoadMore = () => fetchRecords(filters, offset)

  // ── 新增 ──
  const openModal = () => { setForm(EMPTY_FORM); setShowModal(true) }
  const handleFormChange = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.sale_date) return alert('请填写日期')
    if (!form.product_name) return alert('请填写产品名称')
    const inbound = parseInt(form.inbound) || 0
    const outbound = parseInt(form.outbound) || 0
    if (inbound === 0 && outbound === 0) return alert('进货或出货数量至少填写一项')

    setSaving(true)
    const { error } = await supabase.from('sales_records').insert({
      sale_date: form.sale_date,
      province: form.province || null, area: form.area || null,
      product_code: form.product_code || null, product_name: form.product_name,
      product_spec: form.product_spec || null, unit: form.unit || '件',
      unit_price: parseFloat(form.unit_price) || null,
      total_price: parseFloat(form.total_price) || null,
      inbound, outbound,
      customer: form.customer || null, remark: form.remark || null,
      contact: form.contact || null, created_by: currentUser?.id || null,
    })
    if (error) alert('保存失败：' + error.message)
    else { setShowModal(false); loadAll(filters); fetchProvinces() }
    setSaving(false)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    setImportResult(null)
    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const headers = rows[0].map(String)
      const dataRows = rows.slice(1).filter((r) => r[0] !== '' && r[0] != null)

      const ci = (name) => headers.indexOf(name)
      const clean = (v) => { const s = String(v ?? '').trim(); return (s === '' || s === '/') ? null : s }

      const records = dataRows.map((row) => {
        const year = parseInt(row[ci('年份')]) || 0
        const month = parseInt(row[ci('月份')]) || 1
        const day = parseInt(row[ci('日期')]) || 1
        const sale_date = year > 0
          ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          : null
        return {
          seq_no: parseInt(row[ci('序号')]) || null,
          sale_date,
          province: clean(row[ci('省份')]),
          area: clean(row[ci('地区')]),
          product_code: clean(row[ci('编码')]),
          product_name: clean(row[ci('名称')]),
          product_spec: clean(row[ci('规格')]),
          unit: String(row[ci('单位')] || '件').trim() || '件',
          unit_price: parseFloat(row[ci('单价')]) || null,
          total_price: parseFloat(row[ci('总价')]) || null,
          inbound: parseInt(row[ci('进货')]) || 0,
          outbound: parseInt(row[ci('出货')]) || 0,
          customer: clean(row[ci('客户')]),
          remark: clean(row[ci('备注')]),
          contact: clean(row[ci('联系方式')]),
        }
      }).filter((r) => r.seq_no > 0 && r.sale_date && r.product_name)

      const CHUNK = 500
      for (let i = 0; i < records.length; i += CHUNK) {
        const { error } = await supabase
          .from('sales_records')
          .upsert(records.slice(i, i + CHUNK), { onConflict: 'seq_no' })
        if (error) throw new Error(error.message)
      }
      setImportResult({ success: true, count: records.length })
      loadAll(filters)
      fetchProvinces()
      fetchProducts()
    } catch (err) {
      setImportResult({ success: false, message: err.message })
    } finally {
      setImporting(false)
    }
  }

  const totalInbound = Number(stats.total_inbound)
  const totalOutbound = Number(stats.total_outbound)
  const totalRevenue = Number(stats.total_revenue)
  const totalCount = Number(stats.total_count)

  const selectedRecords = records.filter((r) => selectedIds.has(r.id))
  const selOutbound = selectedRecords.reduce((s, r) => s + (r.outbound || 0), 0)
  const selInbound = selectedRecords.reduce((s, r) => s + (r.inbound || 0), 0)
  const selRevenue = selectedRecords.reduce((s, r) => s + (Number(r.total_price) || 0), 0)
  const selAvgPrice = selOutbound > 0 ? selRevenue / selOutbound : null

  return (
    <DashboardLayout>
      {/* 页头 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">销售记录</h1>
          <p className="text-slate-500 text-sm mt-0.5">历史销售数据与统计分析</p>
        </div>
        <div className="flex gap-2">
          <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
          <button onClick={() => importInputRef.current?.click()} disabled={importing} className="btn-secondary">
            {importing ? '导入中…' : '导入 Excel'}
          </button>
          <button onClick={openModal} className="btn-primary">+ 新增记录</button>
        </div>
      </div>

      {importResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm flex items-center justify-between ${
          importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}>
          <span>{importResult.success ? `✓ 成功同步 ${importResult.count} 条记录` : `导入失败：${importResult.message}`}</span>
          <button onClick={() => setImportResult(null)} className="opacity-50 hover:opacity-100 ml-4">✕</button>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="出货总量" value={formatNumber(totalOutbound)} unit="件" color="text-rose-600" />
        <StatCard label="销售总金额" value={totalRevenue > 0 ? formatMoney(totalRevenue) : '—'} color="text-amber-600" />
        <StatCard label="记录数" value={formatNumber(totalCount)} unit="条" color="text-slate-700" />
      </div>

      {/* 筛选栏 */}
      <div className="surface-card p-4 mb-6">
        {/* 年份 + 季度快捷 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {Array.from({ length: CURRENT_FISCAL_YEAR - 2020 }, (_, i) => 2021 + i)
            .reverse()
            .map((y) => (
              <button
                key={y}
                onClick={() => { setQuickYear(String(y)); applyYear(y) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  quickYear === String(y)
                    ? 'bg-slate-900 text-white'
                    : 'bg-white/70 border border-slate-200 text-slate-600 hover:bg-white'
                }`}
              >
                {y}年度
              </button>
            ))}
        </div>
        <div className="flex gap-2 mb-4">
          {[['Q1', '03-05月', 0], ['Q2', '06-08月', 1], ['Q3', '09-11月', 2], ['Q4', '12-02月', 3]].map(([label, hint, q]) => (
            <button
              key={q}
              onClick={() => applyQuarter(q)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex flex-col items-center leading-tight ${
                quickQuarter === q
                  ? 'bg-slate-700 text-white'
                  : 'bg-white/70 border border-slate-200 text-slate-600 hover:bg-white'
              }`}
            >
              <span>{label}</span>
              <span className={`text-xs font-normal ${quickQuarter === q ? 'text-slate-300' : 'text-slate-400'}`}>{hint}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleFilter} className="flex flex-wrap gap-3 items-end">
          {/* 日期 */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">开始日期</label>
            <input type="date" value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="input-field w-40" />
          </div>
          <div>
            <label className="block text-slate-600 text-xs mb-1">结束日期</label>
            <input type="date" value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="input-field w-40" />
          </div>

          {/* 省份 */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">省份</label>
            <SearchDropdown
              value={filters.province}
              onChange={handleProvinceChange}
              options={provinces}
              placeholder="全部省份"
              className="w-36"
            />
          </div>

          {/* 客户（联动省份） */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">
              客户
              {filters.province && (
                <span className="ml-1 text-slate-400">（{filters.province}）</span>
              )}
            </label>
            <SearchDropdown
              value={filters.customer}
              onChange={(val) => setFilters({ ...filters, customer: val })}
              options={customers}
              placeholder="搜索客户..."
              className="w-48"
            />
          </div>

          {/* 产品 */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">产品名称</label>
            <SearchDropdown
              value={filters.product_name}
              onChange={(val) => setFilters({ ...filters, product_name: val })}
              options={products}
              placeholder="搜索产品..."
              className="w-44"
            />
          </div>

          {/* 进/出筛选 */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">类型</label>
            <div className="flex rounded-lg overflow-hidden border border-slate-200 text-sm">
              {[['', '全部'], ['out', '出货'], ['in', '进货']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, type: val }))}
                  className={`px-3 py-1.5 transition ${
                    filters.type === val
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">查询</button>
            <button type="button" onClick={clearFilters} className="btn-ghost">重置</button>
          </div>
        </form>
      </div>

      {/* 省份 / 客户 / 产品 下钻图 */}
      {(chartData.length > 0 || drillProvince) && (
        <div className="surface-card p-4 mb-6">
          {/* 面包屑 */}
          <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
            <button
              onClick={() => { setDrillProvince(null); setCustomerChartData([]); setDrillCustomer(null); setProductChartData([]) }}
              className={`font-medium transition ${!drillProvince ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
            >
              所有省份
            </button>
            {drillProvince && (
              <>
                <span className="text-slate-300">/</span>
                <button
                  onClick={() => { setDrillCustomer(null); setProductChartData([]) }}
                  className={`font-medium transition ${!drillCustomer ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'}`}
                >
                  {drillProvince}
                </button>
              </>
            )}
            {drillCustomer && (
              <>
                <span className="text-slate-300">/</span>
                <span className="font-medium text-slate-900">{drillCustomer}</span>
              </>
            )}
            <span className="text-slate-300 ml-auto text-xs">
              {!drillProvince && '点击省份查看客户'}
              {drillProvince && !drillCustomer && '点击客户查看产品'}
            </span>
          </div>

          {/* 省份图 */}
          {!drillProvince && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="province" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip formatter={(v) => [formatNumber(v) + ' 件', '出货量']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="outbound" fill="#0f172a" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => drillIntoProvince(data.province)} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* 客户图 — 横向条形图，客户名显示在左侧 */}
          {drillProvince && !drillCustomer && (
            <ResponsiveContainer width="100%" height={Math.max(220, customerChartData.length * 36)}>
              <BarChart layout="vertical" data={customerChartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="customer" width={130} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [formatNumber(v) + ' 件', '出货量']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="outbound" fill="#1e40af" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }} onClick={(data) => drillIntoCustomer(data.customer)} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* 产品图 — 横向条形图 */}
          {drillCustomer && (
            <ResponsiveContainer width="100%" height={Math.max(220, productChartData.length * 36)}>
              <BarChart layout="vertical" data={productChartData} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="product_name" width={130} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [formatNumber(v) + ' 件', '出货量']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f1f5f9' }} />
                <Bar dataKey="outbound" fill="#0369a1" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}
                  onClick={(data) => {
                    const newFilters = { ...filters, province: drillProvince || '', customer: drillCustomer || '', product_name: data.product_name, type: 'out' }
                    setFilters(newFilters)
                    loadAll(newFilters)
                  }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* 记录列表 */}
      <div className="surface-card">
        <div className="p-4 border-b border-slate-100 flex items-center gap-3">
          {!loading && records.length > 0 && (
            <input
              type="checkbox"
              checked={selectedIds.size === records.length && records.length > 0}
              ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < records.length }}
              onChange={toggleSelectAll}
              className="w-4 h-4 accent-slate-800 cursor-pointer"
            />
          )}
          <h2 className="text-sm font-semibold text-slate-700">
            记录列表
            {!loading && (
              <span className="ml-2 text-slate-400 font-normal">
                共 {formatNumber(totalCount)} 条，已加载 {records.length} 条
              </span>
            )}
            {selectedIds.size > 0 && (
              <span className="ml-2 text-slate-600 font-normal">· 已选 {selectedIds.size} 条</span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">加载中...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-slate-400">暂无记录</div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {records.map((record) => {
                const isExpanded = expandedId === record.id
                return (
                  <li key={record.id} className={selectedIds.has(record.id) ? 'bg-slate-50' : ''}>
                    <div className="flex items-center px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(record.id)}
                        onChange={() => toggleSelect(record.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-slate-800 cursor-pointer shrink-0 mr-3"
                      />
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : record.id)}
                      className="flex-1 text-left py-3 hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs text-slate-400 shrink-0 w-24">{formatDate(record.sale_date)}</span>
                          <span className="text-sm font-medium text-slate-800 truncate">{record.product_name}</span>
                          {record.product_spec && (
                            <span className="text-xs text-slate-400 shrink-0">{record.product_spec}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {record.inbound > 0 && (
                            <span className="text-xs font-medium text-emerald-600">进 +{record.inbound}</span>
                          )}
                          {record.outbound > 0 && (
                            <span className="text-xs font-medium text-rose-600">出 -{record.outbound}</span>
                          )}
                          {record.unit_price != null && record.unit_price > 0 && (
                            <span className="text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full hidden md:block">¥{record.unit_price}/件</span>
                          )}
                          {record.total_price > 0 && (
                            <span className="text-xs text-amber-600 hidden md:block">{formatMoney(record.total_price)}</span>
                          )}
                          {record.remark && (
                            <span className="text-xs text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full hidden md:block max-w-[140px] truncate">{record.remark}</span>
                          )}
                          {record.customer && (
                            <span className="text-xs text-slate-500 hidden md:block max-w-[100px] truncate">{record.customer}</span>
                          )}
                          <span className="text-slate-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 bg-slate-50/60">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-2 text-sm pt-3">
                          <DetailRow label="日期" value={formatDate(record.sale_date)} />
                          <DetailRow label="省份" value={record.province} />
                          <DetailRow label="地区" value={record.area} />
                          <DetailRow label="客户" value={record.customer} />
                          <DetailRow label="联系方式" value={record.contact} />
                          <DetailRow label="产品编码" value={record.product_code} />
                          <DetailRow label="产品名称" value={record.product_name} />
                          <DetailRow label="规格" value={record.product_spec} />
                          <DetailRow label="单位" value={record.unit} />
                          <DetailRow label="单价" value={record.unit_price != null ? `¥${record.unit_price}` : null} />
                          <DetailRow label="总价" value={record.total_price > 0 ? formatMoney(record.total_price) : null} />
                          <DetailRow label="进货" value={record.inbound > 0 ? record.inbound : null} />
                          <DetailRow label="出货" value={record.outbound > 0 ? record.outbound : null} />
                          <DetailRow label="备注" value={record.remark} />
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            {hasMore && (
              <div className="p-4 text-center border-t border-slate-100">
                <button onClick={handleLoadMore} disabled={loadingMore} className="btn-ghost">
                  {loadingMore ? '加载中...' : `加载更多（还有 ${formatNumber(totalCount - records.length)} 条）`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 多选统计浮动条 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-4 pointer-events-none">
          <div className="pointer-events-auto bg-slate-900 text-white rounded-2xl shadow-2xl px-6 py-3 flex flex-wrap items-center gap-5 text-sm">
            <span className="font-medium text-slate-300">已选 <span className="text-white font-bold">{selectedIds.size}</span> 条</span>
            {selOutbound > 0 && (
              <span>出货 <span className="font-bold text-rose-300">{formatNumber(selOutbound)}</span> 件</span>
            )}
            {selInbound > 0 && (
              <span>进货 <span className="font-bold text-emerald-300">{formatNumber(selInbound)}</span> 件</span>
            )}
            {selRevenue > 0 && (
              <span>金额 <span className="font-bold text-amber-300">{formatMoney(selRevenue)}</span></span>
            )}
            {selAvgPrice != null && (
              <span>均价 <span className="font-bold text-sky-300">¥{selAvgPrice.toFixed(2)}</span>/件</span>
            )}
            <button onClick={clearSelection} className="ml-2 text-slate-400 hover:text-white transition text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {/* 新增 Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">新增销售记录</h2>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 text-sm mb-1">日期 *</label>
                <input type="date" value={form.sale_date}
                  onChange={(e) => handleFormChange('sale_date', e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">省份</label>
                <input type="text" value={form.province}
                  onChange={(e) => handleFormChange('province', e.target.value)}
                  placeholder="如：江苏" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">地区</label>
                <input type="text" value={form.area}
                  onChange={(e) => handleFormChange('area', e.target.value)}
                  placeholder="如：南通" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">产品编码</label>
                <input type="text" value={form.product_code}
                  onChange={(e) => handleFormChange('product_code', e.target.value)}
                  placeholder="如：K" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">产品名称 *</label>
                <input type="text" value={form.product_name}
                  onChange={(e) => handleFormChange('product_name', e.target.value)}
                  placeholder="如：鲍鱼汁" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">规格</label>
                <input type="text" value={form.product_spec}
                  onChange={(e) => handleFormChange('product_spec', e.target.value)}
                  placeholder="如：380x12" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">单位</label>
                <input type="text" value={form.unit}
                  onChange={(e) => handleFormChange('unit', e.target.value)}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">单价</label>
                <input type="number" value={form.unit_price}
                  onChange={(e) => handleFormChange('unit_price', e.target.value)}
                  onWheel={(e) => e.target.blur()} placeholder="0.00" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">总价</label>
                <input type="number" value={form.total_price}
                  onChange={(e) => handleFormChange('total_price', e.target.value)}
                  onWheel={(e) => e.target.blur()} placeholder="0.00" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">进货数量</label>
                <input type="number" value={form.inbound}
                  onChange={(e) => handleFormChange('inbound', e.target.value)}
                  onWheel={(e) => e.target.blur()} placeholder="0" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">出货数量</label>
                <input type="number" value={form.outbound}
                  onChange={(e) => handleFormChange('outbound', e.target.value)}
                  onWheel={(e) => e.target.blur()} placeholder="0" className="input-field" />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-600 text-sm mb-1">客户</label>
                <input type="text" value={form.customer}
                  onChange={(e) => handleFormChange('customer', e.target.value)}
                  placeholder="客户名称" className="input-field" />
              </div>
              <div>
                <label className="block text-slate-600 text-sm mb-1">联系方式</label>
                <input type="text" value={form.contact}
                  onChange={(e) => handleFormChange('contact', e.target.value)}
                  placeholder="电话号码" className="input-field" />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-600 text-sm mb-1">备注</label>
                <textarea value={form.remark}
                  onChange={(e) => handleFormChange('remark', e.target.value)}
                  placeholder="备注信息..." rows={2} className="input-field resize-none" />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="btn-ghost">取消</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

function StatCard({ label, value, unit, color }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>
        {value}
        {unit && <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

function DetailRow({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div>
      <span className="text-slate-400 text-xs">{label}：</span>
      <span className="text-slate-700">{value}</span>
    </div>
  )
}
