"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [5692],
  {
    5692: (i, o, l) => {
      l.r(o);
      var s = l(8760),
        e = l(8520),
        r = l(2472);
      (e.w$.registerPlugin(r.M),
        (window.plr.controllers.SiteHead = class extends s.c {
          init() {
            (super.init(),
              (this.previousScrollTop = 0),
              (this.scrollDirection = "down"),
              (this.scrollHeadLimit = 0.075 * window.safeHeight),
              window.unifiedScrollTop > this.scrollHeadLimit && this.el.classList.add("is-small"));
          }
          onResize() {
            this.scrollHeadLimit = 0.075 * window.safeHeight;
          }
          onScroll() {
            window.unifiedScrollTop !== this.previousScrollTop &&
              (this.scrollDirection =
                window.unifiedScrollTop > this.previousScrollTop ? "down" : "up");
            const i = document.body.classList;
            (i.toggle("is-nav-small", window.unifiedScrollTop > this.scrollHeadLimit),
              i.toggle(
                "is-nav-hidden",
                "down" === this.scrollDirection && window.unifiedScrollTop > 100,
              ),
              (this.previousScrollTop = window.unifiedScrollTop));
          }
        }));
    },
  },
]);
