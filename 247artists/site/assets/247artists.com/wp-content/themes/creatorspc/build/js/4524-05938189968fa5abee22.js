"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [4524],
  {
    4524: (t, i, e) => {
      e.r(i);
      var s = e(8760),
        h = e(8520),
        n = e(314),
        r = e(8188);
      (h.w$.registerPlugin(n.c, r.c),
        (window.plr.controllers.SiteFootCtaLarge = class extends s.c {
          init() {
            super.init();
            const { canvas: t, scene: i } = this.refs;
            this.ctx = t.getContext("2d");
            const e = i.getBoundingClientRect();
            ((this.render = { width: e.width, height: e.height, dpi: window.devicePixelRatio }),
              (this.imagesIndex = 0),
              (this.images = []),
              (this.imagesUrls = JSON.parse(this.el.dataset.images)),
              (this.lastEmit = 0),
              (this.isPaused = !1),
              luge && luge.emitter.once("beforePageInit", this.setSizes.bind(this)));
          }
          onViewportIn() {
            this.isPaused = !1;
          }
          onViewportOut() {
            this.isPaused = !0;
          }
          onResize() {
            this.setSizes();
          }
          setSizes() {
            (this.setCanvasSize(), this.setGraphics());
          }
          setCanvasSize() {
            const { canvas: t, scene: i } = this.refs,
              e = i.getBoundingClientRect();
            ((this.render = {
              width: e.width,
              hWidth: 0.5 * e.width,
              height: e.height,
              hHeight: 0.5 * e.height,
              dpi: window.devicePixelRatio,
            }),
              (t.width = this.render.width * this.render.dpi),
              (t.height = this.render.height * this.render.dpi));
          }
          setGraphics() {
            (this.setRects(), this.setLines(), this.setBackground());
          }
          setRects() {
            const { cta: t, scene: i } = this.refs;
            this.el.style.setProperty("--offset", "0px");
            const e = i.getBoundingClientRect(),
              s = t.getBoundingClientRect(),
              h = this.render.width,
              n = this.render.height,
              r = s.top - e.top,
              o = r + s.height;
            ((this.innerRect = {
              p1: { x: s.left + 30, y: r },
              p2: { x: s.right - 30, y: r },
              p3: { x: s.right - 30, y: o },
              p4: { x: s.left + 30, y: o },
              offset: 0,
            }),
              (this.innerRect.width = this.innerRect.p2.x - this.innerRect.p1.x),
              (this.innerRect.height = this.innerRect.p4.y - this.innerRect.p1.y),
              (this.innerRect.center = {
                x: this.innerRect.p1.x + 0.5 * this.innerRect.width,
                y: this.innerRect.p1.y + 0.5 * this.innerRect.height,
              }));
            const c = Math.max(h, n),
              d = 0.5 * (h - c);
            ((this.outerRect = {
              p1: { x: d, y: 0 },
              p2: { x: d + c, y: 0 },
              p3: { x: d + c, y: n },
              p4: { x: d, y: n },
            }),
              (this.outerRect.width = this.outerRect.p2.x - this.outerRect.p1.x),
              (this.outerRect.height = this.outerRect.p4.y - this.outerRect.p1.y));
            const p = this.innerRect.p1.x,
              g = this.innerRect.p1.y,
              l = Math.sqrt(p * p + g * g),
              x = 1 / Math.floor(l / 60);
            this.rects = [];
            for (let t = 0; t <= 1; t += x) {
              const i = new a(t, this);
              this.rects.push(i);
            }
          }
          setLines() {
            const { innerRect: t, outerRect: i } = this;
            this.lines = [];
            const e = (t.p2.x - t.p1.x) / 10,
              s = (t.p4.y - t.p1.y) / 10,
              h = (i.p2.x - i.p1.x) / 10,
              n = (i.p4.y - i.p1.y) / 10;
            for (let r = 0; r <= 10; r++)
              for (let o = 0; o < 4; o++) {
                let a = "p1";
                2 === o ? (a = "p4") : 3 === o && (a = "p2");
                const c = { x: t[a].x + e * r * ((o + 1) % 2), y: t[a].y + s * r * (o % 2) },
                  d = { x: i[a].x + h * r * ((o + 1) % 2), y: i[a].y + n * r * (o % 2) };
                this.lines.push({ p1: c, p2: d });
              }
          }
          setBackground() {
            const { innerRect: t } = this,
              i = Math.floor(t.height / 6),
              e = (t.height - 6 * i) / 2;
            this.background = [];
            for (let s = 0; s < i; s++) {
              const i = { x: t.p1.x, y: t.p1.y + e + 6 * s },
                h = { x: t.p2.x, y: i.y };
              this.background.push({ p1: i, p2: h });
            }
          }
          ease(t) {
            return Math.pow(1 - t, 2);
          }
          drawLines() {
            const { ctx: t, lines: i, innerRect: e } = this;
            i.forEach((i) => {
              const { p1: s, p2: h } = i;
              (t.beginPath(),
                t.moveTo(s.x, s.y + e.offset),
                t.lineTo(h.x, h.y),
                (t.strokeStyle = "#423e44"),
                t.stroke(),
                t.closePath());
            });
          }
          drawBackground() {
            const { ctx: t, background: i } = this;
            i.forEach((i) => {
              const { p1: e, p2: s } = i;
              (t.beginPath(),
                t.moveTo(e.x, e.y),
                t.lineTo(s.x, s.y),
                (t.strokeStyle = "#423e44"),
                t.stroke(),
                t.closePath());
            });
          }
          emitImage() {
            const t = this.imagesUrls[this.imagesIndex],
              i = new o(t, this);
            (this.images.push(i),
              this.imagesIndex++,
              this.imagesIndex >= this.imagesUrls.length && (this.imagesIndex = 0),
              (this.lastEmit = performance.now()));
          }
          tick(t) {
            if (this.isPaused) return;
            const { canvas: i } = this.refs,
              { ctx: e, innerRect: s, rects: h, render: n } = this;
            (e.clearRect(0, 0, i.width, i.height),
              e.save(),
              e.scale(n.dpi, n.dpi),
              h.forEach((t) => {
                (t.animate(), t.draw());
              }),
              this.drawLines());
            const r = [...this.images].reverse();
            (r.forEach((t) => {
              (t.move(), t.draw());
            }),
              Math.random() < 0.1 && t - this.lastEmit > 1e3 && r.length < 5 && this.emitImage(),
              this.el.style.setProperty("--offset", `${s.offset}px`),
              e.restore());
          }
        }));
      class o {
        constructor(t, i) {
          ((this.src = t),
            (this.slices = 20),
            (this.corner = 2),
            (this.size = 0.0625 * Math.hypot(i.render.width, i.render.height)),
            (this.size += Math.random() * this.size),
            (this.origin = { x: i.innerRect.center.x, y: i.innerRect.center.y + 0.25 * this.size }),
            (this.x = this.origin.x),
            (this.y = this.origin.y),
            (this.scale = 0.5),
            (this.visibility = 1),
            (this.parent = i),
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
          const { parent: t } = this;
          this.aspectRatio = 1.1;
          let i = this.image.width,
            e = i / this.aspectRatio;
          e > this.image.height && ((e = this.image.height), (i = e * this.aspectRatio));
          const s = (this.image.width - i) / 2,
            h = (this.image.height - e) / 2;
          ((this.sourceSize = { x: s + 2, y: h + 2, width: i - 4, height: e - 4 }),
            (this.width = this.size),
            (this.hWidth = this.width / 2),
            (this.height = this.width / this.aspectRatio),
            (this.hHeight = this.height / 2),
            (this.destinationSize = {
              x: this.x - this.hWidth * this.scale,
              y: this.y - this.hHeight * this.scale,
              width: this.width,
              height: this.height,
            }));
          const n = Math.round(3 * Math.random());
          this.destination =
            0 === n
              ? { x: Math.random() * t.render.width, y: 3 * -this.height }
              : 1 === n
                ? { x: t.render.width + 3 * this.width, y: Math.random() * t.render.height }
                : 2 === n
                  ? { x: Math.random() * t.render.width, y: t.render.height + 3 * this.height }
                  : { x: 3 * -this.width, y: Math.random() * t.render.height };
        }
        setClipPaths() {
          const { corner: t, slices: i } = this;
          ((this.clipPaths = []), (this.clipPathSize = this.destinationSize.height / i));
          for (let e = 0; e < i; e++) {
            const s = Math.max(e < i / 2 ? t - e : e - (i - t - 1), 0),
              h = this.clipPathSize * s;
            this.clipPaths.push({
              y: this.clipPathSize * e,
              width: this.destinationSize.width - h,
            });
          }
        }
        animate() {
          const t = h.w$.timeline({ onComplete: this.destroy.bind(this) });
          (t.to(
            this.clipPaths,
            {
              width: 0,
              duration: 0.8,
              ease: "power3.inOut",
              stagger: { amount: 0.4, from: "random" },
            },
            6.8,
          ),
            t.fromTo(
              this,
              { x: this.destination.x, y: this.destination.y, scale: 3 },
              { x: this.origin.x, y: this.origin.y, scale: 0.25, ease: "linear", duration: 8 },
              0,
            ),
            t.fromTo(
              this,
              { visibility: 1 },
              { visibility: 0, duration: 2.4, ease: "linear" },
              5.6,
            ));
        }
        move() {
          const { isLoaded: t } = this;
          t &&
            ((this.destinationSize.x = this.x - this.hWidth),
            (this.destinationSize.y = this.y - this.hHeight));
        }
        draw() {
          const { isLoaded: t, image: i, scale: e, visibility: s } = this,
            h = this.parent.ctx,
            n = this.destinationSize;
          if (!n) return;
          const r = this.sourceSize,
            o = n.width * e,
            a = n.height * e,
            c = n.x - (o - n.width) / 2,
            d = n.y + this.parent.innerRect.offset * (1 - s);
          t &&
            (h.save(),
            h.beginPath(),
            this.clipPaths.forEach((t) => {
              const i = c + ((n.width - t.width) / 2) * e,
                s = d + t.y * e,
                r = t.width * e,
                o = this.clipPathSize * e;
              h.rect(i, s, r, o);
            }),
            h.closePath(),
            h.clip(),
            (h.filter = `brightness(${this.visibility})`),
            h.drawImage(i, r.x, r.y, r.width, r.height, c, d, o, a),
            h.restore());
        }
        destroy() {
          this.parent.images = this.parent.images.filter((t) => t !== this);
        }
      }
      class a {
        constructor(t, i) {
          ((this.innerRect = i.innerRect),
            (this.outerRect = i.outerRect),
            (this.position = t),
            (this.parent = i),
            (this.ctx = i.ctx),
            this.init());
        }
        init() {
          ((this.progress = this.position), this.animate());
        }
        animate() {
          ((this.progress += 0.002), (this.progress = Math.abs(this.progress % 1)));
        }
        destroy() {
          this.parent.rects = this.parent.rects.filter((t) => t !== this);
        }
        draw() {
          const { ctx: t, innerRect: i, outerRect: e } = this,
            s = this.parent.ease(this.progress),
            h = { x: i.p1.x + (e.p1.x - i.p1.x) * s, y: i.p1.y + (e.p1.y - i.p1.y) * s + i.offset },
            n = { x: i.p2.x + (e.p2.x - i.p2.x) * s, y: i.p2.y + (e.p2.y - i.p2.y) * s + i.offset },
            r = { x: i.p3.x + (e.p3.x - i.p3.x) * s, y: i.p3.y + (e.p3.y - i.p3.y) * s + i.offset },
            o = { x: i.p4.x + (e.p4.x - i.p4.x) * s, y: i.p4.y + (e.p4.y - i.p4.y) * s + i.offset };
          (t.beginPath(),
            t.moveTo(h.x, h.y),
            t.lineTo(n.x, n.y),
            t.lineTo(r.x, r.y),
            t.lineTo(o.x, o.y),
            t.lineTo(h.x, h.y),
            (t.strokeStyle = "#423e44"),
            t.stroke(),
            t.closePath());
        }
      }
    },
  },
]);
