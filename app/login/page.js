'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('登录失败：' + error.message)
      setLoading(false)
    } else {
      router.replace('/dashboard')
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-50">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#f8fafc_0%,#eef2ff_45%,#fef3c7_100%)] opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.08)_1px,transparent_0)] [background-size:26px_26px] opacity-40" />
      <div className="pointer-events-none absolute -top-24 right-[-3rem] h-80 w-80 rounded-full bg-cyan-300/40 blur-3xl animate-float" />
      <div className="pointer-events-none absolute bottom-[-6rem] left-[-4rem] h-96 w-96 rounded-full bg-amber-200/70 blur-3xl animate-float-slow" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div className="animate-fade-up">
              <div className="inline-flex items-center gap-3 rounded-full bg-white/70 px-4 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                数据安全 · 实时协同 · 流程可追溯
              </div>
              <h1 className="mt-6 text-4xl font-semibold text-slate-900 sm:text-5xl font-display">
                百越仓库管理系统
              </h1>
              <p className="mt-4 text-base text-slate-600 sm:text-lg">
                面向成品仓库的精细化出入库管理，实时同步库存状态，降低盘点与流转成本。
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  {
                    title: '库存实时可视化',
                    detail: '批次与库位同步更新，减少人工核对。',
                  },
                  {
                    title: '出入库流程可追溯',
                    detail: '每次操作留痕，审计更轻松。',
                  },
                  {
                    title: '多角色协作',
                    detail: '仓管、生产、管理层信息一致。',
                  },
                  {
                    title: '异常预警提示',
                    detail: '低库存与滞销品及时提醒。',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="h-5 w-5"
                        >
                          <path d="M5 12l4 4L19 6" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-fade-in">
              <div className="rounded-3xl border border-white/60 bg-white/85 p-8 shadow-xl backdrop-blur-md">
                <div className="text-center mb-6">
                  <div className="flex justify-center mb-4">
                    <img src="/logo.png" alt="百越" className="w-16 h-16" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    账户登录
                  </h2>
                  <p className="text-sm text-slate-500 mt-2">
                    使用企业邮箱进入管理面板
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      邮箱
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="请输入邮箱"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      密码
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                      placeholder="请输入密码"
                      required
                    />
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? '登录中...' : '登录'}
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    登录即代表你同意企业内部安全规范
                  </p>
                </form>
              </div>
              <p className="mt-6 text-center text-xs text-slate-500">
                © {new Date().getFullYear()} 百越仓库管理系统
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
