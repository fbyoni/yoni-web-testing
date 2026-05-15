(function(){
  if (window.__netShimInstalled) return;
  window.__netShimInstalled = true;

  var loc = window.location;
  function sameOrigin(url){
    if (url == null || url === '') return true;
    try {
      var u = new URL(String(url), loc.href);
      if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:' || u.protocol === 'javascript:') return true;
      return u.origin === loc.origin;
    } catch(e){ return true; }
  }
  function warnBlock(kind, url){
    try { console.warn('[net-shim] blocked external ' + kind + ':', url); } catch(e){}
  }

  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch.bind(window);
    window.fetch = function(input, init){
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (!sameOrigin(url)) {
        warnBlock('fetch', url);
        return Promise.resolve(new Response('{}', {status: 200, headers: {'Content-Type':'application/json'}}));
      }
      return origFetch(input, init);
    };
  }

  if (typeof window.XMLHttpRequest === 'function') {
    var XHR = window.XMLHttpRequest;
    var origOpen = XHR.prototype.open;
    var origSend = XHR.prototype.send;
    XHR.prototype.open = function(method, url){
      this.__shimBlocked = !sameOrigin(url);
      if (this.__shimBlocked) {
        warnBlock('XHR', url);
        arguments[1] = 'about:blank';
      }
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function(){
      if (this.__shimBlocked) return;
      return origSend.apply(this, arguments);
    };
  }

  if (navigator && typeof navigator.sendBeacon === 'function') {
    var origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function(url, data){
      if (!sameOrigin(url)) { warnBlock('sendBeacon', url); return true; }
      return origBeacon(url, data);
    };
  }

  function guardElementSrc(el, attr){
    try {
      var proto = Object.getPrototypeOf(el);
      var desc = Object.getOwnPropertyDescriptor(proto, attr);
      if (!desc || !desc.set || !desc.get) return;
      Object.defineProperty(el, attr, {
        configurable: true,
        get: function(){ return desc.get.call(this); },
        set: function(v){
          if (!sameOrigin(v)) { warnBlock(el.tagName.toLowerCase()+'.'+attr, v); return; }
          desc.set.call(this, v);
        }
      });
    } catch(e){}
    var origSetAttr = el.setAttribute.bind(el);
    el.setAttribute = function(name, value){
      if (name && name.toLowerCase() === attr && !sameOrigin(value)) {
        warnBlock(el.tagName.toLowerCase()+'['+attr+']', value);
        return;
      }
      return origSetAttr(name, value);
    };
  }

  var SRC_TAGS = {script:'src', img:'src', iframe:'src', source:'src', video:'src', audio:'src', embed:'src', track:'src', link:'href'};
  var origCreate = document.createElement.bind(document);
  document.createElement = function(tag, opts){
    var el = origCreate(tag, opts);
    var t = (tag || '').toLowerCase();
    var attr = SRC_TAGS[t];
    if (attr) guardElementSrc(el, attr);
    return el;
  };

  if (typeof window.Image === 'function') {
    var OrigImage = window.Image;
    function ShimImage(w, h){
      var img = (w !== undefined) ? new OrigImage(w, h) : new OrigImage();
      guardElementSrc(img, 'src');
      return img;
    }
    ShimImage.prototype = OrigImage.prototype;
    window.Image = ShimImage;
  }

  if (typeof navigator.serviceWorker === 'object' && navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
    var origReg = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function(scriptURL, opts){
      if (!sameOrigin(scriptURL)) { warnBlock('serviceWorker.register', scriptURL); return Promise.reject(new Error('blocked')); }
      return origReg(scriptURL, opts);
    };
  }

  if (typeof window.WebSocket === 'function') {
    var OrigWS = window.WebSocket;
    function ShimWS(url, protocols){
      try {
        var u = new URL(String(url), loc.href);
        var wsOrigin = (u.protocol === 'wss:' ? 'https:' : 'http:') + '//' + u.host;
        if (wsOrigin !== loc.origin) { warnBlock('WebSocket', url); throw new Error('blocked'); }
      } catch(e) { if (e && e.message === 'blocked') throw e; }
      return protocols !== undefined ? new OrigWS(url, protocols) : new OrigWS(url);
    }
    ShimWS.prototype = OrigWS.prototype;
    Object.keys(OrigWS).forEach(function(k){ try { ShimWS[k] = OrigWS[k]; } catch(e){} });
    window.WebSocket = ShimWS;
  }

  if (typeof window.EventSource === 'function') {
    var OrigES = window.EventSource;
    function ShimES(url, opts){
      if (!sameOrigin(url)) { warnBlock('EventSource', url); throw new Error('blocked'); }
      return opts !== undefined ? new OrigES(url, opts) : new OrigES(url);
    }
    ShimES.prototype = OrigES.prototype;
    Object.keys(OrigES).forEach(function(k){ try { ShimES[k] = OrigES[k]; } catch(e){} });
    window.EventSource = ShimES;
  }
})();
