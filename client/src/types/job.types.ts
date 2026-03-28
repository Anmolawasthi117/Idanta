export type JobStatus = 'queued' | 'running' | 'done' | 'failed'
export type JobType = 'brand_onboarding' | 'brand_asset_regeneration' | 'product_assets'

export interface Job {
  id: string
  job_type: JobType
  ref_id: string | null
  status: JobStatus
  current_step: string
  percent: number
  error: string | null
  updated_at: string
}
