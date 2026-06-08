/* Local mirror JS shims for 247artists.com. */

/* Shared logged-in state: when the mock auth flow has signed the user in
 * (localStorage "247_logged_in"), reflect it in the site nav by relabeling the
 * "Login" link to "Account"; clicking it signs out and reloads. Keeps every
 * page aligned with the single auth state set by /login/ and /signup/. */
(function () {
  "use strict";
  try {
    if (localStorage.getItem("247_logged_in") !== "1") return;
  } catch (e) {
    return;
  }
  function apply() {
    var links = document.querySelectorAll('a[href="/login/"], a[href="/login"]');
    links.forEach(function (a) {
      if (a.dataset.authStateApplied) return;
      a.dataset.authStateApplied = "1";
      if ((a.textContent || "").trim().toLowerCase() === "login") a.textContent = "Account";
      a.addEventListener("click", function (e) {
        e.preventDefault();
        try {
          localStorage.removeItem("247_logged_in");
          localStorage.removeItem("247_email");
        } catch (err) {}
        location.reload();
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
})();
