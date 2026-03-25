import { Link, useLocation } from 'react-router-dom'
import { Home, Package, Palette, PlusCircle } from 'lucide-react'

const items = [
  { to: '/dashboard', label: 'Home', icon: Home },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/brand', label: 'Brand', icon: Palette },
  { to: '/products/add', label: 'Add', icon: PlusCircle },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white md:hidden">
      <div className="grid grid-cols-4">
        {items.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(`${to}/`)
          return (
            <Link
              key={to}
              to={to}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? 'text-orange-600' : 'text-stone-500'}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
