import { useMemo, useState } from 'react'
import BrandAssetGrid from '../../components/brand/BrandAssetGrid'
import BrandCard from '../../components/brand/BrandCard'
import PaletteDisplay from '../../components/brand/PaletteDisplay'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useBrandAsset } from '../../hooks/useAssets'
import { useBrand } from '../../hooks/useBrand'
import { useJobs } from '../../hooks/useJobs'
import { downloadBlob, getErrorMessage, sanitizeHtml } from '../../lib/utils'

export default function BrandPage() {
  const { data: jobs } = useJobs()
  const latestBrandId = useMemo(
    () =>
      jobs?.filter((job) => job.job_type === 'brand_onboarding' && job.status === 'done' && job.ref_id).map(
        (job) => job.ref_id as string,
      )[0] ?? null,
    [jobs],
  )
  const brandQuery = useBrand(latestBrandId)
  const assetMutation = useBrandAsset()
  const { pushToast } = useToast()
  const [storyTab, setStoryTab] = useState<'en' | 'hi'>('en')

  const brand = brandQuery.data

  const handleDownload = async (type: 'kit' | 'logo' | 'banner') => {
    if (!brand) return

    try {
      const { url, filename, cleanup } = await assetMutation.mutateAsync({ brand, type })
      downloadBlob(url, filename)
      window.setTimeout(() => cleanup?.(), 1000)
    } catch (error) {
      pushToast(getErrorMessage(error))
    }
  }

  if (!latestBrandId) {
    return <Card>Aapka brand abhi bana nahi hai. Pehle onboarding poora kijiye.</Card>
  }

  if (brandQuery.isLoading) {
    return <Card>Brand load ho raha hai...</Card>
  }

  if (!brand) {
    return <Card>Brand data nahi mila.</Card>
  }

  return (
    <div className="space-y-6">
      <BrandCard brand={brand} />

      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-orange-600">Color palette</p>
          <h2 className="text-2xl font-semibold text-stone-900">Aapke brand ke rang</h2>
        </div>
        <PaletteDisplay palette={brand.palette} />
      </Card>

      <Card className="space-y-4">
        <div className="flex gap-3">
          <Button variant={storyTab === 'en' ? 'primary' : 'secondary'} onClick={() => setStoryTab('en')}>
            English
          </Button>
          <Button variant={storyTab === 'hi' ? 'primary' : 'secondary'} onClick={() => setStoryTab('hi')}>
            हिंदी
          </Button>
        </div>
        <div
          className="prose max-w-none text-base leading-relaxed text-stone-700"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml((storyTab === 'en' ? brand.story_en : brand.story_hi).replace(/\n/g, '<br />')),
          }}
        />
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-orange-600">Apni files download karein</p>
          <h2 className="text-2xl font-semibold text-stone-900">Brand assets</h2>
          <p className="text-sm text-stone-500">
            Logo aur banner ab PNG image ke roop me download honge taki print aur share karna aasaan rahe.
          </p>
        </div>
        <BrandAssetGrid>
          {[
            { title: 'Brand kit', type: 'ZIP', action: () => handleDownload('kit') },
            { title: 'Logo image', type: 'PNG', action: () => handleDownload('logo') },
            { title: 'Banner image', type: 'PNG', action: () => handleDownload('banner') },
          ].map((asset) => (
            <Card key={asset.title} className="space-y-4">
              <div>
                <p className="text-lg font-semibold text-stone-900">{asset.title}</p>
                <p className="text-sm text-stone-500">{asset.type}</p>
              </div>
              <Button className="w-full" onClick={asset.action} loading={assetMutation.isPending}>
                Download
              </Button>
            </Card>
          ))}
        </BrandAssetGrid>
      </Card>
    </div>
  )
}
