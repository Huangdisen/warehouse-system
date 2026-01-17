'use client'
import Link from 'next/link'

export default function AlertBanner({ count, onClick }) {
  if (!count || count === 0) return null

  return (
    <div className="alert-banner">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-100">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4 text-rose-600"
          >
            <path d="M12 3l10 18H2L12 3z" />
            <path d="M12 9v5" />
            <path d="M12 17h.01" />
          </svg>
        </span>
        <div>
          <p className="font-medium text-rose-800">
            {count} 个产品库存不足
          </p>
          <p className="text-sm text-rose-600">
            请及时补充库存，避免断货
          </p>
        </div>
      </div>
      <button
        onClick={onClick}
        className="px-4 py-2 text-sm font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-xl transition"
      >
        查看详情
      </button>
    </div>
  )
}
