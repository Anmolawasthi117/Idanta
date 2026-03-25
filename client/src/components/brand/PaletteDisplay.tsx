import type { BrandPalette } from '../../types/brand.types'

const entries = [
  { key: 'primary', label: 'Mukhya rang' },
  { key: 'secondary', label: 'Sahayak rang' },
  { key: 'accent', label: 'Accent' },
  { key: 'background', label: 'Pashthbhumi' },
] as const

export default function PaletteDisplay({ palette }: { palette: BrandPalette }) {
  const colors = {
    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    background: palette.background ?? '#F5E6C8',
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {entries.map((entry) => (
        <div key={entry.key} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3">
          <img
            src={`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" rx="20" fill="${colors[entry.key]}"/></svg>`)}`}
            alt={`${entry.label} swatch`}
            className="h-20 w-full rounded-2xl border border-stone-100 object-cover"
          />
          <div>
            <p className="text-sm font-medium text-stone-700">{entry.label}</p>
            <p className="font-mono text-xs text-stone-500">{colors[entry.key]}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
