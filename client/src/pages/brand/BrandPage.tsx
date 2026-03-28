import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandAssetGrid from '../../components/brand/BrandAssetGrid'
import PaletteDisplay from '../../components/brand/PaletteDisplay'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/useToast'
import { useBrandAsset } from '../../hooks/useAssets'
import { useBrand, useRegenerateBrandAsset } from '../../hooks/useBrand'
import { useJobs } from '../../hooks/useJobs'
import { downloadBlob, getErrorMessage, sanitizeHtml } from '../../lib/utils'
import { copyFor, useLanguage } from '../../lib/i18n'
import { Package, ImageIcon, Type, RefreshCw } from 'lucide-react'
import type { RegenerableBrandAsset } from '../../api/brand.api'

export default function BrandPage() {
  const navigate = useNavigate()
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
  const regenerateAssetMutation = useRegenerateBrandAsset()
  const { pushToast } = useToast()
  const language = useLanguage()
  const [storyTab, setStoryTab] = useState<'en' | 'hi'>('en')

  const brand = brandQuery.data

  const handleRegenerateAsset = async (assetType: RegenerableBrandAsset) => {
    if (!brand) return

    try {
      const result = await regenerateAssetMutation.mutateAsync({ brandId: brand.id, assetType })
      navigate(`/jobs/${result.job_id}`)
    } catch (error) {
      pushToast(getErrorMessage(error))
    }
  }

  const assets = [
    {
      title: copyFor(language, 'Logo image', 'Logo image'),
      type: 'PNG',
      preview: brand?.logo_url ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <img src={brand.logo_url} alt={`${brand.name} logo`} className="max-h-full max-w-full object-contain" />
        </div>
      ) : null,
      isAvailable: Boolean(brand?.logo_url),
      downloadType: 'logo' as const,
      regenerateType: 'logo' as RegenerableBrandAsset,
      icon: <ImageIcon className="h-5 w-5 text-orange-500" />,
    },
    {
      title: copyFor(language, 'Banner image', 'Banner image'),
      type: 'PNG',
      preview: brand?.banner_url ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
          <img src={brand.banner_url} alt={`${brand.name} banner`} className="h-40 w-full object-cover" />
        </div>
      ) : null,
      isAvailable: Boolean(brand?.banner_url),
      downloadType: 'banner' as const,
      regenerateType: 'banner' as RegenerableBrandAsset,
      icon: <ImageIcon className="h-5 w-5 text-orange-500" />,
    },
  ]

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
    return <Card>{copyFor(language, 'Aapka brand abhi bana nahi hai. Pehle onboarding poora kijiye.', 'Your brand is not created yet. Please complete onboarding first.')}</Card>
  }

  if (brandQuery.isLoading) {
    return <Card>{copyFor(language, 'Brand load ho raha hai...', 'Loading brand...')}</Card>
  }

  if (!brand) {
    return <Card>{copyFor(language, 'Brand data nahi mila.', 'Brand data not found.')}</Card>
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="relative h-56 overflow-hidden sm:h-72">
          {brand.banner_url ? (
            <img src={brand.banner_url} alt={`${brand.name} banner`} className="h-full w-full object-cover" />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background: `linear-gradient(135deg, ${brand.palette?.primary ?? '#f97316'}, ${brand.palette?.secondary ?? '#fb923c'})`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <div className="flex items-end justify-between gap-4">
              <div className="flex items-end gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-white/40 bg-white/95 shadow-xl sm:h-24 sm:w-24">
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt={`${brand.name} logo`} className="max-h-full max-w-full object-contain p-2" />
                  ) : (
                    <span className="text-sm font-semibold text-stone-500">No Logo</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white sm:text-3xl">{brand.name}</p>
                  <p className="mt-2 inline-block rounded-full bg-white/95 px-3 py-1 text-sm font-semibold text-orange-700 shadow-sm">
                    {brand.tagline}
                  </p>
                  <p className="mt-2 text-sm text-white/90">
                    {brand.artisan_name} · {brand.region}
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-white/50 bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {brand.status}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-orange-600">{copyFor(language, 'Rang', 'Color palette')}</p>
          <h2 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Aapke brand ke rang', 'Your brand colors')}</h2>
        </div>
        <PaletteDisplay palette={brand.palette} />
      </Card>

      <Card className="space-y-4">
        <div className="flex gap-3">
          <Button variant={storyTab === 'en' ? 'primary' : 'secondary'} onClick={() => setStoryTab('en')}>
            English
          </Button>
          <Button variant={storyTab === 'hi' ? 'primary' : 'secondary'} onClick={() => setStoryTab('hi')}>
            Hindi
          </Button>
        </div>
        <div
          className="prose max-w-none text-base leading-relaxed text-stone-700"
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml((storyTab === 'en' ? brand.story_en : brand.story_hi).replace(/\n/g, '<br />')),
          }}
        />
      </Card>

      <Card className="space-y-4 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <Package className="h-6 w-6 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-orange-700">{copyFor(language, 'Complete brand pack', 'Complete brand pack')}</p>
            <h2 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Brand kit', 'Brand kit')}</h2>
          </div>
        </div>
        <p className="text-sm text-stone-600">
          {copyFor(language, 'Is kit me logo, banner, stories aur palette ek hi download me milenge.', 'This kit bundles logo, banner, stories, and palette in a single download.')}
        </p>
        <div className="rounded-2xl border border-orange-200 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
                <Package className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-stone-900">{copyFor(language, 'Download brand kit', 'Download brand kit')}</p>
                <p className="text-sm text-stone-500">ZIP</p>
              </div>
            </div>
            <Button
              onClick={() => handleDownload('kit')}
              loading={assetMutation.isPending}
              disabled={!brand.kit_zip_url || regenerateAssetMutation.isPending}
            >
              {copyFor(language, 'Download', 'Download')}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-orange-600">{copyFor(language, 'Apni files download karein', 'Download your files')}</p>
          <h2 className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Brand assets and controls', 'Brand assets and controls')}</h2>
          <p className="text-sm text-stone-500">
            {copyFor(language, 'Logo aur banner PNG image ke roop me download honge taki print aur share karna aasaan rahe.', 'Logo and banner download as PNG images so they are easy to print and share.')}
          </p>
        </div>

        <BrandAssetGrid>
          {assets.map((asset) => (
            <Card key={asset.title} className="space-y-4">
              <div className="flex items-center gap-2">
                {asset.icon}
                <p className="text-lg font-semibold text-stone-900">{asset.title}</p>
              </div>
              <p className="text-sm text-stone-500">{asset.type}</p>
              {asset.preview ?? (
                <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-stone-50 px-4 text-center text-sm text-stone-500">
                  {copyFor(language, 'Asset abhi available nahi hai.', 'Asset is not available yet.')}
                </div>
              )}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={() => handleDownload(asset.downloadType)}
                  loading={assetMutation.isPending}
                  disabled={!asset.isAvailable || regenerateAssetMutation.isPending}
                >
                  {copyFor(language, 'Download', 'Download')}
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => handleRegenerateAsset(asset.regenerateType)}
                  loading={regenerateAssetMutation.isPending}
                  disabled={assetMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {copyFor(language, 'Regenerate', 'Regenerate')}
                </Button>
              </div>
            </Card>
          ))}
        </BrandAssetGrid>

        <Card className="space-y-3 border-dashed border-orange-200">
          <div className="flex items-center gap-2">
            <Type className="h-5 w-5 text-orange-500" />
            <p className="text-lg font-semibold text-stone-900">{copyFor(language, 'Tagline', 'Tagline')}</p>
          </div>
          <p className="rounded-2xl bg-orange-50 px-4 py-3 text-base font-medium text-orange-800">{brand.tagline}</p>
          <Button
            variant="secondary"
            onClick={() => handleRegenerateAsset('tagline')}
            loading={regenerateAssetMutation.isPending}
            disabled={assetMutation.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {copyFor(language, 'Regenerate tagline only', 'Regenerate tagline only')}
          </Button>
        </Card>
      </Card>
    </div>
  )
}
