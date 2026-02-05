import { apiForbidden, apiUnauthorized } from '@/lib/server/api-response'
import { verifyMpToken } from '@/lib/server/mp-token'

export function getBearerToken(request) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return null
  }
  return authorization.slice(7).trim()
}

export function requireMpAuth(request, options = {}) {
  const { roles = [] } = options
  const token = getBearerToken(request)

  if (!token) {
    return { ok: false, response: apiUnauthorized('缺少访问令牌') }
  }

  const payload = verifyMpToken(token)
  if (!payload?.uid) {
    return { ok: false, response: apiUnauthorized('访问令牌无效或已过期') }
  }

  if (roles.length > 0 && !roles.includes(payload.role)) {
    return { ok: false, response: apiForbidden('当前账号无权访问该资源') }
  }

  return {
    ok: true,
    auth: {
      userId: payload.uid,
      role: payload.role,
      name: payload.name,
      openId: payload.openid,
    },
  }
}
