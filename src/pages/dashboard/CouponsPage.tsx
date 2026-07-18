import { useEffect, useState } from 'react'
import { Plus, Pencil, Tag, ToggleLeft, ToggleRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Coupon } from '@/types'
import toast from 'react-hot-toast'

const COUPON_TYPES = [
  { value: 'general',   label: 'General',           badge: '' },
  { value: 'new_user',  label: 'New User Welcome',   badge: '🎁' },
  { value: 'birthday',  label: 'Birthday',           badge: '🎂' },
  { value: 'promotion', label: 'Promotion',          badge: '📣' },
] as const

const couponSchema = z.object({
  code: z.string().min(2, 'Code required').toUpperCase(),
  type: z.enum(['percentage', 'amount']),
  coupon_type: z.enum(['general', 'new_user', 'birthday', 'promotion']),
  value: z.number().min(0.01, 'Value must be > 0'),
  min_order_amount: z.number().min(0).optional(),
  max_uses: z.number().int().min(1).nullable().optional(),
  expires_at: z.string().optional(),
})

type CouponForm = z.infer<typeof couponSchema>

export default function CouponsPage() {
  const { shop } = useAuth()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; editing?: Coupon }>({ open: false })

  const form = useForm<CouponForm>({ resolver: zodResolver(couponSchema), defaultValues: { type: 'percentage', coupon_type: 'general', min_order_amount: 0, max_uses: null } })

  useEffect(() => {
    if (shop) fetchCoupons()
  }, [shop])

  const fetchCoupons = async () => {
    if (!shop) return
    setLoading(true)
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
    setCoupons((data as Coupon[]) || [])
    setLoading(false)
  }

  const openAdd = () => {
    form.reset({ code: '', type: 'percentage', coupon_type: 'general', value: 10, min_order_amount: 0, max_uses: null, expires_at: '' })
    setModal({ open: true })
  }

  const openEdit = (coupon: Coupon) => {
    form.reset({
      code: coupon.code,
      type: coupon.type,
      coupon_type: coupon.coupon_type ?? 'general',
      value: coupon.value,
      min_order_amount: coupon.min_order_amount ?? 0,
      max_uses: coupon.max_uses ?? null,
      expires_at: coupon.expires_at ? coupon.expires_at.split('T')[0] : '',
    })
    setModal({ open: true, editing: coupon })
  }

  const saveCoupon = async (data: CouponForm) => {
    if (!shop) return
    const payload = {
      shop_id: shop.id,
      code: data.code.toUpperCase().trim(),
      type: data.type,
      coupon_type: data.coupon_type,
      value: data.value,
      min_order_amount: data.min_order_amount ?? 0,
      max_uses: data.max_uses ?? null,
      expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
      is_active: true,
    }

    if (modal.editing) {
      const { error } = await supabase.from('coupons').update(payload).eq('id', modal.editing.id)
      if (error) { toast.error(error.message); return }
      toast.success('Coupon updated')
    } else {
      const { error } = await supabase.from('coupons').insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success('Coupon created')
    }
    setModal({ open: false })
    fetchCoupons()
  }

  const toggleActive = async (coupon: Coupon) => {
    // Optimistic update
    setCoupons((prev) => prev.map((c) => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c))
    const { error } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id)
    if (error) {
      // Rollback on failure
      setCoupons((prev) => prev.map((c) => c.id === coupon.id ? { ...c, is_active: coupon.is_active } : c))
      toast.error('Failed to update coupon status')
    }
  }

  const formatExpiry = (ts: string | null) => {
    if (!ts) return 'No expiry'
    const d = new Date(ts)
    const expired = d < new Date()
    return `${expired ? '⚠ ' : ''}${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Coupons</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Create discount codes for your customers.</p>
        </div>
        <Button onClick={openAdd}><Plus size={16} className="mr-1.5" />New Coupon</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Tag size={40} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="font-medium text-gray-500 dark:text-gray-400">No coupons yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create your first coupon to offer discounts.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {coupons.map((coupon) => (
            <Card key={coupon.id} className={!coupon.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="w-11 h-11 bg-orange-50 dark:bg-orange-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Tag size={18} className="text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-white font-mono tracking-wide">{coupon.code}</span>
                    {(() => { const ct = COUPON_TYPES.find(t => t.value === coupon.coupon_type); return ct && ct.badge ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">{ct.badge} {ct.label}</span> : null })()}
                    <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded-full font-semibold">
                      {coupon.type === 'percentage' ? `${coupon.value}% off` : `${formatCurrency(coupon.value)} off`}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${coupon.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-300'}`}>
                      {coupon.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                    {coupon.min_order_amount ? <span>Min. order {formatCurrency(coupon.min_order_amount)}</span> : null}
                    <span>Used {coupon.used_count}{coupon.max_uses ? `/${coupon.max_uses}` : ''} times</span>
                    <span>Expires: {formatExpiry(coupon.expires_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(coupon)} className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => toggleActive(coupon)} className={`p-2 rounded-lg transition-colors ${coupon.is_active ? 'text-green-600 dark:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800'}`}>
                    {coupon.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        title={modal.editing ? 'Edit Coupon' : 'New Coupon'}
        size="sm"
      >
        <form onSubmit={form.handleSubmit(saveCoupon)} className="space-y-4">
          <Input
            label="Coupon code"
            placeholder="SAVE20"
            style={{ textTransform: 'uppercase' }}
            error={form.formState.errors.code?.message}
            {...form.register('code')}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Coupon purpose</label>
            <div className="grid grid-cols-2 gap-2">
              {COUPON_TYPES.map((ct) => (
                <label key={ct.value} className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                  form.watch('coupon_type') === ct.value ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30' : 'border-gray-200 dark:border-slate-700 dark:hover:border-slate-600'
                }`}>
                  <input type="radio" value={ct.value} {...form.register('coupon_type')} className="sr-only" />
                  <span className="text-sm font-medium dark:text-white">{ct.badge} {ct.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Discount type</label>
            <div className="flex gap-3">
              {(['percentage', 'amount'] as const).map((t) => (
                <label key={t} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.watch('type') === t ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30' : 'border-gray-200 dark:border-slate-700 dark:hover:border-slate-600'}`}>
                  <input type="radio" value={t} {...form.register('type')} className="sr-only" />
                  <span className="text-sm font-medium dark:text-white">{t === 'percentage' ? '% Percentage' : '₹ Fixed Amount'}</span>
                </label>
              ))}
            </div>
          </div>
          <Input
            label={form.watch('type') === 'percentage' ? 'Discount %' : 'Discount amount (₹)'}
            type="number"
            step="0.01"
            placeholder={form.watch('type') === 'percentage' ? '10' : '50'}
            error={form.formState.errors.value?.message}
            {...form.register('value', { valueAsNumber: true })}
          />
          <Input
            label="Min. order amount (₹, optional)"
            type="number"
            step="0.01"
            placeholder="0"
            {...form.register('min_order_amount', { valueAsNumber: true })}
          />
          <Input
            label="Max uses (leave blank for unlimited)"
            type="number"
            placeholder="e.g. 100"
            {...form.register('max_uses', { setValueAs: (v) => (v === '' || v === null ? null : parseInt(v, 10)) })}
          />
          <Input
            label="Expiry date (optional)"
            type="date"
            {...form.register('expires_at')}
          />
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setModal({ open: false })}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={form.formState.isSubmitting}>
              {modal.editing ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
