import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Store, Phone, DollarSign, Globe } from 'lucide-react'
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
    },
  })

  const isOpen = watch('is_open')

  // Reset form when shop data loads (handles race condition on first login)
  useEffect(() => {
    if (shop) {
      setValue('name', shop.name)
      setValue('description', shop.description || '')
      setValue('phone', shop.phone || '')
      setValue('address', shop.address || '')
      setValue('tax_percent', shop.tax_percent)
      setValue('is_open', shop.is_open)
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
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Shop status</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isOpen ? 'Customers can place orders' : 'Orders are paused'}
                </p>
              </div>
              <Toggle
                checked={isOpen}
                onChange={(v) => setValue('is_open', v)}
                label={isOpen ? 'Open' : 'Closed'}
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
