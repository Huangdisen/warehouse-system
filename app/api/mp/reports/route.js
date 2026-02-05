import { apiError, apiOk } from '@/lib/server/api-response'
import { requireMpAuth } from '@/lib/server/mp-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

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
    const startDate = searchParams.get('from') || searchParams.get('start_date')
    const endDate = searchParams.get('to') || searchParams.get('end_date')
    const customerId = searchParams.get('customer_id')
    const keyword = sanitizeKeyword(searchParams.get('q'))
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const limit = Math.min(parsePositiveInt(searchParams.get('limit'), 30), 100)

    const from = (page - 1) * limit
    const to = from + limit - 1

    const supabase = getSupabaseAdmin()
    let query = supabase
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
      `,
        { count: 'exact' }
      )
      .eq('type', 'out')
      .order('stock_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (startDate) {
      query = query.gte('stock_date', startDate)
    }

    if (endDate) {
      query = query.lte('stock_date', endDate)
    }

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    if (keyword) {
      query = query.ilike('remark', `%${keyword}%`)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
      return apiError('查询检验报告列表失败', 500, error.message)
    }

    const filteredItems = (data || []).filter((record) => {
      const remark = record.remark || ''
      return !remark.startsWith('盘点调整') && !remark.startsWith('贴半成品')
    })

    return apiOk({
      items: filteredItems,
      pagination: {
        page,
        limit,
        total: count || 0,
      },
      server_time: new Date().toISOString(),
    })
  } catch (error) {
    return apiError('查询检验报告列表失败', 500, error.message)
  }
}
