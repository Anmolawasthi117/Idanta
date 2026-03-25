import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import OnboardingChatPage from '../pages/onboarding/OnboardingChatPage'
import DashboardPage from '../pages/dashboard/DashboardPage'
import BrandPage from '../pages/brand/BrandPage'
import ProductListPage from '../pages/product/ProductListPage'
import AddProductPage from '../pages/product/AddProductPage'
import ProductDetailPage from '../pages/product/ProductDetailPage'
import JobProgressPage from '../pages/jobs/JobProgressPage'
import AppShell from '../components/layout/AppShell'

function ProtectedRoute() {
  const token = useAuthStore((state) => state.token)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)
  if (!hasHydrated) return null
  if (!token) return <Navigate to="/login" replace />
  return <Outlet />
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
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
