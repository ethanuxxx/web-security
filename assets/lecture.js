/* 授課模式（投影片）：共用資產，所有主題共用。
 * 資料來自頁面內的 <script type="application/json" id="lecture-data">（格式見 site/themes/README.md「授課模式」）。
 * 沒有這支程式時，正文照常閱讀；沒有資料的節不會載入它。
 */
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var dataEl = d.getElementById("lecture-data");
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var sec = data.section || {};
  var pages = [{ cover: true }].concat(data.slides || []);
  var total = pages.length;
  var HASH = /^#lecture-(\d+)$/;

  var overlay = null, ui = null;
  var active = false, idx = 0, opener = null;      // opener：進入前的焦點元素
  var shown = null;            // { node, ph }：目前搬到投影片上的正文節點與原位標記
  var inerted = [];
  var ro = null, fitQueued = false;
  /* 畫筆：筆跡只存在記憶體，依頁碼分開，離開授課模式就清空；座標是相對投影片區域的 0–1 比例 */
  var INK = "#d32f2f", INK_W = 3;
  var strokes = {}, drawOn = false, cur = null, cvs = null, ctx2 = null;

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = d.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var ICONS = {
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/><path d="M14 7l3 3"/>',
    clear: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    doc: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/><path d="M9 13h7M9 17h7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", "20"); s.setAttribute("height", "20");
    s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
    s.innerHTML = ICONS[name];
    return s;
  }
  function button(cls, iconName, label, title) {
    var b = el("button", "lec-btn lec-icon " + (cls || ""));
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = title || label;
    b.appendChild(icon(iconName));
    return b;
  }
  function plain(node) {
    var c = node.cloneNode(true);
    [].slice.call(c.querySelectorAll(".num")).forEach(function (n) { n.remove(); });
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  function isH(n, tags) { return n && n.nodeType === 1 && tags.indexOf(n.tagName) >= 0; }

  /* ---------- 標題與編號：從正文取得 ---------- */
  function headingInfo(page) {
    if (page.heading === "intro") return { no: sec.no || "", title: page.title || "", node: null };
    var h = d.getElementById(page.heading);
    if (!h) return { no: "", title: page.heading, node: null };
    var holder = h;
    if (h.tagName === "H3") {
      while (holder && holder.tagName !== "H2") holder = holder.previousElementSibling;
    }
    var num = holder && holder.querySelector(".num");
    return { no: num ? num.textContent.trim() : "", title: plain(h), node: h };
  }

  /* ---------- 原文：標題到下一個同級或更高級標題之間 ---------- */
  function sourceNodes(page) {
    var out = [], n;
    if (page.heading === "intro") {
      var first = d.querySelector("main h2[id]");
      n = first ? first.previousSibling : null;
      while (n) {
        if (n.nodeType === 1 && (n.matches("header, nav, h1, .notice, .crumbs, .page-toc"))) break;
        out.unshift(n);
        n = n.previousSibling;
      }
      return out;
    }
    var h = d.getElementById(page.heading);
    if (!h) return out;
    var stop = h.tagName === "H2" ? ["H2"] : ["H2", "H3"];
    out.push(h);
    for (n = h.nextSibling; n && !isH(n, stop); n = n.nextSibling) out.push(n);
    return out;
  }

  function fillSource(page) {
    var body = ui.srcBody;
    body.textContent = "";
    sourceNodes(page).forEach(function (n) {
      if (shown && n === shown.ph) n = shown.node;       // 已搬到投影片上的表格或程式碼，原文裡仍要看得到
      if (n.nodeType !== 1) { if (n.nodeType === 3 && n.textContent.trim()) body.appendChild(n.cloneNode(true)); return; }
      if (n.tagName === "FIGURE" || (n.tagName === "svg" && n.style.display === "none")) return;
      var c = n.cloneNode(true);
      [].slice.call(c.querySelectorAll("figure")).forEach(function (f) { f.remove(); });
      [].slice.call(c.querySelectorAll("[id]")).forEach(function (x) { x.removeAttribute("id"); });
      c.removeAttribute("id");
      body.appendChild(c);
    });
    body.scrollTop = 0;
  }

  /* ---------- 視覺物件：搬移真實節點，離開時放回原位 ---------- */
  function moveIn(node) {
    var ph = d.createComment("lecture:" + (node.id || ""));
    node.parentNode.replaceChild(ph, node);
    ui.stage.appendChild(node);
    shown = { node: node, ph: ph };
  }
  function restore() {
    if (!shown) return;
    if (shown.ph.parentNode) shown.ph.parentNode.replaceChild(shown.node, shown.ph);
    shown.node.style.removeProperty("--lec-ts");
    shown.node.classList.remove("lec-ts-wrap");
    if (shown.node.getAttribute("style") === "") shown.node.removeAttribute("style");
    shown = null;
  }

  function figureAspect(node) {
    var svg = node.tagName === "FIGURE" ? node.querySelector("svg") : null;
    var vb = svg && svg.viewBox && svg.viewBox.baseVal;
    return vb && vb.height ? vb.width / vb.height : 0;
  }

  /* ---------- 縮放：表格與程式碼太大時縮小字級，直到放得下 ---------- */
  function fit() {
    fitQueued = false;
    if (!active || !shown) return;
    var node = shown.node, stage = ui.stage;
    if (node.tagName === "FIGURE") {
      if (!node.classList.contains("tsplit")) return;
      fitSplit(node, stage);
      return;
    }
    var s = 1;
    stage.style.setProperty("--lec-scale", "1");
    for (var k = 0; k < 16; k++) {
      var a = node.getBoundingClientRect(), b = stage.getBoundingClientRect();
      if (a.height <= b.height + 1 && a.width <= b.width + 1) break;
      s *= 0.93;
      stage.style.setProperty("--lec-scale", s.toFixed(3));
    }
  }
  /* tsplit：字級以視窗寬度為起點，再依實際寬高與內容量出的比例縮小；到最小字級仍放不下就允許換行與捲動，不裁掉內容 */
  function fitSplit(node, stage) {
    var start = Math.max(26, Math.min(64, window.innerWidth * 0.034));
    var lines = node.querySelectorAll(".ts-line");
    function ratio() {
      var r = 1;
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].scrollWidth > lines[j].clientWidth + 1) r = Math.min(r, lines[j].clientWidth / lines[j].scrollWidth);
      }
      if (node.scrollHeight > stage.clientHeight + 1) r = Math.min(r, stage.clientHeight / node.scrollHeight);
      return r;
    }
    function run(min) {
      var px = start;
      for (var k = 0; k < 8; k++) {
        node.style.setProperty("--lec-ts", px.toFixed(1) + "px");
        var r = ratio();
        if (r >= 1) return true;
        if (px <= min) return false;
        px = Math.max(min, px * r * 0.985);
      }
      node.style.setProperty("--lec-ts", px.toFixed(1) + "px");
      return ratio() >= 1;
    }
    node.classList.remove("lec-ts-wrap");
    if (run(16)) return;
    node.classList.add("lec-ts-wrap");   // 單行放不下：允許換行；仍放不下時 figure 可捲動，不裁掉內容
    run(12);
  }
  function queueFit() {
    sizeCanvas();
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(fit);
  }

  /* ---------- 繪製一頁 ---------- */
  function render(i, quiet) {
    idx = Math.max(0, Math.min(total - 1, i));
    var page = pages[idx];
    restore();
    var slide = ui.slide;
    ui.stage.style.removeProperty("--lec-scale");
    ui.stage.textContent = "";
    ui.points.textContent = "";
    var title, label;
    if (page.cover) {
      slide.setAttribute("data-kind", "cover");
      slide.setAttribute("data-layout", "bottom");
      ui.coverNo.textContent = sec.no || "";
      ui.coverTitle.textContent = sec.title || "";
      ui.coverQ.textContent = sec.question || "";
      title = (sec.no || "") + " " + (sec.title || "");
      label = "封面：" + title;
    } else {
      slide.setAttribute("data-kind", "content");
      var info = headingInfo(page);
      ui.no.textContent = info.no;
      ui.t.textContent = info.title;
      var node = page.show ? d.getElementById(page.show) : null;
      slide.setAttribute("data-visual", node ? node.tagName.toLowerCase() : "none");
      var layout = page.layout || "auto";
      if (layout === "auto") {
        var asp = node ? figureAspect(node) : 0;
        layout = asp && asp < 2 ? "side" : "bottom";
      }
      slide.setAttribute("data-layout", layout);
      if (node) moveIn(node);
      (page.points || []).forEach(function (p) {
        var li = el("li");
        li.innerHTML = p;           // 內容來自建置時已驗證的資料（只允許 code、strong）
        ui.points.appendChild(li);
      });
      label = info.no + " " + info.title;
    }
    ui.count.textContent = (idx + 1) + " / " + total;
    ui.prev.disabled = idx === 0;
    ui.next.disabled = idx === total - 1;
    cur = null;
    redraw();
    ui.live.textContent = "第 " + (idx + 1) + " 頁，共 " + total + " 頁：" + label;
    if (!ui.src.hidden) fillSource(page.cover ? { heading: "intro", title: "" } : page);
    if (!quiet) {
      slide.classList.remove("lec-enter");
      void slide.offsetWidth;
      slide.classList.add("lec-enter");
    }
    setHash(idx);
    queueFit();
  }

  function setHash(i) {
    try { history.replaceState(null, "", location.pathname + location.search + "#lecture-" + (i + 1)); } catch (e) { /* ignore */ }
  }
  function clearHash() {
    if (!HASH.test(location.hash)) return;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }

  /* ---------- 畫筆 ---------- */
  function sizeCanvas() {
    if (!cvs) return;
    var r = ui.slide.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
    redraw();
  }
  function drawStroke(pts) {
    var w = cvs.width, h = cvs.height, dpr = window.devicePixelRatio || 1;
    ctx2.beginPath();
    ctx2.moveTo(pts[0][0] * w, pts[0][1] * h);
    if (pts.length === 1) ctx2.lineTo(pts[0][0] * w + 0.01, pts[0][1] * h);
    for (var i = 1; i < pts.length; i++) ctx2.lineTo(pts[i][0] * w, pts[i][1] * h);
    ctx2.lineWidth = INK_W * dpr;
    ctx2.stroke();
  }
  function redraw() {
    if (!ctx2) return;
    ctx2.clearRect(0, 0, cvs.width, cvs.height);
    ctx2.strokeStyle = INK; ctx2.lineCap = "round"; ctx2.lineJoin = "round";
    (strokes[idx] || []).forEach(drawStroke);
  }
  function inkPoint(e) {
    var r = cvs.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }
  function setDraw(on) {
    drawOn = on;
    cur = null;
    cvs.classList.toggle("on", on);
    ui.penBtn.setAttribute("aria-pressed", on ? "true" : "false");
    ui.penBtn.classList.toggle("is-on", on);
  }
  function clearInk() { strokes[idx] = []; cur = null; redraw(); }
  function buildInk() {
    cvs = el("canvas", "lec-ink");
    cvs.setAttribute("aria-hidden", "true");
    ctx2 = cvs.getContext("2d");
    ui.slide.appendChild(cvs);
    cvs.addEventListener("pointerdown", function (e) {
      if (!drawOn || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      try { cvs.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      cur = [inkPoint(e)];
      (strokes[idx] = strokes[idx] || []).push(cur);
      redraw();
    });
    cvs.addEventListener("pointermove", function (e) {
      if (!cur) return;
      e.preventDefault();
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs.length) evs = [e];
      evs.forEach(function (ev) { cur.push(inkPoint(ev)); });
      redraw();
    });
    function end() { cur = null; }
    cvs.addEventListener("pointerup", end);
    cvs.addEventListener("pointercancel", end);
    cvs.addEventListener("lostpointercapture", end);
  }

  /* ---------- 原文側欄 ---------- */
  function setSource(on, focus) {
    ui.src.hidden = !on;
    ui.srcBtn.setAttribute("aria-expanded", on ? "true" : "false");
    overlay.classList.toggle("has-src", on);
    if (on) {
      var page = pages[idx];
      fillSource(page.cover ? { heading: "intro", title: "" } : page);
      if (focus) ui.srcBody.focus();
    } else if (focus) {
      ui.srcBtn.focus();
    }
    queueFit();
  }

  /* ---------- 建立覆蓋層 ---------- */
  function build() {
    overlay = el("div", "lec");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "授課模式：" + (sec.no || "") + " " + (sec.title || ""));
    overlay.tabIndex = -1;
    ui = {};

    var main = el("div", "lec-main");
    ui.slide = el("section", "lec-slide");
    var head = el("header", "lec-head");
    var h = el("h2", "lec-title");
    ui.no = el("span", "lec-no");
    ui.t = el("span", "lec-t");
    h.appendChild(ui.no); h.appendChild(ui.t);
    head.appendChild(h);
    var cover = el("div", "lec-cover");
    ui.coverNo = el("p", "lec-cover-no");
    ui.coverTitle = el("h2", "lec-cover-title");
    ui.coverQ = el("p", "lec-cover-q");
    cover.appendChild(ui.coverNo); cover.appendChild(ui.coverTitle); cover.appendChild(ui.coverQ);
    ui.stage = el("div", "lec-stage content");
    ui.points = el("ul", "lec-points");
    ui.slide.appendChild(head); ui.slide.appendChild(cover);
    ui.slide.appendChild(ui.stage); ui.slide.appendChild(ui.points);

    ui.src = el("aside", "lec-src");
    ui.src.hidden = true;
    ui.src.id = "lec-src";
    ui.src.setAttribute("aria-label", "這張投影片對應的原文");
    var sbar = el("div", "lec-src-bar");
    sbar.appendChild(el("strong", "", "原文"));
    var sclose = button("lec-src-x", "x", "關閉原文");
    sbar.appendChild(sclose);
    ui.srcBody = el("div", "lec-src-body content");
    ui.srcBody.tabIndex = 0;
    ui.srcBody.setAttribute("role", "region");
    ui.srcBody.setAttribute("aria-label", "原文內容");
    ui.src.appendChild(sbar); ui.src.appendChild(ui.srcBody);
    main.appendChild(ui.slide); main.appendChild(ui.src);

    var bar = el("footer", "lec-bar");
    ui.sec = el("span", "lec-sec", (sec.no || "") + " " + (sec.title || ""));
    var nav = el("nav", "lec-nav");
    nav.setAttribute("aria-label", "投影片換頁");
    ui.prev = button("", "prev", "上一頁", "上一頁（←）");
    ui.count = el("span", "lec-count");
    ui.next = button("", "next", "下一頁", "下一頁（→）");
    nav.appendChild(ui.prev); nav.appendChild(ui.count); nav.appendChild(ui.next);
    var acts = el("span", "lec-acts");
    ui.penBtn = button("", "pen", "開關畫筆（D）", "畫筆（D）：開啟後可用滑鼠或觸控筆在投影片上書寫");
    ui.penBtn.setAttribute("aria-pressed", "false");
    ui.clearBtn = button("", "clear", "清空本頁筆跡（C）", "清空本頁（C）");
    ui.srcBtn = button("", "doc", "顯示或隱藏原文", "原文");
    ui.srcBtn.setAttribute("aria-expanded", "false");
    ui.srcBtn.setAttribute("aria-controls", "lec-src");
    ui.exit = button("", "x", "離開授課模式", "離開（Esc）");
    acts.appendChild(ui.penBtn); acts.appendChild(ui.clearBtn); acts.appendChild(ui.srcBtn); acts.appendChild(ui.exit);
    bar.appendChild(ui.sec); bar.appendChild(nav); bar.appendChild(acts);

    ui.live = el("div", "lec-sr");
    ui.live.setAttribute("aria-live", "polite");
    ui.live.setAttribute("role", "status");

    overlay.appendChild(main); overlay.appendChild(bar); overlay.appendChild(ui.live);

    ui.prev.addEventListener("click", function () { go(-1); });
    ui.next.addEventListener("click", function () { go(1); });
    ui.penBtn.addEventListener("click", function () { setDraw(!drawOn); });
    ui.clearBtn.addEventListener("click", clearInk);
    ui.srcBtn.addEventListener("click", function () { setSource(ui.src.hidden, true); });
    sclose.addEventListener("click", function () { setSource(false, true); });
    ui.exit.addEventListener("click", close);
    ui.srcBody.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) === "#") e.preventDefault();      // 側欄裡的頁內連結沒有目標，不跳轉
      else { a.target = "_blank"; a.rel = "noopener"; }
    });
    if (window.ResizeObserver) {
      ro = new ResizeObserver(queueFit);
      ro.observe(ui.stage);
      ro.observe(ui.slide);
    }
    buildInk();
  }

  function go(delta) { if (active) render(idx + delta); }

  /* ---------- 開啟與離開 ---------- */
  function open(i) {
    if (active) return;
    if (!overlay) build();
    opener = d.activeElement;
    active = true;
    d.body.appendChild(overlay);
    root.classList.add("lecture-on");
    [].slice.call(d.body.children).forEach(function (c) {
      if (c === overlay || c.inert) return;
      c.inert = true;
      inerted.push(c);
    });
    setSource(false, false);
    render(i, true);
    overlay.focus();
    try {
      var p = root.requestFullscreen && !d.fullscreenElement ? root.requestFullscreen() : null;
      if (p && p.catch) p.catch(function () { /* 瀏覽器不允許就維持視窗內 */ });
    } catch (e) { /* ignore */ }
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(queueFit);
  }

  function close(keepHash) {
    if (!active) return;
    active = false;
    restore();
    strokes = {}; cur = null;
    if (drawOn) setDraw(false);
    redraw();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    inerted.forEach(function (c) { c.inert = false; });
    inerted = [];
    root.classList.remove("lecture-on");
    if (keepHash !== true) clearHash();
    try {
      if (d.fullscreenElement && d.exitFullscreen) {
        var p = d.exitFullscreen();
        if (p && p.catch) p.catch(function () { /* ignore */ });
      }
    } catch (e) { /* ignore */ }
    var back = opener && opener.isConnected && opener !== d.body && opener !== root ? opener : d.getElementById("main");
    opener = null;
    if (back) back.focus({ preventScroll: true });
  }

  /* ---------- 鍵盤：方向鍵、翻頁筆（PageUp/PageDown）、Home/End、Esc、L ---------- */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable);
    var key = e.key;
    if (!active) {
      if ((key === "l" || key === "L") && !typing && !e.shiftKey) { e.preventDefault(); open(0); }
      return;
    }
    var handled = true;
    switch (key) {
      case "ArrowRight": case "PageDown": go(1); break;
      case "ArrowLeft": case "PageUp": go(-1); break;
      case " ": case "Spacebar":
        if (tag === "BUTTON") return;      // 空白鍵留給按鈕本身的點擊
        go(1); break;
      case "Home": render(0); break;
      case "End": render(total - 1); break;
      case "Escape":
        if (!ui.src.hidden) setSource(false, true); else close();
        break;
      case "l": case "L": if (typing) return; close(); break;
      case "d": case "D": if (typing || e.shiftKey) return; setDraw(!drawOn); break;
      case "c": case "C": if (typing || e.shiftKey) return; clearInk(); break;
      case "Tab": handled = trap(e); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  function trap(e) {
    var f = [].slice.call(overlay.querySelectorAll("button:not([disabled]), [tabindex='0']")).filter(function (n) {
      return n.offsetParent !== null;
    });
    if (!f.length) return true;
    var first = f[0], last = f[f.length - 1], a = d.activeElement;
    if (e.shiftKey && (a === first || a === overlay)) { last.focus(); return true; }
    if (!e.shiftKey && a === last) { first.focus(); return true; }
    return false;                           // 其餘交給瀏覽器的 Tab 順序
  }

  d.addEventListener("keydown", onKey, true);
  window.addEventListener("pagehide", function () { close(true); });
  window.addEventListener("hashchange", function () {
    var m = HASH.exec(location.hash);
    if (m && active) render(parseInt(m[1], 10) - 1, true);
    else if (m) open(parseInt(m[1], 10) - 1);
    else if (active) close(true);
  });

  var m0 = HASH.exec(location.hash);
  if (m0) open(parseInt(m0[1], 10) - 1);
})();
