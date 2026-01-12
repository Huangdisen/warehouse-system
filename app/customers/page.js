'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerRecords, setCustomerRecords] = useState([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [deleteModal, setDeleteModal] = useState({ show: false, customer: null })
  const [searchTerm, setSearchTerm] = useState('')
  const [role, setRole] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    phone: '',
    address: '',
    remark: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchCustomers()
    fetchRole()
  }, [])

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .order('name')

    setCustomers(data || [])
    setLoading(false)
  }

  const fetchRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    setRole(profile?.role || 'staff')
  }

  const openModal = () => {
    setEditingCustomer(null)
    setFormData({ name: '', contact: '', phone: '', address: '', remark: '' })
    setShowModal(true)
  }

  const openEditModal = (customer, e) => {
    e.stopPropagation() // 阻止触发卡片点击事件
    setEditingCustomer(customer)
    setFormData({
      name: customer.name,
      contact: customer.contact || '',
      phone: customer.phone || '',
      address: customer.address || '',
      remark: customer.remark || '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCustomer(null)
    setFormData({ name: '', contact: '', phone: '', address: '', remark: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    const customerData = {
      name: formData.name,
      contact: formData.contact || null,
      phone: formData.phone || null,
      address: formData.address || null,
      remark: formData.remark || null,
    }

    let error
    if (editingCustomer) {
      // 编辑
      const result = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', editingCustomer.id)
      error = result.error
    } else {
      // 新增
      const result = await supabase
        .from('customers')
        .insert(customerData)
      error = result.error
    }

    if (!error) {
      fetchCustomers()
      closeModal()
    } else {
      alert('保存失败：' + error.message)
    }

    setSubmitting(false)
  }

  const viewCustomerRecords = async (customer) => {
    setSelectedCustomer(customer)
    setRecordsLoading(true)

    const { data } = await supabase
      .from('stock_records')
      .select(`
        *,
        products (name, spec, warehouse, prize_type),
        profiles (name)
      `)
      .eq('customer_id', customer.id)
      .eq('type', 'out')
      .order('stock_date', { ascending: false })

    setCustomerRecords(data || [])
    setRecordsLoading(false)
  }

  const closeRecordsView = () => {
    setSelectedCustomer(null)
    setCustomerRecords([])
  }

  const filteredCustomers = customers.filter((customer) => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return true

    const fields = [
      customer.name,
      customer.contact,
      customer.phone,
      customer.address,
      customer.remark,
    ]

    return fields.some((field) => (field || '').toLowerCase().includes(term))
  })

  const openDeleteModal = (customer, e) => {
    e.stopPropagation() // 阻止触发卡片点击事件
    setDeleteModal({ show: true, customer })
  }

  const handleDelete = async () => {
    const customer = deleteModal.customer
    if (!customer) return

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', customer.id)

    if (!error) {
      fetchCustomers()
      setDeleteModal({ show: false, customer: null })
    } else {
      alert('删除失败：' + error.message)
    }
  }

  // 计算客户出库总量
  const getCustomerStats = (customerId) => {
    // 这里简化处理，实际可以在查询时统计
    return null
  }

  const isViewer = role === 'viewer'

  return (
    <DashboardLayout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="space-y-2 w-full md:w-auto">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">客户管理</h1>
            <p className="text-gray-500">管理客户信息，查看出库记录</p>
          </div>
          <div className="relative w-full md:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="搜索客户/联系人/电话"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="清除"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {!isViewer && (
          <button
            onClick={openModal}
            className="self-start md:self-auto bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
          >
            + 添加客户
          </button>
        )}
      </div>

      {/* 客户记录详情 */}
      {selectedCustomer && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{selectedCustomer.name} - 出库记录</h2>
              {selectedCustomer.contact && (
                <p className="text-gray-500 text-sm">联系人: {selectedCustomer.contact} {selectedCustomer.phone}</p>
              )}
            </div>
            <button
              onClick={closeRecordsView}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕ 关闭
            </button>
          </div>

          {recordsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : customerRecords.length === 0 ? (
            <p className="text-gray-500 text-center py-8">暂无出库记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">仓库</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">产品</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">规格</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">奖项</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">生产日期</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">数量</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {customerRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-gray-900">{record.stock_date}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500">
                        {record.products?.warehouse === 'finished' ? '成品仓' : '半成品仓'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{record.products?.name}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500">{record.products?.spec}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500">{record.products?.prize_type || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-gray-500">{record.production_date || '-'}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-orange-600 font-semibold">-{record.quantity}</td>
                      <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{record.remark || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                <span className="text-gray-600">总出库数量：</span>
                <span className="font-bold text-orange-600">
                  {customerRecords.reduce((sum, r) => sum + r.quantity, 0)} 件
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 客户列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">暂无客户，点击上方按钮添加</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">未找到匹配的客户，换个关键词试试</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              onClick={() => viewCustomerRecords(customer)}
              className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition border-l-4 border-blue-500 relative"
            >
              {!isViewer && (
                <div className="absolute top-2 right-2 flex space-x-2">
                  <button
                    onClick={(e) => openEditModal(customer, e)}
                    className="text-gray-400 hover:text-blue-600 transition"
                    title="编辑"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => openDeleteModal(customer, e)}
                    className="text-gray-400 hover:text-red-600 transition"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              )}
              <h3 className="font-bold text-gray-800 text-lg pr-16">{customer.name}</h3>
              {customer.contact && (
                <p className="text-gray-500 text-sm mt-1">联系人: {customer.contact}</p>
              )}
              {customer.phone && (
                <p className="text-gray-500 text-sm">电话: {customer.phone}</p>
              )}
              {customer.address && (
                <p className="text-gray-500 text-sm truncate">地址: {customer.address}</p>
              )}
              <p className="text-blue-600 text-sm mt-2">点击查看出库记录 →</p>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑客户弹窗 */}
      {showModal && !isViewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{editingCustomer ? '编辑客户' : '添加客户'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  客户名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="客户/公司名称"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">联系人</label>
                <input
                  type="text"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="联系人姓名"
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">电话</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="联系电话"
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-medium mb-2">地址</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="地址"
                />
              </div>
              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-medium mb-2">备注</label>
                <textarea
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="2"
                  placeholder="备注信息"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">删除客户</h2>
            <p className="text-gray-600 mb-6">
              确认删除客户 <span className="font-bold">{deleteModal.customer?.name}</span> 吗？
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteModal({ show: false, customer: null })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
