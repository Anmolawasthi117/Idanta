import { Suspense, lazy, type ReactElement } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { useLatestBrand } from '../hooks/useBrand'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/layout/AppShell'

const HomePage = lazy(() => import('../pages/HomePage'))
const LoginPage = lazy(() => import('../pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'))
const BrandPage = lazy(() => import('../pages/brand/BrandPage'))
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'))
const JobProgressPage = lazy(() => import('../pages/jobs/JobProgressPage'))
const OnboardingChatPage = lazy(() => import('../pages/onboarding/OnboardingChatPage'))
const AddProductPage = lazy(() => import('../pages/product/AddProductPage'))
const ProductDetailPage = lazy(() => import('../pages/product/ProductDetailPage'))
const ProductListPage = lazy(() => import('../pages/product/ProductListPage'))

function PageFallback() {
  return <div className="min-h-[40vh]" aria-hidden="true" />
}

function withSuspense(children: ReactElement) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>
}

function ProtectedRoute() {
  const token = useAuthStore((state) => state.token)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)

  if (!hasHydrated) return null
  if (!token) return <Navigate to="/" replace />
  return <Outlet />
}

function AuthPageRoute({ children }: { children: ReactElement }) {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)
  const latestBrandQuery = useLatestBrand(Boolean(token))

  if (!hasHydrated) return null
  if (token && latestBrandQuery.isLoading) return null
  if (token) return <Navigate to={user?.has_brand || Boolean(latestBrandQuery.data) ? '/dashboard' : '/onboarding'} replace />
  return children
}

const router = createBrowserRouter([
  { path: '/', element: withSuspense(<HomePage />) },
  { path: '/login', element: <AuthPageRoute>{withSuspense(<LoginPage />)}</AuthPageRoute> },
  { path: '/register', element: <AuthPageRoute>{withSuspense(<RegisterPage />)}</AuthPageRoute> },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: 'onboarding', element: withSuspense(<OnboardingChatPage />) },
          { path: 'dashboard', element: withSuspense(<DashboardPage />) },
          { path: 'brand', element: withSuspense(<BrandPage />) },
          { path: 'products', element: withSuspense(<ProductListPage />) },
          { path: 'products/add', element: withSuspense(<AddProductPage />) },
          { path: 'products/:productId', element: withSuspense(<ProductDetailPage />) },
          { path: 'jobs/:jobId', element: withSuspense(<JobProgressPage />) },
        ],
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
