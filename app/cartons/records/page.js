'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function CartonRecordsPage() {
  const searchParams = useSearchParams()
  const [records, setRecords] = useState([])
  const [cartons, setCartons] = useState([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState('all') // 'all' | 'in' | 'out'
  const [filterCarton, setFilterCarton] = useState(() => searchParams.get('carton_id') || '')
  const [formData, setFormData] = useState({
    carton_id: '',
    type: 'in',
    quantity: '',
    stock_date: new Date().toISOString().split('T')[0],
    remark: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchProfile()
    fetchCartons()
    fetchRecords()
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [filterType, filterCarton])

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

  const fetchCartons = async () => {
    const { data } = await supabase
      .from('cartons')
      .select('*')
      .order('name', { ascending: true })
    setCartons(data || [])
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('carton_records')
      .select(`
        *,
        carton:cartons(id, name, spec),
        operator:profiles(id, name)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filterType !== 'all') {
      query = query.eq('type', filterType)
    }

    if (filterCarton) {
      query = query.eq('carton_id', filterCarton)
    }

    const { data, error } = await query

    if (!error) {
      setRecords(data || [])
    }
    setLoading(false)
  }

  const openModal = () => {
    setFormData({
      carton_id: '',
      type: 'in',
      quantity: '',
      stock_date: new Date().toISOString().split('T')[0],
      remark: '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.carton_id) {
      alert('请选择纸箱')
      return
    }

    if (!formData.quantity || parseInt(formData.quantity) <= 0) {
      alert('请输入有效数量')
      return
    }

    setSubmitting(true)

    const { data: { session } } = await supabase.auth.getSession()

    // 插入记录
    const { error: recordError } = await supabase
      .from('carton_records')
      .insert({
        carton_id: formData.carton_id,
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

    // 更新纸箱库存
    const carton = cartons.find(c => c.id === formData.carton_id)
    const newQuantity = formData.type === 'in'
      ? carton.quantity + parseInt(formData.quantity)
      : carton.quantity - parseInt(formData.quantity)

    const { error: updateError } = await supabase
      .from('cartons')
      .update({
        quantity: newQuantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', formData.carton_id)

    if (updateError) {
      alert('更新库存失败：' + updateError.message)
    } else {
      fetchRecords()
      fetchCartons()
      closeModal()
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

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <Link href="/cartons" className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 hover:text-slate-900 mb-3 transition">
            ← 返回纸箱管理
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">纸箱出入库记录</h1>
          <p className="text-slate-500">查看纸箱采购入库和生产消耗记录</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cartons" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            纸箱管理
          </Link>
          <Link href="/cartons/bindding" className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 hover:border-slate-300 transition shadow-sm">
            产品关联
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
            onClick={() => setFilterType('in')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterType === 'in'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            入库
          </button>
          <button
            onClick={() => setFilterType('out')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterType === 'out'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            出库
          </button>
        </div>
        <select
          value={filterCarton}
          onChange={(e) => setFilterCarton(e.target.value)}
          className="input-field text-sm py-1.5 w-full md:w-64"
        >
          <option value="">全部纸箱</option>
          {cartons.map((carton) => (
            <option key={carton.id} value={carton.id}>
              {carton.name} {carton.spec ? `(${carton.spec})` : ''}
            </option>
          ))}
        </select>
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
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">纸箱</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">数量</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700">来源</th>
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
                        <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          入库
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-rose-100 text-rose-700 font-medium">
                          出库
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900">{record.carton?.name || '-'}</span>
                      {record.carton?.spec && (
                        <span className="text-xs text-slate-500 ml-1">({record.carton.spec})</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-lg font-semibold tabular-nums ${
                        record.type === 'in' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {record.type === 'in' ? '+' : '-'}{record.quantity}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {record.source_type === 'auto' ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                          自动扣减
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                          手动
                        </span>
                      )}
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
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              纸箱入库/出库
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  选择纸箱
                </label>
                <select
                  value={formData.carton_id}
                  onChange={(e) => setFormData({ ...formData, carton_id: e.target.value })}
                  className="input-field"
                  required
                >
                  <option value="">-- 请选择 --</option>
                  {cartons.map((carton) => (
                    <option key={carton.id} value={carton.id}>
                      {carton.name} {carton.spec ? `(${carton.spec})` : ''} [当前库存: {carton.quantity}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  操作类型
                </label>
                <div className="flex gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition ${
                    formData.type === 'in'
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
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
                    formData.type === 'out'
                      ? 'border-rose-500 bg-rose-50'
                      : 'border-slate-200 hover:border-slate-300'
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
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  数量
                </label>
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
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  日期
                </label>
                <input
                  type="date"
                  value={formData.stock_date}
                  onChange={(e) => setFormData({ ...formData, stock_date: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-slate-700 text-sm font-medium mb-2">
                  备注
                </label>
                <input
                  type="text"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="input-field"
                  placeholder="可选，如：采购批次号、领用原因等"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn-ghost"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary"
                >
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
