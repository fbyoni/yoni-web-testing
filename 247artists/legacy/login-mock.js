/* Login page mock behavior — 24/7 Artists replica.
 * Fully client-side: validates fields, shows an on-brand success modal,
 * then resets the form to its initial empty state. No network, no navigation. */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    var form = document.querySelector('[data-login-form]');
    if (!form) return;

    var emailField = form.querySelector('[data-field="email"]');
    var passwordField = form.querySelector('[data-field="password"]');
    var emailInput = emailField && emailField.querySelector('input');
    var passwordInput = passwordField && passwordField.querySelector('input');
    var emailError = emailField && emailField.querySelector('[data-error]');
    var passwordError = passwordField && passwordField.querySelector('[data-error]');

    var overlay = document.querySelector('[data-login-overlay]');
    var modalBtn = overlay && overlay.querySelector('[data-login-dismiss]');

    var resetTimer = null;
    var AUTO_DISMISS_MS = 1500;

    function setFieldError(field, errorEl, message) {
      if (!field || !errorEl) return;
      if (message) {
        field.classList.add('login-field--invalid');
        errorEl.textContent = message;
      } else {
        field.classList.remove('login-field--invalid');
        errorEl.textContent = '';
      }
    }

    function clearErrorsOnInput(input, field, errorEl) {
      if (!input) return;
      input.addEventListener('input', function () {
        if (input.value.trim() !== '') {
          setFieldError(field, errorEl, '');
        }
      });
    }
    clearErrorsOnInput(emailInput, emailField, emailError);
    clearErrorsOnInput(passwordInput, passwordField, passwordError);

    function resetForm() {
      form.reset();
      setFieldError(emailField, emailError, '');
      setFieldError(passwordField, passwordError, '');
    }

    function closeOverlay() {
      if (!overlay) return;
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      resetForm();
    }

    function openOverlay() {
      if (!overlay) return;
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (modalBtn) {
        try { modalBtn.focus(); } catch (e) {}
      }
      // Auto-dismiss + reset after a short delay if the user does nothing.
      resetTimer = setTimeout(closeOverlay, AUTO_DISMISS_MS);
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var emailVal = emailInput ? emailInput.value.trim() : '';
      var passwordVal = passwordInput ? passwordInput.value.trim() : '';
      var valid = true;

      if (!emailVal) {
        setFieldError(emailField, emailError, 'Please enter your email.');
        valid = false;
      } else {
        setFieldError(emailField, emailError, '');
      }

      if (!passwordVal) {
        setFieldError(passwordField, passwordError, 'Please enter your password.');
        valid = false;
      } else {
        setFieldError(passwordField, passwordError, '');
      }

      if (!valid) {
        var firstInvalid = form.querySelector('.login-field--invalid input');
        if (firstInvalid) {
          try { firstInvalid.focus(); } catch (e) {}
        }
        return;
      }

      openOverlay();
    });

    if (modalBtn) {
      modalBtn.addEventListener('click', closeOverlay);
    }
    if (overlay) {
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) closeOverlay();
      });
    }
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
        closeOverlay();
      }
    });
  });
})();
