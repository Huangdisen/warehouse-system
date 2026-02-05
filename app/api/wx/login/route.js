import { apiBadRequest, apiError, apiOk, apiUnauthorized } from '@/lib/server/api-response'
import { createMpToken } from '@/lib/server/mp-token'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

const ACCESS_TOKEN_EXPIRES_IN = 6 * 60 * 60

async function resolveWechatOpenId(code) {
  const appid = process.env.WECHAT_APPID
  const secret = process.env.WECHAT_SECRET

  if (!appid || !secret || !code) {
    return null
  }

  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`

  const response = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!response.ok) return null

  const data = await response.json()
  if (!data?.openid || data?.errcode) {
    return null
  }

  return data.openid
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const code = body?.code?.toString().trim()
    const userId = body?.user_id?.toString().trim()

    if (!code && !userId) {
      return apiBadRequest('缺少登录参数：请提供 code 或 user_id')
    }

    const openId = code ? await resolveWechatOpenId(code) : null

    if (code && !openId && process.env.MP_BYPASS_WX_LOGIN !== 'true') {
      return apiUnauthorized('微信登录校验失败，请检查 WECHAT_APPID/WECHAT_SECRET')
    }

    if (!userId) {
      return apiBadRequest('缺少 user_id。MVP 阶段请先将小程序账号绑定到仓库系统用户。')
    }

    const supabase = getSupabaseAdmin()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, name, role')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      return apiError('查询用户失败', 500, error.message)
    }

    if (!profile) {
      return apiUnauthorized('用户不存在或尚未绑定')
    }

    const accessToken = createMpToken(
      {
        uid: profile.id,
        name: profile.name,
        role: profile.role,
        ...(openId ? { openid: openId } : {}),
      },
      ACCESS_TOKEN_EXPIRES_IN
    )

    return apiOk({
      token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_EXPIRES_IN,
      user: profile,
      bind_status: 'bound',
    })
  } catch (error) {
    return apiError('登录失败', 500, error.message)
  }
}
