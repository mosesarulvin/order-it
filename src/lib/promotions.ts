import type { MenuItem, Promotion } from '@/types'

export function getDiscountedPrice(item: MenuItem, promotions: Promotion[]): { price: number; originalPrice: number; hasDiscount: boolean } {
  const originalPrice = item.price
  
  if (!promotions || promotions.length === 0) {
    return { price: originalPrice, originalPrice, hasDiscount: false }
  }

  // Find the best promotion (largest discount) that applies to this item
  // Target rules: 'all', or 'category' matching item.category_id, or 'item' matching item.id
  const applicablePromotions = promotions.filter(p => {
    if (!p.is_active) return false
    if (p.valid_until && new Date(p.valid_until) < new Date()) return false
    
    if (p.target_type === 'all') return true
    if (p.target_type === 'category' && p.target_id === item.category_id) return true
    if (p.target_type === 'item' && p.target_id === item.id) return true
    return false
  })

  if (applicablePromotions.length === 0) {
    return { price: originalPrice, originalPrice, hasDiscount: false }
  }

  // Calculate the lowest possible price across all applicable promotions
  let bestPrice = originalPrice

  for (const promo of applicablePromotions) {
    let currentPrice = originalPrice
    
    if (promo.discount_type === 'percentage') {
      currentPrice = originalPrice * (1 - promo.discount_value / 100)
    } else if (promo.discount_type === 'flat') {
      currentPrice = originalPrice - promo.discount_value
    }
    
    // Ensure price doesn't go below 0
    currentPrice = Math.max(0, currentPrice)
    
    if (currentPrice < bestPrice) {
      bestPrice = currentPrice
    }
  }

  return { 
    price: bestPrice, 
    originalPrice, 
    hasDiscount: bestPrice < originalPrice 
  }
}
