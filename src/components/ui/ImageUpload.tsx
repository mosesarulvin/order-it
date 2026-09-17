import { Image as ImageIcon, Upload, X } from 'lucide-react'
import { Button } from './Button'
import { useRef } from 'react'

export interface ImageUploadProps {
  label?: string
  description?: string
  imageUrl?: string | null
  loading?: boolean
  error?: string
  onChange: (file: File | null) => void
}

export function ImageUpload({ 
  label, 
  description = 'Max size 2MB. Square image recommended.', 
  imageUrl, 
  loading, 
  error, 
  onChange 
}: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onChange(file)
    }
  }

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onChange(null)
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      
      <div className="flex items-center gap-4">
        {/* Preview Area */}
        <div className="w-20 h-20 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden relative group">
          {imageUrl ? (
            <>
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <button 
                  type="button" 
                  onClick={handleRemove}
                  className="p-1 bg-white/20 hover:bg-white/40 rounded-full text-white backdrop-blur-sm transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </>
          ) : (
            <ImageIcon size={24} className="text-gray-300 dark:text-slate-600" />
          )}
        </div>
        
        {/* Actions Area */}
        <div className="flex-1 space-y-2">
          {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
          )}
          <div className="flex items-center gap-2">
            <label className="relative cursor-pointer">
              <Button type="button" variant="secondary" size="sm" loading={loading} className="pointer-events-none">
                <Upload size={14} /> Upload Image
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileChange}
                disabled={loading}
              />
            </label>
          </div>
        </div>
      </div>
      
      {error && (
        <p className="mt-2 text-sm text-red-500 animate-in slide-in-from-top-1">
          {error}
        </p>
      )}
    </div>
  )
}
