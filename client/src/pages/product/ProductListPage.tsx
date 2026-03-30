import { Link } from 'react-router-dom'
import ProductCard from '../../components/product/ProductCard'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useJobs } from '../../hooks/useJobs'
import { useLatestBrand } from '../../hooks/useBrand'
import { useProducts } from '../../hooks/useProduct'
import { copyFor, useLanguage } from '../../lib/i18n'

export default function ProductListPage() {
  const jobsQuery = useJobs()
  const latestBrandQuery = useLatestBrand()
  const language = useLanguage()
  const brandId =
    latestBrandQuery.data?.id ??
    (jobsQuery.data?.find((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id)?.ref_id ??
      null)
  const productsQuery = useProducts(brandId)

  if (latestBrandQuery.isLoading) {
    return <Card>{copyFor(language, 'Brand load ho raha hai...', 'Loading brand...')}</Card>
  }

  if (!brandId) {
    return <Card>{copyFor(language, 'Pehle brand ready hona chahiye. Onboarding poora kijiye.', 'Your brand should be ready first. Please complete onboarding.')}</Card>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900">{copyFor(language, 'Aapke products', 'Your products')}</h1>
          <p className="text-base text-stone-600">{copyFor(language, 'Yahan aap apne sab products dekh sakte ho.', 'You can see all your products here.')}</p>
        </div>
        <Link to="/products/add">
          <Button>{copyFor(language, 'Add product', 'Add product')}</Button>
        </Link>
      </div>

      {productsQuery.isLoading ? <Card>{copyFor(language, 'Products load ho rahe hain...', 'Loading products...')}</Card> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {productsQuery.data?.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>

      {!productsQuery.isLoading && !productsQuery.data?.length ? (
        <Card className="space-y-3 text-center">
          <p className="text-xl font-semibold text-stone-900">{copyFor(language, 'Abhi koi product nahi hai', 'There are no products yet')}</p>
          <Link to="/products/add">
            <Button>{copyFor(language, 'Apna pehla product jodiye', 'Add your first product')}</Button>
          </Link>
        </Card>
      ) : null}
    </div>
  )
}
