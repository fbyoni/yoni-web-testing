const GIFT_VARIANT_BY_OPTIONS_QUERY = `#graphql
  query VariantByOptions($productId: ID!, $options: [SelectedOptionInput!]!, $country: CountryCode) @inContext(country: $country) {
    product(id: $productId) {
      variantBySelectedOptions(selectedOptions: $options) {
        availableForSale
        image {
          url
        }
        id
        priceV2 {
          amount
          currencyCode
        }
        selectedOptions {
          name
          value
        }
        title
      }
    }
  }
`

async function dkAddToCart(additions) {
  return await fetch(
    `${window.Shopify.routes.root}cart/add.js?app=discount_kit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: additions,
      }),
    },
  ).then((res) => res.json())
}

class GiftSelector extends HTMLElement {
  get add() {
    return this.adds[this.addIndex]
  }

  get customCSS() {
    return this.getAttribute('customCSS')
  }

  get refresh() {
    return this.getAttribute('refresh')
  }

  get shouldShow() {
    const isCartPage = location.pathname === '/cart'
    const stopShowingCount = parseInt(this.getAttribute('stopShowingAfter'))

    if (this.getAttribute('showOnCartPage') === 'true') {
      return isCartPage
    } else if (stopShowingCount > 0) {
      return (
        (parseInt(
          (
            document.cookie
              .split('; ')
              .find((c) => c.startsWith('dk_gift_selector_closed_count')) ?? ''
          ).split('=')[1],
        ) || 0) < stopShowingCount
      )
    } else {
      return true
    }
  }

  get storefrontApiKey() {
    return this.getAttribute('storefrontApiKey')
  }

  constructor() {
    super()
    this.formatter = Intl.NumberFormat(this.locale, {
      style: 'currency',
      currency: window.Shopify.currency.active,
    })
    this.modalOpen = false
    this.addIndex = 0
    this.adds = []
    this.products = []
    this.slots = []
    this.slotIndex = 0
    this.shadow = this.attachShadow({ mode: 'open' })

    if (this.customCSS) {
      const style = document.createElement('style')
      style.innerHTML = this.customCSS
      this.shadow.appendChild(style)
    }

    const stylesheet = this.querySelector('#stylesheet').content.cloneNode(true)
    this.shadow.appendChild(stylesheet)
  }

  connectedCallback() {
    window.dkOpenGiftSelector = (add) => {
      this.modalOpen = true
      this.handleGiftAdjustments(add)
    }
  }

  formatVariantData(variantData) {
    return {
      id: parseInt(variantData.id.split('/').pop()),
      title: variantData.title,
      price: parseFloat(variantData.priceV2.amount) * 100,
      available: variantData.availableForSale,
      image: variantData.image.url,
      options: variantData.selectedOptions.map((option) => option.value),
    }
  }

  handleChangeSelection(product) {
    this.slots[this.slotIndex].selection = {
      ...product.variants[product.selectedVariantIndex],
      productTitle: product.title,
      productImage: product.image,
    }

    const firstUnselectedSlotIndex = this.slots.findIndex(
      (slot) => !slot.selection,
    )

    if (this.slotIndex === firstUnselectedSlotIndex - 1) {
      this.handleChangeSlot(firstUnselectedSlotIndex)
    } else {
      this.render()
    }
  }

  async handleChangeProductOption(e) {
    const productId = e.target.dataset.productId
    const optionSelectors = this.shadow.querySelectorAll(`[data-product-id="${productId}"]`)
    const selectedOptions = Array.from(optionSelectors).map((select) => ({
      name: select.name,
      value: select.value,
    }))

    const productIndex = this.products.findIndex(
      (product) => `${product.id}` === `${productId}`,
    )

    const product = this.products[productIndex]

    const variantIndex = product.variants.findIndex((variant) => {
      return selectedOptions.every((option) => {
        return (
          variant.options.includes(option.value)
        )
      })
    })

    if (variantIndex < 0) {
      fetch('/api/2025-04/graphql.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': this.storefrontApiKey,
        },
        body: JSON.stringify({
          query: GIFT_VARIANT_BY_OPTIONS_QUERY,
          variables: {
            productId: `gid://shopify/Product/${productId}`,
            options: product.options.map((option, index) => ({
              name: option.name,
              value: selectedOptions[index].value,
            })),
            country: window.Shopify.country,
          },
        }),
      }).then((res) => res.json())
        .then((res) => {
          const newVariant = this.formatVariantData(res.data.product.variantBySelectedOptions)

          const newProduct = {
            ...product,
            selectedVariantIndex: product.variants.length,
            variants: [...product.variants, { ...newVariant }],
          }

          this.products = this.products.toSpliced(productIndex, 1, newProduct)

          this.render()
        })
    } else {
      this.products = this.products.toSpliced(productIndex, 1, {
        ...this.products[productIndex],
        selectedVariantIndex: variantIndex,
      })

      this.render()
    }
  }

  handleChangeSlot(index) {
    this.slotIndex = index
    if (this.slots[index].addIndex !== this.addIndex) {
      this.addIndex = this.slots[index].addIndex
      this.products = this.add.options.map((option) => ({
        ...option,
        selectedVariantIndex: 0,
      }))
    }

    this.render()
  }

  handleClose() {
    this.modalOpen = false
    this.render()
  }

  async handleGiftAdjustments(adds) {
    this.adds = adds

    if (this.slots.length) {
      const newSlots = []
      adds.forEach((add, addIndex) => {
        const addId = `${add.discountId.split('/').pop()}-${add.discountTier}`
        const existingSlotsForAdd = this.slots.filter(
          (slot) => slot.addId === addId
        )
        for (let i = 0; i < add.quantity; i++) {
          if (existingSlotsForAdd[i]) {
            newSlots.push(existingSlotsForAdd[i])
          } else {
            newSlots.push({
              addId: addId,
              addIndex: addIndex,
              selection: undefined,
            })
          }
        }
      })
      this.slots = newSlots
    }
    else {
      this.slots = adds.flatMap((add, index) => {
        let addSlots = []
        for (let i = 0; i < add.quantity; i++) {
          addSlots.push({
            addId: `${add.discountId.split('/').pop()}-${add.discountTier}`,
            addIndex: index,
            selection: undefined,
          })
        }
        return addSlots
      })
    }

    this.products = this.add.options.map((option) => ({
      ...option,
      selectedVariantIndex: 0,
    }))

    this.render()
  }

  handleSelectionsAddToCart() {
    const additions = this.slots.flatMap((slot) => ({
      id: slot.selection.id,
      quantity: 1,
      properties: {
        _dk_gift: this.adds[slot.addIndex].discountTitle,
      },
    }))

    dkAddToCart(additions).then((cart) => {
      this.handleClose()
      document.dispatchEvent(new CustomEvent(window.discount_kit.config.custom_cart_update_event || 'discount_kit:cart_changed'))
      if (this.refresh === 'true') {
        location.reload()
      }
    })
  }

  render() {
    if (this.modalOpen && this.shouldShow) {
      document.body.style.overflow = 'hidden'

      const modal = this.querySelector('#modal').content.cloneNode(true)

      modal.querySelector('.dk_gift_canvas').addEventListener('click', (e) => {
        if (e.target.classList.contains('dk_gift_canvas')) {
          this.handleClose()
        }
      })

      modal.querySelector('.dk_gift_canvas').addEventListener('touchmove', (e) => {
        e.stopPropagation()
      })

      modal.querySelector('.dk_gift_close').addEventListener('click', () => {
        const closedCount = document.cookie
          .split('; ')
          .find((c) => c.startsWith('dk_gift_selector_closed_count'))
        if (!closedCount) {
          document.cookie =
            'dk_gift_selector_closed_count=1; path=/; max-age=3600'
        } else {
          const count = parseInt(closedCount.split('=')[1]) + 1
          document.cookie = `dk_gift_selector_closed_count=${count}; path=/; max-age=3600`
        }
        this.handleClose()
      })

      const productsContainer = modal.querySelector('.dk_gift_products')
      this.renderProducts(productsContainer)

      const selectionsContainer = modal.querySelector('.dk_gift_selections')
      this.renderSelections(selectionsContainer)

      if (this.slots.findIndex((slot) => !slot.selection) < 0) {
        const addToCartButton = modal.querySelector('#dk_add-to-cart')
        addToCartButton.disabled = false
        addToCartButton.addEventListener('click', () => {
          this.handleSelectionsAddToCart()
        })
      }

      if (this.shadow.querySelector('.dk_gift_canvas')) {
        this.shadow.replaceChild(
          modal,
          this.shadow.querySelector('.dk_gift_canvas'),
        )
      } else {
        this.shadow.appendChild(modal)
      }
    } else {
      document.body.style.overflow = 'auto'
      const existingModal = this.shadow.querySelector('.dk_gift_canvas')
      if (existingModal) {
        this.shadow.removeChild(existingModal)
      }
    }
  }

  renderProducts(productsContainer) {
    this.products.forEach((product) => {
      const productDiv = this.querySelector('#product').content.cloneNode(true)

      productDiv.querySelector('.dk_gift_product_image').innerHTML =
        `<img src="${product.variants[product.selectedVariantIndex]?.image || product.image}" />`
      productDiv.querySelector('.dk_gift_product_title').innerHTML =
        product.title
      productDiv.querySelector('.dk_gift_product_price-range').innerHTML =
        product.priceRange.min !== product.priceRange.max
          ? `${this.formatter.format(
            product.priceRange.min,
          )} - ${this.formatter.format(product.priceRange.max)}`
          : `${this.formatter.format(parseFloat(product.priceRange.max))}`

      const addSelectionButton = productDiv.querySelector(
        '.dk_gift_product_add',
      )

      const productAvailable = product.variants[product.selectedVariantIndex].available
      const relatedOption = this.adds[this.addIndex].options[this.adds[this.addIndex].options.findIndex((option) => option.id === product.id)]
      const variantAllowed = relatedOption.variants.length === 0 || relatedOption.variants.some((variant) => variant.id === product.variants[product.selectedVariantIndex].id)

      if (!productAvailable || !variantAllowed) {
        addSelectionButton.disabled = true
        const unavailableMessageDiv = productDiv.querySelector('.dk_gift_product_unavailable')
        unavailableMessageDiv.style.display = 'block'
      } else {
        addSelectionButton.addEventListener('click', () => {
          this.handleChangeSelection(product)
        })
      }

      const hasMultipleOptions = Array.isArray(product.options) && product.options.length > 1
      const hasOptionWithMultipleValues =
        Array.isArray(product.options) &&
        product.options.some((option) => Array.isArray(option.values) && option.values.length > 1)

      if (hasMultipleOptions || hasOptionWithMultipleValues) {
        const optionsContainer = productDiv.querySelector(
          '.dk_gift_product_options',
        )

        product.options.forEach((option, index) => {
          const select = document.createElement('select')
          select.name = option.name
          select.dataset.productId = product.id
          select.dataset.optionIndex = index
          option.values.forEach((value) => {
            const option = document.createElement('option')
            option.value = value
            option.innerHTML = value
            option.selected =
              value ===
              product.variants[product.selectedVariantIndex].options[index]
            select.appendChild(option)
          })

          select.addEventListener('change', this.handleChangeProductOption.bind(this))

          optionsContainer.appendChild(select)
        })
      }

      productsContainer.appendChild(productDiv)
    })
  }

  renderSelections(selectionsContainer) {
    this.slots.forEach((slot, index) => {
      const slotClone = this.querySelector('#selection').content.cloneNode(true)
      selectionsContainer.appendChild(slotClone)
      const slotEl = Array.from(
        selectionsContainer.querySelectorAll('.dk_selection-container'),
      ).pop()

      if (slot.selection) {
        const slotImage = slotEl.querySelector('img')
        slotImage.src = slot.selection.image || slot.selection.productImage
        slotImage.style.width = '36px'
        slotImage.style.height = '36px'
      }

      if (this.slotIndex === index) {
        slotEl.classList.add('current')
      } else {
        slotEl.addEventListener('click', (e) => {
          this.handleChangeSlot(index)
        })
      }
    })
  }
}

customElements.define('gift-selector', GiftSelector)
