import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Minus, Search, Star, Clock, ChevronRight, UtensilsCrossed, ClipboardList, ShoppingBag, Zap, X as XIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency, getOrderStatusLabel, getOrderStatusColor } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { MenuItemSkeleton } from '@/components/ui/Skeleton'
import type { CustomizationGroup, Shop, MenuCategory, MenuItem } from '@/types'

const ORDERS_KEY = (slug: string) => `orderit-orders-${slug}`
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'preparing'])
const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'ready'])

type RecentOrder = { id: string; order_number: string; status: string }

export default function OrderMenuPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [shop, setShop] = useState<Shop | null>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  // Customization selector state
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null)
  const [customSelections, setCustomSelections] = useState<Record<string, string[]>>({})
  const categoryRefs = useRef<Record<string, HTMLDivElement>>({})

  const { items: cartItems, addItem, updateQuantity, getTotalItems, getTotalPrice, setShopSlug, shopSlug, clearCart } = useCartStore()

  useEffect(() => {
    if (slug) fetchShopData()
  }, [slug])

  // Clear cart automatically when customer scans a different shop's QR
  useEffect(() => {
    if (slug && shopSlug && shopSlug !== slug) {
      clearCart()
    }
  }, [slug, shopSlug])

  useEffect(() => {
    if (!slug) return
    const raw = localStorage.getItem(ORDERS_KEY(slug))
    if (!raw) return

    const now = Date.now()
    // Support both old string[] format and new { id, savedAt }[] format
    const parsed: unknown[] = JSON.parse(raw)
    const entries = parsed.map((e) =>
      typeof e === 'string' ? { id: e, savedAt: now } : e as { id: string; savedAt: number }
    )
    // Drop entries older than 24 hours
    const fresh = entries.filter((e) => now - e.savedAt < TTL_MS)
    if (!fresh.length) { localStorage.removeItem(ORDERS_KEY(slug)); return }
    // Persist cleaned list back
    localStorage.setItem(ORDERS_KEY(slug), JSON.stringify(fresh))

    const ids = fresh.map((e) => e.id)
    supabase
      .from('orders')
      .select('id, order_number, status')
      .in('id', ids)
      .then(({ data }) => {
        if (data) {
          const map = Object.fromEntries(data.map((o) => [o.id, o]))
          // Show active orders + cancelled (so customer sees cancellation) — hide quietly-completed ones
          const visible = ids
            .map((id) => map[id])
            .filter((o) => o && (ACTIVE_STATUSES.has(o.status) || o.status === 'cancelled')) as RecentOrder[]
          setRecentOrders(visible)
          // Prune completed orders from localStorage so they don't show next session
          const pruned = fresh.filter((e) => {
            const o = map[e.id]
            return !o || !TERMINAL_STATUSES.has(o.status)
          })
          if (pruned.length !== fresh.length)
            localStorage.setItem(ORDERS_KEY(slug), JSON.stringify(pruned))
        }
      })
  }, [slug])

  const fetchShopData = async () => {
    if (!slug) return
    setLoading(true)

    const { data: shopData } = await supabase
      .from('shops')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!shopData) { setLoading(false); return }
    setShop(shopData)
    setShopSlug(slug)

    const [catRes, itemRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('shop_id', shopData.id).eq('is_active', true).order('sort_order'),
      supabase.from('menu_items').select('*').eq('shop_id', shopData.id).eq('is_available', true).order('sort_order'),
    ])

    const cats = (catRes.data as MenuCategory[]) || []
    setCategories(cats)
    setItems((itemRes.data as MenuItem[]) || [])
    if (cats.length > 0) setActiveCategory(cats[0].id)
    setLoading(false)
  }

  const getItemQuantity = (itemId: string) => {
    return cartItems.filter((c) => c.menu_item.id === itemId).reduce((s, c) => s + c.quantity, 0)
  }

  const handleAddItem = (item: MenuItem) => {
    if (item.customization_groups && item.customization_groups.length > 0) {
      setCustomizeItem(item)
      setCustomSelections({})
    } else {
      addItem(item)
    }
  }

  const confirmCustomization = () => {
    if (!customizeItem) return
    const groups = customizeItem.customization_groups ?? []
    // Check all required groups have a selection
    for (const g of groups) {
      if (g.required && (!customSelections[g.name] || customSelections[g.name].length === 0)) {
        return // button will be disabled, but guard anyway
      }
    }
    const flatSelections = Object.entries(customSelections).flatMap(([group, choices]) =>
      choices.map((choice) => ({ group, choice }))
    )
    addItem(customizeItem, flatSelections)
    setCustomizeItem(null)
    setCustomSelections({})
  }

  const toggleCustomChoice = (group: CustomizationGroup, choice: string) => {
    setCustomSelections((prev) => {
      const current = prev[group.name] ?? []
      if (group.type === 'single') {
        return { ...prev, [group.name]: [choice] }
      }
      return {
        ...prev,
        [group.name]: current.includes(choice) ? current.filter((c) => c !== choice) : [...current, choice],
      }
    })
  }

  const canConfirmCustomization = () => {
    if (!customizeItem) return false
    return (customizeItem.customization_groups ?? []).every(
      (g) => !g.required || (customSelections[g.name] ?? []).length > 0
    )
  }

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId)
    categoryRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filteredItems = (categoryId: string) => {
    return items.filter((i) => i.category_id === categoryId && !i.is_instant && (
      !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase())
    ))
  }

  const instantItems = items.filter((i) => i.is_instant && (!search || i.name.toLowerCase().includes(search.toLowerCase())))

  // Compute effective open status — applies auto-schedule client-side without DB write
  const computeEffectiveOpen = (): boolean => {
    if (!shop) return false
    if (shop.auto_schedule_enabled && shop.auto_open_time && shop.auto_close_time) {
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      return hhmm >= shop.auto_open_time && hhmm < shop.auto_close_time
    }
    return shop.is_open
  }

  const effectiveIsOpen = !loading && shop ? computeEffectiveOpen() : true
  const grabAndGoOnly = !effectiveIsOpen && instantItems.length > 0

  const totalItems = getTotalItems()
  const totalPrice = getTotalPrice()

  if (!loading && !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <UtensilsCrossed size={64} className="text-gray-200 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Shop not found</h2>
          <p className="text-gray-500 mt-2">This menu link is invalid or the shop no longer exists.</p>
        </div>
      </div>
    )
  }

  if (!loading && shop && !effectiveIsOpen && instantItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50">
        <div>
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={40} className="text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{shop.name}</h2>
          <p className="text-lg text-gray-500 mt-2">Sorry, we're currently closed</p>
          <p className="text-sm text-gray-400 mt-1">Please visit us again later!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 text-white pt-safe px-4 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 pt-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <UtensilsCrossed size={24} className="text-white" />
              )}
            </div>
            <div>
              {loading ? (
                <div className="space-y-1.5">
                  <div className="h-5 w-32 bg-white/20 rounded-lg animate-pulse" />
                  <div className="h-3 w-20 bg-white/20 rounded-lg animate-pulse" />
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold">{shop?.name}</h1>
                  {shop?.description && <p className="text-orange-100 text-sm">{shop.description}</p>}
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-white text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            />
          </div>

          {/* Recent orders panel */}
          {recentOrders.length > 0 && (
            <div className="mt-3 bg-white/20 backdrop-blur-sm rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/20">
                <ClipboardList size={15} className="text-white" />
                <span className="text-white text-xs font-semibold uppercase tracking-wide">
                  {recentOrders.length === 1 ? 'Your last order' : 'Your recent orders'}
                </span>
              </div>
              {recentOrders.map((order) => {
                const isCancelled = order.status === 'cancelled'
                return isCancelled ? (
                  <div
                    key={order.id}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-red-500/20"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-white/70 text-sm font-semibold line-through truncate">{order.order_number}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                        ✕ Cancelled
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    key={order.id}
                    onClick={() => navigate(`/order/${slug}/success/${order.id}`)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-white/10 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-white text-sm font-semibold truncate">{order.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </div>
                    <ChevronRight size={15} className="text-white/70 flex-shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Category pills — hidden while searching or when grab-and-go-only mode */}
      {!search && !grabAndGoOnly && (
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 w-24 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
                ))
              : categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={`flex-shrink-0 h-8 px-4 rounded-full text-sm font-medium transition-all ${
                      activeCategory === cat.id
                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
          </div>
        </div>
      </div>
      )}

      {/* Grab & Go only banner — shown when shop is offline but has instant items */}
      {grabAndGoOnly && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-sm">Kitchen is currently closed</p>
              <p className="text-xs text-amber-700 mt-0.5">You can still order our ready-made Grab &amp; Go items below. They're ready immediately!</p>
            </div>
          </div>
        </div>
      )}

      {/* Menu */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-8">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <MenuItemSkeleton key={i} />)}
          </div>
        ) : (() => {
          const hasAnyResults = (!grabAndGoOnly && categories.some((cat) => filteredItems(cat.id).length > 0)) || instantItems.length > 0
          if (!hasAnyResults) {
            return (
              <div className="py-20 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-semibold text-gray-700">No items found</p>
                <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
              </div>
            )
          }
          return (
            <>
              {/* Grab & Go section — instant items */}
              {instantItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={16} className="text-orange-500" />
                    <h2 className="text-lg font-bold text-gray-900">Grab &amp; Go</h2>
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Ready instantly</span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
                    {instantItems.map((item) => {
                      const outOfStock = item.stock_quantity === 0
                      const lowStock = item.stock_quantity !== null && item.stock_quantity > 0 && item.stock_quantity <= item.low_stock_threshold
                      return (
                        <div key={item.id} className="flex-shrink-0 w-36 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-full h-24 object-cover" />
                          ) : (
                            <div className="w-full h-24 bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
                              <ShoppingBag size={28} className="text-orange-300" />
                            </div>
                          )}
                          <div className="p-2.5">
                            <p className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">{item.name}</p>
                            {lowStock && <p className="text-xs text-orange-500 mt-0.5">Only {item.stock_quantity} left</p>}
                            {outOfStock && <p className="text-xs text-red-500 mt-0.5">Out of stock</p>}
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs font-bold text-orange-600">{formatCurrency(item.price)}</p>
                              <button
                                disabled={outOfStock}
                                onClick={() => handleAddItem(item)}
                                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${outOfStock ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95'}`}
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!grabAndGoOnly && categories.map((cat) => {
                const catItems = filteredItems(cat.id)
                if (catItems.length === 0) return null
                return (
                  <div key={cat.id} ref={(el) => { if (el) categoryRefs.current[cat.id] = el }}>
                    <h2 className="text-lg font-bold text-gray-900 mb-3">{cat.name}</h2>
                    <div className="space-y-3">
                      {catItems.map((item) => {
                        const qty = getItemQuantity(item.id)
                        const outOfStock = item.stock_quantity === 0
                        const lowStock = item.stock_quantity !== null && item.stock_quantity > 0 && item.stock_quantity <= item.low_stock_threshold
                        const hasCustomizations = (item.customization_groups ?? []).length > 0
                        return (
                          <div
                            key={item.id}
                            className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-3 shadow-sm transition-shadow hover:shadow-md"
                            style={{ animation: 'fadeIn 0.3s ease-out' }}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center flex-shrink-0 border border-orange-100">
                                <span className="text-3xl">🍽️</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1.5 flex-wrap">
                                <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>
                                {item.is_popular && (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                                    <Star size={9} fill="currentColor" /> Popular
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{item.description}</p>
                              )}
                              {lowStock && <p className="text-xs text-orange-500 mt-1">Only {item.stock_quantity} left</p>}
                              {outOfStock && <p className="text-xs text-red-500 mt-1">Out of stock</p>}
                              {hasCustomizations && !outOfStock && (
                                <p className="text-xs text-gray-400 mt-0.5">Customizable</p>
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <p className="font-bold text-orange-600">{formatCurrency(item.price)}</p>
                                {outOfStock ? (
                                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Out of stock</span>
                                ) : qty === 0 || hasCustomizations ? (
                                  <button
                                    onClick={() => handleAddItem(item)}
                                    className="flex items-center gap-1 h-8 px-3 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 active:scale-95 transition-all"
                                  >
                                    <Plus size={14} /> Add
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2 bg-orange-50 rounded-xl p-1">
                                    <button
                                      onClick={() => updateQuantity(item.id, qty - 1)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm hover:bg-orange-50 transition-colors"
                                    >
                                      <Minus size={13} />
                                    </button>
                                    <span className="w-5 text-center text-sm font-bold text-orange-700">{qty}</span>
                                    <button
                                      onClick={() => addItem(item)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-colors"
                                    >
                                      <Plus size={13} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )
        })()}
      </div>

      {/* Customization selector sheet */}
      {customizeItem && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={() => setCustomizeItem(null)}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">{customizeItem.name}</h3>
              <button onClick={() => setCustomizeItem(null)} className="text-gray-400 hover:text-gray-600"><XIcon size={20} /></button>
            </div>
            {(customizeItem.customization_groups ?? []).map((group) => (
              <div key={group.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{group.name}</span>
                  {group.required && <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Required</span>}
                  {!group.required && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">Optional</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.choices.map((choice) => {
                    const selected = (customSelections[group.name] ?? []).includes(choice)
                    return (
                      <button
                        key={choice}
                        onClick={() => toggleCustomChoice(group, choice)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${selected ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300'}`}
                      >
                        {choice}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <button
              disabled={!canConfirmCustomization()}
              onClick={confirmCustomization}
              className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all ${canConfirmCustomization() ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              Add to Cart — {formatCurrency(customizeItem.price)}
            </button>
          </div>
        </div>
      )}

      {/* Floating cart button */}
      {totalItems > 0 && (
        <div
          className="fixed bottom-6 left-0 right-0 px-4 z-20"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => navigate(`/order/${slug}/checkout`)}
              className="w-full bg-orange-500 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-orange-300/50 hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
                  {totalItems}
                </span>
                <span className="font-semibold">View Cart</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{formatCurrency(totalPrice)}</span>
                <ChevronRight size={18} />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
