"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [8728],
  {
    8728: (s, t, e) => {
      e.r(t);
      var i = e(8760),
        n = e(8432),
        h = e(8520),
        r = e(4680),
        o = e(9052);
      (h.w$.registerPlugin(r.w, o.gF),
        (window.plr.controllers.STestimonials = class extends i.c {
          init() {
            super.init();
            const s = this.refs.slide;
            ((this.ghosts = []),
              (this.items = Array.isArray(s) ? s : [s]),
              (this.speed = 0),
              (this.isPaused = !1),
              (this.isHovering = !1),
              (this.speedAnim = h.w$.fromTo(
                this,
                { speed: 0 },
                { speed: 1.5, duration: 0.5, ease: "power1.inOut" },
              )),
              luge.ticker.nextTick(this.initDraggable, this));
          }
          bindEvents() {
            (super.bindEvents(),
              (this.callbacks.onMouseEnter = this.onMouseEnter.bind(this)),
              (this.callbacks.onMouseLeave = this.onMouseLeave.bind(this)),
              this.on(this.refs.testimonials, "mouseenter", this.callbacks.onMouseEnter),
              this.on(this.refs.testimonials, "mouseleave", this.callbacks.onMouseLeave));
          }
          onResize() {
            n.Q.widthChanged && this.reCalc();
          }
          onMouseEnter() {
            ((this.isHovering = !0), this.speedAnim.reverse());
          }
          onMouseLeave() {
            ((this.isHovering = !1), this.speedAnim.play());
          }
          onViewportIn() {
            this.isPaused = !1;
          }
          onViewportOut() {
            this.isPaused = !0;
          }
          reCalc() {
            const {
              draggable: s,
              items: t,
              refs: { testimonials: e },
            } = this;
            if (!s) return;
            const i = t[0].getBoundingClientRect(),
              n = parseInt(window.getComputedStyle(e).columnGap, 10),
              r = Math.floor(i.width + n);
            ((this.width = r),
              this.fillScreen(),
              (this.wrap = h.w$.utils.wrap(-r, r * (this.items.length - 1))),
              h.w$.set(this.proxy, { x: 0 }),
              s.update(!0),
              this.onSliderUpdate());
          }
          initDraggable() {
            const s = this.refs.items.firstElementChild;
            ((this.proxy = document.createElement("div")),
              (this.draggable = r.w.create(this.proxy, {
                trigger: s,
                type: "x",
                inertia: !0,
                onDrag: this.onSliderUpdate.bind(this),
                onThrowUpdate: this.onSliderUpdate.bind(this),
              })[0]),
              this.reCalc());
          }
          onSliderUpdate() {
            const s = this.items,
              t = this.width,
              e = this.draggable.x,
              i = this.wrap;
            s.forEach((s, n) => {
              const h = i(e + t * n);
              s.style.transform = `translateX(${h}px)`;
            });
          }
          fillScreen() {
            const s = this.items,
              t = this.width,
              e = 2 * window.innerWidth,
              i = this.refs.testimonials;
            (this.ghosts.forEach((t) => {
              const e = s.indexOf(t);
              (s.splice(e, 1), t.remove());
            }),
              (this.ghosts = []));
            const n = this.ghosts,
              h = Math.ceil(e / t);
            if (s.length < h) {
              for (let t = 0; t < h - s.length; t++) {
                const e = s[t % s.length].cloneNode(!0);
                ((e.ariaHidden = !0), n.push(e), s.push(e));
              }
              i.append(...n);
            }
            this.items = s;
          }
          tick() {
            this.isPaused ||
              this.draggable.isDragging ||
              (h.w$.set(this.proxy, { x: `-=${this.speed}` }),
              this.draggable.update(),
              this.onSliderUpdate());
          }
        }));
    },
  },
]);
