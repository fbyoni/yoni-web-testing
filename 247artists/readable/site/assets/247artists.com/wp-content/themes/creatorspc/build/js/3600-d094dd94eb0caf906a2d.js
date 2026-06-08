"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [3600],
  {
    3600: (t, e, s) => {
      s.r(e);
      var i = s(8760),
        h = s(8520);
      window.plr.controllers.BtnCta = class extends i.c {
        init() {
          (super.init(), luge && luge.emitter.once("afterPageInit", this.setClipPaths.bind(this)));
        }
        bindEvents() {
          (super.bindEvents(),
            (this.callbacks.onMouseEnter = this.onMouseEnter.bind(this)),
            (this.callbacks.onMouseLeave = this.onMouseLeave.bind(this)),
            this.on(this.el, "mouseenter", this.callbacks.onMouseEnter),
            this.on(this.el, "mouseleave", this.callbacks.onMouseLeave));
        }
        onResize() {
          this.setClipPaths();
        }
        setClipPaths() {
          const { ruler: t } = this.refs,
            e = t.offsetWidth;
          if (!e) return;
          const s = this.el.getBoundingClientRect();
          ((this.width = s.width), (this.height = s.height));
          const i = (this.height - 4 * e) / 4;
          this.paths = [];
          const h = [e, e, i, i, i, i, e, e];
          h.reduce((t, s, i) => {
            const a =
                i < 4 ? 2 * e * Math.max(2 - i, 0) : 2 * e * Math.max(2 - (h.length - 1 - i), 0),
              n = {
                y: t,
                width: this.width - a,
                scale: 1,
                maxScale: 1 + (this.height / this.width) * 0.5,
                minScale: 1 - (this.height / this.width) * 0.5,
                height: s,
              };
            return (this.paths.push(n), t + s);
          }, 0);
        }
        onMouseEnter() {
          (this.paths || this.setClipPaths(), this.animateClipPath());
        }
        onMouseLeave() {
          this.resetClipPath();
        }
        drawClipPath() {
          const { paths: t, el: e } = this;
          let s = "";
          (t.forEach((t) => {
            const e = t.width * t.scale,
              i = t.height,
              h = (this.width - e) / 2,
              a = t.y;
            s += `M ${h} ${a} L ${h + e} ${a} L ${h + e} ${a + i} L ${h} ${a + i} Z `;
          }),
            e.style.setProperty("--clip-path", `path('${s}')`));
        }
        animateClipPath() {
          const { paths: t } = this;
          t.forEach((t) => {
            h.w$.to(t, {
              scale: t.maxScale,
              duration: 0.15 + 0.3 * Math.random(),
              delay: 0.3 * Math.random(),
              ease: "power1.inOut",
              repeat: -1,
              yoyo: !0,
              overwrite: !0,
            });
          });
        }
        resetClipPath() {
          const { paths: t } = this,
            e = h.w$.timeline();
          (e.fromTo(this.el, { opacity: 0.99 }, { opacity: 1, duration: 0.4, ease: "none" }, 0),
            e.to(
              t,
              {
                scale: t[0].minScale,
                duration: 0.4,
                ease: "expo.out",
                overwrite: !0,
                stagger: { each: 0.025, from: "center" },
              },
              0,
            ),
            e.to(
              t,
              {
                scale: 1,
                duration: 0.8,
                ease: "expo.inOut",
                stagger: { each: 0.025, from: "center" },
              },
              0.4,
            ));
        }
        tick() {
          this.paths && this.drawClipPath();
        }
      };
    },
  },
]);
