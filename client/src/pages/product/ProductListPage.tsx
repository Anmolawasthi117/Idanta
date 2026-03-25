import { Link } from 'react-router-dom'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ProductCard from '../../components/product/ProductCard'
import { useJobs } from '../../hooks/useJobs'
import { useProducts } from '../../hooks/useProduct'

export default function ProductListPage() {
  const jobsQuery = useJobs()
  const brandId =
    jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id)?.ref_id ??
    null
  const productsQuery = useProducts(brandId)

  if (!brandId) {
    return <Card>Pehle brand ready hona chahiye. Onboarding poora kijiye.</Card>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900">Aapke products</h1>
          <p className="text-base text-stone-600">Yahan aap apne sab products dekh sakte ho.</p>
        </div>
        <Link to="/products/add">
          <Button>Add product</Button>
        </Link>
      </div>

      {productsQuery.isLoading ? <Card>Products load ho rahe hain...</Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {productsQuery.data?.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>

      {!productsQuery.isLoading && !productsQuery.data?.length ? (
        <Card className="space-y-3 text-center">
          <p className="text-xl font-semibold text-stone-900">Abhi koi product nahi hai</p>
          <Link to="/products/add">
            <Button>Apna pehla product jodiye</Button>
          </Link>
        </Card>
      ) : null}
    </div>
  )
}
