import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, GripVertical, ImagePlus, Tag, ChevronDown, ChevronUp } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card, CardContent } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import type { MenuCategory, MenuItem } from '@/types'
import toast from 'react-hot-toast'

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
})

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.number().min(0, 'Price must be positive'),
  is_popular: z.boolean().optional(),
})

type CategoryForm = z.infer<typeof categorySchema>
type ItemForm = z.infer<typeof itemSchema>

export default function MenuPage() {
  const { shop } = useAuth()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())

  // modals
  const [catModal, setCatModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false })
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: MenuItem; categoryId?: string }>({ open: false })
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const catForm = useForm<CategoryForm>({ resolver: zodResolver(categorySchema) })
  const itemForm = useForm<ItemForm>({ resolver: zodResolver(itemSchema) })

  useEffect(() => {
    if (shop) fetchMenu()
  }, [shop])

  const fetchMenu = async () => {
    if (!shop) return
    setLoading(true)
    const [catRes, itemRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('shop_id', shop.id).order('sort_order'),
      supabase.from('menu_items').select('*').eq('shop_id', shop.id).order('sort_order'),
    ])
    const cats = (catRes.data as MenuCategory[]) || []
    setCategories(cats)
    setItems((itemRes.data as MenuItem[]) || [])
    setExpandedCats(new Set(cats.map((c) => c.id)))
    setLoading(false)
  }

  // ── CATEGORY ACTIONS ────────────────────────────────────────────────────────
  const openAddCategory = () => {
    catForm.reset({ name: '', description: '' })
    setCatModal({ open: true })
  }

  const openEditCategory = (cat: MenuCategory) => {
    catForm.reset({ name: cat.name, description: cat.description || '' })
    setCatModal({ open: true, editing: cat })
  }

  const saveCategory = async (data: CategoryForm) => {
    if (!shop) return
    const payload = { shop_id: shop.id, name: data.name, description: data.description || null, sort_order: categories.length }
    if (catModal.editing) {
      const { error } = await supabase.from('menu_categories').update({ name: data.name, description: data.description || null }).eq('id', catModal.editing.id)
      if (error) { toast.error(error.message); return }
      toast.success('Category updated')
    } else {
      const { error } = await supabase.from('menu_categories').insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success('Category added')
    }
    setCatModal({ open: false })
    fetchMenu()
  }

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category and all its items?')) return
    await supabase.from('menu_items').delete().eq('category_id', id)
    await supabase.from('menu_categories').delete().eq('id', id)
    toast.success('Category deleted')
    fetchMenu()
  }

  // ── ITEM ACTIONS ─────────────────────────────────────────────────────────────
  const openAddItem = (categoryId: string) => {
    itemForm.reset({ name: '', description: '', price: 0, is_popular: false })
    setItemModal({ open: true, categoryId })
  }

  const openEditItem = (item: MenuItem) => {
    itemForm.reset({ name: item.name, description: item.description || '', price: item.price, is_popular: item.is_popular })
    setItemModal({ open: true, editing: item, categoryId: item.category_id })
  }

  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed (JPG, PNG, WEBP, etc.)')
      e.target.value = ''
      return
    }
    // Validate file size (max 3MB)
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Image must be smaller than 3MB')
      e.target.value = ''
      return
    }
    setPendingImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!shop) return null
    setUploadingImage(true)
    const ext = file.name.split('.').pop()
    const path = `${shop.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true })
    setUploadingImage(false)
    if (error) { toast.error(`Image upload failed: ${error.message}`); return null }
    const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
    return data.publicUrl
  }

  const saveItem = async (data: ItemForm) => {
    if (!shop || !itemModal.categoryId) return
    let imageUrl = itemModal.editing?.image_url || null
    if (pendingImageFile) {
      imageUrl = await uploadImage(pendingImageFile)
    }

    const payload = {
      shop_id: shop.id,
      category_id: itemModal.categoryId,
      name: data.name,
      description: data.description || null,
      price: data.price,
      is_popular: data.is_popular || false,
      is_available: true,
      sort_order: items.filter((i) => i.category_id === itemModal.categoryId).length,
      image_url: imageUrl,
    }

    if (itemModal.editing) {
      const { error } = await supabase.from('menu_items').update(payload).eq('id', itemModal.editing.id)
      if (error) { toast.error(error.message); return }
      toast.success('Item updated')
    } else {
      const { error } = await supabase.from('menu_items').insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success('Item added')
    }

    setItemModal({ open: false })
    setPendingImageFile(null)
    setImagePreview(null)
    fetchMenu()
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    toast.success('Item deleted')
    fetchMenu()
  }

  const toggleAvailable = async (item: MenuItem) => {
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, is_available: !i.is_available } : i))
  }

  const toggleCat = (id: string) => {
    setExpandedCats((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Menu</h2>
          <p className="text-sm text-gray-500 mt-0.5">{categories.length} categories · {items.length} items</p>
        </div>
        <Button onClick={openAddCategory} className="gap-2">
          <Plus size={16} /> Add Category
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Tag size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-xl font-semibold text-gray-700">No menu categories yet</p>
            <p className="text-gray-400 mt-2 mb-6">Start by adding a category like "Coffee", "Snacks"</p>
            <Button onClick={openAddCategory}><Plus size={16} className="mr-2" /> Add First Category</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => {
            const catItems = items.filter((i) => i.category_id === cat.id)
            const expanded = expandedCats.has(cat.id)

            return (
              <Card key={cat.id}>
                <CardContent className="p-0">
                  {/* Category header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 rounded-t-2xl transition-colors"
                    onClick={() => toggleCat(cat.id)}
                  >
                    <GripVertical size={16} className="text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{cat.name}</h3>
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{catItems.length} items</span>
                      </div>
                      {cat.description && <p className="text-sm text-gray-400 mt-0.5">{cat.description}</p>}
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => openEditCategory(cat)}>
                        <Pencil size={15} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteCategory(cat.id)} className="hover:text-red-500">
                        <Trash2 size={15} />
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => openAddItem(cat.id)}>
                        <Plus size={14} className="mr-1" /> Add Item
                      </Button>
                    </div>
                    {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>

                  {/* Items */}
                  {expanded && (
                    <div className="border-t border-gray-50">
                      {catItems.length === 0 ? (
                        <div className="py-8 text-center text-gray-400 text-sm">
                          No items in this category.{' '}
                          <button className="text-orange-500 font-medium" onClick={() => openAddItem(cat.id)}>Add one</button>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {catItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 p-4 hover:bg-gray-50/50 transition-colors">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center flex-shrink-0 border border-orange-100">
                                  <span className="text-2xl">🍽️</span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-gray-900 text-sm">{item.name}</span>
                                  {item.is_popular && <Badge variant="orange">Popular</Badge>}
                                  {!item.is_available && <Badge variant="default">Unavailable</Badge>}
                                </div>
                                {item.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.description}</p>}
                                <p className="text-sm font-semibold text-orange-600 mt-1">{formatCurrency(item.price)}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Toggle
                                  checked={item.is_available}
                                  onChange={() => toggleAvailable(item)}
                                />
                                <Button variant="ghost" size="icon" onClick={() => openEditItem(item)}>
                                  <Pencil size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => deleteItem(item.id)} className="hover:text-red-500">
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Category Modal */}
      <Modal
        open={catModal.open}
        onClose={() => setCatModal({ open: false })}
        title={catModal.editing ? 'Edit Category' : 'New Category'}
        size="sm"
      >
        <form onSubmit={catForm.handleSubmit(saveCategory)} className="space-y-4">
          <Input
            label="Category name"
            placeholder="e.g. Hot Beverages"
            error={catForm.formState.errors.name?.message}
            {...catForm.register('name')}
          />
          <Input
            label="Description (optional)"
            placeholder="Short description"
            {...catForm.register('description')}
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setCatModal({ open: false })}>Cancel</Button>
            <Button type="submit" className="flex-1" loading={catForm.formState.isSubmitting}>
              {catModal.editing ? 'Save Changes' : 'Add Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Item Modal */}
      <Modal
        open={itemModal.open}
        onClose={() => { setItemModal({ open: false }); setPendingImageFile(null); setImagePreview(null) }}
        title={itemModal.editing ? 'Edit Item' : 'New Menu Item'}
        size="md"
      >
        <form onSubmit={itemForm.handleSubmit(saveItem)} className="space-y-4">
          {/* Image upload */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Item photo</label>
            <div
              className="relative w-full h-36 rounded-xl border-2 border-dashed border-gray-200 overflow-hidden cursor-pointer hover:border-orange-400 transition-colors group"
              onClick={() => fileRef.current?.click()}
            >
              {(imagePreview || itemModal.editing?.image_url) ? (
                <img
                  src={imagePreview || itemModal.editing?.image_url || ''}
                  alt="preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400 group-hover:text-orange-400 transition-colors">
                  <ImagePlus size={24} />
                  <span className="text-sm">Click to upload photo</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          </div>

          <Input
            label="Item name"
            placeholder="e.g. Cappuccino"
            error={itemForm.formState.errors.name?.message}
            {...itemForm.register('name')}
          />
          <Textarea
            label="Description (optional)"
            placeholder="Brief description of the item"
            {...itemForm.register('description')}
          />
          <Input
            label="Price (₹)"
            type="number"
            step="0.5"
            placeholder="0"
            error={itemForm.formState.errors.price?.message}
            {...itemForm.register('price', { valueAsNumber: true })}
          />
          <Toggle
            checked={itemForm.watch('is_popular') || false}
            onChange={(v) => itemForm.setValue('is_popular', v)}
            label="Mark as popular"
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setItemModal({ open: false }); setPendingImageFile(null); setImagePreview(null) }}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" loading={itemForm.formState.isSubmitting || uploadingImage}>
              {itemModal.editing ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
