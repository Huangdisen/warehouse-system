# 采购原料检验报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增供应商档案（三证上传）和采购检验报告（每批次检验文件）两个页面，关联现有采购成本数据。

**Architecture:** 两张新 Supabase 表 + 一个 Storage bucket，两个新 Next.js 页面（`/cost/suppliers`、`/cost/inspection`），侧边栏「采购成本」改为可展开文件夹。扫描功能使用 jscanify（OpenCV.js wrapper）封装为独立组件。

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + Storage), Tailwind CSS, jscanify

---

## 文件清单

**新建：**
- `app/cost/suppliers/page.js` — 供应商档案页面
- `app/cost/inspection/page.js` — 采购检验报告页面
- `components/DocScanner.js` — 扫描纠偏组件（jscanify）

**修改：**
- `components/Sidebar.js` — 采购成本改为可展开文件夹，添加两个子项

---

## Task 1：Supabase 建表 + Storage Bucket

**Files:**
- Supabase SQL Editor（在线执行）

- [ ] **Step 1：执行建表 SQL**

在 Supabase Dashboard → SQL Editor 中执行：

```sql
-- supplier_documents 表
create table supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  doc_type text not null,
  doc_label text,
  file_path text not null,
  file_name text not null,
  expiry_date date,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  remark text
);

alter table supplier_documents enable row level security;
create policy "authenticated read supplier_documents"
  on supplier_documents for select
  using (auth.role() = 'authenticated');
create policy "authenticated insert supplier_documents"
  on supplier_documents for insert
  with check (auth.role() = 'authenticated');
create policy "admin delete supplier_documents"
  on supplier_documents for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- purchase_inspection_docs 表
create table purchase_inspection_docs (
  id uuid primary key default gen_random_uuid(),
  purchase_record_id uuid not null references purchase_records(id) on delete cascade,
  doc_label text not null,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  remark text
);

alter table purchase_inspection_docs enable row level security;
create policy "authenticated read purchase_inspection_docs"
  on purchase_inspection_docs for select
  using (auth.role() = 'authenticated');
create policy "authenticated insert purchase_inspection_docs"
  on purchase_inspection_docs for insert
  with check (auth.role() = 'authenticated');
create policy "admin delete purchase_inspection_docs"
  on purchase_inspection_docs for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
```

预期：执行成功，无报错。

- [ ] **Step 2：创建 Storage Bucket**

在 Supabase Dashboard → Storage → New Bucket：
- Name: `purchase-documents`
- Public bucket: **关闭**（私有，需签名 URL）
- 点击 Create

然后在 Storage → Policies → `purchase-documents` bucket 添加策略：
```sql
-- 已登录用户可上传
create policy "authenticated upload purchase-documents"
  on storage.objects for insert
  with check (bucket_id = 'purchase-documents' and auth.role() = 'authenticated');

-- 已登录用户可读取（生成签名 URL 需要）
create policy "authenticated read purchase-documents"
  on storage.objects for select
  using (bucket_id = 'purchase-documents' and auth.role() = 'authenticated');

-- admin 可删除
create policy "admin delete purchase-documents"
  on storage.objects for delete
  using (bucket_id = 'purchase-documents' and exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  ));
```

- [ ] **Step 3：验证**

在 Supabase Dashboard → Table Editor 确认 `supplier_documents` 和 `purchase_inspection_docs` 两张表存在。Storage 中确认 `purchase-documents` bucket 已创建。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "feat: Supabase 建表 supplier_documents + purchase_inspection_docs + storage bucket"
```

---

## Task 2：安装 jscanify

**Files:**
- `package.json`（依赖更新）
- `components/DocScanner.js`（新建）

- [ ] **Step 1：安装依赖**

```bash
npm install jscanify
```

预期输出：`added 1 package` 或类似，无报错。

- [ ] **Step 2：新建 DocScanner 组件**

创建 `components/DocScanner.js`：

```jsx
'use client'
import { useEffect, useRef, useState } from 'react'

// 动态加载 jscanify（依赖 OpenCV.js，仅客户端）
let jscanifyInstance = null

async function getJscanify() {
  if (jscanifyInstance) return jscanifyInstance
  const { default: Jscanify } = await import('jscanify')
  jscanifyInstance = new Jscanify()
  return jscanifyInstance
}

/**
 * DocScanner — 文档扫描纠偏组件
 *
 * Props:
 *   imageFile: File — 待扫描的图片文件
 *   onConfirm: (blob: Blob) => void — 用户确认后返回纠偏后的图片 Blob
 *   onCancel: () => void — 用户取消
 */
export default function DocScanner({ imageFile, onConfirm, onCancel }) {
  const canvasRef = useRef(null)
  const resultCanvasRef = useRef(null)
  const [step, setStep] = useState('scanning') // 'scanning' | 'result' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    if (!imageFile) return
    runScan()
  }, [imageFile])

  const runScan = async () => {
    setProcessing(true)
    try {
      const scanner = await getJscanify()
      const img = new Image()
      const url = URL.createObjectURL(imageFile)
      img.onload = async () => {
        try {
          // 在 canvas 上绘制原图
          const canvas = canvasRef.current
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)

          // 扫描纠偏
          const resultCanvas = scanner.extractPaper(canvas, img.width, img.height)

          // 把结果绘制到 resultCanvasRef
          const rc = resultCanvasRef.current
          rc.width = resultCanvas.width
          rc.height = resultCanvas.height
          const rctx = rc.getContext('2d')
          rctx.drawImage(resultCanvas, 0, 0)

          setStep('result')
        } catch (e) {
          setStep('error')
          setErrorMsg('扫描失败，请直接上传原图')
        } finally {
          URL.revokeObjectURL(url)
          setProcessing(false)
        }
      }
      img.onerror = () => {
        setStep('error')
        setErrorMsg('图片加载失败')
        setProcessing(false)
      }
      img.src = url
    } catch (e) {
      setStep('error')
      setErrorMsg('扫描组件加载失败：' + e.message)
      setProcessing(false)
    }
  }

  const handleConfirm = () => {
    const rc = resultCanvasRef.current
    rc.toBlob((blob) => onConfirm(blob), 'image/jpeg', 0.85)
  }

  const handleUseOriginal = () => {
    // 直接使用原图（转为 Blob）
    const reader = new FileReader()
    reader.onload = () => {
      const blob = new Blob([reader.result], { type: imageFile.type })
      onConfirm(blob)
    }
    reader.readAsArrayBuffer(imageFile)
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {step === 'scanning' ? '扫描处理中...' : step === 'result' ? '扫描结果预览' : '扫描出错'}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4">
          {/* 隐藏的原图 canvas（jscanify 需要） */}
          <canvas ref={canvasRef} className="hidden" />

          {step === 'scanning' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-700" />
              <p className="text-sm text-slate-500">正在识别文档边界...</p>
            </div>
          )}

          {step === 'result' && (
            <>
              <canvas ref={resultCanvasRef} className="w-full rounded-xl border border-slate-200 mb-4" />
              <p className="text-xs text-slate-500 mb-4 text-center">如效果不佳，可选择直接使用原图</p>
              <div className="flex gap-3">
                <button
                  onClick={handleUseOriginal}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  使用原图
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  确认使用
                </button>
              </div>
            </>
          )}

          {step === 'error' && (
            <>
              <p className="text-sm text-red-500 text-center py-4">{errorMsg}</p>
              <canvas ref={resultCanvasRef} className="hidden" />
              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition"
                >
                  取消
                </button>
                <button
                  onClick={handleUseOriginal}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
                >
                  直接使用原图
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3：Commit**

```bash
git add components/DocScanner.js package.json package-lock.json
git commit -m "feat: 添加 DocScanner 文档扫描纠偏组件（jscanify）"
```

---

## Task 3：侧边栏导航改为文件夹

**Files:**
- Modify: `components/Sidebar.js`

- [ ] **Step 1：添加图标**

在 `components/Sidebar.js` 的 `const icons = {` 块内，在 `cost` 图标后面添加两个新图标：

```js
  supplierDocs: (
    <Icon>
      <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </Icon>
  ),
  purchaseInspection: (
    <Icon>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </Icon>
  ),
```

- [ ] **Step 2：修改 menuItems 数组**

将现有的单项：
```js
  { href: '/cost', label: '采购成本', icon: icons.cost },
```

替换为：
```js
  {
    key: 'purchaseCost',
    label: '采购成本',
    icon: icons.cost,
    toggleable: true,
    children: [
      { href: '/cost', label: '采购记录', icon: icons.cost },
      { href: '/cost/suppliers', label: '供应商档案', icon: icons.supplierDocs },
      { href: '/cost/inspection', label: '采购检验报告', icon: icons.purchaseInspection },
    ],
  },
```

- [ ] **Step 3：添加自动展开逻辑**

在 `Sidebar.js` 的 `useEffect` 展开逻辑块（含 `inspectionReports`、`ledgers` 等的那个 `useEffect`）中添加：

```js
    if (pathname.startsWith('/cost')) {
      setExpandedMenus((prev) => ({ ...prev, purchaseCost: true }))
    }
```

- [ ] **Step 4：本地验证**

```bash
npm run dev
```

访问 `http://localhost:3000/dashboard`，确认侧边栏「采购成本」变为可展开文件夹，三个子项显示正常，点击展开/收起正常。

- [ ] **Step 5：Commit**

```bash
git add components/Sidebar.js
git commit -m "feat: 侧边栏采购成本改为可展开文件夹，添加供应商档案和采购检验报告子项"
```

---

## Task 4：供应商档案页面（/cost/suppliers）

**Files:**
- Create: `app/cost/suppliers/page.js`

- [ ] **Step 1：新建页面文件**

创建 `app/cost/suppliers/page.js`，完整内容：

```jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import dynamic from 'next/dynamic'

const DocScanner = dynamic(() => import('@/components/DocScanner'), { ssr: false })

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
  const [suppliers, setSuppliers] = useState([])   // string[]
  const [docs, setDocs] = useState({})              // { [supplier_name]: doc[] }
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState(null)

  // 抽屉
  const [activeSupplier, setActiveSupplier] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 上传表单
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

  // 扫描
  const [scanFile, setScanFile] = useState(null)
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
    // 从 purchase_records 聚合供应商列表
    const { data: pr } = await supabase
      .from('purchase_records')
      .select('supplier')
      .not('supplier', 'is', null)
    const supplierList = [...new Set((pr || []).map(r => r.supplier).filter(Boolean))].sort()
    setSuppliers(supplierList)

    // 批量查询所有供应商档案
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
    setScanFile(file)
  }

  const handleScanConfirm = (blob) => {
    const scannedFile = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
    setUploadFile(scannedFile)
    setScanFile(null)
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
            {/* 抽屉头 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-md z-10 px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{activeSupplier}</h2>
                <p className="text-xs text-slate-500">{activeDocs.length} 份档案文件</p>
              </div>
              <button onClick={closeDrawer} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
              {/* 已上传文件按类型分组 */}
              {SUPPLIER_DOC_TYPES.map(type => {
                const typeDocs = activeDocs.filter(d => d.doc_type === type.value)
                const otherCustomDocs = type.value === 'other'
                  ? activeDocs.filter(d => d.doc_type === 'other')
                  : typeDocs
                if (type.value !== 'other' && typeDocs.length === 0) return null
                if (type.value === 'other' && otherCustomDocs.length === 0) return null
                return (
                  <div key={type.value}>
                    <p className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-3 ${type.color}`}>
                      {type.label}
                    </p>
                    <div className="space-y-2">
                      {(type.value === 'other' ? otherCustomDocs : typeDocs).map(doc => {
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
                              <button
                                onClick={() => handleView(doc)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                查看
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDelete(doc)}
                                  className="text-xs text-red-400 hover:text-red-600 font-medium"
                                >
                                  删除
                                </button>
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

              {/* 上传区域 */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">上传文件</p>
                <div className="space-y-3">
                  {/* 文件类型选择 */}
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

                  {/* 自定义标签 */}
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

                  {/* 已选文件显示 */}
                  {uploadFile && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-xl">
                      <span className="text-xs text-blue-700 flex-1 truncate">{uploadFile.name}</span>
                      <button onClick={() => setUploadFile(null)} className="text-blue-400 hover:text-blue-600 text-sm">×</button>
                    </div>
                  )}

                  {/* 选择文件 / 拍照扫描按钮 */}
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
                          拍照扫描
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

      {/* 扫描组件 */}
      {scanFile && (
        <DocScanner
          imageFile={scanFile}
          onConfirm={handleScanConfirm}
          onCancel={() => setScanFile(null)}
        />
      )}
    </DashboardLayout>
  )
}
```

- [ ] **Step 2：本地验证**

```bash
npm run dev
```

访问 `http://localhost:3000/cost/suppliers`，确认：
- 页面正常加载，供应商卡片列表显示
- 点击供应商卡片，底部抽屉正常打开
- 上传文件后，文件出现在抽屉文件列表中
- 点击查看，能在新标签打开文件

- [ ] **Step 3：Commit**

```bash
git add app/cost/suppliers/page.js
git commit -m "feat: 供应商档案页面 /cost/suppliers"
```

---

## Task 5：采购检验报告页面（/cost/inspection）

**Files:**
- Create: `app/cost/inspection/page.js`

- [ ] **Step 1：新建页面文件**

创建 `app/cost/inspection/page.js`，完整内容：

```jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DashboardLayout from '@/components/DashboardLayout'
import dynamic from 'next/dynamic'

const DocScanner = dynamic(() => import('@/components/DocScanner'), { ssr: false })

const BUCKET = 'purchase-documents'

const CATEGORIES = [
  { value: 'carton', label: '纸箱', color: 'bg-amber-100 text-amber-700' },
  { value: 'material', label: '物料', color: 'bg-sky-100 text-sky-700' },
  { value: 'label', label: '标签', color: 'bg-violet-100 text-violet-700' },
  { value: 'raw_material', label: '原材料', color: 'bg-emerald-100 text-emerald-700' },
]
const getCategoryInfo = (v) => CATEGORIES.find(c => c.value === v) || { label: v, color: 'bg-slate-100 text-slate-600' }

export default function InspectionPage() {
  const [records, setRecords] = useState([])
  const [inspectionDocs, setInspectionDocs] = useState({})  // { [purchase_record_id]: doc[] }
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userId, setUserId] = useState(null)

  // 筛选
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')

  // 抽屉
  const [activeRecord, setActiveRecord] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 上传表单
  const [docLabel, setDocLabel] = useState('')
  const [docRemark, setDocRemark] = useState('')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  // 扫描
  const [scanFile, setScanFile] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setIsMobile(/iPhone|iPad|Android/i.test(navigator.userAgent))
    fetchProfile()
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [filterCategory, filterSupplier, filterDateFrom, filterDateTo])

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
    const records = pr || []
    setRecords(records)

    // 供应商列表（用于筛选下拉）
    const { data: allPr } = await supabase.from('purchase_records').select('supplier').not('supplier', 'is', null)
    setSuppliers([...new Set((allPr || []).map(r => r.supplier).filter(Boolean))].sort())

    // 批量查询检验文件
    if (records.length > 0) {
      const ids = records.map(r => r.id)
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

  const openDrawer = (record) => {
    setActiveRecord(record)
    setDrawerOpen(true)
    setDocLabel('')
    setDocRemark('')
    setUploadFile(null)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    setActiveRecord(null)
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
    setScanFile(file)
  }

  const handleScanConfirm = (blob) => {
    const scannedFile = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
    setUploadFile(scannedFile)
    setScanFile(null)
  }

  const handleUpload = async () => {
    if (!uploadFile) { alert('请选择文件'); return }
    if (!docLabel.trim()) { alert('请填写文件说明'); return }
    if (!activeRecord) return
    setUploading(true)

    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, '_')
    const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`
    const filePath = `inspections/${activeRecord.id}/${uniqueId}_${safeName}`

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, uploadFile, { upsert: false })
    if (uploadError) { alert('上传失败：' + uploadError.message); setUploading(false); return }

    const { error: insertError } = await supabase.from('purchase_inspection_docs').insert({
      purchase_record_id: activeRecord.id,
      doc_label: docLabel.trim(),
      file_path: filePath,
      file_name: uploadFile.name,
      remark: docRemark.trim() || null,
      uploaded_by: userId,
    })
    if (insertError) {
      await supabase.storage.from(BUCKET).remove([filePath])
      alert('保存记录失败：' + insertError.message)
      setUploading(false)
      return
    }

    setDocLabel('')
    setDocRemark('')
    setUploadFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    await fetchRecords()
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
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${catInfo.color}`}>
                      {catInfo.label}
                    </span>
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
                    <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {docCount} 份
                    </span>
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
            className="relative bg-white rounded-t-3xl sm:rounded-2xl sm:max-w-2xl sm:mx-auto sm:mb-8 sm:w-full overflow-hidden max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* 抽屉头 */}
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

            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* 已上传文件 */}
              {activeDocs.length > 0 && (
                <div className="space-y-2">
                  {activeDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{doc.doc_label}</p>
                        <p className="text-xs text-slate-500 truncate">{doc.file_name}</p>
                        <p className="text-xs text-slate-400">{doc.uploaded_at?.slice(0, 10)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleView(doc)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">查看</button>
                        {isAdmin && (
                          <button onClick={() => handleDelete(doc)} className="text-xs text-red-400 hover:text-red-600 font-medium">删除</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeDocs.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">暂无检验报告，请上传</p>
              )}

              {/* 上传区域 */}
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
                        拍照扫描
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
      )}

      {/* 扫描组件 */}
      {scanFile && (
        <DocScanner
          imageFile={scanFile}
          onConfirm={handleScanConfirm}
          onCancel={() => setScanFile(null)}
        />
      )}
    </DashboardLayout>
  )
}
```

- [ ] **Step 2：本地验证**

```bash
npm run dev
```

访问 `http://localhost:3000/cost/inspection`，确认：
- 采购记录列表正常显示，带类别角标
- 有附件的记录右侧显示蓝色数字角标
- 点击记录，底部抽屉打开，显示已上传文件
- 上传文件后，附件列表更新

- [ ] **Step 3：Commit**

```bash
git add app/cost/inspection/page.js
git commit -m "feat: 采购检验报告页面 /cost/inspection"
```

---

## Task 6：构建验证 + 推送

- [ ] **Step 1：运行构建**

```bash
npm run build
```

预期：构建成功，无报错，`/cost/suppliers` 和 `/cost/inspection` 出现在路由列表中。

- [ ] **Step 2：推送**

```bash
git push
```

- [ ] **Step 3：验证部署**

在 Vercel 等待部署完成后，在移动端访问 `/cost/suppliers`，确认「拍照扫描」按钮出现；在桌面端确认只显示「选择文件」。
