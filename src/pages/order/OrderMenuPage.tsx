import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Minus, Search, Star, Clock, ChevronLeft, ChevronRight, UtensilsCrossed, X as XIcon, User, Flame } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { useCustomerOrderNotifications } from '@/hooks/useCustomerOrderNotifications'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MenuItemSkeleton } from '@/components/ui/Skeleton'
import type { CustomizationGroup, Shop, MenuCategory, MenuItem } from '@/types'

export default function OrderMenuPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  useCustomerOrderNotifications(slug)
  const [shop, setShop] = useState<Shop | null>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  // Customization selector state
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null)
  const [customSelections, setCustomSelections] = useState<Record<string, string[]>>({})
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [viewingItem, setViewingItem] = useState<MenuItem | null>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement>>({})
  const categoryNavRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkCategoryScroll = () => {
    const el = categoryNavRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 5)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 5)
  }

  useEffect(() => {
    checkCategoryScroll()
    const el = categoryNavRef.current
    if (!el) return
    el.addEventListener('scroll', checkCategoryScroll)
    window.addEventListener('resize', checkCategoryScroll)
    return () => {
      el.removeEventListener('scroll', checkCategoryScroll)
      window.removeEventListener('resize', checkCategoryScroll)
    }
  }, [categories])

  const scrollCategories = (direction: 'left' | 'right') => {
    const el = categoryNavRef.current
    if (!el) return
    const scrollAmount = direction === 'left' ? -180 : 180
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' })
  }

  const { items: cartItems, addItem, updateQuantity, getTotalItems, getTotalPrice, setShopSlug, shopSlug, clearCart, getPackingCharge, orderType, setOrderType } = useCartStore()

  useEffect(() => {
    if (slug) fetchShopData()
  }, [slug])

  // Clear cart automatically when customer scans a different shop's QR
  useEffect(() => {
    if (slug && shopSlug && shopSlug !== slug) {
      clearCart()
    }
  }, [slug, shopSlug])

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
    const hasCustoms = item.customization_groups && item.customization_groups.length > 0
    const hasVariants = item.variants && item.variants.length > 0
    if (hasCustoms || hasVariants) {
      setCustomizeItem(item)
      setCustomSelections({})
      if (hasVariants) setSelectedVariantId(item.variants[0].id)
      else setSelectedVariantId('')
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
      choices.map((choiceName) => {
        const groupObj = groups.find((g) => g.name === group)
        const choiceObj = (groupObj?.choices as any[])?.find((c) => typeof c === 'string' ? c === choiceName : c.name === choiceName)
        const price = typeof choiceObj === 'string' ? 0 : (choiceObj?.price || 0)
        return { group, choice: choiceName, price }
      })
    )
    const variant = (customizeItem.variants || []).find(v => v.id === selectedVariantId)
    addItem(customizeItem, flatSelections, variant)
    setCustomizeItem(null)
    setCustomSelections({})
    setSelectedVariantId('')
  }

  const toggleCustomChoice = (group: CustomizationGroup, choice: string) => {
    setCustomSelections((prev) => {
      const current = prev[group.name] ?? []
      if (group.type === 'single') {
        if (current.includes(choice)) {
          return { ...prev, [group.name]: [] }
        }
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
    const groups = customizeItem.customization_groups ?? []
    for (const g of groups) {
      if (g.required && (!customSelections[g.name] || customSelections[g.name].length === 0)) {
        return false
      }
    }
    if (customizeItem.variants && customizeItem.variants.length > 0 && !selectedVariantId) return false
    return true
  }

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId)
    const el = categoryRefs.current[categoryId]
    if (el) {
      const offset = 60 // Account for sticky header
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  const searchedItems = useMemo(() => {
    return items.filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
  }, [items, search])

  const filteredItems = (categoryId: string) => {
    return searchedItems.filter((i) => {
      if (i.category_id !== categoryId) return false
      if (grabAndGoOnly && !i.is_instant) return false
      return true
    })
  }

  const instantItems = useMemo(() => {
    return searchedItems.filter((i) => i.is_instant)
  }, [searchedItems])

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
  const packingCharge = getPackingCharge()

  if (!loading && !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <UtensilsCrossed size={64} className="text-gray-200 dark:text-slate-700 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Shop not found</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">This menu link is invalid or the shop no longer exists.</p>
        </div>
      </div>
    )
  }

  if (!loading && shop && !effectiveIsOpen && instantItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50 dark:bg-slate-950">
        <div>
          <div className="w-20 h-20 bg-brand-primary-lighter dark:bg-brand-primary-shadow rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={40} className="text-brand-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{shop.name}</h2>
          <p className="text-lg text-gray-500 dark:text-gray-400 mt-2">Sorry, we're currently closed</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Please visit us again later!</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors ${totalItems > 0 ? 'pb-28' : 'pb-10'}`}>
      {/* Header */}
      <div
        className={`relative text-white pt-safe px-4 pb-6 transition-all duration-300 bg-cover bg-center ${
          !shop?.cover_image_url ? 'gradient-brand-header' : ''
        }`}
        style={
          shop?.cover_image_url
            ? {
                backgroundImage: `linear-gradient(to bottom, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.85)), url("${shop.cover_image_url}")`,
              }
            : undefined
        }
      >
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 pt-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <UtensilsCrossed size={24} className="text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="space-y-1.5">
                  <div className="h-5 w-32 bg-white/20 rounded-lg animate-pulse" />
                  <div className="h-3 w-20 bg-white/20 rounded-lg animate-pulse" />
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold truncate">{shop?.name}</h1>
                  {shop?.description && <p className="text-white/80 text-sm truncate">{shop.description}</p>}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle isDarkBackground />
              <button
                onClick={() => {
                  const profileId = localStorage.getItem(`profile-${slug}`)
                  if (profileId) {
                    navigate(`/order/${slug}/profile/${profileId}`)
                  } else {
                    navigate(`/order/${slug}/profile`)
                  }
                }}
                className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0"
              >
                <User size={20} className="text-white" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none border border-transparent dark:border-slate-800 shadow-sm"
            />
          </div>

          {/* Order Type Toggle */}
          <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl mt-3 shadow-sm border border-transparent dark:border-slate-800">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                orderType === 'dine_in' 
                  ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Dine-in
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                orderType === 'takeaway' 
                  ? 'bg-brand-primary text-white shadow-md shadow-brand-primary/20' 
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Takeaway
            </button>
          </div>
        </div>
      </div>

      {/* Category pills — hidden while searching or when grab-and-go-only mode */}
      {!search && !grabAndGoOnly && (
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="max-w-lg mx-auto relative flex items-center">
          {canScrollLeft && (
            <button
              onClick={() => scrollCategories('left')}
              className="absolute left-1 z-20 w-7 h-7 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-md text-gray-700 dark:text-gray-200 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              aria-label="Scroll categories left"
            >
              <ChevronLeft size={16} />
            </button>
          )}

          <div
            ref={categoryNavRef}
            className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar w-full"
            style={{ scrollbarWidth: 'none' }}
          >
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 w-28 bg-gray-100 dark:bg-slate-800 rounded-full animate-pulse flex-shrink-0" />
                ))
              : (
                <>
                  {categories.filter(cat => filteredItems(cat.id).length > 0).map((cat) => {
                    const categoryImageItem = items.find((i) => i.category_id === cat.id && i.is_category_image && i.image_url)
                    const hasImage = !!(categoryImageItem && categoryImageItem.image_url)

                    return (
                      <button
                        key={cat.id}
                        onClick={() => scrollToCategory(cat.id)}
                        className={`flex-shrink-0 flex items-center gap-2.5 h-12 ${hasImage ? 'pl-1 pr-5' : 'px-5'} rounded-full text-sm font-medium transition-all ${
                          activeCategory === cat.id
                            ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {hasImage && (
                          <img src={categoryImageItem.image_url!} alt="" className="w-10 h-10 rounded-full object-cover border border-white/20 shadow-sm" />
                        )}
                        {cat.name}
                      </button>
                    )
                  })}
                </>
              )}
          </div>

          {canScrollRight && (
            <button
              onClick={() => scrollCategories('right')}
              className="absolute right-1 z-20 w-7 h-7 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full shadow-md text-gray-700 dark:text-gray-200 flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
              aria-label="Scroll categories right"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Promotional Carousel */}
      {!search && !grabAndGoOnly && items.some(i => i.is_special) && (
        <div className="max-w-lg mx-auto pt-6 pb-2">
          <div className="flex items-center gap-2 mb-3 px-4">
            <Star size={16} className="text-yellow-500 fill-yellow-500" />
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">Today's Special</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 px-4 snap-x snap-mandatory">
            {items.filter(i => i.is_special).map((item) => (
              <div key={`promo-${item.id}`} className="snap-center shrink-0 w-64 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                <div 
                  className="relative cursor-pointer" 
                  onClick={() => {
                    setViewingItem(item)
                    setCustomSelections({})
                  }}
                >
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover" />
                  ) : (
                    <div className="w-full h-32 bg-brand-primary-lighter dark:bg-brand-primary-shadow flex items-center justify-center border-b border-gray-50 dark:border-slate-800">
                      <span className="text-4xl">🌟</span>
                    </div>
                  )}
                  {item.is_instant && (
                    <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
                      <Flame size={12} className="fill-white" />
                      Instant
                    </div>
                  )}
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <div className="flex flex-col min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">{item.name}</h3>
                      {item.rating_count && item.rating_count > 0 ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star size={10} className="fill-amber-400 text-amber-400" />
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{Number(item.rating_average).toFixed(1)} <span className="text-gray-400">({item.rating_count})</span></span>
                        </div>
                      ) : null}
                    </div>
                    <span className="font-bold text-brand-accent dark:text-brand-primary flex-shrink-0">
                      {item.variants && item.variants.length > 0 ? `From ${formatCurrency(item.price)}` : formatCurrency(item.price)}
                    </span>
                  </div>
                  {item.description && <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 flex-1">{item.description}</p>}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.tags.map((tag, idx) => (
                        <span key={idx} className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-700">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-auto pt-2">
                    {(() => {
                      const qty = getItemQuantity(item.id)
                      const outOfStock = item.stock_quantity === 0
                      const hasCustomizations = (item.customization_groups ?? []).length > 0 || (item.variants ?? []).length > 0

                      if (qty > 0 && !hasCustomizations) {
                        return (
                          <div className="flex items-center justify-between bg-brand-primary-lighter dark:bg-brand-primary-shadow rounded-xl p-1 shadow-inner border border-brand-primary-light dark:border-brand-primary-dark/30">
                            <button
                              onClick={() => {
                                updateQuantity(item.id, qty - 1)
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 text-brand-primary shadow-sm hover:scale-105 active:scale-95 transition-all"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="font-bold text-brand-primary-dark dark:text-brand-primary w-6 text-center">{qty}</span>
                            <button
                              onClick={() => {
                                handleAddItem(item)
                              }}
                              className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-primary text-white shadow-sm hover:scale-105 active:scale-95 transition-all"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        )
                      }
                      return (
                        <button
                          onClick={() => {
                            handleAddItem(item)
                          }}
                          disabled={outOfStock}
                          className="w-full h-9 flex items-center justify-center gap-1.5 rounded-xl bg-brand-accent dark:bg-brand-primary text-white font-semibold text-sm shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:bg-gray-300 dark:disabled:bg-slate-700"
                        >
                          <Plus size={16} />
                          {outOfStock ? 'Sold Out' : 'Add'}
                        </button>
                      )
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grab & Go only banner — shown when shop is offline but has instant items */}
      {grabAndGoOnly && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
            <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-400 text-sm">Kitchen is currently closed</p>
              <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">You can still order our ready-made Grab &amp; Go items below. They're ready immediately!</p>
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
          const hasAnyResults = categories.some((cat) => filteredItems(cat.id).length > 0)
          if (!hasAnyResults) {
            return (
              <div className="py-20 text-center">
                <p className="text-4xl mb-3">🔍</p>
                <p className="font-semibold text-gray-700 dark:text-gray-300">No items found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try a different search term</p>
              </div>
            )
          }
          return (
            <>
              {categories.map((cat) => {
                const catItems = filteredItems(cat.id)
                if (catItems.length === 0) return null

                return (
                  <div key={cat.id} ref={(el) => { if (el) categoryRefs.current[cat.id] = el }}>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{cat.name}</h2>
                    <div className="space-y-3">
                      {catItems.map((item) => {
                        const qty = getItemQuantity(item.id)
                        const outOfStock = item.stock_quantity === 0
                        const lowStock = item.stock_quantity !== null && item.stock_quantity > 0 && item.stock_quantity <= item.low_stock_threshold
                        const hasCustomizations = (item.customization_groups ?? []).length > 0 || (item.variants ?? []).length > 0
                        return (
                          <div
                            key={item.id}
                            className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 flex gap-3 shadow-sm transition-shadow hover:shadow-md"
                            style={{ animation: 'fadeIn 0.3s ease-out' }}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} loading="lazy" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-20 h-20 rounded-xl bg-brand-primary-lighter dark:bg-brand-primary-shadow flex items-center justify-center flex-shrink-0 border border-brand-primary-light dark:border-brand-primary-dark">
                                <span className="text-3xl">🍽️</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1.5 flex-wrap">
                                <p className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">{item.name}</p>
                                {item.rating_count && item.rating_count > 0 ? (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/30">
                                    <Star size={9} fill="currentColor" /> {Number(item.rating_average).toFixed(1)} ({item.rating_count})
                                  </span>
                                ) : null}
                                {item.is_popular && (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-brand-accent-light text-brand-accent px-1.5 py-0.5 rounded-full">
                                    <Star size={9} fill="currentColor" /> Popular
                                  </span>
                                )}
                                {item.calories && (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
                                    <Flame size={10} /> {item.calories} kcal
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p 
                                  onClick={() => setViewingItem(item)}
                                  className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2 cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                  {item.description}
                                </p>
                              )}
                              {item.tags && item.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {item.tags.map((tag, idx) => (
                                    <span key={idx} className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-700">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {lowStock && <p className="text-xs text-brand-primary mt-1">Only {item.stock_quantity} left</p>}
                              {outOfStock && <p className="text-xs text-red-500 mt-1">Out of stock</p>}
                              {hasCustomizations && !outOfStock && (
                                <p className="text-xs text-gray-400 mt-0.5">Customizable</p>
                              )}
                              <div className="flex items-center justify-between mt-2">
                                <span className="font-bold text-brand-accent dark:text-brand-primary text-sm sm:text-base">
                                  {item.variants && item.variants.length > 0 ? `From ${formatCurrency(item.price)}` : formatCurrency(item.price)}
                                </span>
                                {outOfStock ? (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-lg">Out of stock</span>
                                ) : qty === 0 || hasCustomizations ? (
                                  <button
                                    onClick={() => handleAddItem(item)}
                                    className="flex items-center gap-1 h-8 px-3 bg-brand-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
                                  >
                                    <Plus size={14} /> Add
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800 rounded-xl p-1">
                                    <button
                                      onClick={() => updateQuantity(item.id, qty - 1)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-300 shadow-sm hover:opacity-90 transition-colors"
                                    >
                                      <Minus size={13} />
                                    </button>
                                    <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-white">{qty}</span>
                                    <button
                                      onClick={() => addItem(item)}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-brand-primary text-white shadow-sm hover:opacity-90 transition-colors"
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

      {/* Item Details Popup */}
      {viewingItem && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setViewingItem(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {viewingItem.image_url ? (
              <div className="relative h-64 w-full bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                <img src={viewingItem.image_url} alt={viewingItem.name} loading="lazy" className="w-full h-full object-contain p-2" />
                <button 
                  onClick={() => setViewingItem(null)} 
                  className="absolute top-3 right-3 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                >
                  <XIcon size={18} />
                </button>
              </div>
            ) : (
              <div className="flex justify-end p-3 pb-0">
                <button onClick={() => setViewingItem(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <XIcon size={20} />
                </button>
              </div>
            )}
            
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg">{viewingItem.name}</h3>
                  {viewingItem.calories && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 mt-0.5 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-md">
                      <Flame size={12} /> {viewingItem.calories} kcal
                    </span>
                  )}
                </div>
                <span className="font-bold text-brand-accent dark:text-brand-primary-light shrink-0 mt-1">
                  {formatCurrency(viewingItem.price)}
                </span>
              </div>
              
              {viewingItem.tags && viewingItem.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {viewingItem.tags.map((tag, idx) => (
                    <span key={idx} className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-700">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-[40vh] overflow-y-auto no-scrollbar mb-5">
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{viewingItem.description}</p>
              </div>
              
              <button
                onClick={() => {
                  setViewingItem(null)
                  handleAddItem(viewingItem)
                }}
                className="w-full py-3.5 rounded-2xl font-bold text-sm bg-brand-primary text-white shadow-lg shadow-brand-primary/30 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customization selector sheet */}
      {customizeItem && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={() => setCustomizeItem(null)}>
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">{customizeItem.name}</h3>
              <button onClick={() => setCustomizeItem(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"><XIcon size={20} /></button>
            </div>
            
            {customizeItem.variants && customizeItem.variants.length > 0 && (
              <div className="space-y-2 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Size / Variant</span>
                  <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Required</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {customizeItem.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => !v.is_out_of_stock && setSelectedVariantId(v.id)}
                      disabled={v.is_out_of_stock}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center justify-between transition-all ${
                        v.is_out_of_stock 
                          ? 'bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-slate-700 cursor-not-allowed opacity-60'
                          : selectedVariantId === v.id 
                            ? 'bg-brand-primary text-white border-brand-primary' 
                            : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-brand-primary-light'
                      }`}
                    >
                      <span>{v.size} {v.unit || customizeItem.unit || ''}</span>
                      <div className="flex items-center gap-2">
                        {v.is_out_of_stock && <span className="text-[10px] uppercase tracking-wider font-bold text-red-500">Sold out</span>}
                        <span className={`opacity-80 text-xs ${v.is_out_of_stock ? 'line-through' : ''}`}>{formatCurrency(v.price)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {(customizeItem.customization_groups ?? []).map((group) => (
              <div key={group.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{group.name}</span>
                  {group.required && <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Required</span>}
                  {!group.required && <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">Optional</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.choices.map((choice, ci) => {
                    const cName = typeof choice === 'string' ? choice : choice.name
                    const cPrice = typeof choice === 'string' ? 0 : choice.price
                    const selected = (customSelections[group.name] ?? []).includes(cName)
                    return (
                      <button
                        key={`${cName}-${ci}`}
                        onClick={() => toggleCustomChoice(group, cName)}
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${selected ? 'bg-brand-primary text-white border-brand-primary' : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:border-brand-primary-light'}`}
                      >
                        {cName} {cPrice > 0 && <span className="opacity-90 ml-1">(+₹{cPrice})</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <button
              disabled={!canConfirmCustomization()}
              onClick={confirmCustomization}
              className={`w-full py-3 rounded-2xl font-semibold text-sm transition-all ${canConfirmCustomization() ? 'bg-brand-primary text-white hover:opacity-90 active:scale-[0.98]' : 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}
            >
              {(() => {
                const variantPrice = customizeItem.variants && customizeItem.variants.length > 0 ? (customizeItem.variants.find(v => v.id === selectedVariantId)?.price || customizeItem.price) : customizeItem.price
                const customsPrice = Object.entries(customSelections).flatMap(([group, choices]) =>
                  choices.map(choiceName => {
                    const groupObj = (customizeItem.customization_groups ?? []).find(g => g.name === group)
                    const choiceObj = (groupObj?.choices as any[])?.find(c => typeof c === 'string' ? c === choiceName : c.name === choiceName)
                    return typeof choiceObj === 'string' ? 0 : (choiceObj?.price || 0)
                  })
                ).reduce((sum, p) => sum + p, 0)
                return `Add to Cart — ${formatCurrency(variantPrice + customsPrice)}`
              })()}
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
              className="w-full bg-brand-primary text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-brand-primary ring-1 ring-white/20 dark:ring-white/10 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
                  {totalItems}
                </span>
                <span className="font-semibold">View Cart</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{formatCurrency(totalPrice + packingCharge)}</span>
                <ChevronRight size={18} />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
