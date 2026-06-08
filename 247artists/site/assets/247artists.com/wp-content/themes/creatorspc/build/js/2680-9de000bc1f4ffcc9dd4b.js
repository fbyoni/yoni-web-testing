"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [2680],
  {
    2680: (t, e, i) => {
      i.r(e);
      var s = i(8760),
        h = i(8520);
      window.plr.controllers.SKeyNumbers = class extends s.c {
        init() {
          (super.init(),
            (this.lineSpacing = 6),
            (this.lineWidth = 1),
            (this.render = { width: window.safeWidth, height: window.safeHeight }),
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
          (this.setSVGSize(), this.setLines());
        }
        setSVGSize() {
          const { svg: t } = this.refs,
            e = this.el.getBoundingClientRect(),
            i = e.height,
            s = e.width;
          ((this.render = { width: s, height: i, top: e.top }),
            (t.style.width = `${s}px`),
            (t.style.height = `${i}px`));
        }
        setLines() {
          const { render: t } = this,
            { content: e } = this.refs;
          this.lines = [];
          const i = e.getBoundingClientRect(),
            s = i.left,
            n = i.left + i.width,
            o = t.height,
            r = t.height - 0.9 * (i.top - t.top + i.height),
            a = Math.floor(t.width / (this.lineSpacing + this.lineWidth)),
            d = (t.width - a * (this.lineSpacing + this.lineWidth)) / 2,
            l = this.lineSpacing + this.lineWidth;
          for (let e = 0; e < a; e++) {
            const i = [],
              a = d + e * l;
            let p = 0;
            (a < s ? (p = 1 - a / s) : a > n && (p = (a - n) / (t.width - n)),
              (p = h.w$.parseEase("power1.inOut")(p)));
            const c = (o - (o - r) * (1 - p)) * (0.5 + 0.5 * Math.random()),
              w = { x: a, y: t.height },
              g = { x: a, y: w.y - c };
            (i.push(w),
              i.push(g),
              this.lines.push({
                points: i,
                p: 1,
                offset: 1e3 * Math.random(),
                freq: 0.0075 + 0.005 * Math.random(),
                ampl: 5 + 5 * Math.random(),
              }));
          }
        }
        moveLines(t) {}
        drawLines(t) {
          const { path: e } = this.refs,
            { lines: i } = this;
          let s = "";
          (i.forEach((e) => {
            const i = e.points[0],
              h = e.points[1],
              n = h.y + Math.cos(t * e.freq + e.offset) * e.ampl;
            ((s += `M ${i.x} ${i.y} `), (s += `L ${i.x} ${h.y - (h.y - n) * e.p} `));
          }),
            e.setAttribute("d", s));
        }
        tick(t) {
          this.isPaused || this.drawLines(t);
        }
      };
    },
  },
]);
