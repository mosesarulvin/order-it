import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Plus, Trash2, Edit2, Copy, Image as ImageIcon, X, ChevronDown, Calendar as CalendarIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Toggle } from '@/components/ui/Toggle'
import { convertToWebP } from '@/lib/utils'
import type { Promotion, MenuCategory, MenuItem } from '@/types'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import * as Popover from '@radix-ui/react-popover'

export default function PromotionsPage() {
  const { shop } = useAuth()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)
  const [uploading, setUploading] = useState(false)

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [discountType, setDiscountType] = useState<'percentage' | 'flat'>('percentage')
  const [discountValue, setDiscountValue] = useState('')
  const [targetType, setTargetType] = useState<'all' | 'category' | 'item'>('all')
  const [targetId, setTargetId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [validUntilDate, setValidUntilDate] = useState<Date | undefined>(undefined)

  // Dropdown states
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false)
  const [idDropdownOpen, setIdDropdownOpen] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  useEffect(() => {
    if (shop) {
      fetchData()
    }
  }, [shop])

  const fetchData = async () => {
    if (!shop) return
    setLoading(true)
    try {
      const [promoRes, catRes, itemRes] = await Promise.all([
        supabase.from('promotions').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }),
        supabase.from('menu_categories').select('*').eq('shop_id', shop.id).eq('is_active', true),
        supabase.from('menu_items').select('*').eq('shop_id', shop.id).eq('is_available', true)
      ])

      if (promoRes.error) throw promoRes.error
      if (catRes.error) throw catRes.error
      if (itemRes.error) throw itemRes.error

      setPromotions(promoRes.data as Promotion[])
      setCategories(catRes.data as MenuCategory[])
      setItems(itemRes.data as MenuItem[])
    } catch (error: any) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const openModal = (promo?: Promotion) => {
    if (promo) {
      setEditingPromotion(promo)
      setTitle(promo.title)
      setImageUrl(promo.image_url || '')
      setDiscountType(promo.discount_type)
      setDiscountValue(promo.discount_value.toString())
      setTargetType(promo.target_type)
      setTargetId(promo.target_id || '')
      setIsActive(promo.is_active)
      setValidUntilDate(promo.valid_until ? new Date(promo.valid_until) : undefined)
    } else {
      setEditingPromotion(null)
      setTitle('')
      setImageUrl('')
      setDiscountType('percentage')
      setDiscountValue('')
      setTargetType('all')
      setTargetId('')
      setIsActive(true)
      setValidUntilDate(undefined)
    }
    setTypeDropdownOpen(false)
    setTargetDropdownOpen(false)
    setIdDropdownOpen(false)
    setDatePickerOpen(false)
    setIsModalOpen(true)
  }


  const handleCopy = (promo: Promotion) => {
    setEditingPromotion(null)
    setTitle(`${promo.title} (Copy)`)
    setImageUrl(promo.image_url || '')
    setDiscountType(promo.discount_type)
    setDiscountValue(promo.discount_value.toString())
    setTargetType(promo.target_type)
    setTargetId(promo.target_id || '')
    setIsActive(promo.is_active)
    setValidUntilDate(promo.valid_until ? new Date(promo.valid_until) : undefined)
    
    setTypeDropdownOpen(false)
    setTargetDropdownOpen(false)
    setIdDropdownOpen(false)
    setDatePickerOpen(false)
    setIsModalOpen(true)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !shop) return
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }

    setUploading(true)
    try {
      const webpFile = await convertToWebP(file)
      const path = `${shop.id}/${Date.now()}.webp`
      const { error: uploadError } = await supabase.storage.from('promotions').upload(path, webpFile, { upsert: true })
      
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('promotions').getPublicUrl(path)
      setImageUrl(publicUrl)
    } catch (error: any) {
      toast.error('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = () => setImageUrl('')

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shop) return
    
    const value = parseFloat(discountValue)
    if (isNaN(value) || value <= 0) {
      toast.error('Please enter a valid discount value')
      return
    }

    if (targetType !== 'all' && !targetId) {
      toast.error('Please select a target category or item')
      return
    }

    const payload = {
      shop_id: shop.id,
      title,
      image_url: imageUrl || null,
      discount_type: discountType,
      discount_value: value,
      target_type: targetType,
      target_id: targetType === 'all' ? null : targetId,
      is_active: isActive,
      valid_until: validUntilDate ? validUntilDate.toISOString() : null
    }

    try {
      if (editingPromotion) {
        const { error } = await supabase.from('promotions').update(payload).eq('id', editingPromotion.id)
        if (error) throw error
        toast.success('Promotion updated')
      } else {
        const { error } = await supabase.from('promotions').insert([payload])
        if (error) throw error
        toast.success('Promotion created')
      }
      setIsModalOpen(false)
      fetchData()
    } catch (error: any) {
      toast.error(error.message || 'Failed to save promotion')
    }
  }

  const handleDelete = (id: string) => {
    setDeletingId(id)
    setDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!deletingId) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('promotions').delete().eq('id', deletingId)
      if (error) throw error
      toast.success('Promotion deleted')
      setDeleteModalOpen(false)
      fetchData()
    } catch (error: any) {
      toast.error('Failed to delete promotion')
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from('promotions').update({ is_active: !currentStatus }).eq('id', id)
      if (error) throw error
      setPromotions(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p))
    } catch (error: any) {
      toast.error('Failed to update status')
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading promotions...</div>
  }

  const targetLabel = targetType === 'all' ? 'Store-wide (All Items)' : targetType === 'category' ? 'Specific Category' : 'Specific Item'

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Promotions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Run discounts and display banners on your menu</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> New Promotion
        </button>
      </div>

      {promotions.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon size={24} />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No promotions yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Create your first promotion to attract more customers.</p>
            <button onClick={() => openModal()} className="text-orange-500 font-medium hover:underline">Create Promotion</button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {promotions.map(promo => (
            <Card key={promo.id} className={`overflow-hidden transition-opacity ${!promo.is_active ? 'opacity-60' : ''}`}>
              {promo.image_url && (
                <div className="w-full h-32 bg-gray-100 dark:bg-slate-800 relative">
                  <img src={promo.image_url} alt={promo.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{promo.title}</h3>
                  <div className="flex items-center gap-2">
                    <Toggle 
                      checked={promo.is_active} 
                      onChange={() => toggleActive(promo.id, promo.is_active)} 
                      label="Active"
                    />
                  </div>
                </div>
                
                <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                  <p>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Discount: </span> 
                    {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : `₹${promo.discount_value}`} off
                  </p>
                  <p>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Target: </span> 
                    {promo.target_type === 'all' && <span className="text-gray-600 dark:text-gray-400">All items</span>}
                    {promo.target_type === 'category' && (
                      <span className="text-gray-600 dark:text-gray-400">
                        Category — <span className="font-medium text-gray-800 dark:text-gray-200">{categories.find(c => c.id === promo.target_id)?.name ?? 'Unknown category'}</span>
                      </span>
                    )}
                    {promo.target_type === 'item' && (
                      <span className="text-gray-600 dark:text-gray-400">
                        Item — <span className="font-medium text-gray-800 dark:text-gray-200">{items.find(i => i.id === promo.target_id)?.name ?? 'Unknown item'}</span>
                      </span>
                    )}
                  </p>
                  {promo.valid_until && (
                    <p>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Valid until: </span> 
                      {new Date(promo.valid_until).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 justify-end border-t border-gray-100 dark:border-slate-700 pt-3">
                  
                  <button onClick={() => handleCopy(promo)} title="Copy Promotion" className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    <Copy size={16} />
                  </button>
                  <button onClick={() => openModal(promo)} className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(promo.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingPromotion ? 'Edit Promotion' : 'New Promotion'} size="md">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banner Image (Optional)</label>
            {imageUrl ? (
              <div className="relative w-full h-32 rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
                <img src={imageUrl} alt="Banner" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-xl p-6 text-center hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="text-gray-500 dark:text-gray-400">
                  <ImageIcon size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">{uploading ? 'Uploading and compressing...' : 'Click to upload banner'}</p>
                  <p className="text-xs mt-1">Recommended size: 800x400 (WebP format will be used)</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4 border-t border-gray-100 dark:border-slate-800 pt-4">
            <Input
              label="Promotion Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Weekend Special 30% Off"
              required
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount Type</label>
                <Popover.Root open={typeDropdownOpen} onOpenChange={setTypeDropdownOpen}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className="w-full h-10 px-3 flex items-center justify-between text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    >
                      <span>{discountType === 'percentage' ? 'Percentage (%)' : 'Flat Amount (₹)'}</span>
                      <ChevronDown size={16} className="text-gray-400" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content sideOffset={4} className="w-[var(--radix-popover-trigger-width)] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-[60] py-1">
                      <button type="button" onClick={() => { setDiscountType('percentage'); setTypeDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">Percentage (%)</button>
                      <button type="button" onClick={() => { setDiscountType('flat'); setTypeDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">Flat Amount (₹)</button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
              <Input
                label="Discount Value"
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="e.g., 30"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target</label>
              <Popover.Root open={targetDropdownOpen} onOpenChange={setTargetDropdownOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="w-full h-10 px-3 flex items-center justify-between text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 mb-2"
                  >
                    <span>{targetLabel}</span>
                    <ChevronDown size={16} className="text-gray-400" />
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content sideOffset={4} className="w-[var(--radix-popover-trigger-width)] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-[60] py-1">
                    <button type="button" onClick={() => { setTargetType('all'); setTargetId(''); setTargetDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">Store-wide (All Items)</button>
                    <button type="button" onClick={() => { setTargetType('category'); setTargetId(''); setTargetDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">Specific Category</button>
                    <button type="button" onClick={() => { setTargetType('item'); setTargetId(''); setTargetDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">Specific Item</button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>

              {targetType === 'category' && (
                <Popover.Root open={idDropdownOpen} onOpenChange={setIdDropdownOpen}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className={`w-full h-10 px-3 flex items-center justify-between text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm ${!targetId ? 'text-gray-400' : 'text-gray-900 dark:text-white'} focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100`}
                    >
                      <span className="truncate pr-2">{targetId ? categories.find(c => c.id === targetId)?.name : 'Select Category...'}</span>
                      <ChevronDown size={16} className="text-gray-400 shrink-0" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content sideOffset={4} className="w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-[60] py-1">
                      {categories.map(c => (
                        <button key={c.id} type="button" onClick={() => { setTargetId(c.id); setIdDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">{c.name}</button>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}

              {targetType === 'item' && (
                <Popover.Root open={idDropdownOpen} onOpenChange={setIdDropdownOpen}>
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      className={`w-full h-10 px-3 flex items-center justify-between text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm ${!targetId ? 'text-gray-400' : 'text-gray-900 dark:text-white'} focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100`}
                    >
                      <span className="truncate pr-2">{targetId ? items.find(i => i.id === targetId)?.name : 'Select Item...'}</span>
                      <ChevronDown size={16} className="text-gray-400 shrink-0" />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content sideOffset={4} className="w-[var(--radix-popover-trigger-width)] max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-[60] py-1">
                      {items.map(i => (
                        <button key={i.id} type="button" onClick={() => { setTargetId(i.id); setIdDropdownOpen(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white">{i.name}</button>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valid Until (Optional)</label>
              <Popover.Root open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    className="w-full h-10 px-3 flex items-center gap-2 text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  >
                    <CalendarIcon size={16} className="text-gray-400 shrink-0" />
                    <span className="flex-1 truncate">{validUntilDate ? format(validUntilDate, 'PPP') : 'Select date...'}</span>
                    {validUntilDate && (
                      <X size={14} className="ml-auto text-gray-400 hover:text-red-500 shrink-0" onClick={(e) => { e.stopPropagation(); setValidUntilDate(undefined) }} />
                    )}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content sideOffset={4} align="start" className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-[60] p-2">
                    <style>{`
                      .rdp-root {
                        --rdp-accent-color: #f97316;
                        --rdp-accent-background-color: #fff7ed;
                        --rdp-font-family: inherit;
                        margin: 0;
                      }
                      .rdp-day_selected { font-weight: bold; }
                      .dark .rdp-root { --rdp-accent-background-color: #7c2d12; }
                      .rdp-months { justify-content: center; }
                      .rdp-day { border-radius: 6px; font-size: 0.85rem; height: 32px; width: 32px; }
                      .rdp-head_cell { font-size: 0.8rem; font-weight: 500; text-transform: uppercase; color: #9ca3af; }
                    `}</style>
                    <DayPicker 
                      mode="single"
                      selected={validUntilDate}
                      onSelect={(date) => { setValidUntilDate(date); setDatePickerOpen(false) }}
                      className="text-gray-900 dark:text-gray-200 bg-white dark:bg-slate-800"
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active</span>
              <Toggle checked={isActive} onChange={() => setIsActive(!isActive)} />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-slate-800">
            <button
              type="submit"
              className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl transition-colors"
            >
              Save Promotion
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Promotion"
        description="Are you sure you want to delete this promotion? This action cannot be undone."
        confirmText="Delete"
        isDanger={true}
        loading={isDeleting}
      />
    </div>
  )
}
