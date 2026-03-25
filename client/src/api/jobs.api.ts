import apiClient from './client'
import type { Job } from '../types/job.types'

export const getJobStatus = async (jobId: string): Promise<Job> => {
  const { data } = await apiClient.get<Job>(`/jobs/${jobId}/status`)
  return data
}

export const listJobs = async (): Promise<Job[]> => {
  const { data } = await apiClient.get<Job[]>('/jobs/')
  return data
}
