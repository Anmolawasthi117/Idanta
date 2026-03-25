import { useParams } from 'react-router-dom'
import ProductAssetGrid from '../../components/product/ProductAssetGrid'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useProductAsset } from '../../hooks/useAssets'
import { useProduct } from '../../hooks/useProduct'
import { downloadBlob, formatPrice, getErrorMessage, sanitizeHtml } from '../../lib/utils'

export default function ProductDetailPage() {
  const { productId } = useParams()
  const productQuery = useProduct(productId ?? null)
  const assetMutation = useProductAsset()
  const { pushToast } = useToast()
  const product = productQuery.data

  const handleDownload = async (
    type: 'hang_tag' | 'label' | 'photo' | 'story_card' | 'certificate',
  ) => {
    if (!product) return

    try {
      const { url, filename, cleanup } = await assetMutation.mutateAsync({ product, type })
      downloadBlob(url, filename)
      window.setTimeout(() => cleanup?.(), 1000)
    } catch (error) {
      pushToast(getErrorMessage(error))
    }
  }

  if (productQuery.isLoading) return <Card>Product load ho raha hai...</Card>
  if (!product) return <Card>Product nahi mila.</Card>

  const assets = [
    { title: 'Hang tag', type: 'hang_tag' as const, available: Boolean(product.hang_tag_url) },
    { title: 'Label', type: 'label' as const, available: Boolean(product.label_url) },
    { title: 'Branded photo', type: 'photo' as const, available: Boolean(product.branded_photo_url) },
    { title: 'Story card', type: 'story_card' as const, available: Boolean(product.story_card_url) },
    { title: 'Certificate', type: 'certificate' as const, available: Boolean(product.certificate_url) },
  ].filter((asset) => asset.available)

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        {product.branded_photo_url || product.photos[0] ? (
          <img
            src={product.branded_photo_url || product.photos[0]}
            alt={product.name}
            className="h-64 w-full object-cover"
          />
        ) : null}
        <div className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-stone-900">{product.name}</h1>
              <p className="text-base text-stone-600">
                {product.category} · {product.occasion}
              </p>
            </div>
            <p className="text-xl font-semibold text-orange-600">{formatPrice(product.price_mrp)}</p>
          </div>
          {product.listing_copy ? (
            <div
              className="text-base leading-relaxed text-stone-700"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.listing_copy.replace(/\n/g, '<br />')) }}
            />
          ) : null}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-2xl font-semibold text-stone-900">Product files</h2>
        <ProductAssetGrid>
          {assets.map((asset) => (
            <Card key={asset.title} className="space-y-4">
              <p className="text-lg font-semibold text-stone-900">{asset.title}</p>
              <Button className="w-full" onClick={() => handleDownload(asset.type)} loading={assetMutation.isPending}>
                Download
              </Button>
            </Card>
          ))}
        </ProductAssetGrid>
      </Card>
    </div>
  )
}
