import { apiBadRequest, apiError, apiOk } from '@/lib/server/api-response'
import { requireMpAuth } from '@/lib/server/mp-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const VALID_WAREHOUSES = new Set(['finished', 'semi'])

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
    const warehouse = (searchParams.get('warehouse') || 'finished').trim()
    const keyword = sanitizeKeyword(searchParams.get('q'))
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 50), 200)

    if (warehouse && !VALID_WAREHOUSES.has(warehouse)) {
      return apiBadRequest('warehouse 仅支持 finished 或 semi')
    }

    const from = (page - 1) * limit
    const to = from + limit - 1

    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('products')
      .select('id, name, spec, prize_type, warehouse, quantity, warning_qty, updated_at', {
        count: 'exact',
      })
      .order('updated_at', { ascending: false })

    if (warehouse) {
      query = query.eq('warehouse', warehouse)
    }

    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,spec.ilike.%${keyword}%,prize_type.ilike.%${keyword}%`)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
      return apiError('查询库存失败', 500, error.message)
    }

    const items = (data || []).map((row) => ({
      ...row,
      low_stock: row.quantity <= row.warning_qty,
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
    return apiError('查询库存失败', 500, error.message)
  }
}
