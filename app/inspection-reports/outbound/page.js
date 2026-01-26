'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import SingleInspectionReport from '@/components/SingleInspectionReport'

export default function InspectionReportsPage() {
  const [reports, setReports] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [inspectionReport, setInspectionReport] = useState(null)
  const [filters, setFilters] = useState({
    customer_id: '',
    start_date: '',
    end_date: '',
  })

  useEffect(() => {
    fetchCustomers()
    fetchReports()
  }, [])

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('id, name')
      .order('name')

    setCustomers(data || [])
  }

  const fetchReports = async (nextFilters = filters) => {
    setLoading(true)

    let query = supabase
      .from('stock_records')
      .select(`
        *,
        products (name, spec, warehouse, prize_type),
        customers (name),
        profiles (name)
      `)
      .eq('type', 'out')
      .order('stock_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (nextFilters.customer_id) {
      query = query.eq('customer_id', nextFilters.customer_id)
    }
    if (nextFilters.start_date) {
      query = query.gte('stock_date', nextFilters.start_date)
    }
    if (nextFilters.end_date) {
      query = query.lte('stock_date', nextFilters.end_date)
    }

    const { data } = await query
    const normalizedData = (data || []).filter((record) => !record.remark?.startsWith('盘点调整'))

    setReports(normalizedData)
    setLoading(false)
  }

  const handleFilter = (e) => {
    e.preventDefault()
    fetchReports(filters)
  }

  const clearFilters = () => {
    const nextFilters = {
      customer_id: '',
      start_date: '',
      end_date: '',
    }
    setFilters(nextFilters)
    fetchReports(nextFilters)
  }

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return reports

    return reports.filter((record) => {
      const fields = [
        record.customers?.name,
        record.products?.name,
        record.products?.spec,
        record.stock_date,
        record.production_date,
        record.remark,
        record.profiles?.name,
      ]

      return fields.some((field) => (field || '').toLowerCase().includes(term))
    })
  }, [reports, searchTerm])

  const summary = useMemo(() => {
    const totalQuantity = filteredReports.reduce((sum, record) => sum + (record.quantity || 0), 0)
    const customerCount = new Set(
      filteredReports
        .map((record) => record.customers?.name)
        .filter((name) => name)
    ).size

    return {
      totalQuantity,
      customerCount,
    }
  }, [filteredReports])

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">出厂检验报告</h1>
          <p className="text-slate-500">基于出库记录汇总出厂检验报告，支持快速检索与打印</p>
        </div>
        <div className="surface-inset px-4 py-3 text-sm text-slate-600">
          共 {filteredReports.length} 条出货记录 · 客户 {summary.customerCount} 个 · 数量 {summary.totalQuantity}
        </div>
      </div>

      <div className="surface-card p-4 mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
          <div className="w-64">
            <label className="block text-slate-600 text-sm mb-1">客户</label>
            <select
              value={filters.customer_id}
              onChange={(e) => setFilters({ ...filters, customer_id: e.target.value })}
              className="select-field"
            >
              <option value="">全部客户</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div className="w-40">
            <label className="block text-slate-600 text-sm mb-1">开始日期</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="w-40">
            <label className="block text-slate-600 text-sm mb-1">结束日期</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="w-64">
            <label className="block text-slate-600 text-sm mb-1">关键词</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
              placeholder="客户/产品/规格/日期/操作人"
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">
              筛选
            </button>
            <button type="button" onClick={clearFilters} className="btn-ghost">
              清空
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="surface-card p-12 text-center text-slate-500">加载中...</div>
      ) : filteredReports.length === 0 ? (
        <div className="surface-card p-12 text-center text-slate-500">暂无符合条件的出货记录</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base table-comfy table-row-hover">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3">出库日期</th>
                  <th className="px-6 py-3">客户</th>
                  <th className="px-6 py-3">产品</th>
                  <th className="px-6 py-3">规格</th>
                  <th className="px-6 py-3">生产日期</th>
                  <th className="px-6 py-3">数量</th>
                  <th className="px-6 py-3">操作人</th>
                  <th className="px-6 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReports.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 whitespace-nowrap text-slate-900">{record.stock_date}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-700">{record.customers?.name || '-'}</td>
                    <td className="px-6 py-3 whitespace-nowrap font-medium text-slate-900">{record.products?.name}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-500">{record.products?.spec}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-500">{record.production_date || '-'}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-amber-600 font-semibold">-{record.quantity}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-500">{record.profiles?.name || '-'}</td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <button
                        onClick={() => setInspectionReport({
                          productName: record.products?.name,
                          productSpec: record.products?.spec,
                          productionDate: record.production_date || record.stock_date,
                        })}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        查看/打印
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inspectionReport && (
        <SingleInspectionReport
          productName={inspectionReport.productName}
          productSpec={inspectionReport.productSpec}
          productionDate={inspectionReport.productionDate}
          onClose={() => setInspectionReport(null)}
        />
      )}
    </DashboardLayout>
  )
}
