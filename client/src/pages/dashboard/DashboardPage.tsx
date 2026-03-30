import { Link, Navigate } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ProductCard from '../../components/product/ProductCard'
import { useLatestBrand } from '../../hooks/useBrand'
import { useJobs } from '../../hooks/useJobs'
import { useProducts } from '../../hooks/useProduct'
import { useAuthStore } from '../../store/authStore'
import { copyFor, useLanguage } from '../../lib/i18n'

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const jobsQuery = useJobs()
  const activeBrandJob = jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status !== 'done')
  const brandQuery = useLatestBrand()
  const productsQuery = useProducts(brandQuery.data?.id ?? null)
  const language = useLanguage()

  if (brandQuery.isLoading) {
    return null
  }

  if (!user?.has_brand && !brandQuery.data) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="relative min-h-[220px] bg-stone-200">
          {brandQuery.data?.banner_url ? (
            <img src={brandQuery.data.banner_url} alt={brandQuery.data.name} className="h-56 w-full object-cover" />
          ) : (
            <div className="flex h-56 items-center justify-center bg-gradient-to-br from-orange-100 via-amber-50 to-stone-100 text-stone-500">
              {copyFor(language, 'Brand banner tayyar ho raha hai', 'Brand banner is getting ready', 'ब्रांड बैनर तैयार हो रहा है')}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-stone-950/20 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-3 sm:gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/80 bg-white p-2 shadow-lg sm:h-20 sm:w-20 sm:rounded-3xl sm:p-3">
                {brandQuery.data?.logo_url ? (
                  <img src={brandQuery.data.logo_url} alt={`${brandQuery.data.name} logo`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-semibold text-stone-400">Logo</span>
                )}
              </div>
              <div className="pb-1 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200 sm:text-sm">{copyFor(language, 'Brand summary', 'Brand summary', 'ब्रांड सारांश')}</p>
                <h1 className="text-2xl font-semibold sm:text-3xl">{brandQuery.data?.name ?? copyFor(language, 'Aapka brand', 'Your brand', 'आपका ब्रांड')}</h1>
                <p className="line-clamp-2 max-w-xl text-xs text-stone-100 sm:text-sm">
                  {brandQuery.data?.tagline ?? copyFor(language, 'Brand details load ho rahi hain.', 'Brand details are loading.', 'ब्रांड विवरण लोड हो रहे हैं।')}
                </p>
              </div>
            </div>
            <div className="self-end sm:self-auto">
              {activeBrandJob ? <Badge tone="warning">{copyFor(language, 'Ban raha hai...', 'Generating...', 'बन रहा है...')}</Badge> : <Badge tone="success">{brandQuery.data?.status ?? 'ready'}</Badge>}
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm text-stone-500">{copyFor(language, 'Kareegar', 'Artisan', 'कारीगर')}</p>
              <p className="text-base font-medium text-stone-900">{brandQuery.data?.artisan_name ?? user?.name ?? ''}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm text-stone-500">{copyFor(language, 'Jagah', 'Region', 'क्षेत्र')}</p>
              <p className="text-base font-medium text-stone-900">{brandQuery.data?.region ?? copyFor(language, 'Abhi update hoga', 'Will be updated', 'अभी अपडेट होगा')}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm text-stone-500">{copyFor(language, 'Brand feel', 'Brand feel', 'ब्रांड फ़ील')}</p>
              <p className="text-base font-medium capitalize text-stone-900">
                {brandQuery.data?.brand_feel ?? 'earthy'}
              </p>
            </div>
          </div>

          {activeBrandJob ? (
            <Link to={`/jobs/${activeBrandJob.id}`}>
              <Button>{copyFor(language, 'Active job dekho', 'View active job', 'सक्रिय काम देखें')}</Button>
            </Link>
          ) : (
            <Link to="/brand">
              <Button>{copyFor(language, 'Brand kholo', 'Open brand', 'ब्रांड खोलें')}</Button>
            </Link>
          )}
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl">{copyFor(language, 'Aapke products', 'Your products', 'आपके उत्पाद')}</h2>
            <p className="text-sm text-stone-600 sm:text-base">{copyFor(language, 'Jitne ready hain sab yahan dikhenge.', 'All ready ones will appear here.', 'जितने तैयार हैं सब यहाँ दिखेंगे।')}</p>
          </div>
          <Link to="/products/add">
            <Button>{copyFor(language, 'Add product', 'Add product', 'उत्पाद जोड़ें')}</Button>
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {productsQuery.data?.map((product) => <ProductCard key={product.id} product={product} />)}
          <Link to="/products/add" className="min-w-[250px]">
            <Card className="flex h-full min-h-[240px] items-center justify-center border-dashed border-orange-300 bg-orange-50 text-center text-orange-700">
              {copyFor(language, '+ Naya product jodiye', '+ Add new product', '+ नया उत्पाद जोड़ें')}
            </Card>
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-stone-500">{copyFor(language, 'Total products', 'Total products', 'कुल उत्पाद')}</p>
          <p className="text-3xl font-semibold text-stone-900">{productsQuery.data?.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-500">{copyFor(language, 'Ready products', 'Ready products', 'तैयार उत्पाद')}</p>
          <p className="text-3xl font-semibold text-stone-900">
            {productsQuery.data?.filter((product) => product.status === 'ready').length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-stone-500">{copyFor(language, 'Is hafte views', 'Views this week', 'इस सप्ताह के व्यूज़')}</p>
          <p className="text-3xl font-semibold text-stone-900">--</p>
        </Card>
      </div>
    </div>
  )
}
