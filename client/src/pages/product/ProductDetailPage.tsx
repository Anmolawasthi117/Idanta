import { useNavigate, useParams } from 'react-router-dom'
import ProductAssetGrid from '../../components/product/ProductAssetGrid'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useProductAsset } from '../../hooks/useAssets'
import { useGenerateProductAssets, useProduct } from '../../hooks/useProduct'
import { downloadBlob, formatPrice, getErrorMessage, sanitizeHtml } from '../../lib/utils'

export default function ProductDetailPage() {
  const navigate = useNavigate()
  const { productId } = useParams()
  const productQuery = useProduct(productId ?? null)
  const assetMutation = useProductAsset()
  const generateMutation = useGenerateProductAssets()
  const { pushToast } = useToast()
  const product = productQuery.data

  const handleDownload = async (
    type: 'hang_tag' | 'label' | 'photo' | 'story_card' | 'certificate' | 'kit',
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

  const handleGenerate = async () => {
    if (!product) return

    try {
      const result = await generateMutation.mutateAsync(product.id)
      navigate(`/jobs/${result.job_id}`)
    } catch (error) {
      pushToast(getErrorMessage(error))
    }
  }

  if (productQuery.isLoading) return <Card>Product load ho raha hai...</Card>
  if (!product) return <Card>Product nahi mila.</Card>

  const assets = [
    {
      title: 'Product kit',
      type: 'kit' as const,
      available: Boolean(product.kit_zip_url),
      preview: null,
      supported: true,
    },
    {
      title: 'Hang tag',
      type: 'hang_tag' as const,
      available: Boolean(product.hang_tag_url),
      preview: product.hang_tag_url ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
          <img src={product.hang_tag_url} alt={`${product.name} hang tag`} className="h-40 w-full object-cover" />
        </div>
      ) : null,
      supported: true,
    },
    {
      title: 'Label',
      type: 'label' as const,
      available: Boolean(product.label_url),
      preview: product.label_url ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
          <img src={product.label_url} alt={`${product.name} label`} className="h-40 w-full object-cover" />
        </div>
      ) : null,
      supported: true,
    },
    {
      title: 'Branded photo',
      type: 'photo' as const,
      available: Boolean(product.branded_photo_url),
      preview: product.branded_photo_url ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
          <img src={product.branded_photo_url} alt={`${product.name} branded`} className="h-40 w-full object-cover" />
        </div>
      ) : null,
      supported: true,
    },
    {
      title: 'Story card',
      type: 'story_card' as const,
      available: Boolean(product.story_card_url),
      preview: product.story_card_url ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
          <img src={product.story_card_url} alt={`${product.name} story card`} className="h-40 w-full object-cover" />
        </div>
      ) : null,
      supported: true,
    },
    {
      title: 'Certificate',
      type: 'certificate' as const,
      available: Boolean(product.certificate_url),
      preview: product.certificate_url ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
          <img src={product.certificate_url} alt={`${product.name} certificate`} className="h-40 w-full object-cover" />
        </div>
      ) : null,
      supported: product.category === 'painting',
    },
  ].filter((asset) => asset.supported)

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
              <div>
                <p className="text-lg font-semibold text-stone-900">{asset.title}</p>
                <p className="text-sm text-stone-500">{asset.available ? 'Available' : 'Not generated yet'}</p>
              </div>
              {asset.preview ?? (
                <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 text-center text-sm text-stone-500">
                  Ye asset abhi generate nahi hua hai.
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => handleDownload(asset.type)}
                  loading={assetMutation.isPending}
                  disabled={!asset.available || generateMutation.isPending}
                >
                  Download
                </Button>
                <Button
                  className="flex-1"
                  variant={asset.available ? 'secondary' : 'primary'}
                  onClick={handleGenerate}
                  loading={generateMutation.isPending}
                  disabled={assetMutation.isPending}
                >
                  {asset.available ? 'Regenerate' : 'Generate'}
                </Button>
              </div>
            </Card>
          ))}
        </ProductAssetGrid>
      </Card>
    </div>
  )
}
