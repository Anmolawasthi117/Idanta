import { Link, Navigate } from 'react-router-dom'
import Card from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import ProductCard from '../../components/product/ProductCard'
import Button from '../../components/ui/Button'
import { useAuthStore } from '../../store/authStore'
import { useJobs } from '../../hooks/useJobs'
import { useBrand } from '../../hooks/useBrand'
import { useProducts } from '../../hooks/useProduct'

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const jobsQuery = useJobs()
  const brandId =
    jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id)?.ref_id ??
    null
  const activeBrandJob = jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status !== 'done')
  const brandQuery = useBrand(brandId)
  const productsQuery = useProducts(brandId)

  if (!user?.has_brand) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-orange-600">Brand summary</p>
            <h1 className="text-3xl font-semibold text-stone-900">{brandQuery.data?.name ?? 'Aapka brand'}</h1>
            <p className="text-stone-600">{brandQuery.data?.tagline ?? 'Brand details load ho rahi hain.'}</p>
          </div>
          {activeBrandJob ? (
            <Badge tone="warning">Generating...</Badge>
          ) : (
            <Badge tone="success">{brandQuery.data?.status ?? 'ready'}</Badge>
          )}
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
