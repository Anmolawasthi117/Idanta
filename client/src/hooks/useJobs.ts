import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getJobStatus, listJobs } from '../api/jobs.api'
import { JOB_POLL_INTERVAL_MS } from '../lib/constants'
import type { JobStatus } from '../types/job.types'

const TERMINAL_STATES: JobStatus[] = ['done', 'failed']

export const useJobs = () =>
  useQuery({
    queryKey: ['jobs'],
    queryFn: listJobs,
  })

export const useJobPolling = (
  jobId: string | null,
  refetchTarget?: { type: 'brand' | 'product'; id: string },
) => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJobStatus(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (currentQuery) => {
      const status = currentQuery.state.data?.status
      if (!status || TERMINAL_STATES.includes(status)) return false
      return JOB_POLL_INTERVAL_MS
    },
  })

  useEffect(() => {
    if (query.data?.status === 'done' && refetchTarget) {
      void queryClient.invalidateQueries({ queryKey: [refetchTarget.type, refetchTarget.id] })
      void queryClient.invalidateQueries({ queryKey: ['jobs'] })
    }
  }, [query.data?.status, queryClient, refetchTarget])

  return query
}
