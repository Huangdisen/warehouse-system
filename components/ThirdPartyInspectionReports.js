'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET_NAME = 'third-party-reports'

const normalizeSearchField = (value) => (value || '').toString().toLowerCase()

export default function ThirdPartyInspectionReports({ reportType, title, description }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [role, setRole] = useState(null)
  const [userId, setUserId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
  })
  const [formData, setFormData] = useState({
    report_name: '',
    report_date: '',
    remark: '',
    file: null,
  })
  const [downloadingId, setDownloadingId] = useState(null)
  const [editingReport, setEditingReport] = useState(null)
  const [editData, setEditData] = useState({
    report_name: '',
    report_date: '',
    remark: '',
    file: null,
  })

  useEffect(() => {
    fetchRole()
    fetchReports()
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
        record.report_date,
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
    setFormData({
      report_name: '',
      report_date: '',
      remark: '',
      file: null,
    })
  }

  const openEditModal = (record) => {
    setEditingReport(record)
    setEditData({
      report_name: record.report_name || '',
      report_date: record.report_date || '',
      remark: record.remark || '',
      file: null,
    })
  }

  const closeEditModal = () => {
    setEditingReport(null)
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
          customer_id: null,
          report_date: formData.report_date || null,
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
          report_date: editData.report_date || null,
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
          <form onSubmit={handleUpload} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-slate-600 text-sm mb-1">报告名称</label>
              <input
                type="text"
                value={formData.report_name}
                onChange={(e) => setFormData((prev) => ({ ...prev, report_name: e.target.value }))}
                className="input-field"
                placeholder="例如：2026年XXX第三方检验报告"
                required
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
              <label className="block text-slate-600 text-sm mb-1">上传文件</label>
              <input
                type="file"
                onChange={handleFileChange}
                className="input-field"
                required
              />
            </div>

            <div className="md:col-span-2 flex justify-end">
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
                  <th className="px-6 py-3">报告日期</th>
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
                      {record.report_date || '-'}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-slate-600">
                      {record.profiles?.name || '-'}
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
          <div className="bg-white rounded-2xl shadow-xl w-[95vw] max-w-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">编辑报告</h2>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-slate-600 text-sm">
                关闭
              </button>
            </div>

            <form onSubmit={handleUpdate} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-slate-600 text-sm mb-1">报告名称</label>
                <input
                  type="text"
                  value={editData.report_name}
                  onChange={(e) => setEditData((prev) => ({ ...prev, report_name: e.target.value }))}
                  className="input-field"
                  required
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
