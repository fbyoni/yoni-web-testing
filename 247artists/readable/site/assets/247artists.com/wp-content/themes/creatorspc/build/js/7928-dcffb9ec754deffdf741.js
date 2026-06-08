"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [7928],
  {
    7928: (t, i, s) => {
      s.r(i);
      var e = s(8760),
        h = s(8520),
        a = s(314);
      (h.w$.registerPlugin(a.c),
        (window.plr.controllers.SHeroLp = class extends e.c {
          init() {
            super.init();
            const { canvas: t } = this.refs;
            ((this.ctx = t.getContext("2d")),
              (this.render = {
                width: window.safeWidth,
                height: window.safeHeight,
                dpi: window.devicePixelRatio,
              }),
              this.update(),
              (this.imagesIndex = 0),
              (this.images = []),
              (this.imagesUrls = JSON.parse(this.el.dataset.images)),
              (this.lastEmit = { x: 0, y: 0, time: 0, delay: 0 }),
              (this.isPaused = !1));
          }
          onResize() {
            this.update();
          }
          onViewportIn() {
            this.isPaused = !1;
          }
          onViewportOut() {
            this.isPaused = !0;
          }
          update() {
            (this.setLogosSize(),
              this.setContentBackground(),
              this.setBounding(),
              this.setCanvasSize(),
              this.setCircles());
          }
          setLogosSize() {
            const t = this.refs.logo;
            t &&
              t.forEach((t) => {
                t.complete
                  ? this.setLogoSize(t)
                  : t.addEventListener(
                      "load",
                      () => {
                        this.setLogoSize(t);
                      },
                      { once: !0 },
                    );
              });
          }
          setLogoSize(t) {
            const i = t.naturalWidth,
              s = t.naturalHeight;
            if (!i || !s) return;
            let e = "vertical";
            (i > s ? (e = "horizontal") : i === s && (e = "square"),
              t.classList.remove("s__reassurance__image--vertical"),
              t.classList.add(`s__reassurance__image--${e}`),
              t.setAttribute("width", i),
              t.setAttribute("height", s));
          }
          setContentBackground() {
            const { background: t, content: i } = this.refs;
            if (!t) return;
            const s = t.querySelector("path"),
              e = i.getBoundingClientRect();
            ((t.style.width = `${e.width}px`), (t.style.height = `${e.height}px`));
            const h = e.width - 1,
              a = e.width - 1,
              r = e.height,
              n = { x: a - 10, y: r + 10 },
              o = -10,
              c = `M0,1 L${h},1 L${a},${r} L${n.x},${n.y} L${o},${n.y} L${o},10 Z`;
            s.setAttribute("d", c);
          }
          setBounding() {
            const { images: t } = this.refs;
            this.rect = this.el.getBoundingClientRect();
            const i = t.getBoundingClientRect();
            ((this.imagesWrapper = {
              left: i.left,
              top: i.top - this.rect.top,
              width: i.width,
              height: i.height,
            }),
              (this.size = Math.min(0.125 * Math.hypot(this.rect.width, this.rect.height), 200)),
              (this.width = this.rect.width),
              (this.hWidth = this.width / 2),
              (this.height = this.rect.height),
              (this.hHeight = this.height / 2));
          }
          setCanvasSize() {
            const { canvas: t } = this.refs;
            ((this.render = {
              width: this.rect.width,
              height: this.rect.height,
              dpi: window.devicePixelRatio,
            }),
              (t.width = this.render.width * this.render.dpi),
              (t.height = this.render.height * this.render.dpi));
          }
          setCircles() {
            ((this.circles = []),
              (this.center = { x: 1.1 * this.rect.width, y: this.rect.height }));
            const t = Math.hypot(this.center.x, this.center.y),
              i = this.center.x - this.rect.width,
              s = this.center.x - 0.5 * this.rect.width,
              e = 0.45 * this.center.x;
            let h = 100,
              a = s;
            for (this.circles.push({ x: this.center.x, y: this.center.y, r: a }); a < t; )
              ((a += h),
                (h *= 1.1),
                this.circles.push({ x: this.center.x, y: this.center.y, r: a }));
            for (h = 100, a = s - h; a > i; )
              (this.circles.push({ x: this.center.x, y: this.center.y, r: a }),
                (a -= h),
                (h *= a > e ? 0.9 : 0.75),
                (h = Math.max(h, 10)));
          }
          drawCircles() {
            const { strokeStyle: t } = this.refs,
              { circles: i, ctx: s } = this,
              e = window.getComputedStyle(t),
              h = e.getPropertyValue("color"),
              a = parseFloat(e.getPropertyValue("opacity"));
            ((s.globalAlpha = a),
              (s.strokeStyle = h),
              i.forEach((t) => {
                (s.beginPath(),
                  s.arc(t.x, t.y, t.r, Math.PI, 2 * Math.PI),
                  s.stroke(),
                  s.closePath());
              }));
          }
          emitImage() {
            const { imagesWrapper: t } = this;
            if (this.images.length >= 20) return;
            if (performance.now() - this.lastEmit.time < this.lastEmit.delay) return;
            if (t.width < 1 || t.height < 1) return;
            const i = t.left + t.width * Math.random(),
              s = t.top + t.height * Math.random(),
              e = this.size * (1 + 0.5 * Math.random()),
              h = this.imagesUrls[this.imagesIndex],
              a = new r(h, i, s, 0, 0, e, this);
            (this.images.push(a),
              this.imagesIndex++,
              this.imagesIndex >= this.imagesUrls.length && (this.imagesIndex = 0),
              (this.lastEmit.x = i),
              (this.lastEmit.y = s),
              (this.lastEmit.time = performance.now()),
              (this.lastEmit.delay = 500 + 1500 * Math.random()));
          }
          tick(t) {
            if (this.isPaused) return;
            const { canvas: i } = this.refs,
              { ctx: s, render: e } = this;
            (s.clearRect(0, 0, i.width, i.height),
              s.save(),
              s.scale(e.dpi, e.dpi),
              this.drawCircles(),
              this.images.forEach((t) => {
                (t.move(), t.draw());
              }),
              this.emitImage(),
              s.restore());
          }
        }));
      class r {
        constructor(t, i, s, e, h, a, r) {
          ((this.src = t),
            (this.slices = 10),
            (this.corner = 2),
            (this.x = i),
            (this.y = s),
            (this.vx = e),
            (this.vy = h),
            (this.opacity = 1),
            (this.visibility = 1),
            (this.size = a),
            (this.parent = r),
            (this.isLoaded = !1),
            this.loadImage());
        }
        loadImage() {
          ((this.image = new window.Image()),
            (this.image.src = this.src),
            this.image.addEventListener("load", this.init.bind(this), { once: !0 }));
        }
        init() {
          (this.setSizes(), this.setClipPaths(), this.animate(), (this.isLoaded = !0));
        }
        setSizes() {
          this.aspectRatio = 1.1;
          let t = this.image.width,
            i = t / this.aspectRatio;
          i > this.image.height && ((i = this.image.height), (t = i * this.aspectRatio));
          const s = (this.image.width - t) / 2,
            e = (this.image.height - i) / 2;
          ((this.sourceSize = { x: s + 2, y: e + 2, width: t - 4, height: i - 4 }),
            (this.width = this.size),
            (this.hWidth = this.width / 2),
            (this.height = this.width / this.aspectRatio),
            (this.hHeight = this.height / 2),
            (this.destinationSize = {
              x: this.x - this.hWidth,
              y: this.y - this.hHeight,
              width: this.width,
              height: this.height,
            }));
        }
        setClipPaths() {
          const { corner: t, slices: i } = this;
          ((this.clipPaths = []), (this.clipPathSize = this.destinationSize.height / i));
          for (let s = 0; s < i; s++) {
            const e = Math.max(s < i / 2 ? t - s : s - (i - t - 1), 0),
              h = this.clipPathSize * e;
            this.clipPaths.push({
              y: this.clipPathSize * s,
              width: this.destinationSize.width - h,
            });
          }
        }
        animate() {
          const t = h.w$.timeline({ onComplete: this.destroy.bind(this) });
          (t.from(
            this.clipPaths,
            {
              width: 0,
              duration: 1.6,
              ease: "power3.inOut",
              stagger: { amount: 0.4, from: Math.round(this.slices / 2) },
            },
            0,
          ),
            t.to(this, { visibility: 0.25, duration: 2, ease: "linear" }, 2.2),
            t.to(this, { opacity: 0, duration: 1, ease: "linear" }, 3.2));
        }
        move() {
          const { isLoaded: t } = this;
          t &&
            ((this.x += this.vx),
            (this.y += this.vy),
            (this.destinationSize.x = this.x - this.hWidth),
            (this.destinationSize.y = this.y - this.hHeight));
        }
        draw() {
          const { isLoaded: t, image: i } = this,
            s = this.parent.ctx,
            e = this.destinationSize,
            h = this.sourceSize;
          t &&
            (s.save(),
            s.beginPath(),
            this.clipPaths.forEach((t) => {
              const i = e.x + (e.width - t.width) / 2,
                h = e.y + t.y,
                a = t.width,
                r = this.clipPathSize;
              s.rect(i, h, a, r);
            }),
            s.closePath(),
            s.clip(),
            (s.filter = `brightness(${this.visibility})`),
            (s.globalAlpha = this.opacity),
            s.drawImage(i, h.x, h.y, h.width, h.height, e.x, e.y, e.width, e.height),
            s.restore());
        }
        destroy() {
          this.parent.images = this.parent.images.filter((t) => t !== this);
        }
      }
    },
  },
]);
