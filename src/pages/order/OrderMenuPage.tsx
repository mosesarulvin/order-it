import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Minus, Search, Star, Clock, ChevronLeft, ChevronRight, UtensilsCrossed, X as XIcon, User, Flame, Eye, ArrowUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { useCustomerOrderNotifications } from '@/hooks/useCustomerOrderNotifications'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MenuItemSkeleton } from '@/components/ui/Skeleton'
import { getSessionToken, getCachedIdentity } from '@/lib/customerSession'
import type { CustomizationGroup, Shop, MenuCategory, MenuItem } from '@/types'
import toast from 'react-hot-toast'

// Renders `* foo` / `- foo` line-prefixed text as an actual bullet list.
function DescriptionBlock({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const allBullets = lines.length >= 2 && lines.every((l) => /^[*\-•]\s+/.test(l))
  if (allBullets) {
    return (
      <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="mt-2 w-1 h-1 rounded-full bg-brand-primary flex-shrink-0" aria-hidden />
            <span>{line.replace(/^[*\-•]\s+/, '')}</span>
          </li>
        ))}
      </ul>
    )
  }
  return <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{text}</p>
}

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
  const [popupQty, setPopupQty] = useState(1)
  const categoryRefs = useRef<Record<string, HTMLDivElement>>({})
  const categoryChipRefs = useRef<Record<string, HTMLButtonElement>>({})
  const categoryNavRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  // Suppresses scroll-spy while a click-to-scroll animation is in flight.
  const suppressSpyRef = useRef(false)

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

  // Scroll-spy: as the customer scrolls the page, highlight the current category.
  useEffect(() => {
    if (loading || search) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressSpyRef.current) return
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (!visible) return
        const id = (visible.target as HTMLElement).dataset.categoryId
        if (id) setActiveCategory(id)
      },
      { rootMargin: '-120px 0px -60% 0px', threshold: [0, 0.1] },
    )
    Object.values(categoryRefs.current).forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [loading, search, categories])

  // Keep the active category chip in view as it changes.
  useEffect(() => {
    if (!activeCategory) return
    const chip = categoryChipRefs.current[activeCategory]
    chip?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeCategory])

  // Back-to-top FAB appears after the customer has scrolled past the hero.
  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Reset qty & lock background scroll when the detail popup opens.
  useEffect(() => {
    if (!viewingItem) return
    setPopupQty(1)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewingItem(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [viewingItem])

  const scrollCategories = (direction: 'left' | 'right') => {
    const el = categoryNavRef.current
    if (!el) return
    const scrollAmount = direction === 'left' ? -180 : 180
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' })
  }

  const { items: cartItems, addItem, updateQuantity, getTotalItems, getTotalPrice, setShopSlug, shopSlug, clearCart, getPackingCharge } = useCartStore()

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
    if (shop && shop.ordering_enabled === false) {
      toast.error('This menu is view-only — please order at the counter')
      return
    }
    if (item.is_display_only) {
      toast.error(`"${item.name}" is menu-only — please order at the counter`)
      return
    }
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
    suppressSpyRef.current = true
    setActiveCategory(categoryId)
    const el = categoryRefs.current[categoryId]
    if (el) {
      const offset = 90
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
    // Match the smooth-scroll duration on most browsers before re-enabling spy.
    window.setTimeout(() => { suppressSpyRef.current = false }, 700)
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
        className={`relative text-white pt-safe px-4 pb-6 transition-all duration-300 bg-cover bg-center ${!shop?.cover_image_url ? 'gradient-brand-header' : ''
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
              {(() => {
                const token = slug ? getSessionToken(slug) : null
                const identity = slug ? getCachedIdentity(slug) : null
                const initials = identity?.name
                  ? identity.name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
                  : null

                return (
                  <button
                    onClick={() => {
                      if (token) {
                        navigate(`/order/${slug}/profile/dashboard`)
                      } else {
                        navigate(`/order/${slug}/profile`)
                      }
                    }}
                    title={identity?.name ? `Signed in as ${identity.name}` : 'My Profile'}
                    className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0 relative"
                  >
                    {token && initials ? (
                      <span className="text-xs font-bold text-white tracking-wider">{initials}</span>
                    ) : (
                      <User size={20} className="text-white" />
                    )}
                    {token && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 border-2 border-brand-500 rounded-full" />
                    )}
                  </button>
                )
              })()}
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
              className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar w-full [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-16px),transparent)]"
              style={{ scrollbarWidth: 'none' }}
            >
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-9 w-24 bg-gray-100 dark:bg-slate-800 rounded-full animate-pulse flex-shrink-0" />
                ))
                : (
                  <>
                    {categories.filter(cat => filteredItems(cat.id).length > 0).map((cat) => {
                      const catItems = filteredItems(cat.id)
                      const catImage = catItems.find((i) => (i as any).is_category_image && i.image_url)?.image_url || catItems.find((i) => i.image_url)?.image_url
                      const active = activeCategory === cat.id
                      return (
                        <button
                          key={cat.id}
                          ref={(el) => { if (el) categoryChipRefs.current[cat.id] = el }}
                          onClick={() => scrollToCategory(cat.id)}
                          aria-pressed={active}
                          className={`flex-shrink-0 inline-flex items-center gap-2 h-10 pl-1.5 pr-4 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${active
                              ? 'bg-brand-primary text-white shadow-sm shadow-brand-primary/40 ring-2 ring-brand-primary/20'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                            }`}
                        >
                          {catImage ? (
                            <img
                              src={catImage}
                              alt={cat.name}
                              className="w-7 h-7 rounded-full object-cover border border-white/40 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                              active ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-900 text-gray-500'
                            }`}>
                              🍽️
                            </div>
                          )}
                          <span>{cat.name}</span>
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

                      if (shop?.ordering_enabled === false || item.is_display_only) {
                        return (
                          <div className="w-full h-9 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                            <Eye size={14} /> Menu only
                          </div>
                        )
                      }

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

      {/* Menu-only banner — shown when shop has disabled online ordering */}
      {shop && shop.ordering_enabled === false && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
            <Eye size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900 dark:text-blue-300 text-sm">This menu is for viewing only</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Online ordering is currently disabled. Please order at the counter.
              </p>
            </div>
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
                  <div key={cat.id} data-category-id={cat.id} ref={(el) => { if (el) categoryRefs.current[cat.id] = el }} className="scroll-mt-24">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="inline-block w-1 h-5 rounded-full bg-brand-primary" aria-hidden />
                        {cat.name}
                      </h2>
                      <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-800/60 px-2.5 py-1 rounded-full">
                        {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {catItems.map((item) => {
                        const qty = getItemQuantity(item.id)
                        const outOfStock = item.stock_quantity === 0
                        const lowStock = item.stock_quantity !== null && item.stock_quantity > 0 && item.stock_quantity <= item.low_stock_threshold
                        const hasCustomizations = (item.customization_groups ?? []).length > 0 || (item.variants ?? []).length > 0
                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setViewingItem(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewingItem(item) } }}
                            className="group bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 p-4 flex gap-3 shadow-sm transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-brand-primary-light dark:hover:border-brand-primary-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/60"
                            style={{ animation: 'fadeIn 0.3s ease-out' }}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} loading="lazy" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center flex-shrink-0 border border-gray-100 dark:border-slate-700/60">
                                <UtensilsCrossed size={22} strokeWidth={1.5} className="text-gray-300 dark:text-slate-600" />
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
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-relaxed line-clamp-2">
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
                                <span className="font-extrabold text-brand-accent dark:text-brand-primary text-base sm:text-lg tracking-tight">
                                  {item.variants && item.variants.length > 0 ? `From ${formatCurrency(item.price)}` : formatCurrency(item.price)}
                                </span>
                                {(shop?.ordering_enabled === false || item.is_display_only) ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/40 px-2.5 py-1 rounded-lg">
                                    <Eye size={12} /> Menu only
                                  </span>
                                ) : outOfStock ? (
                                  <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-lg">Out of stock</span>
                                ) : qty === 0 || hasCustomizations ? (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleAddItem(item) }}
                                    className="flex items-center gap-1 h-9 px-4 bg-brand-primary text-white rounded-xl text-sm font-semibold shadow-sm shadow-brand-primary/30 hover:opacity-90 active:scale-95 transition-all"
                                  >
                                    <Plus size={14} /> Add
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-800 rounded-xl p-1" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, qty - 1) }}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-300 shadow-sm hover:opacity-90 transition-colors"
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="w-5 text-center text-sm font-bold text-gray-900 dark:text-white">{qty}</span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); addItem(item) }}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand-primary text-white shadow-sm hover:opacity-90 transition-colors"
                                    >
                                      <Plus size={14} />
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
      {viewingItem && (() => {
        const hasChoice = (viewingItem.customization_groups?.length ?? 0) > 0
                       || (viewingItem.variants?.length ?? 0) > 0
        const outOfStock = viewingItem.stock_quantity === 0
        const lowStock = viewingItem.stock_quantity !== null
                      && viewingItem.stock_quantity > 0
                      && viewingItem.stock_quantity <= viewingItem.low_stock_threshold
        const blocked = shop?.ordering_enabled === false || viewingItem.is_display_only
        const priceLabel = viewingItem.variants && viewingItem.variants.length > 0
          ? `From ${formatCurrency(viewingItem.price)}`
          : formatCurrency(viewingItem.price)
        const totalLabel = formatCurrency(viewingItem.price * popupQty)
        const close = () => setViewingItem(null)

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-detail-title"
            className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
            style={{ animation: 'fadeIn 0.18s ease-out' }}
            onClick={close}
          >
            <div
              className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] sm:max-h-[86vh] flex flex-col overflow-hidden"
              style={{ animation: 'sheetUp 0.32s cubic-bezier(0.22, 1, 0.36, 1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile drag-handle affordance */}
              <div className="sm:hidden pt-2 pb-1 flex justify-center flex-shrink-0">
                <span className="block w-10 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700" />
              </div>

              {/* Hero image or clean header */}
              {viewingItem.image_url ? (
                <div className="relative aspect-[4/3] w-full bg-gray-100 dark:bg-slate-950 flex-shrink-0">
                  <img
                    src={viewingItem.image_url}
                    alt={viewingItem.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    {viewingItem.is_popular && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-brand-primary text-white px-2 py-1 rounded-full shadow-md">
                        <Star size={10} fill="currentColor" /> Popular
                      </span>
                    )}
                    {viewingItem.is_instant && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-orange-500 text-white px-2 py-1 rounded-full shadow-md">
                        <Flame size={10} /> Instant
                      </span>
                    )}
                    {viewingItem.rating_count && viewingItem.rating_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-white/95 text-gray-900 px-2 py-1 rounded-full shadow-md">
                        <Star size={10} fill="currentColor" className="text-amber-400" />
                        {Number(viewingItem.rating_average).toFixed(1)}
                        <span className="text-gray-500 font-medium">({viewingItem.rating_count})</span>
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={close}
                    aria-label="Close"
                    className="absolute top-3 right-3 w-9 h-9 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/70 active:scale-95 transition-all"
                  >
                    <XIcon size={18} />
                  </button>
                </div>
              ) : (
                <div className="relative pt-6 pb-2 px-5 flex-shrink-0">
                  <button
                    onClick={close}
                    aria-label="Close"
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              )}

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 id="item-detail-title" className="font-bold text-gray-900 dark:text-white text-xl leading-tight">
                    {viewingItem.name}
                  </h3>
                  <span className="font-extrabold text-brand-accent dark:text-brand-primary text-lg tracking-tight flex-shrink-0">
                    {priceLabel}
                  </span>
                </div>

                {(viewingItem.calories || outOfStock || lowStock) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {viewingItem.calories && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-md">
                        <Flame size={12} /> {viewingItem.calories} kcal
                      </span>
                    )}
                    {outOfStock && (
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-md">
                        Out of stock
                      </span>
                    )}
                    {lowStock && (
                      <span className="text-xs font-semibold text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-md">
                        Only {viewingItem.stock_quantity} left
                      </span>
                    )}
                  </div>
                )}

                {viewingItem.tags && viewingItem.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {viewingItem.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-slate-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {viewingItem.description && (
                  <div className="mt-4">
                    <DescriptionBlock text={viewingItem.description} />
                  </div>
                )}

                {viewingItem.variants && viewingItem.variants.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Available sizes</p>
                    <div className="flex flex-wrap gap-2">
                      {viewingItem.variants.map((v) => (
                        <span key={v.id} className={`inline-flex items-center gap-2 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${v.is_out_of_stock ? 'bg-gray-50 dark:bg-slate-800 text-gray-400 border-gray-100 dark:border-slate-700 line-through' : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-700'}`}>
                          {v.size}{v.unit ? ` ${v.unit}` : ''} · <span className={`font-bold ${v.is_out_of_stock ? '' : 'text-brand-accent dark:text-brand-primary'}`}>{formatCurrency(v.price)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky footer */}
              <div
                className="flex-shrink-0 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
              >
                {blocked ? (
                  <div className="w-full py-3 rounded-2xl font-semibold text-sm bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-300 flex items-center justify-center gap-2">
                    <Eye size={16} /> Menu only — order at counter
                  </div>
                ) : outOfStock ? (
                  <div className="w-full py-3 rounded-2xl font-semibold text-sm bg-gray-100 dark:bg-slate-800 text-gray-400 flex items-center justify-center gap-2">
                    Out of stock
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {!hasChoice && (
                      <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800 rounded-2xl p-1">
                        <button
                          onClick={() => setPopupQty((q) => Math.max(1, q - 1))}
                          disabled={popupQty <= 1}
                          aria-label="Decrease quantity"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <Minus size={16} />
                        </button>
                        <span className="w-6 text-center font-bold text-gray-900 dark:text-white tabular-nums">{popupQty}</span>
                        <button
                          onClick={() => setPopupQty((q) => Math.min(99, q + 1))}
                          aria-label="Increase quantity"
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-primary text-white shadow-sm active:scale-95 transition-all"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (hasChoice) {
                          handleAddItem(viewingItem)
                          close()
                        } else {
                          for (let i = 0; i < popupQty; i++) addItem(viewingItem)
                          toast.success(`${popupQty} × ${viewingItem.name} added`, { icon: '🛒' })
                          close()
                        }
                      }}
                      className="flex-1 h-12 rounded-2xl font-bold text-sm bg-brand-primary text-white shadow-lg shadow-brand-primary/30 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                      {hasChoice ? (
                        <>Choose options — {priceLabel}</>
                      ) : (
                        <>
                        {/* <Plus size={16} />  */}
                        Add
                        {/* — {totalLabel} */}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

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
                      className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center justify-between transition-all ${v.is_out_of_stock
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

      {/* Back-to-top FAB — appears after scrolling past the hero */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          aria-label="Back to top"
          className={`fixed right-4 z-20 w-11 h-11 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-gray-700 dark:text-gray-200 hover:scale-105 active:scale-95 transition-all ${totalItems > 0 && shop?.ordering_enabled !== false ? 'bottom-24' : 'bottom-6'}`}
          style={{ animation: 'fadeIn 0.2s ease-out' }}
        >
          <ArrowUp size={18} />
        </button>
      )}

      {/* Floating cart button */}
      {totalItems > 0 && shop?.ordering_enabled !== false && (
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
                <span
                  key={totalItems}
                  className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ animation: 'popIn 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                >
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
