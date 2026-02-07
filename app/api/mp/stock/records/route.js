import { apiBadRequest, apiError, apiOk } from '@/lib/server/api-response'
import { requireMpAuth } from '@/lib/server/mp-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const VALID_WAREHOUSES = new Set(['finished', 'semi'])
const VALID_TYPES = new Set(['in', 'out'])

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n) || n <= 0) return fallback
  return n
}

function sanitizeKeyword(value) {
  return (value || '').toString().trim().replace(/[,%()]/g, ' ').slice(0, 40)
}

export async function GET(request) {
  const auth = requireMpAuth(request, { roles: ['admin', 'staff', 'viewer'] })
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)

    const warehouse = (searchParams.get('warehouse') || '').trim()
    const type = (searchParams.get('type') || '').trim()
    const keyword = sanitizeKeyword(searchParams.get('q'))
    const dateFrom = searchParams.get('date_from') || ''
    const dateTo = searchParams.get('date_to') || ''
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 30), 100)

    if (warehouse && !VALID_WAREHOUSES.has(warehouse)) {
      return apiBadRequest('warehouse 仅支持 finished 或 semi')
    }
    if (type && !VALID_TYPES.has(type)) {
      return apiBadRequest('type 仅支持 in 或 out')
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('stock_records')
      .select(
        `id, type, quantity, stock_date, production_date, remark, created_at,
         product:products!inner(id, name, spec, prize_type, warehouse),
         operator:profiles!stock_records_operator_id_fkey(id, name),
         customer:customers(id, name)`,
        { count: 'exact' }
      )
      .order('stock_date', { ascending: false })
      .order('created_at', { ascending: false })

    // 按仓库过滤（通过关联产品的 warehouse 字段）
    if (warehouse) {
      query = query.eq('product.warehouse', warehouse)
    }

    // 按类型过滤
    if (type) {
      query = query.eq('type', type)
    }

    // 按日期范围过滤
    if (dateFrom) {
      query = query.gte('stock_date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('stock_date', dateTo)
    }

    // 按产品名称/规格搜索
    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,spec.ilike.%${keyword}%`, {
        referencedTable: 'products',
      })
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
      return apiError('查询流水记录失败', 500, error.message)
    }

    const items = (data || []).map((row) => ({
      id: row.id,
      type: row.type,
      quantity: row.quantity,
      stock_date: row.stock_date,
      production_date: row.production_date,
      remark: row.remark,
      created_at: row.created_at,
      product: row.product,
      operator_name: row.operator?.name || null,
      customer_name: row.customer?.name || null,
    }))

    return apiOk({
      items,
      pagination: {
        page,
        limit,
        total: count || 0,
      },
      server_time: new Date().toISOString(),
    })
  } catch (error) {
    return apiError('查询流水记录失败', 500, error.message)
  }
}
