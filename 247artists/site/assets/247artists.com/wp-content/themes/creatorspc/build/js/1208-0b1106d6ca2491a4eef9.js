"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [1208],
  {
    1208: (t, e, s) => {
      s.r(e);
      var i = s(8760),
        r = s(8520),
        n = s(314);
      (r.w$.registerPlugin(n.c),
        (window.plr.controllers.SEducationHome = class extends i.c {
          init() {
            (super.init(),
              this.setSizes(),
              this.setCourses(),
              luge && luge.emitter.once("beforePageInit", this.initScroll.bind(this)));
          }
          onResize() {
            (this.setSizes(), this.setCourses());
          }
          setSizes() {
            const { content: t } = this.refs,
              e = t.getBoundingClientRect(),
              s = Math.hypot(e.width, e.height);
            (this.el.style.setProperty("--content-height", `${e.height}px`),
              this.el.style.setProperty("--content-diag", `${s}px`));
          }
          setCourses() {
            const { content: t, course: e } = this.refs,
              s = t.getBoundingClientRect(),
              i = e[1].getBoundingClientRect(),
              r = Math.hypot(i.width, i.height) / 2;
            ((this.courses = []),
              (this.areaWidth = s.left),
              e.forEach((t, e) => {
                if (0 === t.offsetWidth) return;
                t.style.setProperty("--radius", `${r}px`);
                const s = this.initCourse({
                  el: t,
                  i: e,
                  x: 0,
                  y: null,
                  radius: r,
                  rotation: 0,
                  vr: 0,
                  vy: 0.1,
                  nvy: 0.1,
                  svy: 0.1,
                });
                this.courses.push(s);
              }));
          }
          initCourse(t) {
            return (
              null === t.y
                ? (t.y = Math.random() * window.safeHeight)
                : (t.y = t.nvy < 0 ? window.safeHeight + 2 * t.radius : -2 * t.radius),
              (t.x = window.safeWidth * Math.random()),
              (t.rotation = 60 * Math.random() - 30),
              (t.vr = 0.2 * Math.random() - 0.1),
              (t.vy = 0.1 + 0.5 * Math.random()),
              (t.nvy = t.vy),
              (t.svy = t.vy),
              (t.el.style.zIndex = Math.random() < 0.75 ? 1 : 3),
              t
            );
          }
          initScroll() {
            const { content: t } = this.refs;
            ((this.tl = r.w$.timeline({
              scrollTrigger: { trigger: this.el, start: "top 100%", end: "bottom 0%", scrub: 0.75 },
            })),
              this.tl.fromTo(t, { y: "150%" }, { y: "-150%", ease: "linear", duration: 1 }, 0));
          }
          tick() {
            let t = -0.05 * window.scrollDiff;
            ((t = t > 0 ? Math.max(t, 1) : Math.min(t, -1)),
              this.courses.forEach((e) => {
                const { el: s, x: i, y: r, rotation: n } = e;
                ((s.style.transform = `translate3d(${i}px, ${r}px, 0) rotate(${n}deg)`),
                  (e.nvy = e.vy * t * 5),
                  (e.svy += 0.5 * (e.nvy - e.svy)),
                  (e.y += e.svy),
                  (e.rotation += e.vr * t * 2),
                  ((e.nvy < 0 && e.y < -2.1 * e.radius) ||
                    (e.nvy > 0 && e.y > window.safeHeight + 2.1 * e.radius)) &&
                    (e = this.initCourse(e)));
              }));
          }
        }));
    },
  },
]);
