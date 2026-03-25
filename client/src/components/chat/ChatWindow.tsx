import type { ReactNode } from 'react'
import Card from '../ui/Card'

export default function ChatWindow({ children }: { children: ReactNode }) {
  return <Card className="space-y-4 bg-[#fffdf9]">{children}</Card>
}
