import Input from '../ui/Input'
import Select from '../ui/Select'
import type { ProductCategory } from '../../types/product.types'

interface Props {
  category: ProductCategory
  value: Record<string, string | number | boolean | string[] | undefined>
  onChange: (value: Record<string, string | number | boolean | string[] | undefined>) => void
}

export default function CategoryFieldset({ category, value, onChange }: Props) {
  const setField = (key: string, fieldValue: string | number | boolean | string[] | undefined) => {
    onChange({ ...value, [key]: fieldValue })
  }

  switch (category) {
    case 'apparel':
      return (
        <div className="grid gap-4">
          <Select
            label="Kapde ka prakar (Fabric type)"
            value={String(value.fabric_type ?? '')}
            onChange={(event) => setField('fabric_type', event.target.value)}
            options={[
              { label: 'Select kariye', value: '' },
              { label: 'Cotton', value: 'Cotton' },
              { label: 'Silk', value: 'Silk' },
              { label: 'Chanderi', value: 'Chanderi' },
              { label: 'Muslin', value: 'Muslin' },
              { label: 'Georgette', value: 'Georgette' },
            ]}
          />
          <div className="space-y-2">
            <p className="text-base font-medium text-stone-800">Size (Sizes available)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {['S', 'M', 'L', 'XL', 'Free Size'].map((size) => {
                const current = Array.isArray(value.sizes_available) ? value.sizes_available : []
                const checked = current.includes(size)
                return (
                  <label key={size} className="flex min-h-11 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setField(
                        'sizes_available',
                        checked ? current.filter((item: string) => item !== size) : [...current, size],
                      )
                    }
                  />
                    {size}
                  </label>
                )
              })}
            </div>
          </div>
          <Select
            label="Dhulai ka tareeka (Wash care)"
            value={String(value.wash_care ?? '')}
            onChange={(event) => setField('wash_care', event.target.value)}
            options={[
              { label: 'Select kariye', value: '' },
              { label: 'Hand wash only', value: 'Hand wash only' },
              { label: 'Machine cold', value: 'Machine cold' },
              { label: 'Dry clean only', value: 'Dry clean only' },
            ]}
          />
          <Input
            label="Banane ki kala (Print technique)"
            value={String(value.print_technique ?? '')}
            onChange={(event) => setField('print_technique', event.target.value)}
          />
          <Select
            label="Rang ka prakar (Dye type)"
            value={String(value.dye_type ?? '')}
            onChange={(event) => setField('dye_type', event.target.value || undefined)}
            options={[
              { label: 'Optional', value: '' },
              { label: 'Natural dyes', value: 'Natural dyes' },
              { label: 'Azo-free', value: 'Azo-free' },
              { label: 'Synthetic', value: 'Synthetic' },
            ]}
          />
        </div>
      )
    case 'jewelry':
      return (
        <div className="grid gap-4">
          <Select
            label="Gehne ka prakar (Jewelry type)"
            value={String(value.jewelry_type ?? '')}
            onChange={(event) => setField('jewelry_type', event.target.value)}
            options={[
              { label: 'Select kariye', value: '' },
              { label: 'Bangle', value: 'Bangle' },
              { label: 'Necklace', value: 'Necklace' },
              { label: 'Earring', value: 'Earring' },
              { label: 'Ring', value: 'Ring' },
              { label: 'Anklet', value: 'Anklet' },
            ]}
          />
          <Select
            label="Base dhaatu (Metal or base)"
            value={String(value.metal_or_base ?? '')}
            onChange={(event) => setField('metal_or_base', event.target.value)}
            options={[
              { label: 'Select kariye', value: '' },
              { label: 'Lac', value: 'Lac' },
              { label: 'Silver', value: 'Silver' },
              { label: 'Gold-plated', value: 'Gold-plated' },
              { label: 'Brass', value: 'Brass' },
              { label: 'Terracotta', value: 'Terracotta' },
            ]}
          />
          <Input
            label="Stone ya inlay (Stone or inlay)"
            value={String(value.stone_or_inlay ?? '')}
            onChange={(event) => setField('stone_or_inlay', event.target.value || undefined)}
          />
          <Select
            label="Single ya set (Pair or set)"
            value={String(value.pair_or_set ?? '')}
            onChange={(event) => setField('pair_or_set', event.target.value)}
            options={[
              { label: 'Single', value: 'single' },
              { label: 'Pair', value: 'pair' },
              { label: 'Set of 4', value: 'set_of_4' },
              { label: 'Set of 12', value: 'set_of_12' },
            ]}
          />
          <Input
            label="Size (Sizes)"
            value={Array.isArray(value.sizes_available) ? value.sizes_available.join(', ') : ''}
            onChange={(event) =>
              setField(
                'sizes_available',
                event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              )
            }
          />
        </div>
      )
    case 'pottery':
      return (
        <div className="grid gap-4">
          <Select
            label="Mitti ka item (Pottery type)"
            value={String(value.pottery_type ?? '')}
            onChange={(event) => setField('pottery_type', event.target.value)}
            options={[
              { label: 'Select kariye', value: '' },
              { label: 'Vase', value: 'Vase' },
              { label: 'Bowl', value: 'Bowl' },
              { label: 'Mug', value: 'Mug' },
              { label: 'Plate', value: 'Plate' },
              { label: 'Diya', value: 'Diya' },
            ]}
          />
          <Select
            label="Finish (Finish type)"
            value={String(value.finish_type ?? '')}
            onChange={(event) => setField('finish_type', event.target.value)}
            options={[
              { label: 'Select kariye', value: '' },
              { label: 'Glazed', value: 'Glazed' },
              { label: 'Unglazed', value: 'Unglazed' },
              { label: 'Blue pottery', value: 'Blue pottery' },
              { label: 'Terracotta raw', value: 'Terracotta raw' },
            ]}
          />
          <Input
            type="number"
            label="Capacity (Capacity ml)"
            value={typeof value.capacity_ml === 'number' ? value.capacity_ml : ''}
            onChange={(event) => setField('capacity_ml', event.target.value ? Number(event.target.value) : undefined)}
          />
          <ToggleField
            label="Khaane ke liye safe? (Food safe)"
            checked={Boolean(value.is_food_safe)}
            onChange={(checked) => setField('is_food_safe', checked)}
          />
          <ToggleField
            label="Tootne ka risk? (Fragility)"
            checked={value.fragility_note === undefined ? true : Boolean(value.fragility_note)}
            onChange={(checked) => setField('fragility_note', checked)}
          />
        </div>
      )
    case 'painting':
      return (
        <div className="grid gap-4">
          <Input label="Kala shaili (Art style)" value={String(value.art_style ?? '')} onChange={(event) => setField('art_style', event.target.value)} />
          <Input label="Medium" value={String(value.medium ?? '')} onChange={(event) => setField('medium', event.target.value)} />
          <Input label="Surface" value={String(value.surface ?? '')} onChange={(event) => setField('surface', event.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input type="number" label="Chaudai cm (Width)" value={typeof value.width_cm === 'number' ? value.width_cm : ''} onChange={(event) => setField('width_cm', Number(event.target.value))} />
            <Input type="number" label="Unchai cm (Height)" value={typeof value.height_cm === 'number' ? value.height_cm : ''} onChange={(event) => setField('height_cm', Number(event.target.value))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Original', value: true },
              { label: 'Print', value: false },
            ].map((option) => (
              <label key={option.label} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 ${value.is_original === option.value ? 'border-orange-400 bg-orange-50' : 'border-stone-200 bg-white'}`}>
                <input type="radio" checked={value.is_original === option.value} onChange={() => setField('is_original', option.value)} />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      )
    case 'home_decor':
      return (
        <div className="grid gap-4">
          <Input label="Decor type" value={String(value.decor_type ?? '')} onChange={(event) => setField('decor_type', event.target.value)} />
          <Input label="Material primary" value={String(value.material_primary ?? '')} onChange={(event) => setField('material_primary', event.target.value)} />
          <div className="grid grid-cols-3 gap-4">
            <Input type="number" label="Width" value={typeof value.width_cm === 'number' ? value.width_cm : ''} onChange={(event) => setField('width_cm', event.target.value ? Number(event.target.value) : undefined)} />
            <Input type="number" label="Height" value={typeof value.height_cm === 'number' ? value.height_cm : ''} onChange={(event) => setField('height_cm', event.target.value ? Number(event.target.value) : undefined)} />
            <Input type="number" label="Depth" value={typeof value.depth_cm === 'number' ? value.depth_cm : ''} onChange={(event) => setField('depth_cm', event.target.value ? Number(event.target.value) : undefined)} />
          </div>
          <ToggleField label="Assembly required" checked={Boolean(value.assembly_required)} onChange={(checked) => setField('assembly_required', checked)} />
          <Select
            label="Indoor ya outdoor"
            value={String(value.indoor_outdoor ?? '')}
            onChange={(event) => setField('indoor_outdoor', event.target.value)}
            options={[
              { label: 'Indoor', value: 'indoor' },
              { label: 'Outdoor', value: 'outdoor' },
              { label: 'Both', value: 'both' },
            ]}
          />
        </div>
      )
    default:
      return <Input label="Description" value={String(value.custom_description ?? '')} onChange={(event) => setField('custom_description', event.target.value)} />
  }
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex min-h-14 items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <span className="text-base font-medium text-stone-800">{label}</span>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`flex h-8 w-14 items-center rounded-full p-1 transition ${checked ? 'bg-orange-500 justify-end' : 'bg-stone-300 justify-start'}`}
      >
        <span className="h-6 w-6 rounded-full bg-white" />
      </button>
    </label>
  )
}
