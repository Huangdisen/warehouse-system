'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET_NAME = 'third-party-reports'
const BRAND_OPTIONS = ['百越', '珍利厨', '怡兴祥']
const DEFAULT_AGENCIES = ['谱尼测试']
const STORAGE_KEY_UPLOADER = 'third_party_report_uploader'
const STORAGE_KEY_AGENCIES = 'third_party_report_agencies'

const normalizeSearchField = (value) => (value || '').toString().toLowerCase()

// 获取保存的检测机构列表
const getSavedAgencies = () => {
  if (typeof window === 'undefined') return DEFAULT_AGENCIES
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AGENCIES)
    if (saved) {
      const parsed = JSON.parse(saved)
      // 合并默认机构和保存的机构，去重
      return [...new Set([...DEFAULT_AGENCIES, ...parsed])]
    }
  } catch {}
  return DEFAULT_AGENCIES
}

// 保存新的检测机构
const saveNewAgency = (agency) => {
  if (typeof window === 'undefined' || !agency) return
  try {
    const current = getSavedAgencies()
    if (!current.includes(agency)) {
      const custom = current.filter(a => !DEFAULT_AGENCIES.includes(a))
      custom.push(agency)
      localStorage.setItem(STORAGE_KEY_AGENCIES, JSON.stringify(custom))
    }
  } catch {}
}

// 获取保存的上传人
const getSavedUploader = () => {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(STORAGE_KEY_UPLOADER) || ''
  } catch {}
  return ''
}

// 保存上传人
const saveUploader = (name) => {
  if (typeof window === 'undefined' || !name) return
  try {
    localStorage.setItem(STORAGE_KEY_UPLOADER, name)
  } catch {}
}

export default function ThirdPartyInspectionReports({ reportType, title, description }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [role, setRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [agencies, setAgencies] = useState(DEFAULT_AGENCIES)
  const [showNewAgency, setShowNewAgency] = useState(false)
  const [newAgency, setNewAgency] = useState('')
  const [editShowNewAgency, setEditShowNewAgency] = useState(false)
  const [editNewAgency, setEditNewAgency] = useState('')
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
  })
  const [formData, setFormData] = useState({
    report_name: '',
    brand: '',
    product_spec: '',
    report_date: '',
    testing_agency: '',
    uploader_name: '',
    remark: '',
    file: null,
  })
  const [downloadingId, setDownloadingId] = useState(null)
  const [editingReport, setEditingReport] = useState(null)
  const [editData, setEditData] = useState({
    report_name: '',
    brand: '',
    product_spec: '',
    report_date: '',
    testing_agency: '',
    uploader_name: '',
    remark: '',
    file: null,
  })

  useEffect(() => {
    fetchRole()
    fetchReports()
    // 加载保存的检测机构和上传人
    setAgencies(getSavedAgencies())
    const savedUploader = getSavedUploader()
    if (savedUploader) {
      setFormData(prev => ({ ...prev, uploader_name: savedUploader }))
    }
  }, [])

  const fetchRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserId(user.id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    setRole(profile?.role || 'staff')
  }

  const fetchReports = async (nextFilters = filters) => {
    setLoading(true)

    let query = supabase
      .from('third_party_inspection_reports')
      .select(`
        *,
        profiles (name)
      `)
      .eq('report_type', reportType)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (nextFilters.start_date) {
      query = query.gte('report_date', nextFilters.start_date)
    }
    if (nextFilters.end_date) {
      query = query.lte('report_date', nextFilters.end_date)
    }

    const { data } = await query
    setReports(data || [])
    setLoading(false)
  }

  const handleFilter = (e) => {
    e.preventDefault()
    fetchReports(filters)
  }

  const clearFilters = () => {
    const nextFilters = { start_date: '', end_date: '' }
    setFilters(nextFilters)
    fetchReports(nextFilters)
  }

  const filteredReports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return reports

    return reports.filter((record) => {
      const fields = [
        record.report_name,
        record.brand,
        record.product_spec,
        record.report_date,
        record.testing_agency,
        record.uploader_name,
        record.remark,
        record.file_name,
        record.profiles?.name,
      ]

      return fields.some((field) => normalizeSearchField(field).includes(term))
    })
  }, [reports, searchTerm])

  const canUpload = role === 'admin' || role === 'staff'

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null
    setFormData((prev) => ({ ...prev, file }))
  }

  const handleEditFileChange = (event) => {
    const file = event.target.files?.[0] || null
    setEditData((prev) => ({ ...prev, file }))
  }

  const resetForm = () => {
    const savedUploader = getSavedUploader()
    setFormData({
      report_name: '',
      brand: '',
      product_spec: '',
      report_date: '',
      testing_agency: '',
      uploader_name: savedUploader,
      remark: '',
      file: null,
    })
    setShowNewAgency(false)
    setNewAgency('')
  }

  const openEditModal = (record) => {
    setEditingReport(record)
    setEditData({
      report_name: record.report_name || '',
      brand: record.brand || '',
      product_spec: record.product_spec || '',
      report_date: record.report_date || '',
      testing_agency: record.testing_agency || '',
      uploader_name: record.uploader_name || '',
      remark: record.remark || '',
      file: null,
    })
    setEditShowNewAgency(false)
    setEditNewAgency('')
  }

  const closeEditModal = () => {
    setEditingReport(null)
    setEditShowNewAgency(false)
    setEditNewAgency('')
  }

  const handleUpload = async (event) => {
    event.preventDefault()

    if (!formData.file) {
      alert('请选择要上传的文件')
      return
    }
    if (!formData.report_name.trim()) {
      alert('请输入报告名称')
      return
    }
    if (!userId) {
      alert('登录信息失效，请刷新后重试')
      return
    }

    // 处理新增检测机构
    let finalAgency = formData.testing_agency
    if (showNewAgency && newAgency.trim()) {
      finalAgency = newAgency.trim()
      saveNewAgency(finalAgency)
      setAgencies(getSavedAgencies())
    }

    // 保存上传人
    if (formData.uploader_name.trim()) {
      saveUploader(formData.uploader_name.trim())
    }

    setUploading(true)
    try {
      const safeName = formData.file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const uniqueSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const dateFolder = new Date().toISOString().slice(0, 10)
      const filePath = `${reportType}/${dateFolder}/${uniqueSuffix}_${safeName}`

      const { error: uploadError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .upload(filePath, formData.file, { upsert: false })

      if (uploadError) {
        throw uploadError
      }

      const { error: insertError } = await supabase
        .from('third_party_inspection_reports')
        .insert({
          report_type: reportType,
          report_name: formData.report_name.trim(),
          brand: formData.brand || null,
          product_spec: formData.product_spec.trim() || null,
          customer_id: null,
          report_date: formData.report_date || null,
          testing_agency: finalAgency || null,
          uploader_name: formData.uploader_name.trim() || null,
          remark: formData.remark || null,
          file_path: filePath,
          file_name: formData.file.name,
          file_size: formData.file.size,
          uploaded_by: userId,
        })

      if (insertError) {
        throw insertError
      }

      resetForm()
      fetchReports()
    } catch (error) {
      alert('上传失败：' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (record) => {
    if (!record.file_path) return

    setDownloadingId(record.id)
    try {
      const { data, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .createSignedUrl(record.file_path, 60 * 5)

      if (error) throw error

      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      alert('下载失败：' + error.message)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleUpdate = async (event) => {
    event.preventDefault()

    if (!editingReport) return
    if (!editData.report_name.trim()) {
      alert('请输入报告名称')
      return
    }

    // 处理新增检测机构
    let finalAgency = editData.testing_agency
    if (editShowNewAgency && editNewAgency.trim()) {
      finalAgency = editNewAgency.trim()
      saveNewAgency(finalAgency)
      setAgencies(getSavedAgencies())
    }

    setUploading(true)
    let newFilePath = editingReport.file_path
    let newFileName = editingReport.file_name
    let newFileSize = editingReport.file_size
    let uploadedNewFile = false

    try {
      if (editData.file) {
        const safeName = editData.file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
        const uniqueSuffix = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.floor(Math.random() * 10000)}`
        const dateFolder = new Date().toISOString().slice(0, 10)
        const filePath = `${reportType}/${dateFolder}/${uniqueSuffix}_${safeName}`

        const { error: uploadError } = await supabase
          .storage
          .from(BUCKET_NAME)
          .upload(filePath, editData.file, { upsert: false })

        if (uploadError) throw uploadError

        newFilePath = filePath
        newFileName = editData.file.name
        newFileSize = editData.file.size
        uploadedNewFile = true
      }

      const { error: updateError } = await supabase
        .from('third_party_inspection_reports')
        .update({
          report_name: editData.report_name.trim(),
          brand: editData.brand || null,
          product_spec: editData.product_spec.trim() || null,
          report_date: editData.report_date || null,
          testing_agency: finalAgency || null,
          uploader_name: editData.uploader_name.trim() || null,
          remark: editData.remark || null,
          file_path: newFilePath,
          file_name: newFileName,
          file_size: newFileSize,
        })
        .eq('id', editingReport.id)

      if (updateError) throw updateError

      if (uploadedNewFile && editingReport.file_path) {
        await supabase.storage.from(BUCKET_NAME).remove([editingReport.file_path])
      }

      closeEditModal()
      fetchReports()
    } catch (error) {
      if (uploadedNewFile && newFilePath) {
        await supabase.storage.from(BUCKET_NAME).remove([newFilePath])
      }
      alert('编辑失败：' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (record) => {
    const confirmed = window.confirm(`确定删除报告「${record.report_name}」吗？`)
    if (!confirmed) return

    setUploading(true)
    try {
      if (record.file_path) {
        const { error: removeError } = await supabase
          .storage
          .from(BUCKET_NAME)
          .remove([record.file_path])
        if (removeError) throw removeError
      }

      const { error: deleteError } = await supabase
        .from('third_party_inspection_reports')
        .delete()
        .eq('id', record.id)

      if (deleteError) throw deleteError

      fetchReports()
    } catch (error) {
      alert('删除失败：' + error.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="text-slate-500">{description}</p>
      </div>

      {canUpload && (
        <div className="surface-card p-4 mb-6">
          <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-slate-600 text-sm mb-1">报告名称 *</label>
              <input
                type="text"
                value={formData.report_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, report_name: e.target.value }))}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">品牌</label>
              <select
                value={formData.brand}
                onChange={(e) => setFormData((prev) => ({ ...prev, brand: e.target.value }))}
                className="input-field"
              >
                <option value="">请选择品牌（可选）</option>
                {BRAND_OPTIONS.map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">产品规格</label>
              <input
                type="text"
                value={formData.product_spec}
                onChange={(e) => setFormData((prev) => ({ ...prev, product_spec: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">报告日期</label>
              <input
                type="date"
                value={formData.report_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, report_date: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">检测机构</label>
              {!showNewAgency ? (
                <div className="flex gap-2">
                  <select
                    value={formData.testing_agency}
                    onChange={(e) => setFormData((prev) => ({ ...prev, testing_agency: e.target.value }))}
                    className="input-field flex-1"
                  >
                    <option value="">请选择检测机构</option>
                    {agencies.map((agency) => (
                      <option key={agency} value={agency}>{agency}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewAgency(true)}
                    className="btn-ghost text-sm whitespace-nowrap"
                  >
                    + 新增
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAgency}
                    onChange={(e) => setNewAgency(e.target.value)}
                    className="input-field flex-1"
                    placeholder="输入新检测机构名称"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewAgency(false)
                      setNewAgency('')
                    }}
                    className="btn-ghost text-sm"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">上传人</label>
              <input
                type="text"
                value={formData.uploader_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, uploader_name: e.target.value }))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">备注</label>
              <input
                type="text"
                value={formData.remark}
                onChange={(e) => setFormData((prev) => ({ ...prev, remark: e.target.value }))}
                className="input-field"
                placeholder="可选"
              />
            </div>

            <div>
              <label className="block text-slate-600 text-sm mb-1">上传文件 *</label>
              <input
                type="file"
                onChange={handleFileChange}
                className="input-field"
                required
              />
            </div>

            <div className="flex items-end justify-end">
              <button type="submit" className="btn-primary" disabled={uploading}>
                {uploading ? '上传中...' : '上传记录'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="surface-card p-4 mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">

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
              placeholder="报告名称/日期/备注/上传人/文件名"
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
        <div className="surface-card p-12 text-center text-slate-500">暂无第三方检验报告</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base table-comfy table-row-hover">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3">报告名称</th>
                  <th className="px-6 py-3">品牌</th>
                  <th className="px-6 py-3">产品规格</th>
                  <th className="px-6 py-3">报告日期</th>
                  <th className="px-6 py-3">检测机构</th>
                  <th className="px-6 py-3">上传人</th>
                  <th className="px-6 py-3">备注</th>
                  <th className="px-6 py-3">文件</th>
                  {canUpload && <th className="px-6 py-3">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredReports.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 whitespace-nowrap font-medium text-slate-900">
                      {record.report_name}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                      {record.brand || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                      {record.product_spec || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                      {record.report_date || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                      {record.testing_agency || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                      {record.uploader_name || record.profiles?.name || '-'}
                    </td>
                    <td className="px-6 py-3 text-slate-500 max-w-xs truncate">
                      {record.remark || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleDownload(record)}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        disabled={downloadingId === record.id}
                      >
                        {downloadingId === record.id ? '生成中...' : '查看/下载'}
                      </button>
                    </td>
                    {canUpload && (
                      <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600">
                        <button
                          onClick={() => openEditModal(record)}
                          className="text-slate-600 hover:text-slate-900 hover:underline mr-3"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(record)}
                          className="text-rose-600 hover:text-rose-700 hover:underline"
                        >
                          删除
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingReport && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">编辑报告</h2>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-600 text-sm">
                关闭
              </button>
            </div>

            <form onSubmit={handleUpdate} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-slate-600 text-sm mb-1">报告名称 *</label>
                <input
                  type="text"
                  value={editData.report_name}
                  onChange={(e) => setEditData((prev) => ({ ...prev, report_name: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">品牌</label>
                <select
                  value={editData.brand}
                  onChange={(e) => setEditData((prev) => ({ ...prev, brand: e.target.value }))}
                  className="input-field"
                >
                  <option value="">请选择品牌（可选）</option>
                  {BRAND_OPTIONS.map((brand) => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">产品规格</label>
                <input
                  type="text"
                  value={editData.product_spec}
                  onChange={(e) => setEditData((prev) => ({ ...prev, product_spec: e.target.value }))}
                  className="input-field"
                  />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">报告日期</label>
                <input
                  type="date"
                  value={editData.report_date}
                  onChange={(e) => setEditData((prev) => ({ ...prev, report_date: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">检测机构</label>
                {!editShowNewAgency ? (
                  <div className="flex gap-2">
                    <select
                      value={editData.testing_agency}
                      onChange={(e) => setEditData((prev) => ({ ...prev, testing_agency: e.target.value }))}
                      className="input-field flex-1"
                    >
                      <option value="">请选择检测机构</option>
                      {agencies.map((agency) => (
                        <option key={agency} value={agency}>{agency}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setEditShowNewAgency(true)}
                      className="btn-ghost text-sm whitespace-nowrap"
                    >
                      + 新增
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editNewAgency}
                      onChange={(e) => setEditNewAgency(e.target.value)}
                      className="input-field flex-1"
                      placeholder="输入新检测机构名称"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditShowNewAgency(false)
                        setEditNewAgency('')
                      }}
                      className="btn-ghost text-sm"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">上传人</label>
                <input
                  type="text"
                  value={editData.uploader_name}
                  onChange={(e) => setEditData((prev) => ({ ...prev, uploader_name: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">备注</label>
                <input
                  type="text"
                  value={editData.remark}
                  onChange={(e) => setEditData((prev) => ({ ...prev, remark: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-sm mb-1">替换文件（可选）</label>
                <input type="file" onChange={handleEditFileChange} className="input-field" />
              </div>

              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeEditModal} className="btn-ghost">
                  取消
                </button>
                <button type="submit" className="btn-primary" disabled={uploading}>
                  {uploading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
