// DiscountKit Cart State Manager
// ES6 Module - browser guarantees single execution even with multiple script tags

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

// Safe console.table wrapper (handles browsers without support)
function safeConsoleTable(data) {
  if (typeof console.table === 'function') {
    console.table(data)
  } else {
    // Fallback for browsers without console.table
    console.log(data)
  }
}

function debug(...args) {
  if (DEBUG) {
    // Auto-prepend styled prefix if first arg is a string starting with [DiscountKit Cart]
    if (
      typeof args[0] === 'string' &&
      args[0].startsWith('[DiscountKit Cart]')
    ) {
      const message = args[0].replace('[DiscountKit Cart] ', '')
      console.log(
        '%c[DiscountKit Cart]%c ' + message,
        'font-weight: bold; color: #0078d4',
        'color: inherit',
        ...args.slice(1),
      )
    } else {
      console.log(...args)
    }
  }
}

// Always log initialization status
console.log(
  '%c[DiscountKit Cart]%c Script loaded',
  'font-weight: bold; color: #0078d4',
  'color: inherit',
  { debugMode: DEBUG },
)

if (DEBUG) {
  console.group(
    '%c[DiscountKit Cart] Initialization',
    'font-weight: bold; color: #0078d4',
  )
  debug('[DiscountKit Cart] ✓ Cart state manager starting')
  debug('[DiscountKit Cart] ✓ Debug mode enabled')
}

// Restore last cart signature from sessionStorage (persists across page loads)
let lastCartSignature =
  safeSessionStorage('get', 'dk_last_cart_signature') || null
debug(
  '[DiscountKit Cart] ✓ Restored last signature:',
  lastCartSignature || '(none)',
)

function getCartSignature(cart) {
  // Create signature from variant IDs + quantities
  const itemsSignature = cart.items
    .map((item) => `${item.variant_id || item.id}:${item.quantity}:${item.selling_plan_allocation?.selling_plan?.id || 0}`)
    .sort()
    .join('|')

  // Include active GWP discounts from config
  // This ensures signature changes when discounts expire/activate
  const gwpDiscounts = (window.discount_kit?.config?.discounts || [])
    .filter(d => d.discountType === 'GWP')
    .map(d => d.discountTitle)
    .sort()
    .join(',')

  return `${itemsSignature}::gwp[${gwpDiscounts}]`
}

async function fetchCart() {
  debug('[DiscountKit Cart] → Fetching cart proxy...')
  try {
    const cartReq = await fetch(
      `${window.Shopify.routes.root}apps/discountkit/cart?app=discount_kit`,
    )

    if (!cartReq.ok) {
      console.error(
        '%c[DiscountKit Cart]%c Failed to fetch cart',
        'font-weight: bold; color: #0078d4',
        'color: #d72c0d',
        cartReq.status,
      )
      return
    }

    const {
      cart,
      item_collections: collections,
      item_compare_at_prices: compare_at_prices,
    } = await cartReq.json()

    // Calculate signature from cart data
    const currentSignature = getCartSignature(cart)

    if (DEBUG) {
      console.log(
        '%c[DiscountKit Cart]%c Cart comparison:',
        'font-weight: bold; color: #0078d4',
        'color: inherit',
      )
      safeConsoleTable({
        'Cart Items': cart.items.length,
        'Current Signature': currentSignature || '(empty)',
        'Previous Signature': lastCartSignature || '(none)',
        Changed: currentSignature !== lastCartSignature ? '✅ YES' : '✋ NO',
      })
    }

    // Check if cart actually changed by comparing signature
    // Exception: On cart page for specific shops, always run GWP to handle redirect race condition
    const isCartPage = /\/cart/.test(window.location.pathname)
    const shopNeedsCartPageException = window.Shopify?.shop === 'felix-norton.myshopify.com'
    const skipSignatureCheck = isCartPage && shopNeedsCartPageException

    if (currentSignature === lastCartSignature && !skipSignatureCheck) {
      debug(
        '[DiscountKit Cart] ✋ Cart unchanged (signature match), skipping event',
      )
      return
    }

    if (skipSignatureCheck) {
      debug(
        '[DiscountKit Cart] ⚠️ Cart page exception: running GWP despite signature match',
      )
    }

    // Cart changed! Update signature and persist to sessionStorage
    debug(
      '[DiscountKit Cart] ✅ Cart changed! Firing discount_kit:cart_updated event',
    )
    lastCartSignature = currentSignature
    safeSessionStorage('set', 'dk_last_cart_signature', currentSignature)

    document.dispatchEvent(
      new CustomEvent('discount_kit:cart_updated', {
        detail: {
          cart,
          collections,
          compare_at_prices,
        },
      }),
    )
  } catch (error) {
    console.error(
      '%c[DiscountKit Cart]%c Error fetching cart',
      'font-weight: bold; color: #0078d4',
      'color: #d72c0d',
      error,
    )
  }
}

function observeCartChanges() {
  debug('[DiscountKit Cart] → Setting up PerformanceObserver...')

  // Use PerformanceObserver to detect cart endpoint requests (non-invasive)
  const cartObserver = new PerformanceObserver((entryList) => {
    entryList.getEntries().forEach((entry) => {
      const initiatorType = entry.initiatorType

      // Only check fetch and XHR requests
      if (
        initiatorType &&
        ['xmlhttprequest', 'fetch'].includes(initiatorType)
      ) {
        // Check if it's a cart change endpoint
        const isCartChangeRequest = /\/cart\/(add|update|change|clear)/.test(
          entry.name,
        )
        // Don't trigger on our own cart proxy requests
        const isOurRequest = /app=discount_kit/.test(entry.name)

        if (isCartChangeRequest && !isOurRequest) {
          debug(
            '[DiscountKit Cart] 🔔 Detected cart request:',
            initiatorType,
            entry.name,
          )
          fetchCart()
        }
      }
    })
  })

  cartObserver.observe({ entryTypes: ['resource'] })
  debug('[DiscountKit Cart] ✓ Observer active, watching for cart requests')
}

observeCartChanges()

// Fire initial check on page load
// Signature tracking will prevent firing event if cart hasn't changed
// This means GWP only runs when needed (first visit or cart changed)
debug('[DiscountKit Cart] → Running initial cart check...')
fetchCart()

document.addEventListener('discount_kit:refresh_cart', async (e) => {
  debug('[DiscountKit Cart] 🔄 Manual refresh requested')
  await fetchCart()
})

if (DEBUG) {
  debug('[DiscountKit Cart] ✓ Ready!')
  console.groupEnd()
}
