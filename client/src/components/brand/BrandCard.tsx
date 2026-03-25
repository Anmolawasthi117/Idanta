import type { Brand } from '../../types/brand.types'
import Badge from '../ui/Badge'
import Card from '../ui/Card'

export default function BrandCard({ brand }: { brand: Brand }) {
  return (
    <Card className="overflow-hidden p-0">
      {brand.banner_url ? <img src={brand.banner_url} alt={brand.name} className="h-36 w-full object-cover" /> : null}
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-stone-900">{brand.name}</p>
            <p className="text-stone-600">{brand.tagline}</p>
          </div>
          <Badge tone={brand.status === 'ready' ? 'success' : brand.status === 'failed' ? 'danger' : 'warning'}>
            {brand.status}
          </Badge>
        </div>
        <p className="text-sm text-stone-500">
          {brand.artisan_name} · {brand.region}
        </p>
      </div>
    </Card>
  )
}
