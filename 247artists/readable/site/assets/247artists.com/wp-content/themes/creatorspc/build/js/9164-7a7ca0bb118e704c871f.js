"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [9164],
  {
    9164: (e, t, r) => {
      r.r(t);
      var s = r(8760),
        o = r(8520);
      window.plr.controllers.BArticles = class extends s.c {
        bindEvents() {
          (super.bindEvents(), this.on(this.refs.more, "click", this.onMoreClick.bind(this)));
        }
        onMoreClick(e) {
          e.preventDefault();
          const t = e.currentTarget;
          (history.replaceState({}, "", t.href), this.fetchArticles(t.href, !0));
        }
        async fetchArticles(e, t = !1) {
          const {
            el: r,
            refs: { more: s, items: i },
          } = this;
          (this.controller && this.controller.abort(),
            (this.controller = new AbortController()),
            r.classList.add("is-loading"));
          const l = await fetch(e, { signal: this.controller.signal });
          if (!l.ok) throw new Error("error fetching articles");
          const n = new DOMParser().parseFromString(await l.text(), "text/html"),
            c = n.querySelector('[data-plr-component="b-articles"]'),
            a = n.querySelector(".js-more"),
            h = i.lastElementChild;
          t || (i.innerHTML = "");
          const m = Array.from(c.querySelectorAll(".b-article"));
          (i.append(...m),
            r.classList.toggle("s--has-more", c.classList.contains("s--has-more")),
            (s.href = a.href),
            luge.emitter.emit("update"),
            t && luge.smoothscroll.lenis.scrollTo(h.nextElementSibling, { offset: -50 }),
            this.anim && this.anim.kill(),
            (this.anim = o.w$.from(m, {
              opacity: 0,
              y: 30,
              ease: "power3.out",
              duration: 1,
              stagger: 0.075,
            })),
            r.classList.remove("is-loading"));
        }
      };
    },
  },
]);
