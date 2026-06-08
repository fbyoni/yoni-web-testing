"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [6340],
  {
    6340: (t, e, s) => {
      s.r(e);
      var i = s(8760),
        n = s(8520),
        o = s(2472);
      (n.w$.registerPlugin(o.M),
        (window.plr.controllers.BNavWrapper = class extends i.c {
          bindEvents() {
            (super.bindEvents(),
              this.on(this.refs.navToggle, "click", this.navToggle.bind(this)),
              (this.callbacks.onLinkClick = this.onLinkClick.bind(this)),
              this.on(this.refs.link, "click", this.callbacks.onLinkClick),
              luge && luge.emitter.on("pageTransition", this.onPageTransition.bind(this)));
          }
          onPageTransition(t) {
            (this.refs.nav.querySelectorAll(".menu-item").forEach((e) => {
              const s = e.getAttribute("id");
              if (s) {
                const i = t.querySelector("#" + s);
                i && (e.className = i.className);
              }
            }),
              document.body.classList.contains("is-nav-opened") && this.navToggle());
          }
          onLinkClick(t) {
            const e = t.target.closest("a");
            if (
              e &&
              (e.getAttribute("href").startsWith("#") || e.getAttribute("href").startsWith("/#"))
            ) {
              t.preventDefault();
              const s = document.querySelector(e.getAttribute("href").replace(/^\//, ""));
              s && (this.navToggle(), luge.smoothscroll.lenis.scrollTo(s.offsetTop));
            }
          }
          navToggle() {
            const { wrapper: t } = this.refs;
            (document.body.classList.toggle("is-nav-opened"),
              document.body.classList.contains("is-nav-opened")
                ? t.setAttribute("aria-hidden", "false")
                : t.setAttribute("aria-hidden", "true"));
          }
        }));
    },
  },
]);
