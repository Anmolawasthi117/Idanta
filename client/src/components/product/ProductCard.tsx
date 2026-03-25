import { Link } from 'react-router-dom'
import type { Product } from '../../types/product.types'
import Badge from '../ui/Badge'
import Card from '../ui/Card'
import { formatPrice } from '../../lib/utils'

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/products/${product.id}`} className="block min-w-[250px]">
      <Card className="h-full overflow-hidden p-0">
        <div className="h-40 bg-stone-100">
          {product.branded_photo_url || product.photos[0] ? (
            <img
              src={product.branded_photo_url || product.photos[0]}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-stone-900">{product.name}</p>
              <p className="text-sm text-stone-500">{product.category}</p>
            </div>
            <Badge tone={product.status === 'ready' ? 'success' : product.status === 'failed' ? 'danger' : 'warning'}>
              {product.status}
            </Badge>
          </div>
          <p className="text-lg font-semibold text-orange-600">{formatPrice(product.price_mrp)}</p>
        </div>
      </Card>
    </Link>
  )
}
