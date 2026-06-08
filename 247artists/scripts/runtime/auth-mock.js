/*
 * Mock auth flow for the /login and /signup replicas.
 *
 * The real my.247artists.com pages are a passwordless (email-code) SPA. Here we
 * mock them: validate the form, show a "Success" modal, set a shared logged-in
 * flag (localStorage), then redirect to the main site. The same flag is read by
 * auth-state across the site so the "Login" nav can reflect signed-in status.
 */
(function () {
  'use strict';
  var LOGGED_IN_KEY = '247_logged_in';
  var EMAIL_KEY = '247_email';
  var REDIRECT_TO = '/'; // main page
  var kind = window.__AUTH_KIND || (/signup/.test(location.pathname) ? 'signup' : 'login');

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim());
  }

  ready(function () {
    var form = document.querySelector('form');
    if (!form) return;

    function fields() {
      var email = form.querySelector('input[type="email"]');
      var texts = Array.prototype.slice.call(
        form.querySelectorAll('input:not([type="email"]):not([type="hidden"]):not([type="checkbox"])')
      );
      return {email: email, texts: texts};
    }

    function clearErrors() {
      form.querySelectorAll('.auth-error').forEach(function (el) {
        el.classList.remove('auth-error');
      });
    }

    function flagInvalid() {
      var f = fields();
      var bad = false;
      if (!f.email || !validEmail(f.email.value)) {
        if (f.email) f.email.classList.add('auth-error');
        bad = true;
      }
      if (kind === 'signup') {
        f.texts.forEach(function (t) {
          if (!t.value.trim()) {
            t.classList.add('auth-error');
            bad = true;
          }
        });
      }
      return !bad;
    }

    function showSuccess() {
      var f = fields();
      try {
        localStorage.setItem(LOGGED_IN_KEY, '1');
        if (f.email) localStorage.setItem(EMAIL_KEY, f.email.value.trim());
      } catch (e) {}

      var title = kind === 'signup' ? "You're all set" : 'Welcome back';
      var msg = kind === 'signup'
        ? 'Your 24/7 Artists account is ready. Redirecting you in…'
        : "You're signed in. Redirecting you in…";

      var ov = document.createElement('div');
      ov.className = 'auth-success-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.innerHTML =
        '<div class="auth-success-card">' +
        '<div class="auth-success-check" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' +
        '</div>' +
        '<p class="auth-success-eyebrow">SUCCESS</p>' +
        '<h2 class="auth-success-title">' + title + '</h2>' +
        '<p class="auth-success-msg">' + msg + '</p>' +
        '<button type="button" class="auth-success-btn">Continue</button>' +
        '</div>';
      document.body.appendChild(ov);
      requestAnimationFrame(function () { ov.classList.add('is-open'); });

      var done = false;
      function go() {
        if (done) return;
        done = true;
        window.location.href = REDIRECT_TO;
      }
      ov.querySelector('.auth-success-btn').addEventListener('click', go);
      setTimeout(go, 1700);
    }

    function attempt(e) {
      if (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      clearErrors();
      if (!flagInvalid()) return;
      showSuccess();
    }

    form.addEventListener('submit', attempt, true);
    // Continue button is type=submit by default, but guard clicks too in case.
    var btn = form.querySelector('button');
    if (btn) {
      btn.addEventListener('click', function (e) {
        if ((btn.getAttribute('type') || 'submit') !== 'submit') attempt(e);
      }, true);
    }
  });
})();
