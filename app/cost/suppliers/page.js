'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const BUCKET = 'purchase-documents'

const SUPPLIER_DOC_TYPES = [
  { value: 'business_license', label: '营业执照', color: 'bg-blue-100 text-blue-700' },
  { value: 'production_permit', label: '生产许可证', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'quality_cert', label: '质量证书', color: 'bg-violet-100 text-violet-700' },
  { value: 'other', label: '其他', color: 'bg-slate-100 text-slate-600' },
]

const getDocTypeInfo = (value) =>
  SUPPLIER_DOC_TYPES.find(d => d.value === value) || SUPPLIER_DOC_TYPES[3]

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState(null)

  const [activeSupplier, setActiveSupplier] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [uploadForm, setUploadForm] = useState({
    doc_type: 'business_license',
    doc_label: '',
    expiry_date: '',
    remark: '',
  })
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)


  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|Android/i.test(navigator.userAgent))
    fetchProfile()
    fetchData()
  }, [])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setUserId(session.user.id)
    const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    setIsAdmin(data?.role === 'admin')
  }

  const fetchData = async () => {
    setLoading(true)
    const { data: pr } = await supabase
      .from('purchase_records')
      .select('supplier')
      .not('supplier', 'is', null)
    const supplierList = [...new Set((pr || []).map(r => r.supplier).filter(Boolean))].sort()
    setSuppliers(supplierList)

    if (supplierList.length > 0) {
      const { data: docData } = await supabase
        .from('supplier_documents')
        .select('*')
        .in('supplier_name', supplierList)
        .order('uploaded_at', { ascending: false })
      const grouped = {}
      ;(docData || []).forEach(d => {
        if (!grouped[d.supplier_name]) grouped[d.supplier_name] = []
        grouped[d.supplier_name].push(d)
      })
      setDocs(grouped)
    }
    setLoading(false)
  }

  const openDrawer = (supplier) => {
    setActiveSupplier(supplier)
    setDrawerOpen(true)
    setUploadFile(null)
    setUploadForm({ doc_type: 'business_license', doc_label: '', expiry_date: '', remark: '' })
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setActiveSupplier(null)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return }
    setUploadFile(file)
  }

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return }
    setUploadFile(file)
  }

  const handleUpload = async () => {
    if (!uploadFile) { alert('请选择文件'); return }
    if (!activeSupplier) return
    if (uploadForm.doc_type === 'other' && !uploadForm.doc_label.trim()) {
      alert('请填写文件类型名称'); return
    }
    setUploading(true)

    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
    const safeSupplier = activeSupplier.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g, '_')
    const filePath = `suppliers/${safeSupplier}/${uniqueId}_${safeName}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, uploadFile, { upsert: false })
    if (uploadError) { alert('上传失败：' + uploadError.message); setUploading(false); return }

    const { error: insertError } = await supabase.from('supplier_documents').insert({
      supplier_name: activeSupplier,
      doc_type: uploadForm.doc_type,
      doc_label: uploadForm.doc_type === 'other' ? uploadForm.doc_label.trim() : null,
      file_path: filePath,
      file_name: uploadFile.name,
      expiry_date: uploadForm.expiry_date || null,
      remark: uploadForm.remark.trim() || null,
      uploaded_by: userId,
    })
    if (insertError) {
      await supabase.storage.from(BUCKET).remove([filePath])
      alert('保存记录失败：' + insertError.message)
      setUploading(false)
      return
    }

    setUploadFile(null)
    setUploadForm({ doc_type: 'business_license', doc_label: '', expiry_date: '', remark: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
    await fetchData()
    setUploading(false)
  }

  const handleView = async (doc) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60)
    if (error) { alert('获取链接失败：' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (doc) => {
    if (!confirm(`确认删除「${doc.file_name}」？`)) return
    await supabase.storage.from(BUCKET).remove([doc.file_path])
    await supabase.from('supplier_documents').delete().eq('id', doc.id)
    await fetchData()
  }

  const activeDocs = activeSupplier ? (docs[activeSupplier] || []) : []

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">供应商档案</h1>
          <p className="text-slate-500">管理供应商三证及相关资质文件</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p>暂无供应商数据</p>
          <p className="text-sm mt-1">在采购成本中录入带供应商信息的采购记录后，供应商将自动出现在这里</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {suppliers.map(supplier => {
            const supplierDocs = docs[supplier] || []
            return (
              <button
                key={supplier}
                onClick={() => openDrawer(supplier)}
                className="surface-card p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <p className="font-semibold text-slate-900 text-base">{supplier}</p>
                  {supplierDocs.length > 0 && (
                    <span className="ml-2 shrink-0 bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {supplierDocs.length} 份
                    </span>
                  )}
                </div>
                {supplierDocs.length === 0 ? (
                  <p className="text-sm text-slate-400 mt-2">暂无文件</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[...new Set(supplierDocs.map(d => d.doc_type))].map(t => {
                      const info = getDocTypeInfo(t)
                      return (
                        <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
                          {info.label}
                        </span>
                      )
                    })}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* 底部抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={closeDrawer}>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl sm:rounded-2xl sm:max-w-2xl sm:mx-auto sm:mb-8 sm:w-full overflow-hidden max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{activeSupplier}</h2>
                <p className="text-xs text-slate-500">{activeDocs.length} 份档案文件</p>
              </div>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
              {SUPPLIER_DOC_TYPES.map(type => {
                const typeDocs = activeDocs.filter(d => d.doc_type === type.value)
                if (typeDocs.length === 0) return null
                return (
                  <div key={type.value}>
                    <p className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-3 ${type.color}`}>
                      {type.label}
                    </p>
                    <div className="space-y-2">
                      {typeDocs.map(doc => {
                        const days = daysUntil(doc.expiry_date)
                        const expired = days !== null && days < 0
                        const expiringSoon = days !== null && days >= 0 && days <= 30
                        return (
                          <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {doc.doc_label || doc.file_name}
                              </p>
                              <p className="text-xs text-slate-500 truncate">{doc.file_name}</p>
                              {doc.expiry_date && (
                                <p className={`text-xs mt-0.5 ${expired ? 'text-red-500 font-semibold' : expiringSoon ? 'text-amber-600' : 'text-slate-400'}`}>
                                  {expired ? '已过期 ' : expiringSoon ? `${days}天后到期 ` : '有效期至 '}{doc.expiry_date}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => handleView(doc)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">查看</button>
                              {isAdmin && (
                                <button onClick={() => handleDelete(doc)} className="text-xs text-red-400 hover:text-red-600 font-medium">删除</button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {activeDocs.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">暂无文件，请上传</p>
              )}

              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">上传文件</p>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {SUPPLIER_DOC_TYPES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setUploadForm(p => ({ ...p, doc_type: t.value }))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                          uploadForm.doc_type === t.value
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {uploadForm.doc_type === 'other' && (
                    <input
                      type="text"
                      value={uploadForm.doc_label}
                      onChange={e => setUploadForm(p => ({ ...p, doc_label: e.target.value }))}
                      placeholder="文件类型名称（必填）"
                      className="w-full input-field"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">有效期（可选）</label>
                      <input
                        type="date"
                        value={uploadForm.expiry_date}
                        onChange={e => setUploadForm(p => ({ ...p, expiry_date: e.target.value }))}
                        className="w-full input-field"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">备注（可选）</label>
                      <input
                        type="text"
                        value={uploadForm.remark}
                        onChange={e => setUploadForm(p => ({ ...p, remark: e.target.value }))}
                        placeholder="备注"
                        className="w-full input-field"
                      />
                    </div>
                  </div>

                  {uploadFile && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-xl">
                      <span className="text-xs text-blue-700 flex-1 truncate">{uploadFile.name}</span>
                      <button onClick={() => setUploadFile(null)} className="text-blue-400 hover:text-blue-600 text-sm">×</button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileSelect} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                    >
                      选择文件
                    </button>
                    {isMobile && (
                      <>
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                        >
                          拍照上传
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    onClick={handleUpload}
                    disabled={uploading || !uploadFile}
                    className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition disabled:opacity-40"
                  >
                    {uploading ? '上传中...' : '确认上传'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  )
}
