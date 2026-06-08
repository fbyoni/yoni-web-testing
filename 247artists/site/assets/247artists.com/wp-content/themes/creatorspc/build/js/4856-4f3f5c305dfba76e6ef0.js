"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [4856],
  {
    4856: (e, t, n) => {
      n.r(t);
      var s = n(8760),
        i = n(8520);
      window.plr.controllers.BModal = class extends s.c {
        init() {
          ((this.handleOpen = this.handleOpen.bind(this)),
            (this.onPageTransition = this.onPageTransition.bind(this)),
            super.init(),
            (this.handleKeydown = this.handleKeydown.bind(this)),
            (this.el.closest("[data-lg-page]") || document.body).appendChild(this.el));
        }
        bindEvents() {
          (super.bindEvents(),
            this.bindButtons(),
            this.on(this.refs.backdrop, "click", this.close.bind(this)),
            this.on(this.refs.close, "click", this.close.bind(this)),
            luge && luge.emitter.on("pageTransition", this.onPageTransition));
        }
        onPageTransition() {
          this.el && this.bindButtons();
        }
        bindButtons() {
          this.getButtons().forEach((e) => {
            (e.removeEventListener("click", this.handleOpen),
              e.addEventListener("click", this.handleOpen));
          });
        }
        getButtons() {
          return document.querySelectorAll(
            `[data-modal="${this.el.id}"], a[href="#${this.el.id}"]`,
          );
        }
        open() {
          const {
            el: e,
            refs: { backdrop: t, wrapper: n },
          } = this;
          (e.classList.add("is-opened"),
            i.w$.fromTo(t, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power3.inOut" }),
            i.w$.fromTo(n, { opacity: 0 }, { opacity: 1, ease: "power3.inOut", duration: 0.3 }));
          const s = new CustomEvent("opened");
          (e.dispatchEvent(s), document.addEventListener("keydown", this.handleKeydown));
        }
        close() {
          const {
            el: e,
            refs: { backdrop: t, wrapper: n },
          } = this;
          (i.w$.to(t, { opacity: 0, duration: 0.25, ease: "power3.out" }),
            i.w$.fromTo(
              n,
              { opacity: 1 },
              {
                opacity: 0,
                duration: 0.2,
                ease: "power3.out",
                onComplete: () => {
                  e.classList.remove("is-opened");
                  const t = new CustomEvent("closed");
                  e.dispatchEvent(t);
                },
              },
            ),
            document.removeEventListener("keydown", this.handleKeydown));
        }
        handleOpen(e) {
          (e.preventDefault(), this.open());
        }
        handleKeydown(e) {
          let t = !1;
          if ("key" in e) {
            const n = e.key.toLowerCase();
            t = "escape" === n || "esc" === n;
          } else t = 27 === e.keyCode;
          t && (e.preventDefault(), this.close());
        }
        kill() {
          (luge.emitter.off("pageTransition", this.onPageTransition),
            this.getButtons().forEach((e) => {
              e.removeEventListener("click", this.handleOpen);
            }),
            super.kill());
        }
      };
    },
  },
]);
