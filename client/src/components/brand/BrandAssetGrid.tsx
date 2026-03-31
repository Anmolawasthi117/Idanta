import type { ReactNode } from 'react'

export default function BrandAssetGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}
