/* a24films local replica — JS shims + a self-contained client-side shop cart.
 *
 * Loaded at the end of <body>, after the mirrored app.js. The net-shim already
 * blocks off-origin network traffic; this file adds UX-level behavior the live
 * backend would normally provide:
 *   - neutralizes the newsletter / Klaviyo form submit (no backend offline)
 *   - a fully client-side cart: every shop product card gets an "Add to cart"
 *     button; items live in localStorage; a floating launcher + slide-in drawer
 *     show line items with qty +/- and remove; "Checkout" shows a success modal
 *     and empties the cart. No external calls, no off-localhost navigation.
 */
(function () {
  "use strict";

  // ---- newsletter no-op --------------------------------------------------
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || form.tagName !== "FORM") return;
      var action = (form.getAttribute("action") || "").toLowerCase();
      if (
        action.indexOf("kmail-lists.com") !== -1 ||
        action.indexOf("klaviyo") !== -1 ||
        action.indexOf("http") === 0
      ) {
        e.preventDefault();
      }
    },
    true,
  );

  // ---- cart state --------------------------------------------------------
  if (window.__a24CartInstalled) return;
  window.__a24CartInstalled = true;

  var KEY = "a24MockCart";
  var money = function (cents) {
    return "$" + (cents / 100).toFixed(2);
  };
  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  function save(c) {
    try {
      localStorage.setItem(KEY, JSON.stringify(c));
    } catch (e) {}
  }
  function clearCart() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }
  function totalQty(c) {
    return c.reduce(function (n, i) {
      return n + (i.qty || 0);
    }, 0);
  }
  function subtotal(c) {
    return c.reduce(function (n, i) {
      return n + (i.price || 0) * (i.qty || 0);
    }, 0);
  }
  // The source markup carries no prices, so derive a stable, varied price per
  // product title ($25–$95 in $1 steps) — deterministic so a product always
  // shows the same price across reloads and pages.
  function priceFor(title) {
    var h = 0;
    for (var i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
    return 2500 + (h % 71) * 100;
  }

  function addToCart(item) {
    var cart = load();
    var hit = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].key === item.key) {
        hit = cart[i];
        break;
      }
    }
    if (hit) hit.qty += item.qty;
    else cart.push(item);
    save(cart);
    render();
  }

  // ---- read a product card ----------------------------------------------
  function extractCard(card) {
    var h = card.querySelector("h2, h3, .copy-wrapper a[title]");
    var title = h ? (h.getAttribute("title") || h.textContent).trim() : "Item";
    var img = card.querySelector("img");
    var image = img ? img.getAttribute("src") || img.src || "" : "";
    var link = card.querySelector('a[href]');
    var url = link ? link.getAttribute("href") || "" : "";
    return {
      key: title,
      title: title,
      price: priceFor(title),
      qty: 1,
      image: image,
      url: url,
    };
  }

  // ---- decorate shop product cards --------------------------------------
  var PRODUCT_SEL = ".stack-item.product";
  function decorateCards(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(PRODUCT_SEL).forEach(function (card) {
      if (card.__a24Decorated) return;
      card.__a24Decorated = true;
      var copy = card.querySelector(".copy-wrapper") || card;
      var info = extractCard(card);

      var price = document.createElement("div");
      price.className = "a24-price";
      price.textContent = money(info.price);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "a24-add-btn";
      btn.textContent = "Add to cart";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        addToCart(extractCard(card));
        btn.classList.add("is-added");
        btn.textContent = "Added ✓";
        openDrawer();
        setTimeout(function () {
          btn.classList.remove("is-added");
          btn.textContent = "Add to cart";
        }, 1300);
      });

      copy.appendChild(price);
      copy.appendChild(btn);
    });
  }

  // ---- launcher / badge --------------------------------------------------
  var fabEl, countEl;
  function buildFab() {
    if (fabEl) return;
    fabEl = document.createElement("button");
    fabEl.type = "button";
    fabEl.className = "a24-cart-fab";
    fabEl.setAttribute("aria-label", "Open cart");
    fabEl.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
      '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>' +
      '<span class="a24-cart-fab__label">Cart</span>' +
      '<span class="a24-cart-fab__count">0</span>';
    fabEl.addEventListener("click", openDrawer);
    document.body.appendChild(fabEl);
    countEl = fabEl.querySelector(".a24-cart-fab__count");
  }
  function updateBadge() {
    if (!countEl) return;
    var n = totalQty(load());
    countEl.textContent = n;
    countEl.style.display = n > 0 ? "inline-flex" : "none";
  }

  // ---- drawer ------------------------------------------------------------
  var drawerEl, overlayEl;
  function buildDrawer() {
    if (drawerEl) return;
    overlayEl = document.createElement("div");
    overlayEl.className = "a24-cart-overlay";
    overlayEl.addEventListener("click", closeDrawer);

    drawerEl = document.createElement("aside");
    drawerEl.className = "a24-cart-drawer";
    drawerEl.setAttribute("aria-hidden", "true");
    drawerEl.innerHTML =
      '<div class="a24-cart-head">' +
      '<h2 class="a24-cart-title">Your cart</h2>' +
      '<button type="button" class="a24-cart-close" aria-label="Close cart">&times;</button>' +
      "</div>" +
      '<div class="a24-cart-body"></div>' +
      '<div class="a24-cart-foot">' +
      '<div class="a24-cart-subtotal"><span>Subtotal</span><strong class="a24-cart-subtotal-val">$0.00</strong></div>' +
      '<button type="button" class="a24-cart-checkout">Checkout</button>' +
      '<p class="a24-cart-note">Taxes &amp; shipping calculated at checkout</p>' +
      "</div>";
    document.body.appendChild(overlayEl);
    document.body.appendChild(drawerEl);

    drawerEl.querySelector(".a24-cart-close").addEventListener("click", closeDrawer);
    drawerEl.querySelector(".a24-cart-checkout").addEventListener("click", doCheckout);
    drawerEl.querySelector(".a24-cart-body").addEventListener("click", onBodyClick);
  }

  function renderDrawer() {
    if (!drawerEl) return;
    var cart = load();
    var body = drawerEl.querySelector(".a24-cart-body");
    if (!cart.length) {
      body.innerHTML = '<p class="a24-cart-empty">Your cart is empty.</p>';
    } else {
      body.innerHTML = cart
        .map(function (it, idx) {
          var img = it.image
            ? '<img class="a24-line-img" src="' + it.image + '" alt="">'
            : '<div class="a24-line-img"></div>';
          var titleHtml = it.url
            ? '<a class="a24-line-title" href="' + it.url + '">' + it.title + "</a>"
            : '<span class="a24-line-title">' + it.title + "</span>";
          return (
            '<div class="a24-line" data-idx="' + idx + '">' +
            img +
            '<div class="a24-line-info">' +
            titleHtml +
            '<div class="a24-line-price">' + money(it.price) + " each</div>" +
            '<div class="a24-qty">' +
            '<button type="button" class="a24-qty-btn" data-act="dec" aria-label="Decrease quantity">&minus;</button>' +
            '<span class="a24-qty-val">' + it.qty + "</span>" +
            '<button type="button" class="a24-qty-btn" data-act="inc" aria-label="Increase quantity">+</button>' +
            '<button type="button" class="a24-line-remove" data-act="rm">Remove</button>' +
            "</div>" +
            "</div>" +
            '<div class="a24-line-total">' + money(it.price * it.qty) + "</div>" +
            "</div>"
          );
        })
        .join("");
    }
    drawerEl.querySelector(".a24-cart-subtotal-val").textContent = money(subtotal(cart));
    drawerEl.querySelector(".a24-cart-checkout").disabled = !cart.length;
  }

  function onBodyClick(e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var line = btn.closest(".a24-line");
    if (!line) return;
    var idx = parseInt(line.getAttribute("data-idx"), 10);
    var cart = load();
    if (!cart[idx]) return;
    var act = btn.getAttribute("data-act");
    if (act === "inc") cart[idx].qty += 1;
    else if (act === "dec") cart[idx].qty = Math.max(1, cart[idx].qty - 1);
    else if (act === "rm") cart.splice(idx, 1);
    save(cart);
    render();
  }

  function openDrawer() {
    buildDrawer();
    renderDrawer();
    overlayEl.classList.add("is-open");
    drawerEl.classList.add("is-open");
    drawerEl.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("a24-cart-lock");
  }
  function closeDrawer() {
    if (!drawerEl) return;
    overlayEl.classList.remove("is-open");
    drawerEl.classList.remove("is-open");
    drawerEl.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("a24-cart-lock");
  }

  // ---- checkout success modal -------------------------------------------
  function doCheckout() {
    var cart = load();
    if (!cart.length) return;
    var paid = subtotal(cart);
    closeDrawer();
    var modal = document.createElement("div");
    modal.className = "a24-modal";
    modal.innerHTML =
      '<div class="a24-modal__overlay"></div>' +
      '<div class="a24-modal__card" role="dialog" aria-modal="true" aria-label="Order confirmed">' +
      '<div class="a24-modal__check">&#10003;</div>' +
      '<h2 class="a24-modal__title">Order confirmed</h2>' +
      '<p class="a24-modal__sub">Thanks for shopping A24. Your order is on its way.</p>' +
      '<p class="a24-modal__total">Total paid: <strong>' + money(paid) + "</strong></p>" +
      '<button type="button" class="a24-modal__done">Done</button>' +
      "</div>";
    document.body.appendChild(modal);
    document.documentElement.classList.add("a24-cart-lock");
    function dismiss() {
      clearCart();
      render();
      modal.remove();
      document.documentElement.classList.remove("a24-cart-lock");
    }
    modal.querySelector(".a24-modal__done").addEventListener("click", dismiss);
    modal.querySelector(".a24-modal__overlay").addEventListener("click", dismiss);
  }

  // ---- render + init -----------------------------------------------------
  function render() {
    updateBadge();
    renderDrawer();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  function init() {
    buildFab();
    buildDrawer();
    decorateCards(document);
    render();
    // Shop carousels can be (re)injected by app.js after load — keep decorating.
    if (window.MutationObserver) {
      var obs = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) {
            decorateCards(document);
            break;
          }
        }
      });
      obs.observe(document.body, { subtree: true, childList: true });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
