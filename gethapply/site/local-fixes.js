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
      window.localStorage.setItem(storageKey, "yes");
      window.localStorage.setItem("age_verified", "1");
    } catch (_) {}
    verify();
  }

  function purgePopups() {
    document.querySelectorAll(".b-agegate, .b-popup").forEach((el) => {
      el.classList.remove("active", "age-verify");
      el.setAttribute("hidden", "");
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    document.documentElement.classList.remove("hidden");
    document.body && document.body.classList.remove("hidden");
  }

  const popupObserver = new MutationObserver(purgePopups);
  function startObserver() {
    if (document.body) {
      popupObserver.observe(document.body, { childList: true, subtree: true });
    }
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

  function wrapHeaderInStickyRow(header) {
    if (!header || header.querySelector(":scope > .jdgm-row-stars")) return;
    const row = document.createElement("div");
    row.className = "jdgm-row-stars";
    while (header.firstChild) row.appendChild(header.firstChild);
    header.appendChild(row);
  }

  function wrapReviewRating(reviewHeader) {
    if (!reviewHeader || reviewHeader.querySelector(":scope > .jdgm-row-rating")) return;
    const rating = reviewHeader.querySelector(":scope > .jdgm-rev__rating");
    const timestamp = reviewHeader.querySelector(":scope > .jdgm-rev__timestamp");
    if (!rating) return;
    const row = document.createElement("div");
    row.className = "jdgm-row-rating";
    reviewHeader.insertBefore(row, rating);
    row.appendChild(rating);
    if (timestamp) row.appendChild(timestamp);
  }

  function injectSummaryAverage(widget) {
    const summary = widget.querySelector(".jdgm-rev-widg__summary");
    if (!summary || summary.querySelector(".jdgm-rev-widg__summary-average")) return;
    const avg = widget.getAttribute("data-average-rating") || "";
    if (!avg) return;
    const span = document.createElement("span");
    span.className = "jdgm-rev-widg__summary-average";
    span.textContent = avg;
    summary.insertBefore(span, summary.firstChild);
  }

  function unhideJudgeMeWidget() {
    document.querySelectorAll("style.jdgm-temp-hiding-style").forEach((el) => {
      el.parentNode && el.parentNode.removeChild(el);
    });
    document.querySelectorAll(".jdgm-temp-hidden").forEach((el) => {
      el.classList.remove("jdgm-temp-hidden");
    });
    document.querySelectorAll(".jdgm-rev-widg").forEach((widget) => {
      injectSummaryAverage(widget);
      wrapHeaderInStickyRow(widget.querySelector(":scope > .jdgm-rev-widg__header"));
    });
    document.querySelectorAll(".jdgm-rev__header").forEach(wrapReviewRating);
    document.querySelectorAll(".jdgm-rev__timestamp.jdgm-spinner").forEach((el) => {
      const iso = el.getAttribute("data-content");
      if (iso) {
        const d = new Date(iso.replace(" UTC", "Z").replace(" ", "T"));
        if (!isNaN(d)) {
          const now = new Date();
          const diffDays = Math.floor((now - d) / 86400000);
          let label;
          if (diffDays <= 0) label = "today";
          else if (diffDays === 1) label = "1 day ago";
          else if (diffDays < 30) label = diffDays + " days ago";
          else if (diffDays < 365) label = Math.floor(diffDays / 30) + " months ago";
          else label = Math.floor(diffDays / 365) + " years ago";
          el.textContent = label;
        }
      }
      el.classList.remove("jdgm-spinner");
    });
    document.querySelectorAll(".jdgm-rev__pic-link img[data-src]").forEach((img) => {
      const src = img.getAttribute("data-src");
      if (src && !img.src) img.src = src;
      img.parentNode && img.parentNode.classList.remove("jdgm--loading");
    });
    document.querySelectorAll(".jdgm-write-rev-link").forEach((el) => {
      el.style.display = "";
    });
  }

  function init() {
    applySavedState();
    purgePopups();
    startObserver();
    unhideJudgeMeWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
