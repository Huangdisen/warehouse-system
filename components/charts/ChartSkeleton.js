'use client'

export default function ChartSkeleton({ height = 280 }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      {/* Legend skeleton */}
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-emerald-200 rounded-full" />
          <div className="h-3 w-8 bg-slate-200 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-amber-200 rounded-full" />
          <div className="h-3 w-8 bg-slate-200 rounded" />
        </div>
      </div>

      {/* Chart area skeleton */}
      <div className="h-[calc(100%-40px)] bg-gradient-to-t from-slate-100 to-slate-50 rounded-xl relative overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="w-full h-px bg-slate-200" />
          ))}
        </div>

        {/* Bars simulation */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around px-6 pb-6">
          {[35, 55, 40, 70, 45, 60, 50].map((h, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className="w-6 bg-slate-200 rounded-t transition-all duration-500"
                style={{
                  height: `${h * 2}px`,
                  animationDelay: `${i * 100}ms`
                }}
              />
            </div>
          ))}
        </div>

        {/* Shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skeleton-shimmer" />
      </div>
    </div>
  )
}
