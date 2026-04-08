'use client'
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
const getToday = () => new Date().toISOString().slice(0, 10)
const DEFAULT_STATS = { total_inbound: 0, total_outbound: 0, total_revenue: 0, total_count: 0 }
const INBOUND_ENTRY_TYPES = [
  { value: 'finished_in', label: '成品进库' },
  { value: 'semi_label', label: '半成品贴标' },
]

const normalizeGroupLabel = (value, fallback) => {
  const text = String(value ?? '').trim()
  return text || fallback
}

const uniqSortedValues = (rows, field) => (
  [...new Set((rows || []).map((row) => String(row?.[field] ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
)

const needsLocalAnalytics = (filters) => Boolean(filters.area || filters.product_code)

function summarizeSalesRows(rows) {
  return rows.reduce((acc, row) => {
    acc.total_inbound += Number(row.inbound) || 0
    acc.total_outbound += Number(row.outbound) || 0
    acc.total_revenue += Number(row.total_price) || 0
    acc.total_count += 1
    return acc
  }, { ...DEFAULT_STATS })
}

function groupSalesRows(rows, field, fallbackLabel) {
  const grouped = new Map()

  for (const row of rows || []) {
    const key = normalizeGroupLabel(row?.[field], fallbackLabel)
    const current = grouped.get(key) || { outbound: 0, revenue: 0 }
    current.outbound += Number(row?.outbound) || 0
    current.revenue += Number(row?.total_price) || 0
    grouped.set(key, current)
  }

  return [...grouped.entries()]
    .map(([key, values]) => ({ [field]: key, ...values }))
    .sort((a, b) => (
      b.outbound - a.outbound
      || b.revenue - a.revenue
      || String(a[field]).localeCompare(String(b[field]), 'zh-CN')
    ))
}

const buildCustomerContact = (contact, phone) => {
  const parts = [contact, phone].map((item) => String(item || '').trim()).filter(Boolean)
  return parts.join(' / ')
}

const parsePositiveInt = (value) => {
  const num = parseInt(value, 10)
  return Number.isFinite(num) && num > 0 ? num : 0
}

const parseMoney = (value) => {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

const calculateUnitPrice = (totalPrice, quantity) => {
  const total = Number(totalPrice)
  const qty = parsePositiveInt(quantity)
  if (!Number.isFinite(total) || total <= 0 || qty <= 0) return ''
  return (total / qty).toFixed(2)
}

const createEmptyInboundForm = () => ({
  sale_date: getToday(),
  items: [createEmptyInboundItem()],
})

const createEmptyInboundItem = () => ({
  entry_type: 'finished_in',
  product_code: '',
  product_name: '',
  product_spec: '',
  unit: '件',
  inbound: '',
  remark: '',
})

const createEmptyOutboundItem = () => ({
  product_code: '',
  product_name: '',
  product_spec: '',
  unit: '件',
  outbound: '',
  total_price: '',
  unit_price: '',
  remark: '',
})

const createEmptyOutboundForm = () => ({
  sale_date: getToday(),
  province: '',
  area: '',
  customer: '',
  contact: '',
  items: [createEmptyOutboundItem()],
})

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

  const [stats, setStats] = useState(DEFAULT_STATS)
  const [chartData, setChartData] = useState([])
  const [drillProvince, setDrillProvince] = useState(null)
  const [customerChartData, setCustomerChartData] = useState([])
  const [drillCustomer, setDrillCustomer] = useState(null)
  const [productChartData, setProductChartData] = useState([])
  const [provinces, setProvinces] = useState([])
  const [areas, setAreas] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [productCodes, setProductCodes] = useState([])
  const [productCatalogMap, setProductCatalogMap] = useState({})
  const [customerDirectoryMap, setCustomerDirectoryMap] = useState({})
  const [outboundCustomerOptions, setOutboundCustomerOptions] = useState([])
  const [outboundCustomerContactMap, setOutboundCustomerContactMap] = useState({})
  const [analyticsRows, setAnalyticsRows] = useState([])
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
    province: '', area: '', product_code: '', product_name: '', customer: '', type: 'out',
  })
  const [quickYear, setQuickYear] = useState(String(CURRENT_FISCAL_YEAR))
  const [quickQuarter, setQuickQuarter] = useState(null)

  const [showModal, setShowModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [entryMode, setEntryMode] = useState('in')
  const [inboundForm, setInboundForm] = useState(createEmptyInboundForm())
  const [outboundForm, setOutboundForm] = useState(createEmptyOutboundForm())
  const [previewSubmission, setPreviewSubmission] = useState(null)
  const [saving, setSaving] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const importInputRef = useRef(null)

  const [importLogs, setImportLogs] = useState([])
  const [showImportLogs, setShowImportLogs] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data?.user || null))
    fetchProvinces()
    fetchProducts()
    fetchProductCatalog()
    fetchCustomerDirectory()
    fetchImportLogs()
    loadAll(filters)
  }, [])

  // 省份变化时拉取对应客户和地区列表
  useEffect(() => {
    fetchCustomers(filters.province || null)
    fetchAreas(filters.province || null)
  }, [filters.province])

  useEffect(() => {
    if (!showModal || entryMode !== 'out') return
    fetchOutboundCustomerOptions(outboundForm.province, outboundForm.area)
  }, [showModal, entryMode, outboundForm.province, outboundForm.area, customerDirectoryMap])

  const rpcParams = (f) => ({
    p_start_date: f.start_date || null,
    p_end_date: f.end_date || null,
    p_province: f.province || null,
    p_product_name: f.product_name || null,
    p_customer: (f.customer && f.customer !== '（无客户）') ? f.customer : null,
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

  const fetchProductCatalog = async () => {
    const { data } = await supabase
      .from('sales_records')
      .select('product_code, product_name, product_spec, unit, created_at')
      .not('product_code', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000)

    const nextCatalogMap = {}
    for (const row of data || []) {
      const code = String(row.product_code || '').trim()
      if (!code || nextCatalogMap[code]) continue
      nextCatalogMap[code] = {
        product_name: String(row.product_name || '').trim(),
        product_spec: String(row.product_spec || '').trim(),
        unit: String(row.unit || '件').trim() || '件',
      }
    }

    setProductCatalogMap(nextCatalogMap)
    setProductCodes(Object.keys(nextCatalogMap).sort((a, b) => a.localeCompare(b, 'zh-CN')))
  }

  const fetchAreas = async (province) => {
    let query = supabase
      .from('sales_records')
      .select('area')
      .not('area', 'is', null)
      .limit(5000)

    if (province) query = query.eq('province', province)

    const { data } = await query
    setAreas(uniqSortedValues(data, 'area'))
  }

  const fetchCustomerDirectory = async () => {
    const { data } = await supabase
      .from('customers')
      .select('name, contact, phone')
      .order('name')

    const nextDirectoryMap = {}
    for (const row of data || []) {
      const name = String(row.name || '').trim()
      if (!name || nextDirectoryMap[name]) continue
      nextDirectoryMap[name] = buildCustomerContact(row.contact, row.phone)
    }
    setCustomerDirectoryMap(nextDirectoryMap)
  }

  const fetchImportLogs = async () => {
    const { data } = await supabase
      .from('excel_import_logs')
      .select('*, profiles!imported_by(name)')
      .order('imported_at', { ascending: false })
      .limit(20)
    setImportLogs(data || [])
  }

  const fetchCustomers = async (province) => {
    const { data } = await supabase.rpc('get_sales_customers', {
      p_province: province || null,
    })
    setCustomers(['（无客户）', ...(data || []).map((r) => r.customer).filter(Boolean)])
  }

  const fetchOutboundCustomerOptions = async (province, area) => {
    let query = supabase
      .from('sales_records')
      .select('customer, contact, created_at')
      .not('customer', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5000)

    const provinceText = String(province || '').trim()
    const areaText = String(area || '').trim()

    if (provinceText) query = query.eq('province', provinceText)
    if (areaText) query = query.ilike('area', `%${areaText}%`)

    const { data } = await query
    const historyNames = []
    const nextContactMap = { ...customerDirectoryMap }

    for (const row of data || []) {
      const name = String(row.customer || '').trim()
      if (!name || historyNames.includes(name)) continue
      historyNames.push(name)
      if (row.contact) nextContactMap[name] = String(row.contact).trim()
    }

    const fallbackNames = Object.keys(customerDirectoryMap).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const names = historyNames.length > 0 || provinceText || areaText
      ? [...historyNames, ...fallbackNames.filter((name) => !historyNames.includes(name))]
      : fallbackNames

    setOutboundCustomerContactMap(nextContactMap)
    setOutboundCustomerOptions(names)
  }

  const fetchStats = async (f) => {
    const { data } = await supabase.rpc('get_sales_stats', rpcParams(f))
    setStats(data || DEFAULT_STATS)
  }

  const resetChartDrill = () => {
    setDrillProvince(null)
    setCustomerChartData([])
    setDrillCustomer(null)
    setProductChartData([])
  }

  const fetchChart = async (f) => {
    const { data } = await supabase.rpc('get_sales_by_province', rpcParams(f))
    setChartData(data || [])
    resetChartDrill()
  }

  const buildSalesQuery = (f, select = '*') => {
    let query = supabase.from('sales_records').select(select)

    if (f.start_date) query = query.gte('sale_date', f.start_date)
    if (f.end_date) query = query.lte('sale_date', f.end_date)
    if (f.province) query = query.eq('province', f.province)
    if (f.area) query = query.ilike('area', `%${f.area}%`)
    if (f.product_code) query = query.ilike('product_code', `%${f.product_code}%`)
    if (f.product_name) query = query.ilike('product_name', `%${f.product_name}%`)
    if (f.customer === '（无客户）') query = query.is('customer', null)
    else if (f.customer) query = query.ilike('customer', `%${f.customer}%`)
    if (f.type === 'in') query = query.gt('inbound', 0)
    if (f.type === 'out') query = query.gt('outbound', 0)

    return query
  }

  const fetchAllMatchingRows = async (f, select) => {
    const chunkSize = 1000
    let start = 0
    const rows = []

    while (true) {
      const { data, error } = await buildSalesQuery(f, select).range(start, start + chunkSize - 1)
      if (error) throw error
      const chunk = data || []
      rows.push(...chunk)
      if (chunk.length < chunkSize) break
      start += chunk.length
    }

    return rows
  }

  const drillIntoProvince = async (province) => {
    setDrillProvince(province)
    setDrillCustomer(null)
    setProductChartData([])

    if (needsLocalAnalytics(filters)) {
      const rows = analyticsRows.filter((row) => normalizeGroupLabel(row.province, '未填写') === province)
      setCustomerChartData(groupSalesRows(rows, 'customer', '（无客户）'))
      return
    }

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

    if (needsLocalAnalytics(filters)) {
      const rows = analyticsRows.filter((row) => (
        normalizeGroupLabel(row.province, '未填写') === drillProvince
        && normalizeGroupLabel(row.customer, '（无客户）') === customer
      ))
      setProductChartData(groupSalesRows(rows, 'product_name', '未填写'))
      return
    }

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

    let query = buildSalesQuery(f)
      .order('sale_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(newOffset, newOffset + PAGE_SIZE - 1)

    const { data } = await query
    const rows = data || []
    if (newOffset === 0) setRecords(rows)
    else setRecords((prev) => [...prev, ...rows])
    setHasMore(rows.length === PAGE_SIZE)
    setOffset(newOffset + rows.length)

    if (newOffset === 0) setLoading(false)
    else setLoadingMore(false)
  }

  const loadAll = async (f) => {
    clearSelection()
    setExpandedId(null)

    if (needsLocalAnalytics(f)) {
      setStats(DEFAULT_STATS)
      setChartData([])
      resetChartDrill()
      setAnalyticsRows([])
      fetchRecords(f, 0)

      try {
        const rows = await fetchAllMatchingRows(
          f,
          'province, customer, product_name, inbound, outbound, total_price'
        )
        setAnalyticsRows(rows)
        setStats(summarizeSalesRows(rows))
        setChartData(groupSalesRows(rows, 'province', '未填写'))
      } catch (error) {
        setStats(DEFAULT_STATS)
        setChartData([])
      }
      return
    }

    setAnalyticsRows([])
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
    // 省份变化时清空客户和地区筛选
    const next = { ...filters, province: val, area: '', customer: '' }
    setFilters(next)
  }

  const handleFilter = (e) => { e.preventDefault(); loadAll(filters) }

  const clearFilters = () => {
    const next = {
      ...fiscalRange(CURRENT_FISCAL_YEAR),
      province: '', area: '', product_code: '', product_name: '', customer: '', type: 'out',
    }
    setFilters(next)
    setQuickYear(String(CURRENT_FISCAL_YEAR))
    loadAll(next)
  }

  const handleLoadMore = () => fetchRecords(filters, offset)

  // ── 新增 ──
  const refreshAfterSave = () => {
    loadAll(filters)
    fetchProvinces()
    fetchAreas(filters.province || null)
    fetchCustomers(filters.province || null)
    fetchProducts()
    fetchProductCatalog()
    fetchCustomerDirectory()
  }

  const closeModal = () => {
    setShowModal(false)
    setShowConfirmModal(false)
    setPreviewSubmission(null)
    setSaving(false)
    setInboundForm(createEmptyInboundForm())
    setOutboundForm(createEmptyOutboundForm())
    setOutboundCustomerOptions([])
    setOutboundCustomerContactMap({})
  }

  const closeConfirmModal = () => {
    setShowConfirmModal(false)
    setPreviewSubmission(null)
  }

  const openModal = (mode) => {
    setEntryMode(mode)
    setShowModal(true)
    if (mode === 'in') {
      setInboundForm(createEmptyInboundForm())
    } else {
      setOutboundForm(createEmptyOutboundForm())
      fetchOutboundCustomerOptions('', '')
    }
  }

  const getProductByCode = (code) => {
    const key = String(code || '').trim()
    return key ? productCatalogMap[key] : null
  }

  const addInboundItem = () => {
    setInboundForm((prev) => ({ ...prev, items: [...prev.items, createEmptyInboundItem()] }))
  }

  const removeInboundItem = (index) => {
    setInboundForm((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const handleInboundChange = (field, value) => {
    setInboundForm((prev) => {
      const next = { ...prev, [field]: value }
      return next
    })
  }

  const updateInboundItem = (index, field, value) => {
    setInboundForm((prev) => {
      const items = [...prev.items]
      const nextItem = { ...items[index], [field]: value }
      if (field === 'product_code') {
        const matched = getProductByCode(value)
        nextItem.product_name = matched?.product_name || ''
        nextItem.product_spec = matched?.product_spec || ''
        nextItem.unit = matched?.unit || '件'
      }
      items[index] = nextItem
      return { ...prev, items }
    })
  }

  const addOutboundItem = () => {
    setOutboundForm((prev) => ({ ...prev, items: [...prev.items, createEmptyOutboundItem()] }))
  }

  const removeOutboundItem = (index) => {
    setOutboundForm((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? prev.items : prev.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const updateOutboundItem = (index, field, value) => {
    setOutboundForm((prev) => {
      const items = [...prev.items]
      const nextItem = { ...items[index], [field]: value }

      if (field === 'product_code') {
        const matched = getProductByCode(value)
        nextItem.product_name = matched?.product_name || ''
        nextItem.product_spec = matched?.product_spec || ''
        nextItem.unit = matched?.unit || '件'
      }

      if (field === 'outbound' || field === 'total_price') {
        nextItem.unit_price = calculateUnitPrice(
          field === 'total_price' ? value : nextItem.total_price,
          field === 'outbound' ? value : nextItem.outbound
        )
      }

      items[index] = nextItem
      return { ...prev, items }
    })
  }

  const handleOutboundChange = (field, value) => {
    setOutboundForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleOutboundProvinceChange = (value) => {
    setOutboundForm((prev) => ({ ...prev, province: value, area: '', customer: '', contact: '' }))
  }

  const handleOutboundAreaChange = (value) => {
    setOutboundForm((prev) => ({ ...prev, area: value, customer: '', contact: '' }))
  }

  const handleOutboundCustomerChange = (value) => {
    setOutboundForm((prev) => ({
      ...prev,
      customer: value,
      contact: outboundCustomerContactMap[value] || '',
    }))
  }

  const buildInboundSubmission = () => {
    if (!inboundForm.sale_date) return alert('请填写日期')
    const items = inboundForm.items
      .map((item) => {
        const typeLabel = INBOUND_ENTRY_TYPES.find((option) => option.value === item.entry_type)?.label || ''
        const rawRemark = String(item.remark || '').trim()
        return {
          entry_type: item.entry_type,
          entry_type_label: typeLabel,
          product_code: String(item.product_code || '').trim(),
          product_name: String(item.product_name || '').trim(),
          product_spec: String(item.product_spec || '').trim(),
          unit: String(item.unit || '件').trim() || '件',
          inbound: parsePositiveInt(item.inbound),
          remark: [typeLabel, rawRemark].filter(Boolean).join('｜'),
        }
      })
      .filter((item) => item.product_name && item.inbound > 0)

    if (items.length === 0) return alert('请至少添加一条有效的进货明细')

    return {
      mode: 'in',
      title: '进货记录预览',
      sale_date: inboundForm.sale_date,
      items,
      rows: items.map((item) => ({
        sale_date: inboundForm.sale_date,
        province: null,
        area: null,
        product_code: item.product_code || null,
        product_name: item.product_name,
        product_spec: item.product_spec || null,
        unit: item.unit,
        unit_price: null,
        total_price: null,
        inbound: item.inbound,
        outbound: 0,
        customer: null,
        remark: item.remark || null,
        contact: null,
        created_by: currentUser?.id || null,
      })),
    }
  }

  const openInboundPreview = () => {
    const submission = buildInboundSubmission()
    if (!submission) return
    setPreviewSubmission(submission)
    setShowConfirmModal(true)
  }

  const buildOutboundSubmission = () => {
    if (!outboundForm.sale_date) return alert('请填写日期')

    const items = outboundForm.items
      .map((item) => ({
        product_code: String(item.product_code || '').trim(),
        product_name: String(item.product_name || '').trim(),
        product_spec: String(item.product_spec || '').trim(),
        unit: String(item.unit || '件').trim() || '件',
        outbound: parsePositiveInt(item.outbound),
        total_price: parseMoney(item.total_price),
        unit_price: parseMoney(item.unit_price),
        remark: String(item.remark || '').trim(),
      }))
      .filter((item) => item.product_name && item.outbound > 0)

    if (items.length === 0) return alert('请至少添加一条有效的出货明细')

    return {
      mode: 'out',
      title: '出货记录预览',
      sale_date: outboundForm.sale_date,
      province: outboundForm.province || '',
      area: outboundForm.area || '',
      customer: outboundForm.customer || '',
      contact: outboundForm.contact || '',
      items,
      rows: items.map((item) => ({
        sale_date: outboundForm.sale_date,
        province: outboundForm.province || null,
        area: outboundForm.area || null,
        product_code: item.product_code || null,
        product_name: item.product_name,
        product_spec: item.product_spec || null,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        inbound: 0,
        outbound: item.outbound,
        customer: outboundForm.customer || null,
        remark: item.remark || null,
        contact: outboundForm.contact || null,
        created_by: currentUser?.id || null,
      })),
    }
  }

  const openOutboundPreview = () => {
    const submission = buildOutboundSubmission()
    if (!submission) return
    setPreviewSubmission(submission)
    setShowConfirmModal(true)
  }

  const handleConfirmSubmit = async () => {
    if (!previewSubmission?.rows?.length) return
    setSaving(true)
    const { error } = await supabase.from('sales_records').insert(previewSubmission.rows)
    setSaving(false)
    if (error) return alert('保存失败：' + error.message)
    closeModal()
    refreshAfterSave()
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
      const sheetName = wb.SheetNames.find((n) => n.includes('进出')) ?? wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const headers = rows[0].map((h) => String(h).trim())
      const dataRows = rows.slice(1).filter((r) => r[0] !== '' && r[0] != null)

      const REQUIRED = ['序号', '年份', '名称']
      const missing = REQUIRED.filter((col) => headers.indexOf(col) === -1)
      if (missing.length > 0) {
        throw new Error(`找不到列：${missing.join('、')}。实际列标题：${headers.slice(0, 10).join('、')}`)
      }

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
      })
const filtered = records.filter((r) => r.seq_no > 0 && r.sale_date && r.product_name)

      const CHUNK = 500
      for (let i = 0; i < filtered.length; i += CHUNK) {
        const { error } = await supabase
          .from('sales_records')
          .upsert(filtered.slice(i, i + CHUNK), { onConflict: 'seq_no' })
        if (error) throw new Error(error.message)
      }
      await supabase.from('excel_import_logs').insert({
        file_name: file.name,
        record_count: filtered.length,
        imported_by: currentUser?.id || null,
      })
      setImportResult({ success: true, count: filtered.length })
      loadAll(filters)
      fetchProvinces()
      fetchAreas(filters.province || null)
      fetchCustomers(filters.province || null)
      fetchProducts()
      fetchProductCatalog()
      fetchImportLogs()
    } catch (err) {
      setImportResult({ success: false, message: err.message })
    } finally {
      setImporting(false)
    }
  }

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
          <button
            onClick={() => setShowImportLogs((v) => !v)}
            className="btn-ghost text-slate-500"
          >
            导入历史
          </button>
          <button onClick={() => importInputRef.current?.click()} disabled={importing} className="btn-secondary">
            {importing ? '导入中…' : '导入 Excel'}
          </button>
          <button onClick={() => openModal('in')} className="btn-secondary">+ 进货记录</button>
          <button onClick={() => openModal('out')} className="btn-primary">+ 出货记录</button>
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

      {showImportLogs && (
        <div className="surface-card mb-6">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">导入历史（最近 20 条）</h2>
            <button onClick={() => setShowImportLogs(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
          </div>
          {importLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">暂无导入记录</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {importLogs.map((log) => (
                <li key={log.id} className="px-4 py-3 flex items-center gap-4 text-sm">
                  <span className="text-slate-400 text-xs shrink-0 w-36">
                    {log.imported_at ? new Date(log.imported_at).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                  </span>
                  <span className="text-slate-600 shrink-0 w-20 truncate">{log.profiles?.name || '未知'}</span>
                  <span className="text-slate-700 flex-1 truncate">{log.file_name || '-'}</span>
                  <span className="text-slate-500 shrink-0 text-xs">{log.record_count} 条</span>
                </li>
              ))}
            </ul>
          )}
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

          {/* 地区 */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">
              地区
              {filters.province && (
                <span className="ml-1 text-slate-400">（{filters.province}）</span>
              )}
            </label>
            <SearchDropdown
              value={filters.area}
              onChange={(val) => setFilters({ ...filters, area: val })}
              options={areas}
              placeholder="搜索地区..."
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

          {/* 产品编码 */}
          <div>
            <label className="block text-slate-600 text-xs mb-1">产品编码</label>
            <SearchDropdown
              value={filters.product_code}
              onChange={(val) => setFilters({ ...filters, product_code: val })}
              options={productCodes}
              placeholder="搜索编码..."
              className="w-36"
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
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 56, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="province" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#d97706' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} />
                <Tooltip formatter={(v, name) => name === 'outbound' ? [formatNumber(v) + ' 件', '出货量'] : [formatMoney(v), '销售额']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f1f5f9' }} />
                <Legend formatter={(v) => v === 'outbound' ? '出货量' : '销售额'} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar yAxisId="left" dataKey="outbound" name="outbound" fill="#0f172a" radius={[4, 4, 0, 0]} style={{ cursor: 'pointer' }} onClick={(data) => drillIntoProvince(data.province)} />
                <Bar yAxisId="right" dataKey="revenue" name="revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* 客户图 — 横向条形图，客户名显示在左侧 */}
          {drillProvince && !drillCustomer && (
            <ResponsiveContainer width="100%" height={Math.max(240, customerChartData.length * 52)}>
              <BarChart layout="vertical" data={customerChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis xAxisId="left" type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <XAxis xAxisId="right" type="number" orientation="top" tick={{ fontSize: 11, fill: '#d97706' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} />
                <YAxis type="category" dataKey="customer" width={130} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, name) => name === 'outbound' ? [formatNumber(v) + ' 件', '出货量'] : [formatMoney(v), '销售额']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f1f5f9' }} />
                <Legend formatter={(v) => v === 'outbound' ? '出货量' : '销售额'} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar xAxisId="left" dataKey="outbound" name="outbound" fill="#1e40af" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }} onClick={(data) => drillIntoCustomer(data.customer)} />
                <Bar xAxisId="right" dataKey="revenue" name="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* 产品图 — 横向条形图 */}
          {drillCustomer && (
            <ResponsiveContainer width="100%" height={Math.max(240, productChartData.length * 52)}>
              <BarChart layout="vertical" data={productChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis xAxisId="left" type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <XAxis xAxisId="right" type="number" orientation="top" tick={{ fontSize: 11, fill: '#d97706' }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : v} />
                <YAxis type="category" dataKey="product_name" width={130} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, name) => name === 'outbound' ? [formatNumber(v) + ' 件', '出货量'] : [formatMoney(v), '销售额']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 13 }} cursor={{ fill: '#f1f5f9' }} />
                <Legend formatter={(v) => v === 'outbound' ? '出货量' : '销售额'} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar xAxisId="left" dataKey="outbound" name="outbound" fill="#0369a1" radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}
                  onClick={(data) => {
                    const newFilters = { ...filters, province: drillProvince || '', customer: drillCustomer || '', product_name: data.product_name, type: 'out' }
                    setFilters(newFilters)
                    loadAll(newFilters)
                  }} />
                <Bar xAxisId="right" dataKey="revenue" name="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {entryMode === 'in' ? '新增进货记录' : '新增出货记录'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {entryMode === 'in'
                    ? '输入产品编码自动带出名称和规格，记录成品进库或半成品贴标。'
                    : '支持多行出货录入，编码自动带产品信息，客户自动带联系方式。'}
                </p>
              </div>
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setEntryMode('in')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    entryMode === 'in' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  进货记录
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('out')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    entryMode === 'out' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  出货记录
                </button>
              </div>
            </div>

            <div className="p-6">
              <datalist id="sales-product-code-list">
                {productCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>

              {entryMode === 'in' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 text-sm mb-1">日期 *</label>
                      <input
                        type="date"
                        value={inboundForm.sale_date}
                        onChange={(e) => handleInboundChange('sale_date', e.target.value)}
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">进货明细</h3>
                        <p className="text-xs text-slate-400 mt-1">每一行都可以分别选择入库类型、填写数量和备注。</p>
                      </div>
                      <button type="button" onClick={addInboundItem} className="btn-ghost">
                        添加一行
                      </button>
                    </div>

                    {inboundForm.items.map((item, index) => (
                      <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-slate-700">第 {index + 1} 行</span>
                          {inboundForm.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeInboundItem(index)}
                              className="text-sm text-rose-500 hover:text-rose-700"
                            >
                              删除
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <label className="block text-slate-600 text-sm mb-1">入库类型 *</label>
                            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                              {INBOUND_ENTRY_TYPES.map((entry) => (
                                <button
                                  key={entry.value}
                                  type="button"
                                  onClick={() => updateInboundItem(index, 'entry_type', entry.value)}
                                  className={`flex-1 px-3 py-2 text-sm font-medium transition ${
                                    item.entry_type === entry.value
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-white text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {entry.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">产品编码</label>
                            <input
                              type="text"
                              list="sales-product-code-list"
                              value={item.product_code}
                              onChange={(e) => updateInboundItem(index, 'product_code', e.target.value)}
                              placeholder="输入编码自动带出"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">进货数量 *</label>
                            <input
                              type="number"
                              value={item.inbound}
                              onChange={(e) => updateInboundItem(index, 'inbound', e.target.value)}
                              onWheel={(e) => e.target.blur()}
                              min="1"
                              placeholder="0"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">产品名称 *</label>
                            <input
                              type="text"
                              value={item.product_name}
                              onChange={(e) => updateInboundItem(index, 'product_name', e.target.value)}
                              placeholder="编码未命中时可手动填写"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">规格</label>
                            <input
                              type="text"
                              value={item.product_spec}
                              onChange={(e) => updateInboundItem(index, 'product_spec', e.target.value)}
                              placeholder="自动带出或手动填写"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">单位</label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => updateInboundItem(index, 'unit', e.target.value)}
                              className="input-field"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-slate-600 text-sm mb-1">备注</label>
                            <textarea
                              value={item.remark}
                              onChange={(e) => updateInboundItem(index, 'remark', e.target.value)}
                              placeholder="当前行备注，保存时会自动附带入库类型"
                              rows={3}
                              className="input-field resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-600 text-sm mb-1">日期 *</label>
                      <input
                        type="date"
                        value={outboundForm.sale_date}
                        onChange={(e) => handleOutboundChange('sale_date', e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-sm mb-1">省份</label>
                      <SearchDropdown
                        value={outboundForm.province}
                        onChange={handleOutboundProvinceChange}
                        options={provinces}
                        placeholder="输入或选择省份"
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-sm mb-1">地区</label>
                      <input
                        type="text"
                        value={outboundForm.area}
                        onChange={(e) => handleOutboundAreaChange(e.target.value)}
                        placeholder="如：南通"
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-sm mb-1">客户</label>
                      <SearchDropdown
                        value={outboundForm.customer}
                        onChange={handleOutboundCustomerChange}
                        options={outboundCustomerOptions}
                        placeholder="输入或选择客户"
                        className="w-full"
                      />
                      {outboundCustomerOptions.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1">候选客户会根据省份、地区和客户档案自动更新</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-slate-600 text-sm mb-1">联系方式</label>
                      <input
                        type="text"
                        value={outboundForm.contact}
                        onChange={(e) => handleOutboundChange('contact', e.target.value)}
                        placeholder="选客户后自动带出，可手动调整"
                        className="input-field"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">出货明细</h3>
                        <p className="text-xs text-slate-400 mt-1">输入编码后会自动带出产品名称和规格，总价与数量会自动计算单价。</p>
                      </div>
                      <button type="button" onClick={addOutboundItem} className="btn-ghost">
                        添加一行
                      </button>
                    </div>

                    {outboundForm.items.map((item, index) => (
                      <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-slate-700">第 {index + 1} 行</span>
                          {outboundForm.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeOutboundItem(index)}
                              className="text-sm text-rose-500 hover:text-rose-700"
                            >
                              删除
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">产品编码</label>
                            <input
                              type="text"
                              list="sales-product-code-list"
                              value={item.product_code}
                              onChange={(e) => updateOutboundItem(index, 'product_code', e.target.value)}
                              placeholder="输入编码自动带出"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">出货数量 *</label>
                            <input
                              type="number"
                              value={item.outbound}
                              onChange={(e) => updateOutboundItem(index, 'outbound', e.target.value)}
                              onWheel={(e) => e.target.blur()}
                              min="1"
                              placeholder="0"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">产品名称 *</label>
                            <input
                              type="text"
                              value={item.product_name}
                              onChange={(e) => updateOutboundItem(index, 'product_name', e.target.value)}
                              placeholder="编码未命中时可手动填写"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">规格</label>
                            <input
                              type="text"
                              value={item.product_spec}
                              onChange={(e) => updateOutboundItem(index, 'product_spec', e.target.value)}
                              placeholder="自动带出或手动填写"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">总价</label>
                            <input
                              type="number"
                              value={item.total_price}
                              onChange={(e) => updateOutboundItem(index, 'total_price', e.target.value)}
                              onWheel={(e) => e.target.blur()}
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              className="input-field"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-600 text-sm mb-1">单价</label>
                            <input
                              type="text"
                              value={item.unit_price}
                              readOnly
                              placeholder="自动计算"
                              className="input-field bg-slate-100 text-slate-500"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-slate-600 text-sm mb-1">备注</label>
                            <textarea
                              value={item.remark}
                              onChange={(e) => updateOutboundItem(index, 'remark', e.target.value)}
                              placeholder="当前行备注"
                              rows={3}
                              className="input-field resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={closeModal} className="btn-ghost">取消</button>
              <button
                onClick={entryMode === 'in' ? openInboundPreview : openOutboundPreview}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? '保存中...' : '预览后确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && previewSubmission && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-5">
              <h3 className="text-lg font-semibold text-slate-900">{previewSubmission.title}</h3>
              <p className="text-sm text-slate-500 mt-1">请先核对预览内容，确认无误后再提交。</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="surface-inset px-4 py-3">
                  <span className="text-slate-400">日期：</span>
                  <span className="text-slate-700 font-medium">{previewSubmission.sale_date}</span>
                </div>
                {previewSubmission.mode === 'out' && (
                  <>
                    <div className="surface-inset px-4 py-3">
                      <span className="text-slate-400">省份 / 地区：</span>
                      <span className="text-slate-700 font-medium">
                        {[previewSubmission.province, previewSubmission.area].filter(Boolean).join(' / ') || '未填写'}
                      </span>
                    </div>
                    <div className="surface-inset px-4 py-3">
                      <span className="text-slate-400">客户：</span>
                      <span className="text-slate-700 font-medium">{previewSubmission.customer || '未填写'}</span>
                    </div>
                    <div className="surface-inset px-4 py-3">
                      <span className="text-slate-400">联系方式：</span>
                      <span className="text-slate-700 font-medium">{previewSubmission.contact || '未填写'}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800">提交明细</h4>
                  <span className="text-xs text-slate-400">共 {previewSubmission.items.length} 条</span>
                </div>

                {previewSubmission.items.map((item, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-slate-700">第 {index + 1} 条</span>
                      {previewSubmission.mode === 'in' ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-900 text-white">{item.entry_type_label || '进货'}</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-rose-50 text-rose-600">出货</span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400">产品编码：</span>
                        <span className="text-slate-700">{item.product_code || '未填写'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">产品名称：</span>
                        <span className="text-slate-700 font-medium">{item.product_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">规格：</span>
                        <span className="text-slate-700">{item.product_spec || '未填写'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">单位：</span>
                        <span className="text-slate-700">{item.unit || '件'}</span>
                      </div>
                      {previewSubmission.mode === 'in' ? (
                        <div>
                          <span className="text-slate-400">进货数量：</span>
                          <span className="text-emerald-700 font-medium">{formatNumber(item.inbound)}</span>
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-slate-400">出货数量：</span>
                            <span className="text-rose-700 font-medium">{formatNumber(item.outbound)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">总价 / 单价：</span>
                            <span className="text-slate-700">
                              {item.total_price ? formatMoney(item.total_price) : '未填写'}
                              {' / '}
                              {item.unit_price ? `¥${Number(item.unit_price).toFixed(2)}` : '未填写'}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="md:col-span-2">
                        <span className="text-slate-400">备注：</span>
                        <span className="text-slate-700">{item.remark || '未填写'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
              <button onClick={closeConfirmModal} disabled={saving} className="btn-ghost">返回修改</button>
              <button onClick={handleConfirmSubmit} disabled={saving} className="btn-primary">
                {saving ? '提交中...' : '确认提交'}
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
