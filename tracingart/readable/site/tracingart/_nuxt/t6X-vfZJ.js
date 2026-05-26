import {
  _ as b,
  b as x,
  T as g,
  v as i,
  g as B,
  w as v,
  o as c,
  c as N,
  a as W,
  q as p,
  R as l,
  y as m,
  m as w,
} from './DPLBeim1.js';
import { R as E, B as I } from './BQjU4dwZ.js';
import { S as _, a as S, b as h } from './BBSPXiNi.js';
import { S as R, a as T, b as O } from './BGfcuG2n.js';
import './CDY68bNc.js';
import './CENEsQq1.js';
import './s5kuwhN6.js';
import './BdT36_8W.js';
import './CTD0GRTa.js';
import './BqbHwPfs.js';
import './C5x6R2a_.js';
import './CAExIIT3.js';
import './vxidHdmP.js';
import './EJcA7ZIo.js';
import './B-tuEXrK.js';
import './BBmyyArJ.js';
import './De0MQsoJ.js';
const q = { class: 'fillFixed' },
  A = {
    __name: 'SectionWrapperSandbox',
    setup(F) {
      const k = x(),
        y = g(),
        u = i(null),
        o = i(null),
        a = i(!1),
        d = i(!1),
        s = [
          { id: 'section-1', comp: _, data: R },
          { id: 'section-2', comp: S, data: T },
          { id: 'section-3', comp: h, data: O },
        ].find((t) => y.path.endsWith(t.id)),
        C = s.data.height + 1;
      return (
        B(() => {
          requestAnimationFrame(() => {
            a.value = !0;
          });
        }),
        E(u, {
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (t) => {
            var e, r;
            (r = (e = o.value) == null ? void 0 : e.setProgress) == null || r.call(e, t);
          },
        }),
        v(a, (t) => {
          var e, r, n, f;
          t
            ? (r = (e = o.value) == null ? void 0 : e.show) == null || r.call(e)
            : (f = (n = o.value) == null ? void 0 : n.reset) == null || f.call(n);
        }),
        v(d, (t) => {
          k.setScrollPaused(t);
        }),
        I(
          [
            { name: 'active', value: a },
            { name: 'pauseScroll', value: d },
          ],
          { title: 'Reveal Modules' },
        ),
        (t, e) => (
          c(),
          N(
            'div',
            {
              ref_key: 'refWrapper',
              ref: u,
              class: 'wrapper',
              style: w({ height: `${C * 100}lvh` }),
            },
            [
              W('div', q, [
                p(s).id === 'section-1'
                  ? (c(),
                    l(_, { key: 0, ref_key: 'refComponent', ref: o, active: a.value }, null, 8, [
                      'active',
                    ]))
                  : m('', !0),
                p(s).id === 'section-2'
                  ? (c(),
                    l(S, { key: 1, ref_key: 'refComponent', ref: o, active: a.value }, null, 8, [
                      'active',
                    ]))
                  : m('', !0),
                p(s).id === 'section-3'
                  ? (c(),
                    l(h, { key: 2, ref_key: 'refComponent', ref: o, active: a.value }, null, 8, [
                      'active',
                    ]))
                  : m('', !0),
              ]),
            ],
            4,
          )
        )
      );
    },
  },
  te = b(A, [['__scopeId', 'data-v-752e90fa']]);
export { te as default };
