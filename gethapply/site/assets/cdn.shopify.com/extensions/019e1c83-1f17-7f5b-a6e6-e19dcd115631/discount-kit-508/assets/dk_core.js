// DiscountKit Core - GWP Business Logic
// ES6 Module - browser guarantees single execution even with multiple script tags
// Requires: window.discount_kit.config and window.discount_kit.gift_products (set by core_script.liquid)

// Safe sessionStorage wrapper (handles private browsing mode)
function safeSessionStorage(action, key, value) {
  try {
    if (action === 'get') {
      return sessionStorage.getItem(key)
    } else if (action === 'set') {
      sessionStorage.setItem(key, value)
    } else if (action === 'remove') {
      sessionStorage.removeItem(key)
    }
  } catch (e) {
    // Private browsing mode or storage disabled
    return null
  }
}

// Safe console.table wrapper (handles browsers without support)
function safeConsoleTable(data) {
  if (typeof console.table === 'function') {
    console.table(data)
  } else {
    // Fallback for browsers without console.table
    console.log(data)
  }
}

// Debug mode controlled by query parameter and persisted in sessionStorage
// ?dk_debug=true - Enable debug mode (persists)
// ?dk_debug=false - Disable debug mode (clears)
const urlParams = new URLSearchParams(window.location.search)
const debugParam = urlParams.get('dk_debug')

if (debugParam === 'true') {
  safeSessionStorage('set', 'dk_debug', 'true')
} else if (debugParam === 'false') {
  safeSessionStorage('remove', 'dk_debug')
}

const DEBUG = safeSessionStorage('get', 'dk_debug') === 'true'

function debug(...args) {
  if (DEBUG) {
    // Auto-prepend styled prefix if first arg is a string starting with [DiscountKit Core]
    if (typeof args[0] === 'string' && args[0].startsWith('[DiscountKit Core]')) {
      const message = args[0].replace('[DiscountKit Core] ', '')
      console.log(
        '%c[DiscountKit Core]%c ' + message,
        'font-weight: bold; color: #008060',
        'color: inherit',
        ...args.slice(1),
      )
    } else {
      console.log(...args)
    }
  }
}

function debugWarn(...args) {
  if (DEBUG) {
    // Auto-prepend styled prefix if first arg is a string starting with [DiscountKit Core]
    if (typeof args[0] === 'string' && args[0].startsWith('[DiscountKit Core]')) {
      const message = args[0].replace('[DiscountKit Core] ', '')
      console.warn(
        '%c[DiscountKit Core]%c ' + message,
        'font-weight: bold; color: #008060',
        'color: inherit',
        ...args.slice(1),
      )
    } else {
      console.warn(...args)
    }
  }
}

// Always log initialization status
console.log('%c[DiscountKit Core]%c Script loaded', 'font-weight: bold; color: #008060', 'color: inherit', {
  debugMode: DEBUG,
})

class DiscountKit {
  get cart() {
    if (!this._cart) {
      return {}
    }

    return this._cart
  }

  set cart({ cart, collections, compare_at_prices }) {
    const newCart = {
      attributes: cart.attributes,
      currency: cart.currency,
      items: cart.items.map((item, index) => ({
        collections: collections[index],
        compareAtPrice: compare_at_prices[index],
        discounts: item.discounts,
        id: item.id,
        key: item.key,
        linePrice: item.original_line_price,
        price: item.original_price,
        productId: item.product_id,
        properties: item.properties,
        quantity: item.quantity,
        sellingPlanAllocation: item.selling_plan_allocation,
      })),
    }

    this._cart = newCart
  }

  get conversionRate() {
    return parseFloat(this.config.conversion_rate)
  }

  get discounts() {
    if (!this._discounts) {
      this._discounts = this.config.discounts || []
    }

    return this._discounts
  }

  get giftProducts() {
    if (!this._giftProducts) {
      this._giftProducts = (window.discount_kit.gift_products || []).map((item) => {
        return {
          ...item.product,
          options_with_values: item.options_with_values,
        }
      })
    }

    return this._giftProducts
  }

  constructor(shop, rate) {
    this.shop = shop
    this.config = window.discount_kit.config

    if (!this.config) {
      console.error('[DiscountKit Core] window.discount_kit.config not found')
      return
    }

    this.autoGift = this.config.auto_gift
    this.refresh = this.config.refresh_on_cart_change
    this.preventReaddRemovedGifts = this.config.prevent_readd_removed_gifts
    this.customCartUpdateEvent = this.config.custom_cart_update_event
    // Shops that should NOT have ?app=discount_kit parameter in cart API calls
    const excludedShops = ['697983-11.myshopify.com', 'checkout-ext-29293.myshopify.com']
    this.shouldAddAppParam = !excludedShops.includes(window.Shopify.shop)
    this.cart = {
      cart: this.config.cart,
      collections: this.config.collections,
      compare_at_prices: this.config.compare_at_prices,
    }
    this.rate = rate

    this._gwpDebounceTimer = null
    this._gwpInProgress = false
    this._gwpRequestBounced = false

    const cleanDiscounts = this.discounts.map((discount) => {
      return {
        config: discount.discountNode.config.value,
        discountId: discount.id,
        discountTitle: discount.discountTitle,
        discountType: discount.discountType,
        endsAt: discount.endsAt,
        startsAt: discount.startsAt,
      }
    })

    // Debug logging for initialization
    if (DEBUG) {
      console.group('%c[DiscountKit Core] Initialization', 'font-weight: bold; color: #008060')

      // Count GWP discounts
      const gwpDiscounts = this.discounts.filter((d) => d.discountType === 'GWP')
      const hasGiftProducts = window.discount_kit.gift_products && window.discount_kit.gift_products.length > 0

      // Overview table
      const customEventDisplay = this.customCartUpdateEvent
        ? this.customCartUpdateEvent === 'discount_kit:cart_changed'
          ? '⚙️ Default (PUB_SUB)'
          : `✅ ${this.customCartUpdateEvent}`
        : '❌ Not set'

      safeConsoleTable({
        'Total Discounts': this.discounts.length,
        'GWP Discounts': gwpDiscounts.length,
        'Gift Products Available': hasGiftProducts ? `✅ Yes (${window.discount_kit.gift_products.length})` : '❌ No',
        'Auto-Gift Enabled': this.autoGift ? '✅ Yes' : '❌ No',
        'Auto-Refresh on Change': this.refresh ? '✅ Yes' : '❌ No',
        'Custom Cart Event': customEventDisplay,
        'Cart API Param': this.shouldAddAppParam ? '✅ ?app=discount_kit' : '❌ Disabled',
      })

      // Analyze each GWP discount
      if (gwpDiscounts.length > 0) {
        gwpDiscounts.forEach((discount) => {
          const config = discount.discountNode.config.value
          console.group(`[DiscountKit Core] 📦 ${discount.discountTitle}`)

          // Build tier analysis data
          const tierData = config.tiers.map((tier, tierIndex) => {
            const getsRule = tier.gets.matchRule
            const targetQuantity = tier.gets.targetQuantity
            const selections = getsRule.type === 'productSelection' ? getsRule.selection : getsRule.include

            const isSingleSelection = selections.length === 1 && targetQuantity === 1

            let autoGiftable = '❌ No'
            let reason = `${selections.length} selections, qty: ${targetQuantity}`

            if (isSingleSelection) {
              if (getsRule.type === 'productSelection') {
                const selection = selections[0]
                const variantCount = selection.variants?.length || 0
                if (variantCount === 0 || variantCount === 1) {
                  autoGiftable = '✅ Yes'
                  reason = 'Single variant product'
                } else {
                  autoGiftable = '⚠️ Maybe'
                  reason = `${variantCount} variants`
                }
              } else {
                autoGiftable = '⚠️ Maybe'
                reason = 'Need to check variants'
              }
            }

            return {
              Tier: tierIndex,
              'Auto-Giftable': autoGiftable,
              Reason: reason,
              Buys: `${tier.buys.type === 'minimumQuantity' ? 'Qty' : 'Amt'} ≥ ${tier.buys.value}`,
              Gets: `${targetQuantity}x from ${selections.length} selection(s)`,
            }
          })

          safeConsoleTable(tierData)
          console.groupEnd()
        })
      }

      debug('[DiscountKit Core] ✓ Initialization complete')
      console.groupEnd()
    }

    document.dispatchEvent(
      new CustomEvent('discount_kit:ready', {
        detail: { discounts: cleanDiscounts },
      }),
    )

    // Listen for cart updates from dk_cart.js
    // dk_cart is now responsible for:
    // - Firing initial event on page load
    // - Detecting cart changes
    // - Deduplicating via cart signature
    // We just need to handle GWP when told to
    document.addEventListener('discount_kit:cart_updated', (e) => {
      this.cart = e.detail

      // Run GWP with debouncing to prevent concurrent operations
      if (!this._gwpInProgress) {
        this._gwpInProgress = true
        this.handleGWP()
      } else {
        this._gwpRequestBounced = true
      }

      clearTimeout(this._gwpDebounceTimer)
      this._gwpDebounceTimer = setTimeout(() => {
        this._gwpInProgress = false
        if (this._gwpRequestBounced) {
          this._gwpRequestBounced = false
          this.handleGWP()
        }
      }, 1000)
    })
  }

  isGiftSelectorEnabled() {
    if (this.config.gift_selector_enabled) {
      return true
    }

    return typeof window.dkOpenGiftSelector === 'function'
  }

  notifyCartChanged() {
    // Check if a custom event is configured (not empty and not the default)
    const hasCustomEvent = this.customCartUpdateEvent && this.customCartUpdateEvent !== 'discount_kit:cart_changed'

    // For excluded shops, skip PUB_SUB and only use custom event or rely on page refresh
    // If custom event is specified and refresh is disabled, fire custom event only
    if (!this.refresh && hasCustomEvent) {
      debug('[DiscountKit Core] 🔔 Firing custom event:', this.customCartUpdateEvent)
      document.dispatchEvent(
        new CustomEvent(this.customCartUpdateEvent, {
          detail: { source: 'discount-kit' },
        }),
      )
      window.dispatchEvent(
        new CustomEvent(this.customCartUpdateEvent, {
          detail: { source: 'discount-kit' },
        }),
      )
    } else if (
      this.shouldAddAppParam && // Only use PUB_SUB for non-excluded shops
      window.publish !== undefined &&
      typeof PUB_SUB_EVENTS !== 'undefined' &&
      PUB_SUB_EVENTS.cartUpdate
    ) {
      window.publish(PUB_SUB_EVENTS.cartUpdate, {
        source: 'discount-kit',
      })
    }

    document.dispatchEvent(new CustomEvent('discount_kit:cart_changed'))
  }

  // Gift with Purchase - Auto-Add Tracking

  buildCarturl(endpoint) {
    const base = `${window.Shopify.routes.root}cart/${endpoint}.js`
    return this.shouldAddAppParam ? `${base}?app=discount_kit` : base
  }

  getAutoAddedGifts() {
    const stored = safeSessionStorage('get', 'dk_auto_added_gifts')
    return stored ? JSON.parse(stored) : {}
  }

  saveAutoAddedGifts(tracking) {
    safeSessionStorage('set', 'dk_auto_added_gifts', JSON.stringify(tracking))
  }

  hasBeenAutoAdded(variantId, discountTitle) {
    const tracking = this.getAutoAddedGifts()
    const key = `${variantId}:${discountTitle}`
    return !!tracking[key]
  }

  markAsAutoAdded(variantId, discountTitle) {
    const tracking = this.getAutoAddedGifts()
    const key = `${variantId}:${discountTitle}`
    tracking[key] = Date.now()
    this.saveAutoAddedGifts(tracking)
    debug('[DiscountKit Core] ✓ Marked as auto-added:', {
      variantId,
      discountTitle,
    })
  }

  clearAutoAddedTracking(variantId, discountTitle) {
    const tracking = this.getAutoAddedGifts()
    const key = `${variantId}:${discountTitle}`
    if (tracking[key]) {
      delete tracking[key]
      this.saveAutoAddedGifts(tracking)
      debug('[DiscountKit Core] ✓ Cleared auto-add tracking:', {
        variantId,
        discountTitle,
      })
    }
  }

  // Gift with Purchase

  async handleGWP() {
    debug('[DiscountKit Core] 🎁 Running handleGWP')

    const gwpDiscounts = this.discounts.filter((discount) => {
      return discount.discountType === 'GWP'
    })

    debug('[DiscountKit Core] Total GWP discounts configured:', gwpDiscounts.length)

    const remove = this.checkForGiftsToRemove(gwpDiscounts)

    const productsToAdd = gwpDiscounts.flatMap((discount) => {
      return this.determineProductsToAdd(discount, remove)
    })

    const add = this.generateAdds(productsToAdd)

    document.dispatchEvent(
      new CustomEvent('discount_kit:gift_adjustments', {
        detail: { add, remove },
      }),
    )

    const singleVariantAdds = add.filter(
      (item) =>
        item.options.length === 1 && item.options[0].variants.length === 1 && item.options[0].variants[0].available,
    )

    if (
      add.length > 0 &&
      ((!this.autoGift && this.isGiftSelectorEnabled()) ||
        (this.isGiftSelectorEnabled() && !(singleVariantAdds.length === add.length)))
    ) {
      window.dkOpenGiftSelector(add)
      return
    }

    if (this.autoGift) {
      const filteredAdds = singleVariantAdds
        .filter((item) => {
          // Skip gifts already auto-added this session (if setting enabled)
          if (this.preventReaddRemovedGifts) {
            const variantId = item.options[0].variants[0].id
            return !this.hasBeenAutoAdded(variantId, item.discountTitle)
          }
          return true
        })
        .map((item) => {
          return {
            id: item.options[0].variants[0].id,
            quantity: item.quantity,
            properties: {
              _dk_gift: item.discountTitle,
            },
          }
        })

      if (Object.keys(remove).length > 0 || filteredAdds.length > 0) {
        try {
          let hasNetChange = false

          // Remove gifts that lost their discounts
          if (Object.keys(remove).length > 0) {
            // Clear tracking BEFORE removing (if setting enabled)
            if (this.preventReaddRemovedGifts) {
              this.cart.items
                .filter((item) => !!item.properties['_dk_gift'])
                .forEach((item) => {
                  if (remove[item.key] !== undefined) {
                    this.clearAutoAddedTracking(item.id, item.properties['_dk_gift'])
                  }
                })
            }

            await this.updateCart(remove)
            hasNetChange = true
          }

          // Add new gifts (this will auto-remove any that don't get discounts)
          if (filteredAdds.length > 0) {
            const addedSuccessfully = await this.addToCart(filteredAdds)
            if (addedSuccessfully) {
              hasNetChange = true

              // Mark gifts as auto-added (if setting enabled)
              if (this.preventReaddRemovedGifts) {
                filteredAdds.forEach((gift) => {
                  this.markAsAutoAdded(gift.id, gift.properties._dk_gift)
                })
              }
            }
          }

          // Only refresh if there was a net change to the cart
          if (hasNetChange) {
            this.notifyCartChanged()
            document.dispatchEvent(new CustomEvent('discount_kit:refresh_cart'))

            if (this.refresh) {
              window.location.reload()
            }
          } else {
            debug('[DiscountKit Core] ✋ No net cart change (added then removed broken gifts), skipping refresh')
          }
        } catch (e) {
          console.error('[DiscountKit Core] Error handling GWP:', e)
        }
      }
    }
  }

  checkForGiftsToRemove(gwpDiscounts) {
    // Get active GWP discount titles
    const activeDiscountTitles = gwpDiscounts.map((d) => d.discountTitle)

    debug('[DiscountKit Core] 🔍 Checking for gifts to remove')
    debug('[DiscountKit Core] Active GWP discounts:', activeDiscountTitles)

    const giftsInCart = this.cart.items.filter((item) => !!item.properties['_dk_gift'])
    debug(
      '[DiscountKit Core] Gifts in cart:',
      giftsInCart.map((item) => ({
        title: item.title,
        discount: item.properties['_dk_gift'],
        hasDiscounts: item.discounts.length > 0,
        price: item.price,
      })),
    )

    const productsToRemove = giftsInCart.filter((item) => {
      // Case 1: Gift has no discounts applied (prerequisites lost)
      const isZeroPriced = item.price === 0
      const hasNoGWPDiscount =
        !item.discounts.some((discount) => activeDiscountTitles.includes(discount.title)) && !isZeroPriced

      // Case 2: Gift's discount no longer exists in config (expired/deleted)
      const discountExpired = !activeDiscountTitles.includes(item.properties['_dk_gift'])

      if (hasNoGWPDiscount) {
        debug('[DiscountKit Core] ❌ Removing (no discount applied):', item.title)
      }
      if (discountExpired) {
        debug('[DiscountKit Core] ❌ Removing (discount expired/deleted):', {
          title: item.title,
          discount: item.properties['_dk_gift'],
          activeDiscounts: activeDiscountTitles,
        })
      }

      return hasNoGWPDiscount || discountExpired
    })

    if (productsToRemove.length === 0) {
      debug('[DiscountKit Core] ✓ No gifts to remove')
    }

    return productsToRemove.reduce((acc, item) => {
      return {
        ...acc,
        [item.key]: 0,
      }
    }, {})
  }

  classifyCartItems(discountTitle, discountConfig, cartItems) {
    const giftProducts = []
    const prereqProducts = []

    cartItems.forEach((item, index) => {
      const hasDiscountApplied = item.discounts.some((discount) => discount.title === discountTitle)
      const isZeroPricedGift = item.price === 0 && item.properties['_dk_gift'] === discountTitle
      if (hasDiscountApplied || isZeroPricedGift) {
        giftProducts.push(item)
      } else {
        let matchesPrereq = false

        if (discountConfig.matchRule.purchaseType === 'subscription' && !item.sellingPlanAllocation) {
          return
        } else if (discountConfig.matchRule.purchaseType === 'oneTime' && item.sellingPlanAllocation) {
          return
        }

        if (discountConfig.matchRule.excludeSale && item.compareAtPrice !== null) {
          return
        }

        if (discountConfig.matchRule.all) {
          matchesPrereq = true
        } else if (discountConfig.matchRule.type === 'productSelection') {
          matchesPrereq = discountConfig.matchRule.selection.some(
            (selection) =>
              `${selection.id}` === `${item.productId}` &&
              (selection.variants === null ||
                selection.variants.length === 0 ||
                selection.variants?.some((variant) => `${variant.id}` === `${item.id}`)),
          )
        } else if (discountConfig.matchRule.type === 'product') {
          matchesPrereq = discountConfig.matchRule.include.includes(`${item.productId}`)
        } else {
          matchesPrereq = discountConfig.matchRule.include.some((id) =>
            item.collections.some((collection) => `${collection.id}` === `${id}`),
          )
        }

        if (matchesPrereq) {
          prereqProducts.push(item)
        }
      }
    })

    return { giftProducts, prereqProducts }
  }

  determineProductsToAdd(discount, giftLinesToRemove) {
    const discountTitle = discount.discountTitle
    const discountConfig = discount.discountNode.config.value
    const prereqType = discountConfig.tiers[0].buys.type
    const conversionRate = discountConfig.currencyCode ? 1 : this.conversionRate

    const adjustedCartItems = this.cart.items.filter((item) => {
      return !Object.keys(giftLinesToRemove).some((giftLine) => {
        return item.key === giftLine
      })
    })

    let { giftProducts, prereqProducts } = this.classifyCartItems(discountTitle, discountConfig, adjustedCartItems)

    let prereqTotal = prereqProducts.reduce((acc, product) => {
      return prereqType === 'minimumQuantity' ? acc + product.quantity : acc + product.linePrice
    }, 0)

    const highestPossibleTier = discountConfig.tiers.findLastIndex((tier) => {
      return prereqType === 'minimumQuantity'
        ? prereqTotal >= tier.buys.value
        : prereqTotal >= tier.buys.value * conversionRate
    })

    if (highestPossibleTier < 0) {
      return []
    }

    return discountConfig.tiers.flatMap((tier, index) => {
      if (index <= highestPossibleTier) {
        const tierSelectionType = tier.gets.matchRule.type
        const validProducts =
          tier.gets.matchRule.type === 'productSelection' ? tier.gets.matchRule.selection : tier.gets.matchRule.include

        const giftsRequired = tier.gets.targetQuantity
        let giftsInCart = 0

        while (giftsInCart < giftsRequired) {
          const matchedGiftIndex = giftProducts.findIndex((product) => {
            return tierSelectionType === 'productSelection'
              ? validProducts.some(
                  (selection) =>
                    `${selection.id}` === `${product.productId}` &&
                    (selection.variants === null ||
                      selection.variants.length === 0 ||
                      selection.variants?.some((variant) => `${variant.id}` === `${product.id}`)),
                )
              : validProducts.includes(`${product.productId}`)
          })

          if (matchedGiftIndex < 0) {
            break
          }

          const matchedGift = giftProducts.splice(matchedGiftIndex, 1)[0]

          const giftsNeeded = giftsRequired - giftsInCart

          if (matchedGift.quantity >= giftsNeeded) {
            giftsInCart += giftsNeeded

            if (matchedGift.quantity > giftsNeeded) {
              giftProducts.splice(matchedGiftIndex, 0, {
                ...matchedGift,
                quantity: matchedGift.quantity - giftsNeeded,
              })
            }
          } else {
            giftsInCart += matchedGift.quantity
          }
        }

        if (giftsInCart < giftsRequired) {
          return [
            {
              discountId: discount.id,
              discountTitle,
              tier: index,
              quantityRequired: giftsRequired - giftsInCart,
            },
          ]
        } else {
          return []
        }
      } else {
        return []
      }
    })
  }

  generateAdds(productsToAdd) {
    return productsToAdd.flatMap((product) => {
      const matchingDiscount = this.discounts.find((discount) => discount.id === product.discountId)
      const config = matchingDiscount.discountNode.config.value
      const selections = config.tiers[product.tier].gets.matchRule.selection

      const options = selections.flatMap((selection) => {
        const matchingProduct = this.giftProducts.find((product) => `${product.id}` === `${selection.id}`)

        if (!matchingProduct) {
          return []
        }

        return [
          {
            id: matchingProduct.id,
            image: matchingProduct.featured_image,
            options: matchingProduct.options_with_values,
            priceRange: {
              min: matchingProduct.price_min / 100,
              max: matchingProduct.price_max / 100,
            },
            title: matchingProduct.title,
            variants:
              selection.variants === null || selection.variants.length === 0
                ? matchingProduct.variants.map((variant) => ({
                    available: variant.available,
                    id: variant.id,
                    image: variant.featured_image?.src || null,
                    options: variant.options,
                    price: variant.price,
                    title: variant.title,
                  }))
                : matchingProduct.variants.flatMap((variant) => {
                    return selection.variants.some((selectedVariant) => `${selectedVariant.id}` === `${variant.id}`)
                      ? [
                          {
                            available: variant.available,
                            id: variant.id,
                            title: variant.title,
                            image: variant.featured_image?.src || null,
                            options: variant.options,
                            price: variant.price,
                          },
                        ]
                      : []
                  }),
          },
        ]
      })

      // If all variants are unavailable, don't add this gift
      if (options.every((option) => option.variants.every((v) => !v.available))) {
        return []
      }

      return [
        {
          discountId: product.discountId,
          discountTitle: product.discountTitle,
          discountTier: product.tier,
          quantity: product.quantityRequired,
          options,
        },
      ]
    })
  }

  async addToCart(adds) {
    const addResponse = await fetch(this.buildCarturl('add'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: adds,
      }),
    })

    if (addResponse.status >= 400 && addResponse.status < 600) {
      throw new Error('Failed to add products')
    }

    const json = await addResponse.json()

    if (!json.items) {
      throw new Error('Failed to add products')
    }

    // Check which gifts didn't get discounts (broken config)
    // Zero-priced gifts won't receive discounts from Shopify (nothing to discount)
    // so we exclude them from this check to allow $0 gifts to be added
    const giftsWithoutDiscounts = json.items.filter((item) => {
      const hasExpectedDiscount = item.discounts.some((discount) => discount.title === item.properties._dk_gift)
      const isZeroPriced = item.price === 0
      // Only flag as broken if it has no discount AND is not zero-priced
      return !hasExpectedDiscount && !isZeroPriced
    })

    // Immediately remove gifts that didn't get discounts
    // This prevents leaving full-price items in cart
    if (giftsWithoutDiscounts.length > 0) {
      if (DEBUG) {
        console.group('%c[DiscountKit Core] ⚠️ Broken GWP Config Detected', 'color: #ffa500; font-weight: bold')
        console.warn(
          '%c[DiscountKit Core]%c The following gifts did not receive discounts and will be removed:',
          'font-weight: bold; color: #008060',
          'color: inherit',
        )
        safeConsoleTable(
          giftsWithoutDiscounts.map((item) => ({
            Gift: item.properties._dk_gift,
            Product: item.title || item.product_title,
            Price: `${item.price / 100} ${this.cart.currency}`,
          })),
        )
        console.groupEnd()
      }

      const updates = giftsWithoutDiscounts.reduce((acc, item) => {
        acc[item.key] = 0
        return acc
      }, {})

      await this.updateCart(updates)
    }

    // Return whether we actually added anything (net change)
    return json.items.length - giftsWithoutDiscounts.length > 0
  }

  async updateCart(updates, attributes = {}) {
    return await fetch(this.buildCarturl('update'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updates: updates,
        attributes: attributes,
      }),
    }).then((res) => {
      if (res.status >= 400 && res.status < 600) {
        throw new Error('Failed to update cart')
      }

      return res.json()
    })
  }
}

// Export class and create singleton instance
window.discount_kit.DiscountKit = DiscountKit
window.discount_kit.core = new DiscountKit(window.Shopify.shop, window.Shopify.currency.rate)
