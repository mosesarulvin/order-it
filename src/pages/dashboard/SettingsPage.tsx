import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Phone, DollarSign, Globe, Clock, Tag, Star, Zap } from 'lucide-react'
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
    },
  })

  const isOpen = watch('is_open')
  const autoSchedule = watch('auto_schedule_enabled')

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
    }
  }, [shop, setValue])

  const onSubmit = async (data: FormData) => {
    if (!shop) return
    setLoading(true)
    const { error } = await supabase.from('shops').update(data).eq('id', shop.id)
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
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Manage your shop profile and preferences</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Shop status */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Shop status</p>
                <p className="text-sm text-gray-500 mt-0.5">
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
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <Zap size={13} className="flex-shrink-0 mt-0.5 text-amber-500" />
                <span>When offline, customers can only order Grab &amp; Go (instant) items. Kitchen orders are disabled.</span>
              </div>
            )}

            {/* Auto-schedule */}
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800 text-sm flex items-center gap-1.5"><Clock size={14} /> Auto open/close schedule</p>
                  <p className="text-xs text-gray-400 mt-0.5">Automatically go online and offline at set times</p>
                </div>
                <Toggle
                  checked={watch('auto_schedule_enabled')}
                  onChange={(v) => setValue('auto_schedule_enabled', v)}
                  label=""
                />
              </div>
              {autoSchedule && (
                <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-orange-200">
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
                  <p className="col-span-2 text-xs text-gray-400">The shop will automatically go online/offline at these times each day.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Feature flags */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Customer features</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5"><Tag size={14} /> Coupon codes</p>
                <p className="text-xs text-gray-400 mt-0.5">Show coupon input field at checkout</p>
              </div>
              <Toggle
                checked={watch('coupons_enabled')}
                onChange={(v) => setValue('coupons_enabled', v)}
                label=""
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5"><Star size={14} /> Customer reviews</p>
                <p className="text-xs text-gray-400 mt-0.5">Allow customers to leave a review after their order</p>
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
            <h3 className="font-semibold text-gray-900">Shop details</h3>
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
            <h3 className="font-semibold text-gray-900">Billing</h3>
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
            <p className="text-xs text-gray-400">Set to 0 to disable tax. Applies to all orders automatically.</p>
          </CardContent>
        </Card>

        {/* Slug info */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-gray-900 mb-1">Customer page URL</h3>
            <div className="flex items-center gap-2 mt-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
              <Globe size={14} className="text-gray-400" />
              <span className="text-sm text-gray-600 break-all">
                {window.location.origin}/order/<span className="font-semibold text-orange-600">{shop?.slug}</span>
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-2">This is the link customers land on after scanning your QR code.</p>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Save settings
        </Button>
      </form>
    </div>
  )
}
