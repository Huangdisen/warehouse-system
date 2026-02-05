import { NextResponse } from 'next/server'

export function apiOk(data, status = 200) {
  return NextResponse.json({ success: true, data }, { status })
}

export function apiError(message, status = 500, details) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        ...(details ? { details } : {}),
      },
    },
    { status }
  )
}

export function apiBadRequest(message, details) {
  return apiError(message, 400, details)
}

export function apiUnauthorized(message = '未授权') {
  return apiError(message, 401)
}

export function apiForbidden(message = '无权限') {
  return apiError(message, 403)
}
