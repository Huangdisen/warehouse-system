# 采购原料检验报告 设计文档

日期：2026-03-30

## 概述

为仓库管理系统新增「采购原料检验报告」模块，关联现有采购成本记录，支持上传检验报告和供应商三证。采用两层结构：供应商层管理三证及自定义证件，采购记录层管理每批次检验报告。

## 导航变更

`采购成本` 菜单从单项变为可展开文件夹，包含三个子项：

- 采购成本 → `/cost`
- 供应商档案 → `/cost/suppliers`
- 采购检验报告 → `/cost/inspection`

侧边栏改动：在 `Sidebar.js` 中将 `/cost` 单项改为带 children 的文件夹，参考现有 `inspectionReports` 文件夹结构。

## 数据库

### 新建表：`supplier_documents`

```sql
create table supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  doc_type text not null, -- 'business_license' | 'production_permit' | 'quality_cert' | 'other'
  doc_label text,         -- 自定义标签，doc_type='other' 时填写
  file_path text not null,
  file_name text not null,
  expiry_date date,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz default now(),
  remark text
);

alter table supplier_documents enable row level security;
create policy "authenticated read" on supplier_documents for select using (auth.role() = 'authenticated');
create policy "authenticated insert" on supplier_documents for insert with check (auth.role() = 'authenticated');
create policy "admin delete" on supplier_documents for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
```

### 新建表：`purchase_inspection_docs`

```sql
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
create policy "authenticated read" on purchase_inspection_docs for select using (auth.role() = 'authenticated');
create policy "authenticated insert" on purchase_inspection_docs for insert with check (auth.role() = 'authenticated');
create policy "admin delete" on purchase_inspection_docs for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
```

### Storage Bucket

- Bucket 名：`purchase-documents`（public: false，需签名 URL）
- 路径结构：
  - 供应商档案：`suppliers/{supplier_name}/{uuid}_{filename}`
  - 采购检验报告：`inspections/{purchase_record_id}/{uuid}_{filename}`

## 页面：`/cost/suppliers`（供应商档案）

### 数据来源
- 供应商列表：从 `purchase_records` 聚合 `distinct supplier`，过滤掉空值
- 文件列表：从 `supplier_documents` 按 `supplier_name` 查询

### UI 结构
- 供应商卡片列表，每张卡片显示供应商名称 + 已上传文件数量角标
- 点击卡片 → 底部抽屉展开，内容分组：
  - 营业执照 / 生产许可证 / 质量证书 / 其他
  - 每个文件行：文件名、有效期（过期显示红色）、上传时间、查看按钮、删除按钮（admin only）
- 抽屉底部「上传文件」区域：
  - 选择文件类型（radio：预设三种 + 自定义）
  - 自定义类型时显示标签输入框
  - 有效期输入（可选）
  - 备注输入（可选）
  - 选择文件 / 拍照扫描按钮

### 文件类型常量
```js
const SUPPLIER_DOC_TYPES = [
  { value: 'business_license', label: '营业执照', color: 'bg-blue-100 text-blue-700' },
  { value: 'production_permit', label: '生产许可证', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'quality_cert', label: '质量证书', color: 'bg-violet-100 text-violet-700' },
  { value: 'other', label: '其他', color: 'bg-slate-100 text-slate-600' },
]
```

## 页面：`/cost/inspection`（采购检验报告）

### 数据来源
- 采购记录：从 `purchase_records` 查询（支持与 `/cost` 相同的筛选：类别、供应商、日期）
- 检验文件：从 `purchase_inspection_docs` 批量查询已展示记录的附件

### UI 结构
- 顶部筛选栏（类别 + 供应商 + 日期范围，复用 `/cost` 筛选样式）
- 采购记录卡片列表，每条显示：
  - 主行：类别角标、品名、规格
  - 副行：日期 · 供应商 · 数量
  - 右侧：附件数量角标（有附件时显示蓝色数字）
- 点击记录 → 底部抽屉：
  - 已上传文件列表（文件名、说明、上传时间、查看 / 删除）
  - 上传区域：文件说明输入框 + 选择文件 / 拍照扫描按钮

## 文件查看

调用 Supabase Storage `createSignedUrl`（有效期 60 秒）→ `window.open` 新标签预览。PDF 浏览器原生预览，图片直接显示。

## 扫描功能（移动端）

使用 `jscanify`（基于 OpenCV.js）实现文档扫描纠偏：

1. 点击「拍照扫描」→ 调起摄像头（`input[capture=environment]`）
2. 拍照后进入扫描预览界面（全屏 modal）
3. jscanify 自动识别文档四角、绘制边框
4. 用户可手动拖拽调整四角
5. 确认 → 透视变换纠偏 → canvas 导出 JPEG（质量 0.85）
6. 预览结果 → 确认上传 / 重拍

桌面端不显示「拍照扫描」入口，仅显示「选择文件」。

## 权限

- 所有登录用户可查看、上传
- 仅 admin 可删除

## 文件大小限制

单文件最大 10MB，超出提示用户。
