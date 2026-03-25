import { Link, useLocation } from 'react-router-dom'
import { Package, Palette, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import Button from '../ui/Button'

export default function Navbar() {
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const clearAuth = useAuthStore((state) => state.clearAuth)

  const isActive = (path: string) => location.pathname.startsWith(path)

  return (
    <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-semibold text-stone-900">Idanta</p>
            <p className="text-sm text-stone-500">Aapke brand ka saathi</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <Link
            to="/dashboard"
            className={`rounded-full px-4 py-2 text-sm font-medium ${isActive('/dashboard') ? 'bg-orange-100 text-orange-700' : 'text-stone-600'}`}
          >
            Home
          </Link>
          <Link
            to="/brand"
            className={`rounded-full px-4 py-2 text-sm font-medium ${isActive('/brand') ? 'bg-orange-100 text-orange-700' : 'text-stone-600'}`}
          >
            <span className="inline-flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Brand
            </span>
          </Link>
          <Link
            to="/products"
            className={`rounded-full px-4 py-2 text-sm font-medium ${isActive('/products') ? 'bg-orange-100 text-orange-700' : 'text-stone-600'}`}
          >
            <span className="inline-flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products
            </span>
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-stone-800">{user?.name ?? 'Artisan'}</p>
            <p className="text-xs text-stone-500">{user?.phone ?? ''}</p>
          </div>
          <Button variant="ghost" onClick={clearAuth}>
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
