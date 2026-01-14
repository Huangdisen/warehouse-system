'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Sidebar from './Sidebar'

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.replace('/login')
        return
      }

      setUser(session.user)

      // 获取用户 profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      setProfile(profileData)
      setLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          router.replace('/login')
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    )
  }

  const handleProfileUpdate = (updatedProfile) => {
    setProfile(updatedProfile)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} profile={profile} onProfileUpdate={handleProfileUpdate} />
      <main className="md:ml-64 min-h-screen relative overflow-hidden pt-20 md:pt-0">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#f8fafc_0%,#eef2ff_45%,#fef3c7_100%)] opacity-80" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_0)] [background-size:24px_24px] opacity-40" />
        <div className="pointer-events-none absolute -top-20 right-[-4rem] h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl animate-float" />
        <div className="pointer-events-none absolute bottom-[-5rem] left-[-4rem] h-96 w-96 rounded-full bg-amber-200/60 blur-3xl animate-float-slow" />

        <div className="relative z-10 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
