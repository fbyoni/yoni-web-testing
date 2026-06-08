"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [456],
  {
    456: (t, c, e) => {
      e.r(c);
      var l = e(8760),
        r = e(8520);
      window.plr.controllers.SitePreloader = class extends l.c {
        constructor(t) {
          (super(t), luge);
        }
        intro(t, c) {
          const e = r.w$.timeline();
          (e.to(this.el, { opacity: 0, duration: 1 }, 0),
            e.call(
              function () {
                t();
              },
              [],
              "-=0.5",
            ),
            e.call(
              function () {
                (this.kill(), c(), e.kill());
              },
              [],
              1,
            ));
        }
      };
    },
  },
]);
