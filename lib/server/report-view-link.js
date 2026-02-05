import crypto from 'crypto'

function getSecret() {
  const secret = process.env.MP_API_JWT_SECRET
  if (!secret) throw new Error('Missing MP_API_JWT_SECRET')
  return secret
}

function sign(input) {
  return crypto.createHmac('sha256', getSecret()).update(input).digest('base64url')
}

export function createReportViewLinkToken(reportId, expiresInSeconds = 10 * 60) {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const payload = `${reportId}.${exp}`
  const sig = sign(payload)
  return { exp, sig }
}

export function verifyReportViewLinkToken(reportId, exp, sig) {
  if (!reportId || !exp || !sig) return false
  const expNum = Number(exp)
  if (!Number.isFinite(expNum)) return false
  if (Math.floor(Date.now() / 1000) > expNum) return false
  return sign(`${reportId}.${expNum}`) === sig
}

