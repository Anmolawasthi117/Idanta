import type { ReactElement } from 'react'
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { useLatestBrand } from '../hooks/useBrand'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/layout/AppShell'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import BrandPage from '../pages/brand/BrandPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import JobProgressPage from '../pages/jobs/JobProgressPage'
import OnboardingChatPage from '../pages/onboarding/OnboardingChatPage'
import AddProductPage from '../pages/product/AddProductPage'
import ProductDetailPage from '../pages/product/ProductDetailPage'
import ProductListPage from '../pages/product/ProductListPage'

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
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <AuthPageRoute><LoginPage /></AuthPageRoute> },
  { path: '/register', element: <AuthPageRoute><RegisterPage /></AuthPageRoute> },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: 'onboarding', element: <OnboardingChatPage /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'brand', element: <BrandPage /> },
          { path: 'products', element: <ProductListPage /> },
          { path: 'products/add', element: <AddProductPage /> },
          { path: 'products/:productId', element: <ProductDetailPage /> },
          { path: 'jobs/:jobId', element: <JobProgressPage /> },
        ],
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
