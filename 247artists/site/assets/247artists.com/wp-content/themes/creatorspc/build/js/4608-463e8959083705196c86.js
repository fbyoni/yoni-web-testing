"use strict";
(self.webpackChunkcreatorspc = self.webpackChunkcreatorspc || []).push([
  [4608],
  {
    4608: (e, t, n) => {
      n.r(t);
      var o = n(8760);
      window.plr.controllers.BNewsletter = class extends o.c {
        count = 0;
        bindEvents() {
          (super.bindEvents(), this.on(this.el, "submit", this.handleSubmit.bind(this)));
        }
        handleSubmit(e) {
          e.preventDefault();
          const t = this.el,
            n = t.action.replace("/post?", "/post-json?"),
            o = new FormData(t),
            s = new url(n);
          for (const [e, t] of o.entries()) s.searchParams.set(e, t);
          this.jsonp(s.toString(), { param: "c" }, (e, t) => {
            if (e || !t) return (console.log(e), void alert("something went wrong!"));
            if ("success" !== t.result) return void alert(t.msg);
            const n = this.refs.msg;
            ((n.style.opacity = 1),
              setTimeout(() => {
                n.style.opacity = 0;
              }, 5e3));
          });
        }
        jsonp(e, t, n) {
          ("function" == typeof t && ((n = t), (t = {})), t || (t = {}));
          const o = t.prefix || "__jp",
            s = t.name || o + this.count++,
            r = t.param || "callback",
            i = null != t.timeout ? t.timeout : 1e4,
            c = encodeURIComponent,
            a = document.getElementsByTagName("script")[0] || document.head;
          let l;
          function u() {
            (p.parentNode && p.parentNode.removeChild(p),
              (window[s] = () => {}),
              l && clearTimeout(l));
          }
          (i &&
            (l = setTimeout(function () {
              (u(), n && n(new Error("Timeout")));
            }, i)),
            (window[s] = function (e) {
              (u(), n && n(null, e));
            }),
            (e = (e += (~e.indexOf("?") ? "&" : "?") + r + "=" + c(s)).replace("?&", "?")));
          const p = document.createElement("script");
          return (
            (p.src = e),
            a.parentNode.insertBefore(p, a),
            function () {
              window[s] && u();
            }
          );
        }
      };
    },
  },
]);
