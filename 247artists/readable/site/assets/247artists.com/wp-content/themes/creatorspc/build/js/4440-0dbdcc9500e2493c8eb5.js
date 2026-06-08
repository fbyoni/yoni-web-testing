"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [4440],
  {
    4440: (t, i, s) => {
      s.r(i);
      var h = s(8760),
        e = s(8520),
        a = s(314),
        n = s(8188);
      (e.w$.registerPlugin(a.c, n.c),
        (window.plr.controllers.SHeroHome = class extends h.c {
          init() {
            super.init();
            const { canvas: t } = this.refs;
            ((this.ctx = t.getContext("2d")),
              (this.render = {
                width: window.safeWidth,
                height: window.safeHeight,
                dpi: window.devicePixelRatio,
              }),
              (this.mouse = {
                x: -1,
                y: -1,
                sx: -1,
                sy: -1,
                lx: -1,
                ly: -1,
                vx: 0,
                vy: 0,
                svx: 0,
                svy: 0,
              }),
              (this.scroll = { y: 0, sy: 0 }),
              (this.head = { x: 0.5 * this.width, y: 0.5 * this.height, mx: 0, my: 0 }),
              (this.offsetY = 0),
              this.setBounding(),
              this.setCanvasSize(),
              this.setClipPaths(),
              this.setCircles(),
              (this.imagesIndex = 0),
              (this.images = []),
              (this.imagesUrls = JSON.parse(this.el.dataset.images)),
              (this.lastEmit = { x: 0, y: 0, scrollY: 0, time: 0 }),
              (this.isPaused = !1),
              (this.isInit = !1),
              (this.isSleeping = !0),
              (this.sleepTimeout = null),
              this.sleep(),
              luge && luge.emitter.once("afterReveal", this.initScroll.bind(this)));
          }
          bindEvents() {
            (super.bindEvents(),
              (this.callbacks.onScroll = this.onScroll.bind(this)),
              this.on(this.el, "scroll", this.callbacks.onScroll));
          }
          onResize() {
            (this.setBounding(),
              this.setCanvasSize(),
              this.setClipPaths(),
              this.setCircles(),
              this.initScroll());
          }
          onMouseMove(t) {
            const { mouse: i, scroll: s } = this,
              h = t.pageX,
              e = t.pageY - s.y;
            ((i.x = h),
              (i.y = e),
              (i.vx = Math.max(Math.min(i.x - i.lx, 10), -10)),
              (i.vy = Math.max(Math.min(i.y - i.ly, 10), -10)),
              (i.svx += 0.1 * (i.vx - i.svx)),
              (i.svy += 0.1 * (i.vy - i.svy)),
              (i.lx = i.x),
              (i.ly = i.y),
              this.isInit && this.wake());
          }
          onScroll() {
            const { mouse: t, scroll: i } = this,
              s = i.y > i.sy ? "down" : "up";
            ((i.y = window.scrollY),
              (t.x = 0.5 * this.width),
              (t.y = "down" === s ? 0.75 * this.height : 0.25 * this.height),
              (t.lx = t.x),
              (t.ly = t.y),
              (t.vx = 0),
              (t.vy = 0),
              this.isInit && this.wake());
          }
          onViewportIn() {
            this.isPaused = !1;
          }
          onViewportOut() {
            this.isPaused = !0;
          }
          sleep() {
            ((this.isSleeping = !0),
              (this.head.x = 0.5 * this.width),
              (this.head.y = 0.5 * this.height));
          }
          wake() {
            ((this.isSleeping = !1),
              clearTimeout(this.sleepTimeout),
              (this.sleepTimeout = setTimeout(this.sleep.bind(this), 3e3)));
          }
          setBounding() {
            const { inner: t } = this.refs;
            ((this.innerRect = t.getBoundingClientRect()),
              (this.size = 0.125 * Math.hypot(this.innerRect.width, this.innerRect.height)),
              (this.spacing = 0.5 * this.size),
              (this.rect = this.el.getBoundingClientRect()),
              (this.top = this.rect.top - this.scroll.y),
              (this.width = this.innerRect.width),
              (this.hWidth = this.width / 2),
              (this.height = this.innerRect.height),
              (this.hHeight = this.height / 2));
          }
          setCanvasSize() {
            const { canvas: t } = this.refs;
            ((this.render = {
              width: this.innerRect.width,
              height: this.innerRect.height,
              dpi: window.devicePixelRatio,
            }),
              (t.width = this.render.width * this.render.dpi),
              (t.height = this.render.height * this.render.dpi));
          }
          setCircles() {
            const { clipPathWidth: t } = this;
            ((this.circles = []),
              (this.center = { x: 1.1 * this.innerRect.width, y: this.innerRect.height }));
            const i = Math.hypot(this.center.x, this.center.y),
              s = this.center.x - this.innerRect.width,
              h = this.center.x - 0.5 * this.innerRect.width,
              e = 0.45 * this.center.x;
            let a = 100,
              n = h;
            this.circles.push({ x: this.center.x, y: this.center.y, r: n, toR: n });
            let r = 1;
            for (; n < i; ) {
              ((n += a), (a *= 1.1));
              const i = h + t * r;
              (this.circles.push({ x: this.center.x, y: this.center.y, r: n, toR: i }), r++);
            }
            for (a = 100, n = h - a, r = 1; n > s; ) {
              const i = Math.max(h - t * r, 0);
              (this.circles.push({ x: this.center.x, y: this.center.y, r: n, toR: i }),
                (n -= a),
                (a *= n > e ? 0.9 : 0.75),
                (a = Math.max(a, 10)),
                r++);
            }
          }
          setClipPaths() {
            ((this.clipPaths = []), (this.clipPathWidth = this.innerRect.width / 6));
            for (let t = 0; t < 6; t++)
              this.clipPaths.push({ x: this.clipPathWidth * t, height: this.innerRect.height });
          }
          initScroll() {
            const { height: t } = this,
              { title: i } = this.refs;
            (this.tl && this.tl.revert(),
              this.titleSt && this.titleSt.revert(),
              (this.titleSt = new n.c(i, {
                type: "chars,words,lines",
                linesClass: "line",
                wordsClass: "word",
                charsClass: "char",
              })),
              (this.tl = e.w$.timeline({
                scrollTrigger: {
                  trigger: this.el,
                  start: "top 0%",
                  end: "bottom 100%",
                  scrub: 0.25,
                },
              })),
              this.tl.fromTo(this, { offsetY: 0 }, { offsetY: t, duration: 2, ease: "linear" }, 0),
              this.tl.to(
                this.circles,
                { r: (t) => this.circles[t].toR, duration: 2, ease: "power1.inOut" },
                0,
              ),
              this.tl.to(
                this.titleSt.words,
                {
                  x: -1 * window.safeWidth,
                  ease: "power3.in",
                  duration: 1,
                  stagger: { each: "0.05" },
                },
                0,
              ),
              this.tl.to(
                this.clipPaths,
                {
                  height: 0,
                  duration: 0.5,
                  ease: "power3.inOut",
                  stagger: { each: 0.1, from: "random" },
                },
                2.5,
              ),
              this.timelines.push(this.tl),
              (this.isInit = !0));
          }
          drawCircles() {
            const { circles: t, ctx: i, offsetY: s } = this;
            t.forEach((t) => {
              (i.beginPath(),
                i.arc(t.x, t.y - s, t.r, Math.PI, 2 * Math.PI),
                (i.strokeStyle = "#423E44"),
                i.stroke(),
                i.closePath());
            });
          }
          drawLines() {
            const { circles: t, ctx: i, offsetY: s, render: h } = this;
            t.forEach((t) => {
              const e = { x: t.x - t.r, y: t.y - s },
                a = { x: e.x, y: h.height };
              (i.beginPath(),
                i.moveTo(e.x, e.y),
                i.lineTo(a.x, a.y),
                (i.strokeStyle = "#423E44"),
                i.stroke(),
                i.closePath());
            });
          }
          drawClipPath() {
            let t = "";
            (this.clipPaths.forEach((i, s) => {
              t += `M ${i.x} ${i.height} h ${this.clipPathWidth} v -${i.height} h -${this.clipPathWidth} Z `;
            }),
              this.el.style.setProperty("--clip-path", `path('${t}')`));
          }
          emitImage() {
            const { mouse: t, scroll: i, spacing: s } = this;
            if (this.images.length >= 20 || (-1 === t.x && -1 === t.y && !this.isSleeping)) return;
            let h = !1,
              e = 0,
              a = 0;
            if (
              (this.isSleeping
                ? ((e = this.head.x + this.head.mx), (a = this.head.y + this.head.my))
                : ((e = t.sx), (a = t.sy)),
              0 === this.lastEmit.x && 0 === this.lastEmit.y)
            )
              h = !0;
            else {
              const t = e - this.lastEmit.x,
                n = a - this.lastEmit.y - (i.sy - this.lastEmit.scrollY);
              Math.hypot(t, n) > s && (h = !0);
            }
            if (h) {
              const s = this.imagesUrls[this.imagesIndex];
              let h = 0,
                n = 0;
              this.isSleeping ? ((h = 5), (n = -5)) : ((h = t.svx), (n = t.svy));
              const l = new r(s, e, a, h, n, this.size, this);
              (this.images.push(l),
                this.imagesIndex++,
                this.imagesIndex >= this.imagesUrls.length && (this.imagesIndex = 0),
                (this.lastEmit.x = e),
                (this.lastEmit.y = a),
                (this.lastEmit.scrollY = i.sy),
                (this.lastEmit.time = performance.now()));
            }
          }
          tick(t) {
            if (this.isPaused) return;
            const { canvas: i } = this.refs,
              { ctx: s, mouse: h, scroll: e, render: a } = this;
            ((h.sx += 0.5 * (h.x - h.sx)),
              (h.sy += 0.5 * (h.y - h.sy)),
              (e.sy += 0.1 * (e.y - e.sy)),
              (this.head.mx = Math.cos(5e-4 * (t - 3e3)) * (this.width - this.size) * 0.5),
              (this.head.my = Math.sin(0.001 * t) * this.height * 0.1),
              s.clearRect(0, 0, i.width, i.height),
              s.save(),
              s.scale(a.dpi, a.dpi),
              this.drawCircles(),
              this.drawLines(),
              this.drawClipPath(),
              this.images.forEach((t) => {
                (t.move(), t.draw());
              }),
              this.emitImage(),
              s.restore());
          }
        }));
      class r {
        constructor(t, i, s, h, e, a, n) {
          ((this.src = t),
            (this.slices = 10),
            (this.corner = 2),
            (this.x = i),
            (this.y = s),
            (this.vx = h),
            (this.vy = e),
            (this.scrollY = n.scroll.sy),
            (this.opacity = 1),
            (this.visibility = 1),
            (this.size = a),
            (this.parent = n),
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
            h = (this.image.height - i) / 2;
          ((this.sourceSize = { x: s + 2, y: h + 2, width: t - 4, height: i - 4 }),
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
            const h = Math.max(s < i / 2 ? t - s : s - (i - t - 1), 0),
              e = this.clipPathSize * h;
            this.clipPaths.push({
              y: this.clipPathSize * s,
              width: this.destinationSize.width - e,
            });
          }
        }
        animate() {
          const t = e.w$.timeline({ onComplete: this.destroy.bind(this) });
          (t.from(
            this.clipPaths,
            {
              width: 0,
              duration: 0.8,
              ease: "power3.inOut",
              stagger: { amount: 0.4, from: Math.round(this.slices / 2) },
            },
            0,
          ),
            t.to(
              this.clipPaths,
              {
                width: 0,
                duration: 0.8,
                ease: "power3.inOut",
                stagger: { amount: 0, from: Math.round(this.slices / 2) },
              },
              1.2,
            ),
            t.to(this, { visibility: 0.25, duration: 0.6, ease: "linear" }, 0.8),
            this.parent.isSleeping && t.timeScale(0.75));
        }
        move() {
          const { isLoaded: t } = this;
          if (!t) return;
          ((this.x += this.vx), (this.y += this.vy), (this.vx *= 0.95), (this.vy *= 0.95));
          const i = this.parent.scroll.y - this.scrollY;
          ((this.destinationSize.x = this.x - this.hWidth),
            (this.destinationSize.y = this.y - this.hHeight - 1.5 * i));
        }
        draw() {
          const { isLoaded: t, image: i } = this,
            s = this.parent.ctx,
            h = this.destinationSize,
            e = this.sourceSize;
          t &&
            (s.save(),
            s.beginPath(),
            this.clipPaths.forEach((t) => {
              const i = h.x + (h.width - t.width) / 2,
                e = h.y + t.y,
                a = t.width,
                n = this.clipPathSize;
              s.rect(i, e, a, n);
            }),
            s.closePath(),
            s.clip(),
            (s.filter = `brightness(${this.visibility})`),
            (s.globalAlpha = this.opacity),
            s.drawImage(i, e.x, e.y, e.width, e.height, h.x, h.y, h.width, h.height),
            s.restore());
        }
        destroy() {
          this.parent.images = this.parent.images.filter((t) => t !== this);
        }
      }
    },
  },
]);
