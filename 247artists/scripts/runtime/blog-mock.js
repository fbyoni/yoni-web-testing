/* Mock UX for the local beehiiv (/blog/) replica.
 *
 * The real beehiiv newsletter app's hydration JS is stripped so the mirror is
 * fully self-contained (zero external calls). This restores the only two
 * interactions on the archive root:
 *   - Subscribe: the email capture form (action="/create") and any "Subscribe"
 *     button/link -> success modal instead of POSTing to beehiiv.
 *   - Login: the header "Login" button -> a simple modal (no real auth).
 *
 * Post tiles keep their real beehiiv URLs (rewritten to absolute https links by
 * the scraper) so clicking a post opens the original article.
 */
(function () {
  'use strict';

  var overlay = null;

  function buildOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'blog-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="blog-modal-card">' +
      '<div class="blog-modal-icon" aria-hidden="true">✓</div>' +
      '<h2 class="blog-modal-title"></h2>' +
      '<p class="blog-modal-text"></p>' +
      '<button type="button" class="blog-modal-btn">Got it</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('.blog-modal-btn').addEventListener('click', closeModal);
  }

  function openModal(title, text) {
    buildOverlay();
    overlay.querySelector('.blog-modal-title').textContent = title;
    overlay.querySelector('.blog-modal-text').textContent = text;
    overlay.classList.add('is-open');
    document.documentElement.classList.add('blog-modal-lock');
    document.body.classList.add('blog-modal-lock');
    overlay.querySelector('.blog-modal-btn').focus();
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.documentElement.classList.remove('blog-modal-lock');
    document.body.classList.remove('blog-modal-lock');
  }

  function subscribeSuccess() {
    openModal(
      "You're subscribed! 🎉",
      'Thanks for joining the 24/7 Artists newsletter — keep an eye on your inbox for the next drop.'
    );
  }

  function loginSuccess() {
    openModal('Welcome back!', "You're now signed in to 24/7 Artists.");
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Intercept the email subscribe form(s).
  document.addEventListener(
    'submit',
    function (e) {
      var form = e.target;
      if (!form || form.tagName !== 'FORM') return;
      var action = (form.getAttribute('action') || '').toLowerCase();
      var hasEmail = !!form.querySelector('input[type="email"], input[name="email"]');
      if (action.indexOf('/create') !== -1 || action.indexOf('subscribe') !== -1 || hasEmail) {
        e.preventDefault();
        e.stopImmediatePropagation();
        subscribeSuccess();
      }
    },
    true
  );

  // Intercept Subscribe / Login buttons and links.
  document.addEventListener(
    'click',
    function (e) {
      var el = e.target.closest('a, button');
      if (!el) return;
      var label = textOf(el);
      if (label === 'login' || label === 'log in' || label === 'sign in') {
        e.preventDefault();
        e.stopImmediatePropagation();
        loginSuccess();
        return;
      }
      if (label === 'subscribe' || label === 'subscribe now') {
        e.preventDefault();
        e.stopImmediatePropagation();
        subscribeSuccess();
      }
    },
    true
  );

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });
})();
