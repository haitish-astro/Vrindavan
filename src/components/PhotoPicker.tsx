import { useEffect, useId, useRef } from 'react'
import { Camera, X } from 'lucide-react'

export interface PickedPhoto {
  key: string
  file: File
  preview: string
}

/** Choose photos from the phone's library or camera, with little previews. */
export function PhotoPicker({
  photos,
  onChange,
  multiple = true,
  max = 20,
  label = 'Add photos',
}: {
  photos: PickedPhoto[]
  onChange: (photos: PickedPhoto[]) => void
  multiple?: boolean
  max?: number
  label?: string
}) {
  const inputId = useId()
  const latest = useRef(photos)
  latest.current = photos

  // Free the preview images when the picker goes away.
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  const add = (files: FileList | null) => {
    if (!files) return
    const picked = [...files]
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))
    if (multiple) {
      onChange([...photos, ...picked].slice(0, max))
    } else {
      photos.forEach((p) => URL.revokeObjectURL(p.preview))
      onChange(picked.slice(0, 1))
    }
  }

  const remove = (photo: PickedPhoto) => {
    URL.revokeObjectURL(photo.preview)
    onChange(photos.filter((p) => p.key !== photo.key))
  }

  return (
    <div>
      {photos.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.key} className="relative">
              <img src={photo.preview} alt="" className="aspect-square w-full rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label={`Remove ${photo.file.name}`}
                className="absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full bg-ink/75 text-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(multiple ? photos.length < max : true) && (
        <label
          htmlFor={inputId}
          className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-peacock/30 bg-peacock-soft/30 px-4 py-4 text-center text-sm font-semibold text-peacock-deep transition hover:bg-peacock-soft/60 focus-within:ring-2 focus-within:ring-peacock"
        >
          <Camera className="size-5" aria-hidden />
          {photos.length === 0 ? label : multiple ? 'Add more photos' : 'Choose a different photo'}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            multiple={multiple}
            className="sr-only"
            onChange={(event) => {
              add(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

/** A slim progress bar for uploads. */
export function UploadProgress({ label, fraction }: { label: string; fraction: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100)
  return (
    <div role="status" aria-live="polite">
      <div className="mb-1 flex justify-between text-sm text-ink-soft">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-peacock-soft"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-peacock transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
