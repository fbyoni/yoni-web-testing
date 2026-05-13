(function () {
  const storageKey = "happly-age-verified";

  function textOf(button) {
    return (button && button.textContent ? button.textContent : "").trim().toLowerCase();
  }

  function verify() {
    try {
      window.localStorage.setItem(storageKey, "yes");
      window.localStorage.setItem("age_verified", "1");
    } catch (_) {}

    document.querySelectorAll(".b-agegate").forEach((gate) => {
      gate.classList.add("verified");
    });

    document.querySelectorAll(".b-popup.active").forEach((popup) => {
      popup.classList.remove("active", "age-verify");
    });

    document.documentElement.classList.remove("hidden");
    document.body.classList.remove("hidden");
  }

  function deny(button) {
    const gate = button.closest(".b-agegate");
    const wrapper = gate && gate.querySelector(".b-agegate__wrapper");
    if (wrapper) {
      wrapper.classList.add("denied");
    }
  }

  function applySavedState() {
    try {
      if (
        window.localStorage.getItem(storageKey) === "yes" ||
        window.localStorage.getItem("age_verified")
      ) {
        verify();
      }
    } catch (_) {}
  }

  document.addEventListener(
    "click",
    function (event) {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }

      if (button.matches('[data-age="yes"]')) {
        event.preventDefault();
        event.stopPropagation();
        verify();
        return;
      }

      if (button.matches('[data-age="n"]')) {
        event.preventDefault();
        event.stopPropagation();
        deny(button);
        return;
      }

      const ageGateActions = button.closest(".b-agegate__actions");
      if (!ageGateActions) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (textOf(button) === "yes") {
        verify();
      } else {
        deny(button);
      }
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySavedState);
  } else {
    applySavedState();
  }
})();
