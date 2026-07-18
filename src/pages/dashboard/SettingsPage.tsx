import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Phone, DollarSign, Globe, Clock, Tag, Star, Zap, Palette, Image as ImageIcon, Upload, Trash2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { Toggle } from '@/components/ui/Toggle'
import toast from 'react-hot-toast'

const schema = z.object({
  name: z.string().min(2, 'Shop name is required'),
  description: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  tax_percent: z.number().min(0).max(100),
  is_open: z.boolean(),
  coupons_enabled: z.boolean(),
  reviews_enabled: z.boolean(),
  auto_schedule_enabled: z.boolean(),
  auto_open_time: z.string().optional(),
  auto_close_time: z.string().optional(),
  logo_url: z.string().nullable().optional(),
  brand_primary: z.string().nullable().optional(),
  brand_secondary: z.string().nullable().optional(),
  brand_accent: z.string().nullable().optional(),
})

type FormData = z.infer<typeof schema>

export default function SettingsPage() {
  const { shop, refreshShop } = useAuth()
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: shop?.name || '',
      description: shop?.description || '',
      phone: shop?.phone || '',
      address: shop?.address || '',
      tax_percent: shop?.tax_percent || 0,
      is_open: shop?.is_open ?? true,
      coupons_enabled: shop?.coupons_enabled ?? true,
      reviews_enabled: shop?.reviews_enabled ?? true,
      auto_schedule_enabled: shop?.auto_schedule_enabled ?? false,
      auto_open_time: shop?.auto_open_time || '',
      auto_close_time: shop?.auto_close_time || '',
      logo_url: shop?.logo_url || null,
      brand_primary: shop?.brand_primary || null,
      brand_secondary: shop?.brand_secondary || null,
      brand_accent: shop?.brand_accent || null,
    },
  })

  const isOpen = watch('is_open')
  const autoSchedule = watch('auto_schedule_enabled')
  
  const [themeMode, setThemeMode] = useState<'default' | 'custom'>(shop?.brand_primary ? 'custom' : 'default')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(shop?.logo_url || null)

  const brandPrimary = watch('brand_primary') || '#f97316'
  const brandSecondary = watch('brand_secondary') || '#f59e0b'
  const brandAccent = watch('brand_accent') || '#ea580c'

  // Reset form when shop data loads (handles race condition on first login)
  useEffect(() => {
    if (shop) {
      setValue('name', shop.name)
      setValue('description', shop.description || '')
      setValue('phone', shop.phone || '')
      setValue('address', shop.address || '')
      setValue('tax_percent', shop.tax_percent)
      setValue('is_open', shop.is_open)
      setValue('coupons_enabled', shop.coupons_enabled ?? true)
      setValue('reviews_enabled', shop.reviews_enabled ?? true)
      setValue('auto_schedule_enabled', shop.auto_schedule_enabled ?? false)
      setValue('auto_open_time', shop.auto_open_time || '')
      setValue('auto_close_time', shop.auto_close_time || '')
      setValue('logo_url', shop.logo_url || null)
      setValue('brand_primary', shop.brand_primary || null)
      setValue('brand_secondary', shop.brand_secondary || null)
      setValue('brand_accent', shop.brand_accent || null)
      setThemeMode(shop.brand_primary ? 'custom' : 'default')
      setLogoPreview(shop.logo_url || null)
    }
  }, [shop, setValue])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!shop) return
    const file = e.target.files?.[0]
    if (!file) return

    // 2MB size limit
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB')
      return
    }

    setLogoUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${shop.id}-${Math.random()}.${fileExt}`
    const filePath = `logos/${fileName}`

    try {
      const { error: uploadError } = await supabase.storage
        .from('shop-assets')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('shop-assets')
        .getPublicUrl(filePath)

      setValue('logo_url', publicUrl, { shouldDirty: true })
      setLogoPreview(publicUrl)
      toast.success('Logo uploaded!')
    } catch (error: any) {
      toast.error('Error uploading logo: ' + error.message)
    } finally {
      setLogoUploading(false)
    }
  }

  const removeLogo = () => {
    setValue('logo_url', null, { shouldDirty: true })
    setLogoPreview(null)
  }

  const applyPreset = (p: string, s: string, a: string) => {
    setValue('brand_primary', p, { shouldDirty: true })
    setValue('brand_secondary', s, { shouldDirty: true })
    setValue('brand_accent', a, { shouldDirty: true })
  }

  const onSubmit = async (data: FormData) => {
    if (!shop) return
    setLoading(true)

    const payload = {
      ...data,
      brand_primary: themeMode === 'default' ? null : data.brand_primary,
      brand_secondary: themeMode === 'default' ? null : data.brand_secondary,
      brand_accent: themeMode === 'default' ? null : data.brand_accent,
    }
    const { error } = await supabase.from('shops').update(payload).eq('id', shop.id)
    if (error) {
      toast.error(error.message)
    } else {
      await refreshShop()
      toast.success('Settings saved!')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your shop profile and preferences</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Shop status */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Shop status</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {isOpen ? 'Full menu — customers can place kitchen orders' : 'Offline — only Grab & Go / instant items available'}
                </p>
              </div>
              <Toggle
                checked={isOpen}
                onChange={(v) => setValue('is_open', v)}
                label={isOpen ? 'Online' : 'Offline'}
              />
            </div>
            {!isOpen && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-400">
                <Zap size={13} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <span>When offline, customers can only order Grab &amp; Go (instant) items. Kitchen orders are disabled.</span>
              </div>
            )}

            {/* Auto-schedule */}
            <div className="border-t border-gray-100 dark:border-slate-800 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200 text-sm flex items-center gap-1.5"><Clock size={14} /> Auto open/close schedule</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Automatically go online and offline at set times</p>
                </div>
                <Toggle
                  checked={watch('auto_schedule_enabled')}
                  onChange={(v) => setValue('auto_schedule_enabled', v)}
                  label=""
                />
              </div>
              {autoSchedule && (
                <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-orange-200 dark:border-orange-800">
                  <Input
                    label="Open at"
                    type="time"
                    {...register('auto_open_time')}
                  />
                  <Input
                    label="Close at"
                    type="time"
                    {...register('auto_close_time')}
                  />
                  <p className="col-span-2 text-xs text-gray-400 dark:text-gray-500">The shop will automatically go online/offline at these times each day.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Branding & Appearance */}
        <Card>
          <CardContent className="p-5 space-y-6">
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-slate-800 pb-3">
              <Palette size={18} className="text-gray-400 dark:text-gray-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white">Branding &amp; Appearance</h3>
            </div>

            {/* Logo Upload */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><ImageIcon size={14} /> Shop Logo</p>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-gray-50 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {logoPreview ? (
                    <img src={logoPreview} alt="Shop Logo" className="w-full h-full object-cover" />
                  ) : (
                    <Store size={24} className="text-gray-300 dark:text-slate-600" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Max size 2MB. Square image recommended.</p>
                  <div className="flex items-center gap-2">
                    <label className="relative cursor-pointer">
                      <Button type="button" variant="secondary" size="sm" loading={logoUploading} className="pointer-events-none">
                        <Upload size={14} /> Upload Image
                      </Button>
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleLogoUpload}
                        disabled={logoUploading}
                      />
                    </label>
                    {logoPreview && (
                      <Button type="button" variant="ghost" size="sm" onClick={removeLogo} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={14} /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Theme Customizer */}
            <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Palette size={14} /> Color Theme</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Choose how your shop appears to customers</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setThemeMode('default')}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${themeMode === 'default' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30' : 'border-gray-200 dark:border-slate-700 hover:border-orange-200 dark:hover:border-orange-800'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold text-sm ${themeMode === 'default' ? 'text-orange-700 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'}`}>Default Orange</span>
                    {themeMode === 'default' && <CheckCircle2 size={16} className="text-orange-500" />}
                  </div>
                  <div className="flex gap-1">
                    <div className="w-4 h-4 rounded-full bg-[#f97316]"></div>
                    <div className="w-4 h-4 rounded-full bg-[#f59e0b]"></div>
                    <div className="w-4 h-4 rounded-full bg-[#ea580c]"></div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setThemeMode('custom')
                    if (!watch('brand_primary')) applyPreset('#3b82f6', '#60a5fa', '#2563eb') // default to blue if custom selected for first time
                  }}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${themeMode === 'custom' ? 'border-gray-900 dark:border-slate-500 bg-gray-50 dark:bg-slate-800' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-semibold text-sm ${themeMode === 'custom' ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>Custom Colors</span>
                    {themeMode === 'custom' && <CheckCircle2 size={16} className="text-gray-900 dark:text-white" />}
                  </div>
                  <div className="flex gap-1">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: brandPrimary }}></div>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: brandSecondary }}></div>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: brandAccent }}></div>
                  </div>
                </button>
              </div>

              {themeMode === 'custom' && (
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 border border-gray-100 dark:border-slate-700 space-y-4 animate-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block">Primary</label>
                      <input type="color" {...register('brand_primary')} className="w-full h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block">Secondary</label>
                      <input type="color" {...register('brand_secondary')} className="w-full h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block">Accent</label>
                      <input type="color" {...register('brand_accent')} className="w-full h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0" />
                    </div>
                  </div>

                  <div className="pt-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Presets:</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => applyPreset('#10b981', '#34d399', '#059669')} className="w-6 h-6 rounded-full bg-emerald-500 ring-2 ring-transparent hover:ring-gray-300"></button>
                      <button type="button" onClick={() => applyPreset('#ef4444', '#f87171', '#dc2626')} className="w-6 h-6 rounded-full bg-red-500 ring-2 ring-transparent hover:ring-gray-300"></button>
                      <button type="button" onClick={() => applyPreset('#8b5cf6', '#a78bfa', '#7c3aed')} className="w-6 h-6 rounded-full bg-violet-500 ring-2 ring-transparent hover:ring-gray-300"></button>
                      <button type="button" onClick={() => applyPreset('#14b8a6', '#2dd4bf', '#0d9488')} className="w-6 h-6 rounded-full bg-teal-500 ring-2 ring-transparent hover:ring-gray-300"></button>
                      <button type="button" onClick={() => applyPreset('#ec4899', '#f472b6', '#db2777')} className="w-6 h-6 rounded-full bg-pink-500 ring-2 ring-transparent hover:ring-gray-300"></button>
                      <button type="button" onClick={() => applyPreset('#0f172a', '#334155', '#020617')} className="w-6 h-6 rounded-full bg-slate-900 ring-2 ring-transparent hover:ring-gray-300"></button>
                    </div>
                  </div>

                  {/* Live Preview Card */}
                  <div className="mt-4 border border-gray-100 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between" style={{ background: `linear-gradient(to bottom right, ${themeMode === 'custom' ? brandPrimary : '#f97316'}, ${themeMode === 'custom' ? brandSecondary : '#f59e0b'})` }}>
                      <div className="flex items-center gap-2">
                         {logoPreview ? (
                            <img src={logoPreview} className="w-6 h-6 rounded-lg bg-white p-0.5 object-cover" />
                         ) : (
                            <div className="w-6 h-6 rounded-lg bg-white/20"></div>
                         )}
                         <span className="text-white text-xs font-bold">Live Preview</span>
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-slate-800 flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="h-3 w-16 bg-gray-200 dark:bg-slate-700 rounded"></div>
                        <div className="h-2 w-24 bg-gray-200 dark:bg-slate-700 rounded"></div>
                      </div>
                      <button type="button" className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm" style={{ backgroundColor: themeMode === 'custom' ? brandPrimary : '#f97316' }}>
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feature flags */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Customer features</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Tag size={14} /> Coupon codes</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Show coupon input field at checkout</p>
              </div>
              <Toggle
                checked={watch('coupons_enabled')}
                onChange={(v) => setValue('coupons_enabled', v)}
                label=""
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5"><Star size={14} /> Customer reviews</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Allow customers to leave a review after their order</p>
              </div>
              <Toggle
                checked={watch('reviews_enabled')}
                onChange={(v) => setValue('reviews_enabled', v)}
                label=""
              />
            </div>
          </CardContent>
        </Card>

        {/* Shop details */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Shop details</h3>
            <Input
              label="Shop name"
              icon={<Store size={16} />}
              placeholder="e.g. Blue Tokai Coffee"
              error={errors.name?.message}
              {...register('name')}
            />
            <Textarea
              label="Description"
              placeholder="Brief description of your shop"
              {...register('description')}
            />
            <Input
              label="Phone number"
              icon={<Phone size={16} />}
              placeholder="+91 98765 43210"
              {...register('phone')}
            />
            <Textarea
              label="Address"
              placeholder="Shop address"
              {...register('address')}
            />
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Billing</h3>
            <Input
              label="Tax percentage (%)"
              type="number"
              step="0.5"
              min="0"
              max="100"
              icon={<DollarSign size={16} />}
              placeholder="0"
              error={errors.tax_percent?.message}
              {...register('tax_percent', { valueAsNumber: true })}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">Set to 0 to disable tax. Applies to all orders automatically.</p>
          </CardContent>
        </Card>

        {/* Slug info */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Customer page URL</h3>
            <div className="flex items-center gap-2 mt-3 bg-gray-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 border border-gray-100 dark:border-slate-700">
              <Globe size={14} className="text-gray-400 dark:text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300 break-all">
                {window.location.origin}/order/<span className="font-semibold text-orange-600 dark:text-orange-400">{shop?.slug}</span>
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">This is the link customers land on after scanning your QR code.</p>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Save settings
        </Button>
      </form>
    </div>
  )
}
