// Subtle section-jump menu for the local mirror (not part of the original site).
// Builds a hamburger button (top-right, always visible) that opens a list of all
// impress.js steps; clicking one jumps straight there via the impress API.
(function () {
  if (window.__loopNavInstalled) return;
  window.__loopNavInstalled = true;

  // Human-readable labels for the known step ids (falls back to a prettified id).
  var LABELS = {
    title: 'Title',
    generative: 'Generative Music',
    systemdefinition: 'What Is a System?',
    itsgonnarain: "It's Gonna Rain — Reich",
    reichphasing: "Reich's Phasing",
    airports: 'Music for Airports — Eno',
    'systems-again': 'Systems',
    inc: 'In C — Riley',
    incplayer: 'In C — Player',
    methodvsproduct: 'Method vs. Product',
    reflection: 'Reflection — Eno',
    softwareoverview: 'Generative Software',
    randomness: 'Randomness',
    stochasticdrummachine: 'Stochastic Drum Machine',
    cage: 'John Cage',
    algorithms: 'Algorithms',
    generativegrammars: 'Generative Grammars',
    additiverhythmgrammar: 'Additive Rhythm Grammar',
    polyloops: 'Polyloops',
    connected: 'Connected Systems',
    tramsofhelsinki: 'Trams of Helsinki',
    tramszoomout: 'Trams — Zoom Out',
    datasonification: 'Data Sonification',
    hooman: 'Human Input',
    trope: 'Trope',
    musicmouse: 'Music Mouse',
    models: 'Models',
    markovplayer: 'Markov Player',
    deeplearning: 'Deep Learning',
    overview: 'Systems Overview',
    links: 'Links & Thanks'
  };

  function prettify(id) {
    if (!id) return '';
    return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var root = document.getElementById('impress');
    if (!root) return;
    var steps = Array.prototype.slice.call(root.querySelectorAll('.step'));
    if (!steps.length) return;

    var btn = document.createElement('button');
    btn.className = 'loop-nav-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Jump to section');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span></span><span></span><span></span>';

    var panel = document.createElement('nav');
    panel.className = 'loop-nav-panel';
    panel.setAttribute('aria-label', 'Sections');
    var list = document.createElement('ul');
    panel.appendChild(list);

    steps.forEach(function (step, i) {
      var li = document.createElement('li');
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'loop-nav-item';
      item.dataset.target = step.id || '';
      var label = (step.id && LABELS[step.id]) || prettify(step.id) || ('Slide ' + (i + 1));
      var idx = ('0' + (i + 1)).slice(-2);
      item.innerHTML = '<span class="loop-nav-idx">' + idx + '</span><span class="loop-nav-label"></span>';
      item.querySelector('.loop-nav-label').textContent = label;
      item.addEventListener('click', function () { gotoStep(step); close(); });
      li.appendChild(item);
      list.appendChild(li);
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    function open() {
      panel.classList.add('open');
      btn.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      var active = list.querySelector('.loop-nav-item.active');
      if (active) active.scrollIntoView({block: 'nearest'});
    }
    function close() {
      panel.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() { panel.classList.contains('open') ? close() : open(); }

    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    function gotoStep(step) {
      try {
        var api = window.impress && window.impress();
        if (api && typeof api.goto === 'function') { api.goto(step); return; }
      } catch (e) {}
      if (step.id) window.location.hash = '#/' + step.id; // fallback
    }

    function setActive(id) {
      var items = list.querySelectorAll('.loop-nav-item');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('active', items[i].dataset.target === id);
      }
    }

    // impress dispatches a bubbling 'impress:stepenter' on the entered step.
    document.addEventListener('impress:stepenter', function (e) {
      if (e.target && e.target.id) setActive(e.target.id);
    });

    // Initialise the highlight from the current step / hash.
    var current = root.querySelector('.step.active') ||
      (location.hash && document.getElementById(location.hash.replace(/^#\/?/, '')));
    if (current && current.id) setActive(current.id);
  });
})();
