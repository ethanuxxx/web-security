/* 系統地圖首頁：「一筆 request 的旅程」播放器（桌面 >= 1011px，需要 GSAP + MotionPathPlugin）。
 * 資料來自 journey.json（建置時驗證後內嵌於 #sm-journey-data）；這裡只負責把資料排成一條 GSAP 時間軸。
 * 沒有這支程式或 GSAP 時，首頁的靜態地圖與說明照常運作。沒有鏡頭移動：整張地圖一直完整可見。
 * 動畫開關：<html data-motion="on|off">（theme.js 的頂端列按鈕）。off 時每一步直接跳到它的結束狀態，不做補間。
 */
(function () {
  "use strict";
  var d = document;
  var root = d.querySelector(".sm-home");
  var dataEl = d.getElementById("sm-journey-data");
  if (!root || !dataEl || !window.gsap) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (window.MotionPathPlugin) gsap.registerPlugin(MotionPathPlugin);

  var NS = "http://www.w3.org/2000/svg";
  var svg = root.querySelector(".sm-map-full");
  var box = root.querySelector(".sm-svgbox");
  var bar = root.querySelector(".sm-jbar");
  var tip = root.querySelector(".sm-tip");
  var narr = root.querySelector(".sm-jn");
  if (!svg || !box || !bar || !tip || !narr) return;
  root.classList.add("has-journey"); // the idle step list is only shown when this player can start it
  var idle = root.querySelector(".sm-jidle");
  var player = bar.querySelector(".sm-jplayer");
  var startBtn = root.querySelector(".sm-jstart");
  var playBtn = bar.querySelector('[data-act="toggle"]');
  var prevBtn = bar.querySelector('[data-act="prev"]');
  var nextBtn = bar.querySelector('[data-act="next"]');
  var stopBtn = bar.querySelector('[data-act="stop"]');
  var range = bar.querySelector('input[type="range"]');
  var ticks = bar.querySelector(".sm-jticks");
  var stepLab = bar.querySelector(".sm-jstep");
  var live = narr.querySelector(".sm-jn-live");
  var endEl = narr.querySelector(".sm-jn-end");
  var src = narr.querySelector(".sm-jn-src");
  var DESK = matchMedia("(min-width: 1011px)");
  var VW = data.vb[0], VH = data.vb[1];

  var route = null, tl = null, ov = null, layer = null, opened = false, playing = false, finished = false;
  var starts = [], ends = [], total = 0, cur = -1, labels = [], dragging = false;

  function motionOn() { return d.documentElement.getAttribute("data-motion") !== "off"; }
  function el(tag, cls, parent) {
    var e = d.createElementNS(NS, tag);
    if (cls) e.setAttribute("class", cls);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, cls, parent, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function pct(x, y, node) {
    node.style.left = (x / VW * 100) + "%";
    node.style.top = (y / VH * 100) + "%";
  }
  function pathD(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" ");
  }
  function plen(pts) {
    var n = 0;
    for (var i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return n;
  }

  /* ------------------------------------------------------------------ build the scene */
  function build(r) {
    layer = el("g", "jp-layer", svg);
    layer.setAttribute("aria-hidden", "true");
    ov = h("div", "jp-ov", box);
    ov.setAttribute("aria-hidden", "true");

    var glows = {}, lits = {}, pk = {}, cards = {}, mini = null;
    // glow rectangles for every component any step focuses, lit lines for every edge any step lights
    r.steps.forEach(function (st) {
      (st.focus || []).forEach(function (id) {
        if (glows[id]) return;
        var b = data.nodes[id], g = el("rect", "jp-glow", layer);
        g.setAttribute("x", b[0] - 4); g.setAttribute("y", b[1] - 4);
        g.setAttribute("width", b[2] + 8); g.setAttribute("height", b[3] + 8); g.setAttribute("rx", 12);
        glows[id] = g;
      });
      (st.edges || []).forEach(function (i) {
        if (lits[i]) return;
        var e = data.edges[i], l = el("line", "jp-lit", layer);
        l.setAttribute("x1", e[0]); l.setAttribute("y1", e[1]); l.setAttribute("x2", e[2]); l.setAttribute("y2", e[3]);
        lits[i] = l;
      });
    });

    // the little page that grows inside the Rendering box (step "render")
    var rb = data.nodes.rendering;
    if (rb) {
      mini = { g: el("g", "jp-mini", layer), parts: [] };
      var mx = rb[0] + rb[2] - 40, my = rb[1] + 6, mw = 34, mh = rb[3] - 12;
      function mrect(cls, x, y, w, hh) {
        var e = el("rect", cls, mini.g);
        e.setAttribute("x", x); e.setAttribute("y", y); e.setAttribute("width", w); e.setAttribute("height", hh); e.setAttribute("rx", 1.5);
        mini.parts.push(e);
        return e;
      }
      mrect("jp-mini-bg", mx, my, mw, mh);
      mrect("jp-mini-bar", mx + 3, my + 3, mw - 6, 5);
      var av = el("circle", "jp-mini-av", mini.g);
      av.setAttribute("cx", mx + 9); av.setAttribute("cy", my + 18); av.setAttribute("r", 5);
      mini.parts.push(av);
      mrect("jp-mini-ln", mx + 16, my + 14, mw - 19, 2.5);
      mrect("jp-mini-ln", mx + 16, my + 20, mw - 19, 2.5);
      mrect("jp-mini-ln", mx + 3, my + 29, mw - 6, 2.5);
      mrect("jp-mini-ln", mx + 3, my + 35, mw - 14, 2.5);
    }

    // packets: an SVG dot (moves along the line) and an HTML label (stays readable at any map scale)
    r.packets.forEach(function (p) {
      var tone = p.tone === "res" ? " jp-tone-res" : "";
      var g = el("g", "jp-pk" + tone, layer);
      el("circle", "jp-halo", g).setAttribute("r", 12);
      el("circle", "jp-dot", g).setAttribute("r", 6.5);
      var lab = h("div", "jp-lab" + tone, ov);
      var grid = h("div", "jp-lab-main", lab);
      grid.style.display = "grid";
      var v0 = h("span", "jp-lt", grid, p.label);
      v0.style.gridArea = "1 / 1";
      var more = h("div", "jp-lab-more", lab);
      pk[p.id] = { g: g, lab: lab, grid: grid, variants: [v0], more: more, sides: [{ t: 0, side: "t" }], anchors: [], cur: 0, def: p };
      gsap.set(g, { x: 0, y: 0, transformOrigin: "50% 50%" });
    });

    // cards: positioned wrapper (.jp-card) + animated inner box (.jp-cin)
    (r.cards || []).forEach(function (c) {
      var w = h("div", "jp-card" + (c.align === "r" ? " align-r" : ""), ov);
      pct(c.at[0], c.at[1], w);
      w.style.width = c.w + "rem";
      var inn = h("div", "jp-cin", w), o = { wrap: w, inn: inn, def: c };
      if (c.kind === "flip") {
        inn.className += " jp-flipbox";
        var fl = h("div", "jp-flip", inn);
        [["front", c.front, ""], ["back", c.back, " back tone-" + (c.back.tone || "ok")]].forEach(function (f) {
          var face = h("div", "jp-face" + f[2], fl);
          h("p", "jp-ct", face, f[1].title);
          f[1].lines.forEach(function (t) { h("p", "jp-cl", face, t); });
        });
        o.flip = fl;
      } else if (c.kind === "table") {
        h("p", "jp-ct", inn, c.title);
        if (c.query) h("p", "jp-q", inn, c.query);
        var tb = h("table", "jp-tbl", inn), thr = h("tr", "", h("thead", "", tb));
        c.header.forEach(function (t) { h("th", "", thr, t); });
        var tbody = h("tbody", "", tb);
        o.rows = c.rows.map(function (row) {
          var tr = h("tr", "jp-row", tbody);
          row.forEach(function (t) { h("td", "", tr, t); });
          return tr;
        });
      } else if (c.kind === "page") {
        h("p", "jp-ct", inn, c.title);
        (c.lines || []).forEach(function (t) { h("p", "jp-cl", inn, t); });
        var pg = h("div", "jp-page", inn), row = null, cols = null;
        o.parts = [];
        c.parts.forEach(function (kind) {
          var e;
          if (kind === "bar") { e = h("div", "jp-pg-bar", pg); }
          else if (kind === "avatar") {
            row = h("div", "jp-pg-row", pg);
            e = h("div", "jp-pg-av", row);
            cols = h("div", "jp-pg-cols", row);
          } else {
            e = h("div", "jp-pg-ln", cols || pg);
            e.style.width = (60 + 40 * ((o.parts.length * 37) % 3) / 3) + "%";
          }
          o.parts.push(e);
        });
      } else {
        h("p", "jp-ct", inn, c.title);
        c.lines.forEach(function (t, i) { h("p", "jp-cl" + (i === 0 && /^[A-Z]/.test(t) ? " mono" : ""), inn, t); });
      }
      cards[c.id] = o;
    });
    return { glows: glows, lits: lits, pk: pk, cards: cards, mini: mini };
  }

  /* ------------------------------------------------------------------ the timeline */
  var SPEED = 300; // map units per second along a line
  function build_tl(r, S) {
    var t = gsap.timeline({ paused: true, onUpdate: tick, onComplete: onDone });
    t.timeScale(1 / (data.pace || 1)); // journey.json "pace": 1.3 plays every duration and hold 1.3x longer
    starts = []; ends = []; labels = [];
    var cursor = 0;
    var prevFocus = {}, prevEdges = {}, prevCards = [];
    var seenAt = {}; // chain 'from' values: what each glow / lit edge currently shows
    r.steps.forEach(function (st, si) {
      var t0 = cursor;
      starts.push(t0);
      t.addLabel("s" + si, t0);
      // intro: clear the last step's cards, move the glow / lit edges on to this step
      prevCards.forEach(function (cid) {
        t.fromTo(S.cards[cid].inn, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: "power1.in" }, t0);
      });
      Object.keys(S.glows).forEach(function (id) {
        var on = (st.focus || []).indexOf(id) >= 0, was = !!prevFocus[id];
        if (on !== was) t.fromTo(S.glows[id], { opacity: was ? 1 : 0 }, { opacity: on ? 1 : 0, duration: 0.4 }, t0);
      });
      Object.keys(S.lits).forEach(function (i) {
        var on = (st.edges || []).indexOf(+i) >= 0, was = !!prevEdges[i];
        if (on !== was) t.fromTo(S.lits[i], { opacity: was ? 1 : 0 }, { opacity: on ? 1 : 0, duration: 0.4 }, t0);
      });
      prevFocus = {}; (st.focus || []).forEach(function (id) { prevFocus[id] = 1; });
      prevEdges = {}; (st.edges || []).forEach(function (i) { prevEdges[i] = 1; });
      prevCards = [];

      var cur_ = t0 + 0.45, lastStart = cur_;
      (st.actions || []).forEach(function (a) {
        var start = (a.with ? lastStart : cur_) + (a.delay || 0);
        var dur = schedule(t, S, a, start, si, prevCards);
        if (a.id) t.addLabel("s" + si + "-" + a.id, start);
        lastStart = start;
        cur_ = Math.max(cur_, start + dur);
      });
      ends.push(cur_);
      t.addLabel("e" + si, cur_);
      cursor = cur_ + 0.7; // a short hold, then the next step begins
    });
    Object.keys(S.pk).forEach(function (id) {
      S.pk[id].sides.sort(function (a, b) { return a.t - b.t; });
      S.pk[id].anchors.sort(function (a, b) { return a.t - b.t; });
    });
    total = ends[ends.length - 1] + 0.4;
    t.addLabel("end", total);
    t.set({}, {}, total); // make the timeline last to `total`
    return t;
  }

  function schedule(t, S, a, at, si, shown) {
    var P = a.packet && S.pk[a.packet], dur;
    var ease = "power1.inOut";
    if (P && a.side) P.sides.push({ t: at, side: a.side }); // where the label sits from this moment on
    if (P && a.labat !== undefined) P.anchors.push({ t: at, at: a.labat }); // [x, y]: park the label there (null: follow the dot again)
    switch (a.type) {
      case "show":
        dur = a.dur || 0.35;
        t.fromTo(P.g, { x: a.at[0], y: a.at[1], opacity: 0, scale: 0.2 },
          { x: a.at[0], y: a.at[1], opacity: 1, scale: 1, duration: dur, ease: "back.out(2.2)" }, at);
        return dur;
      case "hide":
        dur = a.dur || 0.25;
        t.fromTo(P.g, { opacity: 1, scale: 1 }, { opacity: 0, scale: 0.3, duration: dur }, at);
        return dur;
      case "move": {
        var len = plen(a.path);
        dur = a.dur || Math.max(0.5, Math.min(2.2, len / SPEED));
        // sideAt: [[fraction of the move, side], ...] moves the label to another side part-way along (it never covers box text)
        if (P && a.sideAt) a.sideAt.forEach(function (e) { P.sides.push({ t: at + e[0] * dur, side: e[1] }); });
        var pd = el("path", "", layer);
        pd.setAttribute("d", pathD(a.path));
        pd.setAttribute("fill", "none");
        pd.style.visibility = "hidden"; // geometry only
        var L = pd.getTotalLength(), T = Math.min(80, L * 0.8);
        var tr = el("path", "jp-trail" + (P.def.tone === "res" ? " jp-tone-res" : ""), layer);
        tr.setAttribute("d", pathD(a.path));
        tr.style.strokeDasharray = T + " " + (L + T);
        t.fromTo(tr, { strokeDashoffset: T, opacity: 0 }, { strokeDashoffset: T, opacity: 1, duration: 0.01 }, at);
        t.fromTo(tr, { strokeDashoffset: T }, { strokeDashoffset: T - L, duration: dur, ease: ease }, at);
        t.fromTo(tr, { opacity: 1 }, { opacity: 0, duration: 0.55 }, at + dur);
        t.to(P.g, { motionPath: { path: pd, align: pd, alignOrigin: [0.5, 0.5] }, duration: dur, ease: ease, immediateRender: false }, at);
        return dur;
      }
      case "relabel": {
        dur = a.dur || 0.3;
        var from = P.variants[P.cur], v = h("span", "jp-lt", P.grid, a.text);
        v.style.gridArea = "1 / 1"; v.style.opacity = 0;
        P.variants.push(v); P.cur = P.variants.length - 1;
        // out, then in (never both at once, so two texts are never drawn over each other)
        t.fromTo(from, { opacity: 1 }, { opacity: 0, duration: dur / 2 }, at);
        t.fromTo(v, { opacity: 0 }, { opacity: 1, duration: dur / 2 }, at + dur / 2);
        return dur;
      }
      case "open": {
        dur = a.dur || 0.5;
        P.more.innerHTML = "";
        a.details.forEach(function (x) { h("span", "", P.more, x); });
        var hh = a.details.length * 20 + 4;
        t.fromTo(P.more, { height: 0 }, { height: hh, duration: dur, ease: "power2.out" }, at);
        t.fromTo(P.g.querySelector(".jp-halo"), { attr: { r: 12 } }, { attr: { r: 18 }, duration: dur }, at);
        P.hh = hh;
        return dur;
      }
      case "close":
        dur = a.dur || 0.35;
        t.fromTo(P.more, { height: P.hh || 0 }, { height: 0, duration: dur }, at);
        t.fromTo(P.g.querySelector(".jp-halo"), { attr: { r: 18 } }, { attr: { r: 12 }, duration: dur }, at);
        return dur;
      case "card":
        dur = a.dur || 0.45;
        t.fromTo(S.cards[a.card].inn, { opacity: 0, y: 12, scale: 0.94 },
          { opacity: 1, y: 0, scale: 1, duration: dur, ease: "back.out(1.6)" }, at);
        shown.push(a.card);
        return dur;
      case "flip":
        dur = a.dur || 0.9;
        t.fromTo(S.cards[a.card].flip, { rotationY: 0 }, { rotationY: 180, duration: dur, ease: "power2.inOut" }, at);
        return dur;
      case "rows": {
        dur = a.dur || 0.6;
        var o = S.cards[a.card];
        a.rows.forEach(function (i) {
          t.fromTo(o.rows[i], { backgroundColor: "rgba(54,224,204,0)", color: "#d3deea" },
            { backgroundColor: "rgba(54,224,204,0.38)", color: "#ffffff", duration: dur }, at);
        });
        return dur;
      }
      case "burst": {
        dur = a.dur || 0.6;
        var b = el("circle", "jp-burst", layer);
        b.setAttribute("cx", a.at[0]); b.setAttribute("cy", a.at[1]); b.setAttribute("r", 6);
        t.fromTo(b, { opacity: 0, attr: { r: 6 } }, { opacity: 0.95, attr: { r: 8 }, duration: 0.02 }, at);
        t.fromTo(b, { opacity: 0.95, attr: { r: 8 } }, { opacity: 0, attr: { r: 36 }, duration: dur, ease: "power2.out" }, at + 0.02);
        return dur;
      }
      case "grow": {
        dur = a.dur || 1.7;
        var c = S.cards[a.card], n = c.parts.length, step = (dur - 0.5) / Math.max(1, n);
        c.parts.forEach(function (p, i) {
          var isAv = p.className.indexOf("av") >= 0, isLn = p.className.indexOf("ln") >= 0;
          var from = isLn ? { scaleX: 0, opacity: 0 } : (isAv ? { scale: 0, opacity: 0 } : { scaleY: 0, opacity: 0 });
          var to = isLn ? { scaleX: 1, opacity: 1 } : (isAv ? { scale: 1, opacity: 1 } : { scaleY: 1, opacity: 1 });
          to.duration = 0.5; to.ease = "power2.out"; from.transformOrigin = isAv ? "50% 50%" : (isLn ? "0% 50%" : "50% 0%");
          t.fromTo(p, from, to, at + i * step);
        });
        if (S.mini) {
          S.mini.parts.forEach(function (p, i) {
            var isCirc = p.tagName.toLowerCase() === "circle";
            t.fromTo(p, { opacity: 0, scale: isCirc ? 0 : 1, scaleY: isCirc ? 1 : 0, svgOrigin: undefined },
              { opacity: 1, scale: 1, scaleY: 1, duration: 0.5, ease: "power2.out" }, at + i * (dur - 0.5) / S.mini.parts.length);
          });
          t.fromTo(S.mini.g, { opacity: 0 }, { opacity: 1, duration: 0.2 }, at);
        }
        return dur;
      }
    }
    return 0;
  }

  /* ------------------------------------------------------------------ per-frame sync */
  function tick() {
    if (!tl) return;
    var time = tl.time();
    // packet labels follow their dots
    Object.keys(scene.pk).forEach(function (id) {
      var P = scene.pk[id];
      var x = gsap.getProperty(P.g, "x"), y = gsap.getProperty(P.g, "y");
      // a parked label (labat) glides from where it was to its anchor, so it never covers a box the dot has to pass
      var from = null, to = null, t0 = 0;
      P.anchors.forEach(function (e) { if (e.t <= time + 1e-6) { from = to; to = e.at; t0 = e.t; } });
      if (to || from) {
        var f = Math.max(0, Math.min(1, (time - t0) / 0.35)); f = f * f * (3 - 2 * f);
        var A = from || [x, y], B = to || [x, y];
        x = A[0] + (B[0] - A[0]) * f; y = A[1] + (B[1] - A[1]) * f;
      }
      pct(x, y, P.lab);
      P.lab.style.opacity = gsap.getProperty(P.g, "opacity");
      var side = "t";
      P.sides.forEach(function (s) { if (s.t <= time + 1e-6) side = s.side; });
      if (P.side !== side) { P.lab.className = P.lab.className.replace(/ side-\w+/g, "") + " side-" + side; P.side = side; }
    });
    var i = stepAt(time);
    if (!playing && playBtn.getAttribute("aria-label") !== (isEnd() ? "重播" : "播放")) setPlaying(false);
    if (!dragging) range.value = String(Math.round(time / total * 1000));
    if (i !== cur) setStep(i);
  }
  function stepAt(time) {
    var i = 0;
    for (var k = 0; k < starts.length; k++) if (starts[k] <= time + 1e-6) i = k;
    return i;
  }
  function setStep(i) {
    cur = i;
    var blk = src.querySelector('[data-route="' + route.id + '"][data-step="' + i + '"]');
    live.innerHTML = blk ? blk.innerHTML : ""; // one update per step change (aria-live polite)
    stepLab.textContent = "步驟 " + (i + 1) + "／" + route.steps.length;
    range.setAttribute("aria-valuetext", "步驟 " + (i + 1) + "：" + route.steps[i].title);
  }
  // the journey is "at its end" when the last step's final state is on screen (not only when playback ran out)
  function isEnd() { return !!tl && ends.length > 0 && tl.time() >= ends[ends.length - 1] - 0.05; }
  function setPlaying(p) {
    playing = p;
    var end = !p && isEnd();
    var txt = p ? "⏸ 暫停" : (end ? "↻ 重播" : "▶ 播放");
    if (playBtn.textContent !== txt) playBtn.textContent = txt;
    playBtn.setAttribute("aria-label", p ? "暫停" : (end ? "重播" : "播放"));
    if (endEl) endEl.hidden = !end; // the closing line: replay or leave; the final state stays visible until the reader decides
  }
  function onDone() {
    finished = true;
    clearTimer();
    setPlaying(false);
  }

  /* ------------------------------------------------------------------ transport */
  var timer = 0, scene = null;
  function clearTimer() { if (timer) { clearInterval(timer); timer = 0; } }
  function seekTime(time) { tl.pause(); tl.time(Math.max(0, Math.min(total, time)), false); finished = tl.time() >= total - 1e-6; }
  function goStep(i) {
    i = Math.max(0, Math.min(route.steps.length - 1, i));
    clearTimer(); setPlaying(false); finished = false;
    tl.pause();
    if (motionOn()) {
      var dt = Math.abs(ends[i] - tl.time());
      tl.tweenTo(ends[i], { duration: Math.max(0.35, Math.min(1.6, dt * 0.5)), ease: "power1.inOut", overwrite: true });
    } else {
      gsap.killTweensOf(tl);
      tl.time(ends[i], false);
    }
  }
  function curStep() { return stepAt(tl.time()); }
  function play() {
    if (finished || isEnd()) { finished = false; tl.time(0, false); }
    if (motionOn()) {
      gsap.killTweensOf(tl);
      tl.play(); setPlaying(true);
    } else {
      // no tweening: each step snaps to its end state, a few seconds apart
      var i = tl.time() < ends[0] - 1e-6 ? 0 : curStep() + 1;
      if (i >= route.steps.length) i = 0;
      snap(i); setPlaying(true);
      clearTimer();
      timer = setInterval(function () {
        var n = curStep() + 1;
        if (n >= route.steps.length) { clearTimer(); finished = true; setPlaying(false); return; }
        snap(n);
      }, 4500);
    }
  }
  function snap(i) { gsap.killTweensOf(tl); tl.pause(); tl.time(ends[i], false); }
  function pause() { clearTimer(); tl.pause(); gsap.killTweensOf(tl); setPlaying(false); }
  function toggle() { if (playing) pause(); else play(); }

  /* ------------------------------------------------------------------ open / close */
  function ticksUI() {
    ticks.innerHTML = "";
    starts.forEach(function (s, i) {
      var m = d.createElement("i");
      m.textContent = String(i + 1);
      m.style.left = "calc(8px + (100% - 16px) * " + (s / total).toFixed(4) + ")";
      ticks.appendChild(m);
    });
  }
  function open(autoplay) {
    if (opened || !DESK.matches) return;
    route = data.routes.filter(function (r) { return r.id === data.default; })[0] || data.routes[0];
    opened = true;
    root.classList.add("is-journey");
    narr.hidden = false;
    tip.setAttribute("aria-live", "off");
    idle.hidden = true; player.hidden = false;
    scene = build(route);
    tl = build_tl(route, scene);
    tl.seek(total, true); tl.seek(0, true); // prime every 'from' value, then back to the start
    ticksUI();
    cur = -1; finished = false;
    tick();
    setPlaying(false);
    if (autoplay) { play(); }
    else if (!motionOn()) { snap(0); }
    playBtn.focus();
  }
  function close(refocus) {
    if (!opened) return;
    clearTimer();
    if (tl) { tl.kill(); gsap.killTweensOf(tl); }
    tl = null; playing = false; opened = false; finished = false;
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    layer = ov = scene = null;
    root.classList.remove("is-journey");
    narr.hidden = true;
    live.innerHTML = "";
    if (endEl) endEl.hidden = true;
    tip.setAttribute("aria-live", "polite");
    player.hidden = true; idle.hidden = false;
    if (refocus) startBtn.focus();
  }

  startBtn.addEventListener("click", function () { open(true); });
  // idle panel: a step title starts the journey at that step
  function startAt(i) {
    open(false);
    if (!opened) return;
    i = Math.max(0, Math.min(route.steps.length - 1, i));
    if (motionOn()) { tl.time(starts[i], false); play(); }
    else { snap(i); setPlaying(false); }
  }
  [].forEach.call(root.querySelectorAll(".sm-prev-step"), function (b) {
    b.addEventListener("click", function () { startAt(parseInt(b.getAttribute("data-step"), 10) || 0); });
  });
  stopBtn.addEventListener("click", function () { close(true); });
  playBtn.addEventListener("click", toggle);
  function atEnd(i) { return tl.time() >= ends[i] - 0.05; }
  prevBtn.addEventListener("click", function () {
    var i = curStep();
    if (i === 0) { clearTimer(); setPlaying(false); finished = false; tl.pause(); gsap.killTweensOf(tl);
      if (motionOn()) tl.tweenTo(0, { duration: 0.5, ease: "power1.inOut" }); else tl.time(0, false); return; }
    goStep(i - 1);
  });
  nextBtn.addEventListener("click", function () { var i = curStep(); goStep(atEnd(i) ? i + 1 : i); });
  range.addEventListener("input", function () {
    dragging = true;
    pause();
    var time = range.value / 1000 * total;
    if (!motionOn()) time = ends[stepAt(time)];
    tl.time(Math.min(total, time), false);
    finished = tl.time() >= total - 1e-6;
    dragging = false;
    if (!motionOn()) range.value = String(Math.round(tl.time() / total * 1000));
  });
  bar.addEventListener("keydown", function (e) {
    if (!opened) return;
    var k = e.key, onBtn = e.target.tagName === "BUTTON";
    if (k === " " && !onBtn) { e.preventDefault(); toggle(); }
    else if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); nextBtn.click(); }
    else if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); prevBtn.click(); }
    else if (k === "Escape") { e.preventDefault(); close(true); }
  });

  // the motion switch changed while a journey is open: stop tweening, show the current step's end state
  new MutationObserver(function () {
    if (!opened) return;
    pause();
    if (!motionOn()) snap(curStep());
  }).observe(d.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  var onMq = function () { if (!DESK.matches) close(false); };
  if (DESK.addEventListener) DESK.addEventListener("change", onMq); else if (DESK.addListener) DESK.addListener(onMq);

  /* ------------------------------------------------------------------ test hook (probes and screenshots only) */
  window.__journey = {
    open: function () { open(false); },
    stop: function () { close(false); },
    seekStep: function (i, frac) {
      open(false); pause();
      var t0 = starts[i], t1 = ends[i];
      tl.time(t0 + (t1 - t0) * (frac == null ? 1 : frac), false);
    },
    seekLabel: function (label, off) {
      open(false); pause();
      tl.time((tl.labels[label] || 0) + (off || 0), false);
    },
    play: function () { open(true); },
    state: function () {
      return { opened: opened, step: cur, time: tl ? tl.time() : 0, total: total, playing: playing, labels: tl ? Object.keys(tl.labels) : [] };
    }
  };
  try {
    var q = new URLSearchParams(location.search);
    if (q.has("jlabel")) window.__journey.seekLabel(q.get("jlabel"), parseFloat(q.get("joff") || "0"));
    else if (q.has("journey")) window.__journey.seekStep(parseInt(q.get("journey"), 10), q.has("t") ? parseFloat(q.get("t")) : 1);
  } catch (e) { /* the hook is optional */ }
})();
