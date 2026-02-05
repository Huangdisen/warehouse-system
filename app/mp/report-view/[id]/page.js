import { verifyReportViewLinkToken } from '@/lib/server/report-view-link'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function isHiddenRemark(remark = '') {
  return remark.startsWith('盘点调整') || remark.startsWith('贴半成品')
}

export const dynamic = 'force-dynamic'

export default async function MpReportViewPage({ params, searchParams }) {
  const id = params?.id
  const exp = searchParams?.exp
  const sig = searchParams?.sig

  if (!verifyReportViewLinkToken(id, exp, sig)) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>链接已失效</h1>
        <p style={{ color: '#64748b' }}>请回到小程序重新打开报告。</p>
      </main>
    )
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('stock_records')
    .select(
      `
      id,
      stock_date,
      production_date,
      quantity,
      remark,
      created_at,
      products (name, spec),
      customers (name),
      profiles (name)
    `
    )
    .eq('id', id)
    .eq('type', 'out')
    .maybeSingle()

  if (error || !data || isHiddenRemark(data.remark || '')) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>未找到报告</h1>
        <p style={{ color: '#64748b' }}>请确认该出库记录是否可生成检验报告。</p>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f5f7fb', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
      <div style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 6px 20px rgba(15,23,42,0.06)' }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>出厂检验报告</h1>
        <p style={{ marginTop: 6, color: '#64748b' }}>小程序只读预览</p>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 10 }}>
          <strong>产品名称</strong><span>{data.products?.name || '-'}</span>
          <strong>规格</strong><span>{data.products?.spec || '-'}</span>
          <strong>客户</strong><span>{data.customers?.name || '-'}</span>
          <strong>出库日期</strong><span>{data.stock_date || '-'}</span>
          <strong>生产日期</strong><span>{data.production_date || '-'}</span>
          <strong>数量</strong><span>{data.quantity ?? '-'}</span>
          <strong>操作人</strong><span>{data.profiles?.name || '-'}</span>
          <strong>备注</strong><span>{data.remark || '-'}</span>
        </div>
      </div>
    </main>
  )
}
