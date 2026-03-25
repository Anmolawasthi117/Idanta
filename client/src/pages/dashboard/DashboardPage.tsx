import { Link, Navigate } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ProductCard from '../../components/product/ProductCard'
import { useBrand } from '../../hooks/useBrand'
import { useJobs } from '../../hooks/useJobs'
import { useProducts } from '../../hooks/useProduct'
import { useAuthStore } from '../../store/authStore'

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const jobsQuery = useJobs()
  const brandId =
    jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id)
      ?.ref_id ?? null
  const activeBrandJob = jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status !== 'done')
  const brandQuery = useBrand(brandId)
  const productsQuery = useProducts(brandId)

  if (!user?.has_brand) {
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
              Brand banner tayyar ho raha hai
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950/55 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/80 bg-white p-3 shadow-lg">
                {brandQuery.data?.logo_url ? (
                  <img src={brandQuery.data.logo_url} alt={`${brandQuery.data.name} logo`} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-semibold text-stone-400">Logo</span>
                )}
              </div>
              <div className="pb-1 text-white">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">Brand summary</p>
                <h1 className="text-3xl font-semibold">{brandQuery.data?.name ?? 'Aapka brand'}</h1>
                <p className="max-w-xl text-sm text-stone-100">
                  {brandQuery.data?.tagline ?? 'Brand details load ho rahi hain.'}
                </p>
              </div>
            </div>
            {activeBrandJob ? <Badge tone="warning">Generating...</Badge> : <Badge tone="success">{brandQuery.data?.status ?? 'ready'}</Badge>}
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm text-stone-500">Artisan</p>
              <p className="text-base font-medium text-stone-900">{brandQuery.data?.artisan_name ?? user.name}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm text-stone-500">Region</p>
              <p className="text-base font-medium text-stone-900">{brandQuery.data?.region ?? 'Abhi update hoga'}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-sm text-stone-500">Brand feel</p>
              <p className="text-base font-medium capitalize text-stone-900">
                {brandQuery.data?.brand_feel ?? 'earthy'}
              </p>
            </div>
          </div>

          {activeBrandJob ? (
            <Link to={`/jobs/${activeBrandJob.id}`}>
              <Button>Active job dekho</Button>
            </Link>
          ) : (
            <Link to="/brand">
              <Button>Brand kholo</Button>
            </Link>
          )}
        </div>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">Aapke products</h2>
            <p className="text-stone-600">Jitne ready hain sab yahan dikhenge.</p>
          </div>
          <Link to="/products/add">
            <Button>Add product</Button>
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {productsQuery.data?.map((product) => <ProductCard key={product.id} product={product} />)}
          <Link to="/products/add" className="min-w-[250px]">
            <Card className="flex h-full min-h-[240px] items-center justify-center border-dashed border-orange-300 bg-orange-50 text-center text-orange-700">
              + Naya product jodiye
            </Card>
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-stone-500">Total products</p>
          <p className="text-3xl font-semibold text-stone-900">{productsQuery.data?.length ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-500">Ready products</p>
          <p className="text-3xl font-semibold text-stone-900">
            {productsQuery.data?.filter((product) => product.status === 'ready').length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-stone-500">Views this week</p>
          <p className="text-3xl font-semibold text-stone-900">--</p>
        </Card>
      </div>
    </div>
  )
}
