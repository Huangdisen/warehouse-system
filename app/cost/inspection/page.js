'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'

const BUCKET = 'purchase-documents'

const isImage = (fileName) => /\.(jpe?g|png|webp|gif)$/i.test(fileName)

const CATEGORIES = [
  { value: 'carton', label: '纸箱', color: 'bg-amber-100 text-amber-700' },
  { value: 'material', label: '物料', color: 'bg-sky-100 text-sky-700' },
  { value: 'label', label: '标签', color: 'bg-violet-100 text-violet-700' },
  { value: 'raw_material', label: '原材料', color: 'bg-emerald-100 text-emerald-700' },
]
const getCategoryInfo = (v) => CATEGORIES.find(c => c.value === v) || { label: v, color: 'bg-slate-100 text-slate-600' }

function PdfIcon() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 rounded-lg">
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
      <span className="text-[10px] text-red-400 font-semibold mt-0.5">PDF</span>
    </div>
  )
}

function FileIcon() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 rounded-lg">
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    </div>
  )
}

function Thumbnail({ doc, url, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col rounded-xl overflow-hidden border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all text-left bg-white"
    >
      <div className="h-20 w-full overflow-hidden bg-slate-100 relative">
        {url && isImage(doc.file_name) ? (
          <img src={url} alt={doc.file_name} className="w-full h-full object-cover" />
        ) : doc.file_name?.toLowerCase().endsWith('.pdf') ? (
          <PdfIcon />
        ) : (
          <FileIcon />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
      </div>
      <div className="p-1.5">
        <p className="text-[11px] font-medium text-slate-700 truncate leading-tight">{doc.doc_label}</p>
        <p className="text-[10px] text-slate-400 truncate">{doc.file_name}</p>
      </div>
    </button>
  )
}

function PreviewModal({ docs, initialIndex, thumbUrls, onClose }) {
  const [index, setIndex] = useState(initialIndex)
  const [urlMap, setUrlMap] = useState({ ...thumbUrls })
  const touchStartX = useRef(null)

  const doc = docs[index]
  const url = urlMap[doc?.id]
  const img = isImage(doc?.file_name)
  const pdf = doc?.file_name?.toLowerCase().endsWith('.pdf')
  const total = docs.length

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index])

  useEffect(() => {
    if (!doc || urlMap[doc.id]) return
    supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrlMap(prev => ({ ...prev, [doc.id]: data.signedUrl }))
    })
  }, [index])

  const go = (dir) => setIndex(i => (i + dir + total) % total)
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
    touchStartX.current = null
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <p className="text-white text-sm font-medium truncate max-w-xs">{doc?.file_name}</p>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          {total > 1 && <span className="text-slate-400 text-xs">{index + 1} / {total}</span>}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white text-sm">
              新窗口打开
            </a>
          )}
          <button onClick={onClose} className="text-slate-300 hover:text-white text-2xl leading-none">×</button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={onClose}
      >
        <div className="w-full h-full flex items-center justify-center p-4" onClick={onClose}>
          {!url && <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />}
          {url && img && (
            <img src={url} alt={doc.file_name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
          )}
          {url && pdf && (
            <iframe src={url} className="w-full h-full rounded-lg bg-white" title={doc.file_name} onClick={e => e.stopPropagation()} />
          )}
          {url && !img && !pdf && (
            <div className="text-slate-300 text-center" onClick={e => e.stopPropagation()}>
              <p className="mb-3">无法预览此文件</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">下载文件</a>
            </div>
          )}
        </div>
        {total > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); go(-1) }} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition text-xl">‹</button>
            <button onClick={(e) => { e.stopPropagation(); go(1) }} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition text-xl">›</button>
          </>
        )}
      </div>
    </div>
  )
}

export default function InspectionPage() {
  const [records, setRecords] = useState([])
  const [inspectionDocs, setInspectionDocs] = useState({})
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState(null)

  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  const [activeRecord, setActiveRecord] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [thumbUrls, setThumbUrls] = useState({})
  const [previewIndex, setPreviewIndex] = useState(null)

  const [docLabel, setDocLabel] = useState('批次厂检')
  const [docRemark, setDocRemark] = useState('')
  const [uploadFiles, setUploadFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|Android/i.test(navigator.userAgent))
    fetchProfile()
  }, [])

  useEffect(() => { fetchRecords() }, [filterCategory, filterSupplier, filterDateFrom, filterDateTo])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setUserId(session.user.id)
    const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
    setIsAdmin(data?.role === 'admin')
  }

  const fetchRecords = async () => {
    setLoading(true)
    let query = supabase
      .from('purchase_records')
      .select('id, category, item_name, spec, quantity, unit, supplier, purchase_date, unit_price, total_amount')
      .order('purchase_date', { ascending: false })
      .limit(200)

    if (filterCategory !== 'all') query = query.eq('category', filterCategory)
    if (filterSupplier) query = query.eq('supplier', filterSupplier)
    if (filterDateFrom) query = query.gte('purchase_date', filterDateFrom)
    if (filterDateTo) query = query.lte('purchase_date', filterDateTo)

    const { data: pr } = await query
    const recs = pr || []
    setRecords(recs)

    const { data: allPr } = await supabase.from('purchase_records').select('supplier').not('supplier', 'is', null)
    setSuppliers([...new Set((allPr || []).map(r => r.supplier).filter(Boolean))].sort())

    if (recs.length > 0) {
      const ids = recs.map(r => r.id)
      const { data: docData } = await supabase
        .from('purchase_inspection_docs')
        .select('*')
        .in('purchase_record_id', ids)
        .order('uploaded_at', { ascending: false })
      const grouped = {}
      ;(docData || []).forEach(d => {
        if (!grouped[d.purchase_record_id]) grouped[d.purchase_record_id] = []
        grouped[d.purchase_record_id].push(d)
      })
      setInspectionDocs(grouped)
    } else {
      setInspectionDocs({})
    }
    setLoading(false)
  }

  const loadThumbnails = async (docList) => {
    if (!docList || docList.length === 0) return
    const paths = docList.map(d => d.file_path)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
    if (!data) return
    const urlMap = {}
    data.forEach((item, i) => { if (item.signedUrl) urlMap[docList[i].id] = item.signedUrl })
    setThumbUrls(urlMap)
  }

  const openDrawer = (record) => {
    setActiveRecord(record)
    setDrawerOpen(true)
    setDocLabel('批次厂检')
    setDocRemark('')
    setUploadFiles([])
    setThumbUrls({})
    const docList = inspectionDocs[record.id] || []
    loadThumbnails(docList)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setActiveRecord(null)
    setThumbUrls({})
    setPreviewIndex(null)
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
    if (!docLabel.trim()) { alert('请填写文件说明'); return }
    if (!activeRecord) return
    setUploading(true)

    const failed = []
    for (const file of uploadFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
      const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
      const filePath = `inspections/${activeRecord.id}/${uniqueId}_${safeName}`

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file, { upsert: false })
      if (uploadError) { failed.push(file.name); continue }

      const { error: insertError } = await supabase.from('purchase_inspection_docs').insert({
        purchase_record_id: activeRecord.id,
        doc_label: docLabel.trim(),
        file_path: filePath,
        file_name: file.name,
        remark: docRemark.trim() || null,
        uploaded_by: userId,
      })
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([filePath])
        failed.push(file.name)
      }
    }

    if (failed.length > 0) alert(`以下文件上传失败：${failed.join('、')}`)

    setDocLabel('批次厂检')
    setDocRemark('')
    setUploadFiles([])
    await fetchRecords()
    // 刷新缩略图
    const updatedDocs = inspectionDocs[activeRecord.id] || []
    setTimeout(() => loadThumbnails(updatedDocs), 500)
    setUploading(false)
  }

  const handleDelete = async (doc) => {
    if (!confirm(`确认删除「${doc.file_name}」？`)) return
    await supabase.storage.from(BUCKET).remove([doc.file_path])
    await supabase.from('purchase_inspection_docs').delete().eq('id', doc.id)
    await fetchRecords()
  }

  const activeDocs = activeRecord ? (inspectionDocs[activeRecord.id] || []) : []

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">采购检验报告</h1>
          <p className="text-slate-500">为每批采购上传检验报告及相关文件</p>
        </div>
      </div>

      {/* 筛选 */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filterCategory === 'all'
                ? 'bg-slate-800 text-white shadow-inner'
                : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px'
            }`}
          >全部</button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(filterCategory === cat.value ? 'all' : cat.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                filterCategory === cat.value
                  ? 'bg-slate-800 text-white shadow-inner'
                  : 'bg-white text-slate-700 border border-slate-200 shadow-[0_2px_0_0_#cbd5e1] hover:shadow-[0_1px_0_0_#cbd5e1] hover:translate-y-px'
              }`}
            >{cat.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">全部供应商</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          <span className="text-slate-400 text-sm">至</span>
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300" />
          {(filterSupplier || filterDateFrom || filterDateTo || filterCategory !== 'all') && (
            <button
              onClick={() => { setFilterSupplier(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterCategory('all') }}
              className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-600 transition"
            >× 清除筛选</button>
          )}
        </div>
      </div>

      {/* 采购记录列表 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-slate-400">暂无采购记录</div>
      ) : (
        <div className="surface-card overflow-hidden">
          {records.map((record, idx) => {
            const catInfo = getCategoryInfo(record.category)
            const docCount = (inspectionDocs[record.id] || []).length
            return (
              <button
                key={record.id}
                onClick={() => openDrawer(record)}
                className={`w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/60 transition-colors ${
                  idx < records.length - 1 ? 'border-b border-slate-100' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${catInfo.color}`}>{catInfo.label}</span>
                    <span className="font-medium text-slate-900 truncate">{record.item_name}</span>
                    {record.spec && <span className="text-slate-400 text-sm shrink-0">{record.spec}</span>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {record.purchase_date}
                    {record.supplier && ` · ${record.supplier}`}
                    {record.quantity && ` · ${record.quantity}${record.unit || ''}`}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {docCount > 0 ? (
                    <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">{docCount} 份</span>
                  ) : (
                    <span className="text-slate-300 text-xs">无附件</span>
                  )}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 text-slate-300">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 底部抽屉 */}
      {drawerOpen && activeRecord && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={closeDrawer}>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl sm:rounded-2xl sm:max-w-2xl sm:mx-auto sm:mb-8 sm:w-full overflow-hidden max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-5 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${getCategoryInfo(activeRecord.category).color}`}>
                      {getCategoryInfo(activeRecord.category).label}
                    </span>
                    <span className="font-semibold text-slate-900 truncate">{activeRecord.item_name}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {activeRecord.purchase_date}{activeRecord.supplier && ` · ${activeRecord.supplier}`}
                  </p>
                </div>
                <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 text-2xl leading-none shrink-0">×</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
              {/* 缩略图列表 */}
              {activeDocs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-2">暂无检验报告，请上传</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {activeDocs.map((doc, i) => (
                    <div key={doc.id} className="relative group">
                      <Thumbnail
                        doc={doc}
                        url={thumbUrls[doc.id]}
                        onClick={() => setPreviewIndex(i)}
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
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">上传检验报告</p>
                <input
                  type="text"
                  value={docLabel}
                  onChange={e => setDocLabel(e.target.value)}
                  placeholder="文件说明（必填，如：第三方检测报告）"
                  className="w-full input-field"
                />
                <input
                  type="text"
                  value={docRemark}
                  onChange={e => setDocRemark(e.target.value)}
                  placeholder="备注（可选）"
                  className="w-full input-field"
                />

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
      )}

      {previewIndex !== null && (
        <PreviewModal
          docs={activeDocs}
          initialIndex={previewIndex}
          thumbUrls={thumbUrls}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </DashboardLayout>
  )
}
