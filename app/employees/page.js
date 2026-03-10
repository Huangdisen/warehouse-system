'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const BUCKET = 'employee-documents'

const DOC_TYPES = [
  { value: 'contract', label: '劳动合同', color: 'bg-blue-100 text-blue-700' },
  { value: 'health_cert', label: '健康证', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'insurance', label: '保险', color: 'bg-amber-100 text-amber-700' },
  { value: 'other', label: '其他', color: 'bg-slate-100 text-slate-600' },
]

const DEPARTMENTS = ['包装部', '煮制部', '办公室', '业务员']

const getDocTypeInfo = (value) => DOC_TYPES.find(d => d.value === value) || DOC_TYPES[3]

function calcWorkYears(hireDate, endDate) {
  if (!hireDate) return null
  const start = new Date(hireDate)
  const end = endDate ? new Date(endDate) : new Date()
  let years = end.getFullYear() - start.getFullYear()
  let months = end.getMonth() - start.getMonth()
  if (months < 0) { years--; months += 12 }
  if (end.getDate() < start.getDate()) {
    months--
    if (months < 0) { years--; months += 12 }
  }
  if (years <= 0 && months <= 0) return '不足1个月'
  if (years <= 0) return `${months}个月`
  if (months === 0) return `${years}年`
  return `${years}年${months}个月`
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
  return diff
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [documents, setDocuments] = useState({})
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterDept, setFilterDept] = useState('all')

  const [showModal, setShowModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [detailEmployee, setDetailEmployee] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({ doc_type: 'contract', expiry_date: '', remark: '' })
  const fileInputRef = useRef(null)

  const [deleteModal, setDeleteModal] = useState({ show: false, employee: null })
  const [deleteDocModal, setDeleteDocModal] = useState({ show: false, doc: null })
  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const modalFileInputRef = useRef(null)
  const [modalUploadForm, setModalUploadForm] = useState({ doc_type: 'contract', expiry_date: '', remark: '' })
  const [pendingFiles, setPendingFiles] = useState([])

  const emptyForm = {
    name: '', phone: '', id_number: '', gender: 'male', birth_date: '',
    hire_date: new Date().toISOString().split('T')[0], department: '', position: '',
    status: 'active', resign_date: '', contract_start: '', contract_end: '',
    health_cert_expiry: '', insurance_type: '', insurance_start: '',
    emergency_contact: '', emergency_phone: '', address: '', remark: '',
  }
  const [formData, setFormData] = useState(emptyForm)

  useEffect(() => {
    fetchProfile()
    fetchEmployees()
  }, [])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      setUserId(session.user.id)
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
      setIsAdmin(data?.role === 'admin')
    }
  }

  const fetchEmployees = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('status', { ascending: true })
      .order('hire_date', { ascending: true })
    if (!error) setEmployees(data || [])
    setLoading(false)
  }

  const fetchDocuments = async (employeeId) => {
    const { data } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
    setDocuments(prev => ({ ...prev, [employeeId]: data || [] }))
  }

  const openModal = (emp = null) => {
    if (emp) {
      setEditingEmployee(emp)
      setFormData({
        name: emp.name || '', phone: emp.phone || '', id_number: emp.id_number || '',
        gender: emp.gender || 'male', birth_date: emp.birth_date || '',
        hire_date: emp.hire_date || '', department: emp.department || '', position: emp.position || '',
        status: emp.status || 'active', resign_date: emp.resign_date || '',
        contract_start: emp.contract_start || '', contract_end: emp.contract_end || '',
        health_cert_expiry: emp.health_cert_expiry || '',
        insurance_type: emp.insurance_type || '', insurance_start: emp.insurance_start || '',
        emergency_contact: emp.emergency_contact || '', emergency_phone: emp.emergency_phone || '',
        address: emp.address || '', remark: emp.remark || '',
      })
    } else {
      setEditingEmployee(null)
      setFormData(emptyForm)
    }
    setPendingFiles([])
    setModalUploadForm({ doc_type: 'contract', expiry_date: '', remark: '' })
    setShowModal(true)
  }

  const handleModalFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFiles(prev => [...prev, {
      id: Date.now() + '_' + Math.random(),
      file,
      doc_type: modalUploadForm.doc_type,
      expiry_date: modalUploadForm.expiry_date,
      remark: modalUploadForm.remark,
    }])
    setModalUploadForm(p => ({ ...p, expiry_date: '', remark: '' }))
    if (modalFileInputRef.current) modalFileInputRef.current.value = ''
  }

  const removePendingFile = (id) => {
    setPendingFiles(prev => prev.filter(f => f.id !== id))
  }

  const uploadPendingFiles = async (employeeId) => {
    for (const pf of pendingFiles) {
      const safeName = pf.file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID() : `${Date.now()}_${Math.floor(Math.random() * 10000)}`
      const filePath = `${employeeId}/${pf.doc_type}/${uniqueId}_${safeName}`

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, pf.file, { upsert: false })
      if (uploadError) { alert(`上传 ${pf.file.name} 失败：${uploadError.message}`); continue }

      const { error: insertError } = await supabase.from('employee_documents').insert({
        employee_id: employeeId,
        doc_type: pf.doc_type,
        file_name: pf.file.name,
        file_path: filePath,
        file_size: pf.file.size,
        expiry_date: pf.expiry_date || null,
        remark: pf.remark || null,
        uploaded_by: userId,
      })
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([filePath])
        alert(`记录 ${pf.file.name} 失败：${insertError.message}`)
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) { alert('请填写姓名'); return }
    if (!formData.hire_date) { alert('请填写入职日期'); return }
    setSubmitting(true)

    const payload = {
      ...formData,
      name: formData.name.trim(),
      phone: formData.phone.trim() || null,
      id_number: formData.id_number.trim() || null,
      birth_date: formData.birth_date || null,
      department: formData.department.trim() || null,
      position: formData.position.trim() || null,
      resign_date: formData.status === 'resigned' ? (formData.resign_date || null) : null,
      contract_start: formData.contract_start || null,
      contract_end: formData.contract_end || null,
      health_cert_expiry: formData.health_cert_expiry || null,
      insurance_type: formData.insurance_type.trim() || null,
      insurance_start: formData.insurance_start || null,
      emergency_contact: formData.emergency_contact.trim() || null,
      emergency_phone: formData.emergency_phone.trim() || null,
      address: formData.address.trim() || null,
      remark: formData.remark.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let error, newId
    if (editingEmployee) {
      const { error: e } = await supabase.from('employees').update(payload).eq('id', editingEmployee.id)
      error = e
      newId = editingEmployee.id
    } else {
      const { data: inserted, error: e } = await supabase.from('employees').insert(payload).select('id').single()
      error = e
      newId = inserted?.id
    }

    if (error) {
      alert('保存失败：' + error.message)
    } else {
      if (pendingFiles.length > 0 && newId) {
        await uploadPendingFiles(newId)
      }
      fetchEmployees()
      setShowModal(false)
      setPendingFiles([])
      if (detailEmployee && editingEmployee?.id === detailEmployee.id) {
        const { data } = await supabase.from('employees').select('*').eq('id', editingEmployee.id).single()
        if (data) { setDetailEmployee(data); await fetchDocuments(data.id) }
      }
    }
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deleteModal.employee) return
    const { error } = await supabase.from('employees').delete().eq('id', deleteModal.employee.id)
    if (error) alert('删除失败：' + error.message)
    else {
      fetchEmployees()
      if (detailEmployee?.id === deleteModal.employee.id) { setShowDetail(false); setDetailEmployee(null) }
    }
    setDeleteModal({ show: false, employee: null })
  }

  const openDetail = async (emp) => {
    setDetailEmployee(emp)
    setShowDetail(true)
    await fetchDocuments(emp.id)
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !detailEmployee) return
    setUploading(true)

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID() : `${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const filePath = `${detailEmployee.id}/${uploadForm.doc_type}/${uniqueId}_${safeName}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: false })
    if (uploadError) {
      alert('上传失败：' + uploadError.message)
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const { error: insertError } = await supabase.from('employee_documents').insert({
      employee_id: detailEmployee.id,
      doc_type: uploadForm.doc_type,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      expiry_date: uploadForm.expiry_date || null,
      remark: uploadForm.remark.trim() || null,
      uploaded_by: userId,
    })

    if (insertError) {
      alert('记录保存失败：' + insertError.message)
      await supabase.storage.from(BUCKET).remove([filePath])
    } else {
      await fetchDocuments(detailEmployee.id)
      setUploadForm({ doc_type: 'contract', expiry_date: '', remark: '' })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
    setUploading(false)
  }

  const isPreviewable = (fileName) => {
    const ext = (fileName || '').split('.').pop().toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext)
  }

  const isImage = (fileName) => {
    const ext = (fileName || '').split('.').pop().toLowerCase()
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
  }

  const handlePreview = async (doc) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 600)
    if (error) { alert('获取预览失败：' + error.message); return }
    setPreviewDoc(doc)
    setPreviewUrl(data.signedUrl)
  }

  const handleDownload = async (doc) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 300)
    if (error) { alert('下载失败：' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDeleteDoc = async () => {
    if (!deleteDocModal.doc) return
    const doc = deleteDocModal.doc
    await supabase.storage.from(BUCKET).remove([doc.file_path])
    const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id)
    if (error) alert('删除失败：' + error.message)
    else if (detailEmployee) await fetchDocuments(detailEmployee.id)
    setDeleteDocModal({ show: false, doc: null })
  }

  const filteredEmployees = employees.filter(emp => {
    if (filterStatus !== 'all' && emp.status !== filterStatus) return false
    if (filterDept !== 'all' && emp.department !== filterDept) return false
    if (!searchTerm) return true
    const t = searchTerm.toLowerCase()
    return emp.name?.toLowerCase().includes(t) || emp.phone?.includes(t) || emp.department?.toLowerCase().includes(t) || emp.position?.toLowerCase().includes(t)
  })

  const activeCount = employees.filter(e => e.status === 'active').length
  const allDepartments = [...new Set(employees.map(e => e.department).filter(Boolean))]

  const expiringContracts = employees.filter(e => e.status === 'active' && e.contract_end && daysUntil(e.contract_end) !== null && daysUntil(e.contract_end) <= 90 && daysUntil(e.contract_end) >= 0)
  const expiringHealth = employees.filter(e => e.status === 'active' && e.health_cert_expiry && daysUntil(e.health_cert_expiry) !== null && daysUntil(e.health_cert_expiry) <= 60 && daysUntil(e.health_cert_expiry) >= 0)

  const empDocs = detailEmployee ? (documents[detailEmployee.id] || []) : []

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">员工档案</h1>
          <p className="text-slate-500">管理在职员工记录、合同、健康证和保险文件</p>
        </div>
        {isAdmin && (
          <button onClick={() => openModal()} className="px-4 py-2 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition shadow-sm">
            添加员工
          </button>
        )}
      </div>

      {/* 概况 + 预警 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 font-medium">在职人数</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{activeCount}</p>
        </div>
        <div className="surface-card p-4">
          <p className="text-xs text-slate-500 font-medium">全部人数</p>
          <p className="text-3xl font-black text-slate-900 mt-1">{employees.length}</p>
        </div>
        <div className={`surface-card p-4 ${expiringContracts.length > 0 ? 'border-amber-300 bg-amber-50/50' : ''}`}>
          <p className="text-xs text-slate-500 font-medium">合同即将到期</p>
          <p className={`text-3xl font-black mt-1 ${expiringContracts.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {expiringContracts.length}
          </p>
          {expiringContracts.length > 0 && <p className="text-xs text-amber-600 mt-1">90天内</p>}
        </div>
        <div className={`surface-card p-4 ${expiringHealth.length > 0 ? 'border-rose-300 bg-rose-50/50' : ''}`}>
          <p className="text-xs text-slate-500 font-medium">健康证即将到期</p>
          <p className={`text-3xl font-black mt-1 ${expiringHealth.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {expiringHealth.length}
          </p>
          {expiringHealth.length > 0 && <p className="text-xs text-rose-600 mt-1">60天内</p>}
        </div>
      </div>

      {/* 筛选 */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="搜索姓名、电话、部门、岗位..."
          className="w-full md:w-96 input-field"
        />
        <div className="flex flex-wrap gap-2">
          {[{ value: 'all', label: '全部' }, { value: 'active', label: '在职' }, { value: 'resigned', label: '离职' }].map(s => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(s.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                filterStatus === s.value
                  ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
              }`}
            >
              {s.label}
            </button>
          ))}
          <span className="text-slate-300 self-center">|</span>
          <button
            onClick={() => setFilterDept('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
              filterDept === 'all'
                ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
            }`}
          >
            全部门
          </button>
          {allDepartments.map(d => (
            <button
              key={d}
              onClick={() => setFilterDept(filterDept === d ? 'all' : d)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-150 ${
                filterDept === d
                  ? 'bg-slate-800 text-white shadow-inner translate-y-px'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px active:shadow-none active:translate-y-0.5'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* 员工列表 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-slate-500">{searchTerm ? '未找到匹配的员工' : '暂无员工记录'}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map(emp => {
            const workYears = calcWorkYears(emp.hire_date, emp.status === 'resigned' ? emp.resign_date : null)
            const contractDays = daysUntil(emp.contract_end)
            const healthDays = daysUntil(emp.health_cert_expiry)
            const isResigned = emp.status === 'resigned'

            return (
              <div
                key={emp.id}
                onClick={() => openDetail(emp)}
                className={`surface-card hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer ${isResigned ? 'opacity-60' : ''}`}
              >
                <div className="px-4 pt-4 pb-3 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-slate-900">{emp.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {emp.department && <span className="text-xs text-slate-500">{emp.department}</span>}
                        {emp.position && <span className="text-xs text-slate-400">{emp.position}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        isResigned ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isResigned ? '离职' : '在职'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">工龄</span>
                    <span className="text-sm font-semibold text-slate-900">{workYears || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">入职日期</span>
                    <span className="text-sm text-slate-700">{emp.hire_date}</span>
                  </div>
                  {emp.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">电话</span>
                      <span className="text-sm text-slate-700">{emp.phone}</span>
                    </div>
                  )}
                </div>

                {/* 预警标签 */}
                {!isResigned && (contractDays !== null && contractDays <= 90 || healthDays !== null && healthDays <= 60) && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {contractDays !== null && contractDays <= 90 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        contractDays <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {contractDays <= 0 ? '合同已到期' : `合同${contractDays}天后到期`}
                      </span>
                    )}
                    {healthDays !== null && healthDays <= 60 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        healthDays <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {healthDays <= 0 ? '健康证已过期' : `健康证${healthDays}天后到期`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 员工详情侧栏 */}
      {showDetail && detailEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) { setShowDetail(false) } }}>
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-semibold text-slate-900">{detailEmployee.name}</h2>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <>
                    <button onClick={() => openModal(detailEmployee)} className="text-sm text-slate-500 hover:text-slate-900 transition">编辑</button>
                    <button onClick={() => setDeleteModal({ show: true, employee: detailEmployee })} className="text-sm text-rose-500 hover:text-rose-700 transition">删除</button>
                  </>
                )}
                <button onClick={() => setShowDetail(false)} className="ml-2 text-slate-400 hover:text-slate-600 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">基本信息</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="状态" value={
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${detailEmployee.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {detailEmployee.status === 'active' ? '在职' : '离职'}
                    </span>
                  } />
                  <InfoItem label="工龄" value={<span className="font-bold text-slate-900">{calcWorkYears(detailEmployee.hire_date, detailEmployee.status === 'resigned' ? detailEmployee.resign_date : null) || '-'}</span>} />
                  <InfoItem label="性别" value={detailEmployee.gender === 'male' ? '男' : detailEmployee.gender === 'female' ? '女' : '-'} />
                  <InfoItem label="出生日期" value={detailEmployee.birth_date || '-'} />
                  <InfoItem label="电话" value={detailEmployee.phone || '-'} />
                  <InfoItem label="身份证号" value={detailEmployee.id_number || '-'} />
                  <InfoItem label="部门" value={detailEmployee.department || '-'} />
                  <InfoItem label="岗位" value={detailEmployee.position || '-'} />
                  <InfoItem label="入职日期" value={detailEmployee.hire_date || '-'} />
                  {detailEmployee.status === 'resigned' && <InfoItem label="离职日期" value={detailEmployee.resign_date || '-'} />}
                  <InfoItem label="住址" value={detailEmployee.address || '-'} full />
                </div>
              </div>

              {/* 紧急联系人 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">紧急联系人</h3>
                <div className="grid grid-cols-2 gap-3">
                  <InfoItem label="姓名" value={detailEmployee.emergency_contact || '-'} />
                  <InfoItem label="电话" value={detailEmployee.emergency_phone || '-'} />
                </div>
              </div>

              {detailEmployee.remark && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">备注</h3>
                  <p className="text-sm text-slate-600">{detailEmployee.remark}</p>
                </div>
              )}

              {/* 文件管理 */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">文件管理</h3>

                {isAdmin && (
                  <div className="mb-4 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">文件类型</label>
                        <select
                          value={uploadForm.doc_type}
                          onChange={(e) => setUploadForm(p => ({ ...p, doc_type: e.target.value }))}
                          className="input-field text-sm"
                        >
                          {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">到期日期</label>
                        <input
                          type="date"
                          value={uploadForm.expiry_date}
                          onChange={(e) => setUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                          className="input-field text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">备注</label>
                      <input
                        type="text"
                        value={uploadForm.remark}
                        onChange={(e) => setUploadForm(p => ({ ...p, remark: e.target.value }))}
                        className="input-field text-sm"
                        placeholder="可选"
                      />
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleUpload}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="btn-primary text-sm"
                      >
                        {uploading ? '上传中...' : '选择文件并上传'}
                      </button>
                    </div>
                  </div>
                )}

                {empDocs.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">暂无文件</p>
                ) : (
                  <div className="space-y-2">
                    {empDocs.map(doc => {
                      const dtInfo = getDocTypeInfo(doc.doc_type)
                      const expDays = daysUntil(doc.expiry_date)
                      const canPreview = isPreviewable(doc.file_name)
                      return (
                        <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${dtInfo.color}`}>{dtInfo.label}</span>
                            <div className="min-w-0">
                              <p
                                className={`text-sm font-medium truncate ${canPreview ? 'text-blue-600 hover:text-blue-800 cursor-pointer hover:underline' : 'text-slate-900'}`}
                                onClick={() => canPreview && handlePreview(doc)}
                              >
                                {doc.file_name}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {doc.expiry_date && (
                                  <span className={`text-xs ${expDays !== null && expDays <= 30 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                                    到期: {doc.expiry_date}
                                    {expDays !== null && expDays <= 0 && ' (已过期)'}
                                    {expDays !== null && expDays > 0 && expDays <= 30 && ` (${expDays}天)`}
                                  </span>
                                )}
                                {doc.remark && <span className="text-xs text-slate-400">{doc.remark}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {canPreview && (
                              <button onClick={() => handlePreview(doc)} className="text-xs text-slate-500 hover:text-slate-700 transition font-medium">预览</button>
                            )}
                            <button onClick={() => handleDownload(doc)} className="text-xs text-blue-600 hover:text-blue-800 transition font-medium">下载</button>
                            {isAdmin && (
                              <button onClick={() => setDeleteDocModal({ show: true, doc })} className="text-xs text-rose-500 hover:text-rose-700 transition">删除</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑员工弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingEmployee ? '编辑员工' : '添加员工'}
            </h2>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="姓名 *" value={formData.name} onChange={v => setFormData(p => ({ ...p, name: v }))} required />
                <div>
                  <label className="block text-slate-700 text-sm font-medium mb-2">性别</label>
                  <div className="flex gap-3">
                    {[{ v: 'male', l: '男' }, { v: 'female', l: '女' }].map(g => (
                      <label key={g.v} className={`flex-1 flex items-center justify-center p-2.5 rounded-xl border-2 cursor-pointer transition text-sm font-medium ${
                        formData.gender === g.v ? 'border-slate-700 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                        <input type="radio" name="gender" value={g.v} checked={formData.gender === g.v} onChange={(e) => setFormData(p => ({ ...p, gender: e.target.value }))} className="hidden" />
                        {g.l}
                      </label>
                    ))}
                  </div>
                </div>
                <FormField label="电话" value={formData.phone} onChange={v => setFormData(p => ({ ...p, phone: v }))} />
                <FormField label="身份证号" value={formData.id_number} onChange={v => setFormData(p => ({ ...p, id_number: v }))} />
                <FormField label="出生日期" value={formData.birth_date} onChange={v => setFormData(p => ({ ...p, birth_date: v }))} type="date" />
                <FormField label="入职日期 *" value={formData.hire_date} onChange={v => setFormData(p => ({ ...p, hire_date: v }))} type="date" required />
                <div>
                  <label className="block text-slate-700 text-sm font-medium mb-2">部门</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData(p => ({ ...p, department: e.target.value }))}
                    className="input-field"
                    list="dept-list"
                    placeholder="选择或输入"
                  />
                  <datalist id="dept-list">
                    {DEPARTMENTS.map(d => <option key={d} value={d} />)}
                  </datalist>
                </div>
                <FormField label="岗位" value={formData.position} onChange={v => setFormData(p => ({ ...p, position: v }))} placeholder="例如：包装工" />

                <div className="col-span-2 border-t border-slate-200 pt-4 mt-2">
                  <p className="text-sm font-semibold text-slate-700 mb-3">紧急联系人</p>
                </div>
                <FormField label="紧急联系人" value={formData.emergency_contact} onChange={v => setFormData(p => ({ ...p, emergency_contact: v }))} />
                <FormField label="联系人电话" value={formData.emergency_phone} onChange={v => setFormData(p => ({ ...p, emergency_phone: v }))} />

                <div className="col-span-2 border-t border-slate-200 pt-4 mt-2">
                  <p className="text-sm font-semibold text-slate-700 mb-3">其他</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-700 text-sm font-medium mb-2">住址</label>
                  <input type="text" value={formData.address} onChange={(e) => setFormData(p => ({ ...p, address: e.target.value }))} className="input-field" placeholder="可选" />
                </div>

                <div>
                  <label className="block text-slate-700 text-sm font-medium mb-2">在职状态</label>
                  <div className="flex gap-3">
                    {[{ v: 'active', l: '在职' }, { v: 'resigned', l: '离职' }].map(s => (
                      <label key={s.v} className={`flex-1 flex items-center justify-center p-2.5 rounded-xl border-2 cursor-pointer transition text-sm font-medium ${
                        formData.status === s.v
                          ? s.v === 'active' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-500 bg-slate-50 text-slate-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                        <input type="radio" name="status" value={s.v} checked={formData.status === s.v} onChange={(e) => setFormData(p => ({ ...p, status: e.target.value }))} className="hidden" />
                        {s.l}
                      </label>
                    ))}
                  </div>
                </div>
                {formData.status === 'resigned' && (
                  <FormField label="离职日期" value={formData.resign_date} onChange={v => setFormData(p => ({ ...p, resign_date: v }))} type="date" />
                )}

                <div className="col-span-2">
                  <label className="block text-slate-700 text-sm font-medium mb-2">备注</label>
                  <input type="text" value={formData.remark} onChange={(e) => setFormData(p => ({ ...p, remark: e.target.value }))} className="input-field" placeholder="可选" />
                </div>
              </div>

              {/* 文件上传区域 */}
              <div className="col-span-2 border-t border-slate-200 pt-4 mt-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">上传档案文件</p>
                <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">文件类型</label>
                      <select
                        value={modalUploadForm.doc_type}
                        onChange={(e) => setModalUploadForm(p => ({ ...p, doc_type: e.target.value }))}
                        className="input-field text-sm"
                      >
                        {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">到期日期</label>
                      <input
                        type="date"
                        value={modalUploadForm.expiry_date}
                        onChange={(e) => setModalUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                        className="input-field text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">备注</label>
                      <input
                        type="text"
                        value={modalUploadForm.remark}
                        onChange={(e) => setModalUploadForm(p => ({ ...p, remark: e.target.value }))}
                        className="input-field text-sm"
                        placeholder="可选"
                      />
                    </div>
                  </div>
                  <div>
                    <input
                      ref={modalFileInputRef}
                      type="file"
                      onChange={handleModalFileSelect}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    />
                    <button
                      type="button"
                      onClick={() => modalFileInputRef.current?.click()}
                      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
                    >
                      + 选择文件
                    </button>
                  </div>
                </div>

                {pendingFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-slate-500">待上传文件（保存时一并上传）</p>
                    {pendingFiles.map(pf => {
                      const dtInfo = getDocTypeInfo(pf.doc_type)
                      return (
                        <div key={pf.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${dtInfo.color}`}>{dtInfo.label}</span>
                            <span className="text-sm text-slate-900 truncate">{pf.file.name}</span>
                            {pf.expiry_date && <span className="text-xs text-slate-400 shrink-0">到期: {pf.expiry_date}</span>}
                          </div>
                          <button type="button" onClick={() => removePendingFile(pf.id)} className="text-xs text-rose-500 hover:text-rose-700 transition shrink-0 ml-2">移除</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost">取消</button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? (pendingFiles.length > 0 ? '保存并上传中...' : '保存中...') : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 删除员工确认 */}
      {deleteModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">确认删除</h2>
            <p className="text-slate-600 mb-2">确定要删除员工 <span className="font-semibold">{deleteModal.employee?.name}</span> 的全部档案吗？</p>
            <p className="text-rose-500 text-sm mb-6">相关文件也会一并删除，不可恢复。</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setDeleteModal({ show: false, employee: null })} className="btn-ghost">取消</button>
              <button onClick={handleDelete} className="btn-danger">删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除文件确认 */}
      {deleteDocModal.show && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70]">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">确认删除文件</h2>
            <p className="text-slate-600 mb-6">确定要删除 <span className="font-semibold">{deleteDocModal.doc?.file_name}</span> 吗？</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setDeleteDocModal({ show: false, doc: null })} className="btn-ghost">取消</button>
              <button onClick={handleDeleteDoc} className="btn-danger">删除</button>
            </div>
          </div>
        </div>
      )}

      {/* 文件预览弹窗 */}
      {previewDoc && previewUrl && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4" onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getDocTypeInfo(previewDoc.doc_type).color}`}>
                  {getDocTypeInfo(previewDoc.doc_type).label}
                </span>
                <span className="text-sm font-medium text-slate-900 truncate">{previewDoc.file_name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={() => handleDownload(previewDoc)} className="text-sm text-blue-600 hover:text-blue-800 transition font-medium">下载</button>
                <button onClick={() => { setPreviewDoc(null); setPreviewUrl(null) }} className="text-slate-400 hover:text-slate-600 transition">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100 p-4">
              {isImage(previewDoc.file_name) ? (
                <img src={previewUrl} alt={previewDoc.file_name} className="max-w-full max-h-[75vh] object-contain rounded-lg shadow" />
              ) : (
                <iframe src={previewUrl} className="w-full h-[75vh] rounded-lg border border-slate-200 bg-white" title={previewDoc.file_name} />
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

function InfoItem({ label, value, full }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-xs text-slate-400">{label}</p>
      <div className="text-sm text-slate-700 mt-0.5">{value}</div>
    </div>
  )
}

function ExpiryItem({ label, date, warningDays }) {
  const days = daysUntil(date)
  let color = 'text-slate-700'
  let badge = null
  if (date && days !== null) {
    if (days <= 0) { color = 'text-rose-600 font-semibold'; badge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium ml-1">已过期</span> }
    else if (days <= warningDays) { color = 'text-amber-600 font-semibold'; badge = <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium ml-1">{days}天</span> }
  }
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <div className={`text-sm mt-0.5 ${color}`}>
        {date || '-'}{badge}
      </div>
    </div>
  )
}

function FormField({ label, value, onChange, type = 'text', required, placeholder }) {
  return (
    <div>
      <label className="block text-slate-700 text-sm font-medium mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onWheel={type === 'number' ? (e) => e.target.blur() : undefined}
        className="input-field"
        required={required}
        placeholder={placeholder}
      />
    </div>
  )
}
