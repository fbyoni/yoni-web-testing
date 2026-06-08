"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [5072],
  {
    5072: (t, s, e) => {
      e.r(s);
      var i = e(8760),
        h = e(8432);
      window.plr.controllers.ALinesHorizontal = class extends i.c {
        init() {
          (super.init(),
            (this.side = this.el.dataset.side || "both"),
            (this.render = { width: window.safeWidth, height: window.safeHeight }),
            (this.lineSpacing = 6),
            (this.lineWidth = 1),
            (this.isPaused = !1),
            (this.ampls = Array.from({ length: 3 }).map(() => 5 + 5 * Math.random())),
            (this.freqs = this.ampls.map(() => 0.0075 + 0.005 * Math.random())),
            (this.offsets = Array.from({ length: 2 }).map(() => 1e3 * Math.random())),
            luge &&
              (luge.emitter.once("beforePageInit", this.setSizes.bind(this)),
              luge.emitter.once("beforePageInit", this.setLines.bind(this))));
        }
        onResize() {
          (this.setSizes(), h.Q.widthChanged && this.setLines());
        }
        onViewportIn() {
          this.isPaused = !1;
        }
        onViewportOut() {
          this.isPaused = !0;
        }
        setSizes() {
          const { svg: t } = this.refs,
            s = this.el.getBoundingClientRect(),
            e = s.height,
            i = s.width;
          ((this.render = { width: i, height: e }),
            (t.style.width = `${i}px`),
            (t.style.height = `${e}px`));
        }
        setLines() {
          const { lineSpacing: t, lineWidth: s, render: e } = this,
            i = t + s;
          function h(t) {
            return t[Math.round(Math.random() * (t.length - 1))];
          }
          this.lines = [];
          const { prevLines: n, offsets: o, freqs: r, ampls: a } = this,
            d = (null == n ? void 0 : n.continueY) || 0,
            l = this.side;
          for (let t = 1; t <= e.width - 1; t += i) {
            this.continueY = this.lines.length + d;
            const s = Math.abs(Math.sin(0.01 * this.continueY));
            for (let i = 0; i < 2; i++) {
              if (("top" === l && 0 !== i) || ("bottom" === l && 1 !== i)) continue;
              const n = [],
                d = { y: 0 === i ? 0 : e.height, x: t },
                p = 0.1 * e.height * s * Math.random(),
                c = { y: Math.round(0 === i ? p : d.y - p), x: d.x };
              (n.push(d),
                n.push(c),
                this.lines.push({ points: n, p: 1, offset: h(o), freq: h(r), ampl: h(a) }));
            }
          }
        }
        drawLines(t) {
          const { path: s } = this.refs,
            { lines: e } = this;
          let i = "";
          (e.forEach((s) => {
            const e = s.points[0],
              h = s.points[1],
              n = h.y + Math.cos(t * s.freq + s.offset) * s.ampl;
            ((i += `M ${e.x} ${e.y} `), (i += `L ${e.x} ${h.y - (h.y - n) * s.p} `));
          }),
            s.setAttribute("d", i));
        }
        tick(t) {
          this.isPaused || this.drawLines(t);
        }
      };
    },
  },
]);
