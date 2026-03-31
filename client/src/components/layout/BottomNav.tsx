import { Link, useLocation } from 'react-router-dom'
import { Home, Package, Palette, PlusCircle } from 'lucide-react'
import { copyFor, useLanguage } from '../../lib/i18n'

export default function BottomNav() {
  const location = useLocation()
  const language = useLanguage()
  const items = [
    { to: '/dashboard', label: copyFor(language, 'Home', 'Home'), icon: Home },
    { to: '/products', label: copyFor(language, 'Products', 'Products'), icon: Package },
    { to: '/brand', label: copyFor(language, 'Brand', 'Brand'), icon: Palette },
    { to: '/products/add', label: copyFor(language, 'Add', 'Add'), icon: PlusCircle },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#1f5c5a]/10 bg-[#fbf8f2]/98 backdrop-blur md:hidden">
      <div className="grid grid-cols-4 pb-[max(env(safe-area-inset-bottom),0.35rem)]">
        {items.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(`${to}/`)
          return (
            <Link
              key={to}
              to={to}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium ${active ? 'text-[#1f5c5a]' : 'text-stone-500'}`}
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
