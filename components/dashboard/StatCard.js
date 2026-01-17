'use client'

export default function StatCard({
  title,
  value,
  icon,
  color = 'default',
  highlight = false,
  subtitle,
  trend,
  loading = false
}) {
  const colorStyles = {
    green: 'bg-emerald-50 border-emerald-200',
    orange: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200',
    default: 'bg-white border-slate-200/70',
  }

  const iconBgColors = {
    green: 'bg-emerald-100 text-emerald-600',
    orange: 'bg-amber-100 text-amber-600',
    blue: 'bg-blue-100 text-blue-600',
    default: 'bg-slate-100 text-slate-600',
  }

  if (loading) {
    return (
      <div className="p-4 rounded-2xl border bg-white animate-pulse">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-3 w-16 bg-slate-200 rounded" />
            <div className="h-7 w-12 bg-slate-200 rounded" />
          </div>
          <div className="h-10 w-10 bg-slate-100 rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`p-4 rounded-2xl border shadow-sm transition hover:shadow-md ${
        highlight ? 'bg-rose-50 border-rose-200' : colorStyles[color]
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className={`text-2xl font-bold ${
              highlight ? 'text-rose-600' : 'text-slate-800'
            }`}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {trend && (
              <span className={`text-xs font-medium ${
                trend > 0 ? 'text-emerald-600' : trend < 0 ? 'text-rose-600' : 'text-slate-400'
              }`}>
                {trend > 0 ? '↑' : trend < 0 ? '↓' : ''}
                {trend !== 0 && Math.abs(trend)}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <span className={`flex items-center justify-center w-10 h-10 rounded-xl ${
            highlight ? 'bg-rose-100 text-rose-600' : iconBgColors[color]
          }`}>
            {icon}
          </span>
        )}
      </div>
    </div>
  )
}

// 统计卡片骨架屏
export function StatCardSkeleton() {
  return (
    <div className="p-4 rounded-2xl border bg-white border-slate-200/70 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-16 bg-slate-200 rounded" />
          <div className="h-7 w-12 bg-slate-200 rounded" />
        </div>
        <div className="h-10 w-10 bg-slate-100 rounded-xl" />
      </div>
    </div>
  )
}
