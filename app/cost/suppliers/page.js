'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const BUCKET = 'purchase-documents'

const isImage = (fileName) => /\.(jpe?g|png|webp|gif)$/i.test(fileName)

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

function PdfIcon() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 rounded-lg">
      <svg viewBox="0 0 24 24" className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
      <span className="text-xs text-red-400 font-semibold mt-1">PDF</span>
    </div>
  )
}

function FileIcon() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 rounded-lg">
      <svg viewBox="0 0 24 24" className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  )
}

function Thumbnail({ doc, url, onClick }) {
  const days = daysUntil(doc.expiry_date)
  const expired = days !== null && days < 0
  const expiringSoon = days !== null && days >= 0 && days <= 30

  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left bg-white"
    >
      <div className="h-28 w-full overflow-hidden bg-slate-100 relative">
        {url && isImage(doc.file_name) ? (
          <img
            src={url}
            alt={doc.file_name}
            className="w-full h-full object-cover"
          />
        ) : doc.file_name?.toLowerCase().endsWith('.pdf') ? (
          <PdfIcon />
        ) : (
          <FileIcon />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
      </div>
      <div className="p-2 flex-1">
        <p className="text-xs font-medium text-slate-800 truncate leading-tight">{doc.file_name}</p>
        {doc.expiry_date && (
          <p className={`text-xs mt-0.5 ${expired ? 'text-red-500 font-semibold' : expiringSoon ? 'text-amber-600' : 'text-slate-400'}`}>
            {expired ? '已过期' : expiringSoon ? `${days}天后到期` : `至 ${doc.expiry_date}`}
          </p>
        )}
        {doc.remark && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{doc.remark}</p>
        )}
      </div>
    </button>
  )
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState(null)

  const [activeSupplier, setActiveSupplier] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [thumbUrls, setThumbUrls] = useState({}) // doc.id -> signedUrl

  const [uploadForm, setUploadForm] = useState({ expiry_date: '', remark: '' })
  const [uploadFiles, setUploadFiles] = useState([])
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

  const loadThumbnails = async (docList) => {
    if (!docList || docList.length === 0) return
    const paths = docList.map(d => d.file_path)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
    if (!data) return
    const urlMap = {}
    data.forEach((item, i) => {
      if (item.signedUrl) urlMap[docList[i].id] = item.signedUrl
    })
    setThumbUrls(urlMap)
  }

  const openDrawer = (supplier) => {
    setActiveSupplier(supplier)
    setDrawerOpen(true)
    setUploadFiles([])
    setUploadForm({ expiry_date: '', remark: '' })
    const supplierDocs = docs[supplier] || []
    loadThumbnails(supplierDocs)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setActiveSupplier(null)
    setThumbUrls({})
  }

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    const oversized = files.filter(f => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) { alert(`以下文件超过 10MB：${oversized.map(f => f.name).join('、')}`); return }
    setUploadFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...files.filter(f => !names.has(f.name))]
    })
    e.target.value = ''
  }

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return }
    setUploadFiles(prev => [...prev, file])
    e.target.value = ''
  }

  const removeFile = (index) => setUploadFiles(prev => prev.filter((_, i) => i !== index))

  const handleUpload = async () => {
    if (uploadFiles.length === 0) { alert('请选择文件'); return }
    if (!activeSupplier) return
    setUploading(true)

    const failed = []
    for (const file of uploadFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
      const filePath = `suppliers/${uniqueId}_${safeName}`

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: false })
      if (uploadError) { failed.push(file.name); continue }

      const { error: insertError } = await supabase.from('supplier_documents').insert({
        supplier_name: activeSupplier,
        doc_type: 'other',
        file_path: filePath,
        file_name: file.name,
        expiry_date: uploadForm.expiry_date || null,
        remark: uploadForm.remark.trim() || null,
        uploaded_by: userId,
      })
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([filePath])
        failed.push(file.name)
      }
    }

    if (failed.length > 0) alert(`以下文件上传失败：${failed.join('、')}`)

    setUploadFiles([])
    setUploadForm({ expiry_date: '', remark: '' })
    await fetchData()
    // 刷新缩略图
    const updatedDocs = (docs[activeSupplier] || [])
    setTimeout(() => loadThumbnails(updatedDocs), 500)
    setUploading(false)
  }

  const handleView = (doc) => {
    const url = thumbUrls[doc.id]
    if (url) { window.open(url, '_blank'); return }
    supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 60).then(({ data, error }) => {
      if (error) { alert('获取链接失败：' + error.message); return }
      window.open(data.signedUrl, '_blank')
    })
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
          <p className="text-slate-500">管理供应商资质文件</p>
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
                  <p className="text-xs text-slate-400 mt-2">点击查看文件</p>
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
            className="relative bg-white rounded-t-3xl sm:rounded-2xl sm:max-w-2xl sm:mx-auto sm:mb-8 sm:w-full overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{activeSupplier}</h2>
                <p className="text-xs text-slate-500">{activeDocs.length} 份档案文件</p>
              </div>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* 文件缩略图列表 */}
              {activeDocs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无文件，请上传</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {activeDocs.map(doc => (
                    <div key={doc.id} className="relative group">
                      <Thumbnail
                        doc={doc}
                        url={thumbUrls[doc.id]}
                        onClick={() => handleView(doc)}
                      />
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc) }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none items-center justify-center hidden group-hover:flex"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 上传区 */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">上传文件</p>
                <div className="space-y-3">
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

                  {uploadFiles.length > 0 && (
                    <div className="space-y-1">
                      {uploadFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded-xl">
                          <span className="text-xs text-blue-700 flex-1 truncate">{f.name}</span>
                          <button onClick={() => removeFile(i)} className="text-blue-400 hover:text-blue-600 text-sm">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" multiple className="hidden" onChange={handleFileSelect} />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                    >
                      选择文件{uploadFiles.length > 0 ? `（已选 ${uploadFiles.length}）` : ''}
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
                    disabled={uploading || uploadFiles.length === 0}
                    className="w-full py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 transition disabled:opacity-40"
                  >
                    {uploading ? '上传中...' : `确认上传${uploadFiles.length > 1 ? `（${uploadFiles.length} 个文件）` : ''}`}
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
