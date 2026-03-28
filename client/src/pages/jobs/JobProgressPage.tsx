import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import { useJobPolling } from '../../hooks/useJobs'
import { copyFor, useLanguage } from '../../lib/i18n'

const BRAND_STEPS = {
  hi: [
    { label: 'Craft ki jaankari', percent: 10 },
    { label: 'Brand naam', percent: 25 },
    { label: 'Logo aur banner', percent: 50 },
    { label: 'Brand ki kahani', percent: 50 },
    { label: 'Kit tayyar', percent: 90 },
    { label: 'Tayyar!', percent: 100 },
  ],
  en: [
    { label: 'Craft knowledge', percent: 10 },
    { label: 'Brand name', percent: 25 },
    { label: 'Logo and banner', percent: 50 },
    { label: 'Brand story', percent: 50 },
    { label: 'Kit ready', percent: 90 },
    { label: 'Done!', percent: 100 },
  ],
  hg: [
    { label: 'Craft details', percent: 10 },
    { label: 'Brand name', percent: 25 },
    { label: 'Logo and banner', percent: 50 },
    { label: 'Brand story', percent: 50 },
    { label: 'Kit ready', percent: 90 },
    { label: 'Done!', percent: 100 },
  ],
}

const BRAND_ASSET_STEPS = {
  hi: [
    { label: 'Asset prepare', percent: 15 },
    { label: 'Asset regenerate', percent: 55 },
    { label: 'Kit refresh', percent: 85 },
    { label: 'Tayyar!', percent: 100 },
  ],
  en: [
    { label: 'Asset prep', percent: 15 },
    { label: 'Asset regenerate', percent: 55 },
    { label: 'Kit refresh', percent: 85 },
    { label: 'Done!', percent: 100 },
  ],
  hg: [
    { label: 'Asset prep', percent: 15 },
    { label: 'Asset regenerate', percent: 55 },
    { label: 'Kit refresh', percent: 85 },
    { label: 'Done!', percent: 100 },
  ],
}

const PRODUCT_STEPS = {
  hi: [
    { label: 'Product details', percent: 5 },
    { label: 'Description', percent: 40 },
    { label: 'Tags aur labels', percent: 60 },
    { label: 'Photo branding', percent: 70 },
    { label: 'Assets pack', percent: 90 },
    { label: 'Tayyar!', percent: 100 },
  ],
  en: [
    { label: 'Product details', percent: 5 },
    { label: 'Description', percent: 40 },
    { label: 'Tags and labels', percent: 60 },
    { label: 'Photo branding', percent: 70 },
    { label: 'Assets pack', percent: 90 },
    { label: 'Done!', percent: 100 },
  ],
  hg: [
    { label: 'Product details', percent: 5 },
    { label: 'Description', percent: 40 },
    { label: 'Tags and labels', percent: 60 },
    { label: 'Photo branding', percent: 70 },
    { label: 'Assets pack', percent: 90 },
    { label: 'Done!', percent: 100 },
  ],
}

export default function JobProgressPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const language = useLanguage()
  const jobQuery = useJobPolling(jobId ?? null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (jobQuery.data?.status === 'done' && jobQuery.data.ref_id) {
      if (jobQuery.data.job_type === 'product_assets') {
        queryClient.invalidateQueries({ queryKey: ['product', jobQuery.data.ref_id] })
        queryClient.invalidateQueries({ queryKey: ['products'] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['brand'] })
      }

      const timeout = window.setTimeout(() => {
        navigate(jobQuery.data?.job_type === 'product_assets' ? `/products/${jobQuery.data?.ref_id}` : '/brand')
      }, 1200)
      return () => window.clearTimeout(timeout)
    }
  }, [jobQuery.data, navigate, queryClient])

  const looksLikeAssetRegeneration =
    jobQuery.data?.job_type === 'brand_asset_regeneration' ||
    /regenerat/i.test(jobQuery.data?.current_step ?? '')

  const steps =
    jobQuery.data?.job_type === 'product_assets'
      ? PRODUCT_STEPS[language]
      : looksLikeAssetRegeneration
      ? BRAND_ASSET_STEPS[language]
      : BRAND_STEPS[language]

  const progressSubtitle =
    looksLikeAssetRegeneration
      ? copyFor(language, 'Selected brand asset regenerate ho raha hai.', 'Selected brand asset is being regenerated.')
      : jobQuery.data?.job_type === 'product_assets'
      ? copyFor(language, 'Aapke product assets ban rahe hain.', 'Your product assets are being prepared.')
      : copyFor(language, 'Aapka brand ban raha hai - thoda sabr karo', 'Your brand is being prepared - please wait a little')

  if (jobQuery.isLoading) {
    return <Card className="space-y-4 text-center">{copyFor(language, 'Progress load ho raha hai...', 'Loading progress...')}</Card>
  }

  if (!jobQuery.data) {
    return <Card>{copyFor(language, 'Job nahi mila.', 'Job not found.')}</Card>
  }

  if (jobQuery.data.status === 'failed') {
    return (
      <Card className="space-y-4 text-center">
        <p className="text-2xl font-semibold text-stone-900">{copyFor(language, 'Kuch gadbad ho gayi', 'Something went wrong')}</p>
        <p className="text-stone-600">{jobQuery.data.error}</p>
        <Button onClick={() => navigate(jobQuery.data?.job_type === 'product_assets' ? '/products/add' : '/brand')}>
          {copyFor(language, 'Dobara try karein', 'Try again')}
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="space-y-6 py-8 text-center">
        <div className="mx-auto h-40 w-40 text-orange-500">
          <svg viewBox="0 0 220 220" className="h-full w-full fill-current">
            <circle cx="110" cy="110" r="102" className="fill-orange-100 text-orange-500" />
            <path d="M65 150c8-36 30-55 45-55s37 19 45 55H65Zm18-82c0-14 11-25 27-25s27 11 27 25-11 25-27 25S83 82 83 68Zm71 43 17-17 12 12-17 17-12-12Z" />
          </svg>
        </div>
        <div className="space-y-2">
          <p className="text-3xl font-semibold text-stone-900">{jobQuery.data.current_step}</p>
          <p className="text-base text-stone-500">{progressSubtitle}</p>
        </div>
        <div className="space-y-3 px-2 sm:px-8">
          <ProgressBar value={jobQuery.data.percent} />
          <p className="text-sm font-medium text-orange-700">{jobQuery.data.percent}% complete</p>
        </div>
        <div className="grid gap-3 px-2 sm:grid-cols-3 sm:px-8">
          {steps.map((step) => (
            <div
              key={`${step.label}-${step.percent}`}
              className={`rounded-2xl border px-3 py-3 text-sm ${
                jobQuery.data.percent >= step.percent
                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                  : 'border-stone-200 bg-stone-50 text-stone-500'
              }`}
            >
              {step.label}
            </div>
          ))}
        </div>
        {jobQuery.data.status === 'done' ? (
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">OK</div>
        ) : null}
      </Card>
    </div>
  )
}
