import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import BottomNav from './BottomNav'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-[#fffaf4]">
      <Navbar />
      <main className="mx-auto min-h-[calc(100vh-72px)] max-w-6xl px-4 pb-24 pt-5 md:pb-8">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
