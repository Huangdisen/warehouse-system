import crypto from 'crypto'

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getSecret() {
  const secret = process.env.MP_API_JWT_SECRET
  if (!secret) {
    throw new Error('Missing MP_API_JWT_SECRET')
  }
  return secret
}

function sign(input) {
  return crypto.createHmac('sha256', getSecret()).update(input).digest('base64url')
}

export function createMpToken(payload, expiresInSeconds = 6 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000)
  const body = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
    typ: 'mp_access_token',
  }

  const headerPart = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payloadPart = toBase64Url(JSON.stringify(body))
  const content = `${headerPart}.${payloadPart}`
  const signature = sign(content)

  return `${content}.${signature}`
}

export function verifyMpToken(token) {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerPart, payloadPart, signaturePart] = parts
  const content = `${headerPart}.${payloadPart}`

  const expectedSignature = sign(content)
  if (signaturePart !== expectedSignature) return null

  let payload
  try {
    payload = JSON.parse(fromBase64Url(payloadPart))
  } catch {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || now >= payload.exp) return null
  if (payload.typ !== 'mp_access_token') return null

  return payload
}
