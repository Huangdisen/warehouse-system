import { apiError, apiOk } from '@/lib/server/api-response'
import { requireMpAuth } from '@/lib/server/mp-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(request, { params }) {
  const auth = requireMpAuth(request, { roles: ['admin', 'staff', 'viewer'] })
  if (!auth.ok) return auth.response

  try {
    const id = params?.id
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
        products (id, name, spec, warehouse, prize_type),
        customers (id, name),
        profiles (id, name)
      `
      )
      .eq('id', id)
      .eq('type', 'out')
      .maybeSingle()

    if (error) {
      return apiError('查询检验报告详情失败', 500, error.message)
    }

    if (!data) {
      return apiError('报告不存在', 404)
    }

    const remark = data.remark || ''
    if (remark.startsWith('盘点调整') || remark.startsWith('贴半成品')) {
      return apiError('报告不存在', 404)
    }

    return apiOk({
      ...data,
      inspection_snapshot: {
        product_name: data.products?.name || '',
        product_spec: data.products?.spec || '',
        production_date: data.production_date || data.stock_date,
      },
    })
  } catch (error) {
    return apiError('查询检验报告详情失败', 500, error.message)
  }
}
