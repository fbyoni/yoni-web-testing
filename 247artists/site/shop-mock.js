/* shop-mock.js — mocked cart + checkout for the self-contained 247artists shop.
 *
 * The shop pages are an exact visual replica of a Shopify "Horizon" theme store.
 * The real theme posts add-to-cart to /cart/add and drives a web-component cart
 * drawer that depends on stripped runtime modules. This layer:
 *   - intercepts every <form action="/cart/add"> submit + add-to-cart button
 *   - stores line items in localStorage (title, variant, price, qty, image, url)
 *   - renders a count badge in the header + an on-brand cart drawer
 *   - supports qty +/- / remove + a live subtotal
 *   - intercepts the header cart button & the drawer Checkout button to show a
 *     "Checkout successful" modal, then resets the cart to empty on dismiss
 * No external calls, no off-localhost navigation.
 */
(function () {
  "use strict";
  if (window.__shopMockInstalled) return;
  window.__shopMockInstalled = true;

  var STORAGE_KEY = "mockCart247";
  var MONEY = function (cents) {
    return "$" + (cents / 100).toFixed(2);
  };

  // ---- stub Shopify cart AJAX endpoints ----------------------------------
  // The Horizon theme's product-form / cart-drawer components issue their own
  // same-origin fetches to /cart/add.js, /cart.js, /cart/change.js etc. Those
  // routes don't exist in the static mirror (404). net-shim only blocks
  // off-origin, so intercept these here and answer with a mock cart payload so
  // no 404s fire and the theme JS doesn't throw.
  var CART_RE = /\/cart(?:\/(?:add|change|update|clear)|)\.js(\?|$)/i;
  // Backend-only storefront endpoints the theme hits (predictive search,
  // recommendations, section rendering). No backend exists in the mirror, so
  // answer empty-200 instead of letting them 404.
  var EMPTY_RE = /\/(search|recommendations)(\/|\?|$)/i;
  function mockCartPayload() {
    var cart = loadCart();
    return {
      token: "mock",
      item_count: totalQty(cart),
      total_price: subtotal(cart),
      items_subtotal_price: subtotal(cart),
      currency: "USD",
      items: cart.map(function (it) {
        return {
          id: it.variantId,
          title: it.title,
          quantity: it.qty,
          price: it.price,
          line_price: it.price * it.qty,
          variant_title: it.variant || null,
          image: it.image || null,
          url: it.url || null,
        };
      }),
    };
  }
  function jsonResponse(obj) {
    return new Response(JSON.stringify(obj), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof window.fetch === "function") {
    var realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : input && input.url ? input.url : "";
      if (CART_RE.test(url)) {
        return Promise.resolve(jsonResponse(mockCartPayload()));
      }
      if (EMPTY_RE.test(url)) {
        return Promise.resolve(
          new Response("", { status: 200, headers: { "Content-Type": "text/html" } }),
        );
      }
      return realFetch(input, init);
    };
  }
  if (typeof window.XMLHttpRequest === "function") {
    var XHR = window.XMLHttpRequest;
    var realOpen = XHR.prototype.open;
    var realSend = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this.__mockCart = CART_RE.test(url || "");
      this.__mockEmpty = !this.__mockCart && EMPTY_RE.test(url || "");
      return realOpen.apply(this, arguments);
    };
    XHR.prototype.send = function () {
      if (this.__mockCart || this.__mockEmpty) {
        var self = this;
        var payload = this.__mockCart ? JSON.stringify(mockCartPayload()) : "";
        setTimeout(function () {
          try {
            Object.defineProperty(self, "readyState", { value: 4, configurable: true });
            Object.defineProperty(self, "status", { value: 200, configurable: true });
            Object.defineProperty(self, "responseText", { value: payload, configurable: true });
            Object.defineProperty(self, "response", { value: payload, configurable: true });
          } catch (e) {}
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
          if (typeof self.onload === "function") self.onload();
          self.dispatchEvent(new Event("readystatechange"));
          self.dispatchEvent(new Event("load"));
          self.dispatchEvent(new Event("loadend"));
        }, 0);
        return;
      }
      return realSend.apply(this, arguments);
    };
  }

  // ---- state -------------------------------------------------------------
  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveCart(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {}
  }
  function clearCart() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }
  function totalQty(cart) {
    return cart.reduce(function (n, it) {
      return n + (it.qty || 0);
    }, 0);
  }
  function subtotal(cart) {
    return cart.reduce(function (n, it) {
      return n + (it.price || 0) * (it.qty || 0);
    }, 0);
  }

  // ---- helpers: parse a price string like "$25.00 USD" -> cents ----------
  function parsePriceText(txt) {
    if (!txt) return null;
    var m = String(txt)
      .replace(/,/g, "")
      .match(/(\d+(?:\.\d{1,2})?)/);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * 100);
  }

  function closest(el, sel) {
    return el && el.closest ? el.closest(sel) : null;
  }

  // Extract the product info around a given add-to-cart form / button.
  function extractItem(form) {
    var variantInput = form.querySelector('input[name="id"]');
    var qtyInput = form.querySelector('input[name="quantity"]');
    var variantId = variantInput ? variantInput.value : "";
    var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

    // Title: quick-add card data attr, else product page h1.
    var title = "";
    var quick = closest(form, "quick-add-component");
    if (quick && quick.getAttribute("data-product-title")) {
      title = quick.getAttribute("data-product-title");
    }
    if (!title) {
      var card = closest(form, ".product-card, product-card-link, .card");
      if (card) {
        var vh = card.querySelector(".visually-hidden");
        if (vh) title = vh.textContent.trim();
      }
    }
    if (!title) {
      var h1 = document.querySelector("main h1, .product-title h1, h1");
      if (h1) title = h1.textContent.trim();
    }
    if (!title) title = "Item";

    // Selected variant label (product page radios) appended to title.
    var variantLabel = "";
    var scope = closest(form, "product-form-component, .product, main") || document;
    var checked = scope.querySelector(
      'variant-picker input[type="radio"]:checked, fieldset input[type="radio"]:checked',
    );
    if (checked && checked.value) variantLabel = checked.value;

    // Price: nearest .price within the product scope, else product-card scope.
    var price = null;
    var priceScope =
      closest(form, ".product-card, quick-add-component") ||
      closest(form, "product-form-component") ||
      scope;
    var priceEl =
      priceScope && priceScope.querySelector
        ? priceScope.querySelector('.price, .price-item, [class*="price"]')
        : null;
    if (!priceEl) {
      // product page: main price block
      priceEl = document.querySelector("product-price .price, .price");
    }
    if (priceEl) price = parsePriceText(priceEl.textContent);
    if (price == null) price = 0;

    // Image: data-product-variant-media, else card/gallery image.
    var image = "";
    var addComp =
      form.querySelector("add-to-cart-component[data-product-variant-media]") ||
      (quick && quick.querySelector("add-to-cart-component[data-product-variant-media]"));
    if (addComp) image = addComp.getAttribute("data-product-variant-media") || "";
    if (!image) {
      var imgScope = closest(form, ".product-card, quick-add-component") || scope;
      var img = imgScope && imgScope.querySelector ? imgScope.querySelector("img") : null;
      if (!img) img = document.querySelector(".product-media img, .media-gallery img, main img");
      if (img) image = img.getAttribute("src") || img.src || "";
    }

    // Product URL (for the line-item link).
    var url = "";
    var link = (closest(form, ".product-card") || document).querySelector(
      'a.product-card__link, a[href*="/shop/products/"]',
    );
    if (link) url = link.getAttribute("href") || "";
    if (!url && /\/shop\/products\//.test(location.pathname)) url = location.pathname;

    return {
      key: variantId || title + "|" + variantLabel,
      variantId: variantId,
      title: title,
      variant: variantLabel,
      price: price,
      qty: qty,
      image: image,
      url: url,
    };
  }

  function addToCart(item) {
    var cart = loadCart();
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].key === item.key) {
        existing = cart[i];
        break;
      }
    }
    if (existing) existing.qty += item.qty;
    else cart.push(item);
    saveCart(cart);
    render();
  }

  // ---- header badge ------------------------------------------------------
  function updateBadge() {
    var count = totalQty(loadCart());
    // Real theme bubble.
    var bubble = document.querySelector('[ref="cartBubble"], .cart-bubble');
    if (bubble) {
      if (count > 0) {
        bubble.classList.remove("visually-hidden");
        bubble.classList.remove("hidden");
      }
    }
    var bubbleCount = document.querySelector('[ref="cartBubbleCount"], .cart-bubble__text-count');
    if (bubbleCount) {
      bubbleCount.textContent = count;
      if (count > 0) bubbleCount.classList.remove("hidden");
      else bubbleCount.classList.add("hidden");
    }
    // Our own fallback badge (always reflects count, shows on top of icon).
    var mine = document.getElementById("mock-cart-count");
    if (!mine) {
      var iconBtn = getCartOpenButton();
      if (iconBtn) {
        mine = document.createElement("span");
        mine.id = "mock-cart-count";
        mine.className = "mock-cart-count";
        iconBtn.style.position = iconBtn.style.position || "relative";
        iconBtn.appendChild(mine);
      }
    }
    if (mine) {
      mine.textContent = count;
      mine.style.display = count > 0 ? "flex" : "none";
    }
  }

  function getCartOpenButton() {
    return (
      document.querySelector('cart-drawer-component button[aria-label^="Open cart"]') ||
      document.querySelector('button[aria-label^="Open cart"]') ||
      document.querySelector('[data-testid="cart-icon"]') ||
      document.querySelector("cart-icon")
    );
  }

  // ---- drawer DOM --------------------------------------------------------
  var drawerEl, overlayEl;
  function buildDrawer() {
    if (drawerEl) return;
    overlayEl = document.createElement("div");
    overlayEl.className = "mock-cart-overlay";
    overlayEl.addEventListener("click", closeDrawer);

    drawerEl = document.createElement("aside");
    drawerEl.className = "mock-cart-drawer";
    drawerEl.setAttribute("aria-hidden", "true");
    drawerEl.innerHTML =
      '<div class="mock-cart-head">' +
      '<h2 class="mock-cart-title">Your cart</h2>' +
      '<button type="button" class="mock-cart-close" aria-label="Close cart">&times;</button>' +
      "</div>" +
      '<div class="mock-cart-body"></div>' +
      '<div class="mock-cart-foot">' +
      '<div class="mock-cart-subtotal"><span>Subtotal</span><span class="mock-cart-subtotal-val">$0.00</span></div>' +
      '<button type="button" class="mock-cart-checkout">Checkout</button>' +
      '<p class="mock-cart-note">Taxes and shipping calculated at checkout</p>' +
      "</div>";
    document.body.appendChild(overlayEl);
    document.body.appendChild(drawerEl);

    drawerEl.querySelector(".mock-cart-close").addEventListener("click", closeDrawer);
    drawerEl.querySelector(".mock-cart-checkout").addEventListener("click", doCheckout);
    drawerEl.querySelector(".mock-cart-body").addEventListener("click", onBodyClick);
  }

  function renderDrawer() {
    if (!drawerEl) return;
    var cart = loadCart();
    var body = drawerEl.querySelector(".mock-cart-body");
    if (!cart.length) {
      body.innerHTML = '<p class="mock-cart-empty">Your cart is empty.</p>';
    } else {
      body.innerHTML = cart
        .map(function (it, idx) {
          var img = it.image
            ? '<img class="mock-line-img" src="' + it.image + '" alt="">'
            : '<div class="mock-line-img mock-line-img--blank"></div>';
          var variant = it.variant ? '<div class="mock-line-variant">' + it.variant + "</div>" : "";
          var titleHtml = it.url
            ? '<a class="mock-line-title" href="' + it.url + '">' + it.title + "</a>"
            : '<span class="mock-line-title">' + it.title + "</span>";
          return (
            '<div class="mock-line" data-idx="' +
            idx +
            '">' +
            img +
            '<div class="mock-line-info">' +
            titleHtml +
            variant +
            '<div class="mock-line-price">' +
            MONEY(it.price) +
            "</div>" +
            '<div class="mock-qty">' +
            '<button type="button" class="mock-qty-btn" data-act="dec" aria-label="Decrease quantity">&minus;</button>' +
            '<span class="mock-qty-val">' +
            it.qty +
            "</span>" +
            '<button type="button" class="mock-qty-btn" data-act="inc" aria-label="Increase quantity">+</button>' +
            '<button type="button" class="mock-line-remove" data-act="rm">Remove</button>' +
            "</div>" +
            "</div>" +
            '<div class="mock-line-total">' +
            MONEY(it.price * it.qty) +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }
    drawerEl.querySelector(".mock-cart-subtotal-val").textContent = MONEY(subtotal(cart));
    var checkoutBtn = drawerEl.querySelector(".mock-cart-checkout");
    checkoutBtn.disabled = !cart.length;
  }

  function onBodyClick(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var line = btn.closest(".mock-line");
    if (!line) return;
    var idx = parseInt(line.getAttribute("data-idx"), 10);
    var cart = loadCart();
    if (!cart[idx]) return;
    var act = btn.getAttribute("data-act");
    if (act === "inc") cart[idx].qty += 1;
    else if (act === "dec") cart[idx].qty = Math.max(1, cart[idx].qty - 1);
    else if (act === "rm") cart.splice(idx, 1);
    saveCart(cart);
    render();
  }

  function openDrawer() {
    buildDrawer();
    renderDrawer();
    overlayEl.classList.add("is-open");
    drawerEl.classList.add("is-open");
    drawerEl.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("mock-cart-lock");
  }
  function closeDrawer() {
    if (!drawerEl) return;
    overlayEl.classList.remove("is-open");
    drawerEl.classList.remove("is-open");
    drawerEl.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("mock-cart-lock");
  }

  // ---- checkout success modal -------------------------------------------
  function doCheckout() {
    var cart = loadCart();
    if (!cart.length) return;
    closeDrawer();
    var modal = document.createElement("div");
    modal.className = "mock-checkout-modal";
    modal.innerHTML =
      '<div class="mock-checkout-overlay"></div>' +
      '<div class="mock-checkout-card" role="dialog" aria-modal="true" aria-label="Order confirmed">' +
      '<div class="mock-checkout-check">&#10003;</div>' +
      '<h2 class="mock-checkout-title">Checkout successful</h2>' +
      '<p class="mock-checkout-sub">Thank you! Your order has been confirmed.</p>' +
      '<p class="mock-checkout-total">Total paid: <strong>' +
      MONEY(subtotal(cart)) +
      "</strong></p>" +
      '<button type="button" class="mock-checkout-done">Done</button>' +
      "</div>";
    document.body.appendChild(modal);
    document.documentElement.classList.add("mock-cart-lock");
    function dismiss() {
      clearCart();
      render();
      modal.remove();
      document.documentElement.classList.remove("mock-cart-lock");
    }
    modal.querySelector(".mock-checkout-done").addEventListener("click", dismiss);
    modal.querySelector(".mock-checkout-overlay").addEventListener("click", dismiss);
  }

  // ---- render all --------------------------------------------------------
  function render() {
    updateBadge();
    renderDrawer();
  }

  // ---- interception ------------------------------------------------------
  function isAddForm(form) {
    if (!form || form.tagName !== "FORM") return false;
    var action = form.getAttribute("action") || "";
    return /\/cart\/add\b/.test(action);
  }

  // Capture-phase submit interception (theme uses on:submit web-component too).
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!isAddForm(form)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      try {
        addToCart(extractItem(form));
        openDrawer();
      } catch (err) {}
    },
    true,
  );

  // Some theme add buttons are type=submit inside the form (handled above) but
  // also intercept any explicit add button click as a safety net.
  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target.closest('button[name="add"], [data-add-to-cart]');
      if (btn) {
        // On multi-variant cards (products with sizes) the "Add" button opens a
        // size-selection modal instead of adding directly — the theme wires it
        // as on:click="quick-add-component/handleClick". In that case let the
        // theme open the modal and do NOT add here; the user adds from inside
        // the modal. Adding here too is the double-add bug (one on the card
        // click, one from the modal).
        var onClick = btn.getAttribute("on:click") || "";
        if (onClick.indexOf("quick-add-component") !== -1) {
          return;
        }
        var form = closest(btn, 'form[action*="/cart/add"]');
        if (form) {
          // Let the submit handler do the work; just ensure submit fires.
          // Prevent the theme component's own click handler.
          e.preventDefault();
          e.stopImmediatePropagation();
          try {
            addToCart(extractItem(form));
            openDrawer();
          } catch (err) {}
          return;
        }
      }
      // Header cart open button.
      var openBtn = e.target.closest(
        'cart-drawer-component button[aria-label^="Open cart"], button[aria-label^="Open cart"], a[href$="/cart"], a[href$="/cart/"], #cart-icon, [data-testid="cart-icon"]',
      );
      if (openBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openDrawer();
        return;
      }
      // Any direct checkout link/button outside our drawer.
      var co = e.target.closest('a[href*="/checkout"], button[name="checkout"], [data-checkout]');
      if (co) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (loadCart().length) doCheckout();
        else openDrawer();
      }
    },
    true,
  );

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  // Some product galleries keep alternate/variant media as hidden, lazily
  // loaded <img loading="lazy"> that the (stripped) theme media-gallery only
  // reveals on variant change. They reference real mirrored files; eager-load
  // them so the replica gallery is fully present rather than under-loaded.
  function eagerLoadProductMedia() {
    var imgs = document.querySelectorAll('img[loading="lazy"]');
    imgs.forEach(function (img) {
      var src = img.getAttribute("src");
      if (!src || /^https?:\/\//i.test(src)) return; // only same-origin mirrored
      // Force eager so Chrome fetches even while off-screen / inside hidden
      // (variant gallery / hover-secondary) slides.
      img.loading = "eager";
      img.setAttribute("fetchpriority", "low");
      if (!img.complete || img.naturalWidth === 0) {
        // Re-assigning src kicks the fetch. Warm a detached image first so the
        // file is in cache before the DOM node completes.
        var warm = new Image();
        warm.src = src;
        img.src = src;
      }
    });
  }

  // ---- init --------------------------------------------------------------
  function init() {
    buildDrawer();
    render();
    eagerLoadProductMedia();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
