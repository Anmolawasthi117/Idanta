import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Card from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import Button from '../../components/ui/Button'
import { useJobPolling } from '../../hooks/useJobs'

const BRAND_STEPS = [
  { label: 'Craft ki jaankari', percent: 10 },
  { label: 'Brand naam', percent: 25 },
  { label: 'Logo aur banner', percent: 50 },
  { label: 'Brand ki kahani', percent: 50 },
  { label: 'Kit tayyar', percent: 90 },
  { label: 'Tayyar!', percent: 100 },
]

const PRODUCT_STEPS = [
  { label: 'Product details', percent: 5 },
  { label: 'Description', percent: 40 },
  { label: 'Tags aur labels', percent: 60 },
  { label: 'Photo branding', percent: 70 },
  { label: 'Assets pack', percent: 90 },
  { label: 'Tayyar!', percent: 100 },
]

export default function JobProgressPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const jobQuery = useJobPolling(jobId ?? null)

  useEffect(() => {
    if (jobQuery.data?.status === 'done' && jobQuery.data.ref_id) {
      const timeout = window.setTimeout(() => {
        navigate(jobQuery.data?.job_type === 'brand_onboarding' ? '/brand' : `/products/${jobQuery.data?.ref_id}`)
      }, 1500)
      return () => window.clearTimeout(timeout)
    }
  }, [jobQuery.data, navigate])

  const steps = jobQuery.data?.job_type === 'product_assets' ? PRODUCT_STEPS : BRAND_STEPS

  if (jobQuery.isLoading) {
    return <Card className="space-y-4 text-center">Progress load ho raha hai...</Card>
  }

  if (!jobQuery.data) {
    return <Card>Job nahi mila.</Card>
  }

  if (jobQuery.data.status === 'failed') {
    return (
      <Card className="space-y-4 text-center">
        <p className="text-2xl font-semibold text-stone-900">Kuch gadbad ho gayi</p>
        <p className="text-stone-600">{jobQuery.data.error}</p>
        <Button onClick={() => navigate(jobQuery.data?.job_type === 'brand_onboarding' ? '/onboarding' : '/products/add')}>
          Dobara try karein
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
          <p className="text-base text-stone-500">Aapka brand ban raha hai - thoda sabr karo</p>
        </div>
        <div className="space-y-3 px-2 sm:px-8">
          <ProgressBar value={jobQuery.data.percent} />
          <p className="text-sm font-medium text-orange-700">{jobQuery.data.percent}% complete</p>
        </div>
        <div className="grid gap-3 px-2 sm:grid-cols-3 sm:px-8">
          {steps.map((step) => (
            <div
              key={`${step.label}-${step.percent}`}
              className={`rounded-2xl border px-3 py-3 text-sm ${jobQuery.data.percent >= step.percent ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-stone-200 bg-stone-50 text-stone-500'}`}
            >
              {step.label}
            </div>
          ))}
        </div>
        {jobQuery.data.status === 'done' ? <div className="mx-auto h-14 w-14 animate-bounce rounded-full bg-emerald-500 text-white">✓</div> : null}
      </Card>
    </div>
  )
}
