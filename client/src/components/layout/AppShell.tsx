import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useUiStore } from '../../store/uiStore'
import BottomNav from './BottomNav'
import Navbar from './Navbar'

export default function AppShell() {
  const setLanguage = useUiStore((state) => state.setLanguage)

  useEffect(() => {
    setLanguage('en')
  }, [setLanguage])

  return (
    <div className="min-h-screen bg-[#f6f1e8]">
      <Navbar />
      <main className="mx-auto min-h-[calc(100vh-72px)] max-w-6xl px-3 pb-28 pt-4 sm:px-4 sm:pt-5 md:pb-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
