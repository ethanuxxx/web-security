/* 授課模式（投影片）：只在 build 產生的授課頁（/present/<堂 id>/）載入，所有主題共用。
 * 一堂課可跨多節：依 course.json 的順序連續播放各節；沒有 lecture.json 的節只有一張封面。
 * 資料來自頁面內的 <script type="application/json" id="present-data">（格式見 site/themes/README.md「授課模式」）。
 */
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var dataEl = d.getElementById("present-data");
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var session = data.session || {};
  var sections = data.sections || [];
  /* 每節一張封面，後面接該節 lecture.json 的投影片；pages 是整堂課的連續頁 */
  var pages = [], firstPage = [];
  sections.forEach(function (s, si) {
    firstPage.push(pages.length);
    pages.push({ si: si, cover: true });
    (s.slides || []).forEach(function (sl) { var p = { si: si }; for (var k in sl) p[k] = sl[k]; pages.push(p); });
  });
  var total = pages.length;
  var HASH = /^#sec-([a-z0-9-]+)(?:\.(\d+))?$/;
  var bodies = [];             // 每節正文（隱藏容器），只有有投影片的節才有
  function sec() { return sections[pages[idx].si] || {}; }
  function byId(si, id) {
    var b = bodies[si];
    return b ? b.querySelector('[id="' + String(id).replace(/"/g, "") + '"]') : null;
  }

  var overlay = null, ui = null;
  var active = false, idx = 0;
  var shown = [];              // [{ node, ph }]：目前搬到投影片上的正文節點（1–3 個，依序上下排）與原位標記
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
    if (page.heading === "intro") return { no: sections[page.si].no || "", title: page.title || "", node: null };
    var h = byId(page.si, page.heading);
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
      var first = bodies[page.si] ? bodies[page.si].querySelector("h2[id]") : null;
      n = first ? first.previousSibling : null;
      while (n) {
        out.unshift(n);
        n = n.previousSibling;
      }
      return out;
    }
    var h = byId(page.si, page.heading);
    if (!h) return out;
    var stop = h.tagName === "H2" ? ["H2"] : ["H2", "H3"];
    out.push(h);
    for (n = h.nextSibling; n && !isH(n, stop); n = n.nextSibling) out.push(n);
    return out;
  }

  function fillSource(page) {
    var body = ui.srcBody;
    body.textContent = "";
    if (!bodies[page.si]) body.appendChild(el("p", "", "本節尚未撰寫，沒有原文。"));
    sourceNodes(page).forEach(function (n) {
      shown.forEach(function (x) { if (n === x.ph) n = x.node; });   // 已搬到投影片上的表格、程式碼或請求框，原文裡仍要看得到
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
  function moveIn(nodes) {
    nodes.forEach(function (node) {
      var ph = d.createComment("lecture:" + (node.id || ""));
      node.parentNode.replaceChild(ph, node);
      ui.stage.appendChild(node);
      shown.push({ node: node, ph: ph });
    });
  }
  function restore() {
    shown.forEach(function (x) {
      var node = x.node;
      if (x.ph.parentNode) x.ph.parentNode.replaceChild(node, x.ph);
      node.style.removeProperty("--lec-ts");
      node.style.removeProperty("height");
      shotImgs(node).forEach(function (im) { im.style.removeProperty("width"); im.style.removeProperty("height"); if (im.getAttribute("style") === "") im.removeAttribute("style"); });
      node.classList.remove("lec-ts-wrap");
      node.style.removeProperty("width"); node.style.removeProperty("flex"); node.style.removeProperty("max-height");
      if (node.getAttribute("style") === "") node.removeAttribute("style");
    });
    shown = [];
    ui.stage.removeAttribute("data-count");
    ui.stage.removeAttribute("data-dir");
    ui.stage.removeAttribute("data-fit");
  }

  function shotImgs(node) {
    return node.tagName === "FIGURE" && node.classList.contains("shot") ? [].slice.call(node.querySelectorAll("img")) : [];
  }
  function figureAspect(node) {
    var imgs = shotImgs(node);
    if (imgs.length) {   // 截圖：以 img 的 width／height 屬性算（並排＝寬度相加、高度取最大）
      var w = 0, h = 0;
      imgs.forEach(function (im) { w += +im.getAttribute("width") || 0; h = Math.max(h, +im.getAttribute("height") || 0); });
      return w && h ? w / h : 0;
    }
    var svg = node.tagName === "FIGURE" ? node.querySelector("svg") : null;
    var vb = svg && svg.viewBox && svg.viewBox.baseVal;
    return vb && vb.height ? vb.width / vb.height : 0;
  }

  /* ---------- 縮放：表格與程式碼太大時縮小字級，直到放得下 ---------- */
  function fit() {
    fitQueued = false;
    if (!active || !shown.length) return;
    var node = shown[0].node, stage = ui.stage;
    if (shown.length > 1 && shown.some(function (x) { return shotImgs(x.node).length; }) && shown.every(function (x) { return x.node.tagName === "FIGURE"; })) { fitMulti(stage); return; }
    if (shown.length > 1 || node.tagName === "DIV") { fitStack(stage); return; }
    if (node.tagName === "FIGURE") {
      if (shotImgs(node).length) { fitShot(node, stage); return; }
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
  /* 請求／回應框與多個物件：字級整體縮小，直到全部（含間距）放進視覺區，不裁切 */
  function fitStack(stage) {
    var s = 1, shots = shown.filter(function (x) { return shotImgs(x.node).length; });
    shots.forEach(function (x) { x.node.style.flex = "none"; x.node.style.height = "auto"; });   // 截圖 figure 依內容高，圖片隨 s 等比縮放
    stage.style.setProperty("--lec-scale", "1");
    for (var k = 0; k < (shots.length ? 48 : 24); k++) {
      shots.forEach(function (x) {
        var nat = shotImgs(x.node)[0].naturalWidth;
        var cap = nat ? Math.min(1, nat / (+shotImgs(x.node)[0].getAttribute("width") || nat)) : 1;
        shotImgs(x.node).forEach(function (im) {
          im.style.width = ((+im.getAttribute("width") || 0) * s * cap).toFixed(1) + "px"; im.style.height = ((+im.getAttribute("height") || 0) * s * cap).toFixed(1) + "px";
        });
      });
      var h = 0, w = 0;
      shown.forEach(function (x, i) { var r = x.node.getBoundingClientRect(); h += r.height; w = Math.max(w, r.width); });
      h += (shown.length - 1) * (parseFloat(getComputedStyle(stage).rowGap) || 0);
      if (h <= stage.clientHeight + 1 && w <= stage.clientWidth + 1) break;
      s *= 0.94;
      stage.style.setProperty("--lec-scale", s.toFixed(3));
    }
  }
  /* 多個物件含截圖：各物件先依自然尺寸（截圖用 img 的 width／height，SVG 用 viewBox 乘 SVG_UNIT）算出寬、高與固定內距，
     再試算「一列」與「一欄」兩種排法，各求整體等比縮放比例，取比例較大者；截圖上限為圖檔原尺寸 */
  var SVG_UNIT = 1.6;
  function fitMulti(stage) {
    var cs0 = getComputedStyle(stage);
    var availW = stage.clientWidth, availH = stage.clientHeight;
    var gap = parseFloat(cs0.columnGap) || 0, gapV = parseFloat(cs0.rowGap) || 0;
    var cap = Infinity;
    var items = shown.map(function (x) {
      var node = x.node, cs = getComputedStyle(node), imgs = shotImgs(node);
      var padW = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      var it = { node: node, imgs: imgs, w: 0, h: 0, ew: padW, over: 0 };
      if (imgs.length) {
        var cg = parseFloat(cs.columnGap) || 0, maxH = 0;
        imgs.forEach(function (im) { it.w += +im.getAttribute("width") || 0; maxH = Math.max(maxH, +im.getAttribute("height") || 0); });
        it.h = maxH;
        it.ew += (imgs.length - 1) * cg + 2 * imgs.length + 2;
        node.style.flex = "none"; node.style.width = "auto";
        imgs.forEach(function (im) { im.style.width = (+im.getAttribute("width") * 0.01) + "px"; im.style.height = (+im.getAttribute("height") * 0.01) + "px"; });
        node.style.height = "auto"; node.style.maxHeight = "none";
        it.over = Math.max(node.offsetHeight, node.scrollHeight) - maxH * 0.01;
        node.style.removeProperty("height");
        var nat = imgs[0].naturalWidth ? imgs[0].naturalWidth / (+imgs[0].getAttribute("width")) : 1;
        cap = Math.min(cap, nat);
      } else {
        var vb = node.querySelector("svg"); vb = vb && vb.viewBox && vb.viewBox.baseVal;
        it.w = (vb ? vb.width : 640) * SVG_UNIT; it.h = (vb ? vb.height : 180) * SVG_UNIT;
        var capEl = node.querySelector("figcaption");
        it.over = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + (capEl ? capEl.offsetHeight + parseFloat(getComputedStyle(capEl).marginTop) : 0);
      }
      return it;
    });
    var n = items.length;
    function sum(list, f) { return list.reduce(function (t, i) { return t + f(i); }, 0); }
    function mn(list, f) { return list.reduce(function (m, i) { return Math.min(m, f(i)); }, Infinity); }
    var shots = items.filter(function (i) { return i.imgs.length; }), flex = items.filter(function (i) { return !i.imgs.length; });
    /* 一種排法的比例：截圖先依高（一欄時依寬）定，SVG 吃剩下的空間；SVG 比截圖小時改用同一個比例 */
    function plan(row) {
      var sS, sF = Infinity, gp = row ? gap : gapV;
      if (row) {
        sS = Math.min(cap, mn(shots, function (i) { return (availH - i.over) / i.h; }));
        if (flex.length) sF = Math.min(mn(flex, function (i) { return (availH - i.over) / i.h; }),
          (availW - gap * (n - 1) - sum(items, function (i) { return i.ew; }) - sum(shots, function (i) { return i.w * sS; })) / sum(flex, function (i) { return i.w; }));
        if (!flex.length) sS = Math.min(sS, (availW - gap * (n - 1) - sum(items, function (i) { return i.ew; })) / sum(items, function (i) { return i.w; }));
        if (sF < sS) sS = sF = Math.min(cap, (availW - gap * (n - 1) - sum(items, function (i) { return i.ew; })) / sum(items, function (i) { return i.w; }), mn(items, function (i) { return (availH - i.over) / i.h; }));
      } else {
        sS = Math.min(cap, mn(shots, function (i) { return (availW - i.ew) / i.w; }));
        if (flex.length) sF = Math.min(mn(flex, function (i) { return (availW - i.ew) / i.w; }),
          (availH - gp * (n - 1) - sum(items, function (i) { return i.over; }) - sum(shots, function (i) { return i.h * sS; })) / sum(flex, function (i) { return i.h; }));
        if (!flex.length) sS = Math.min(sS, (availH - gp * (n - 1) - sum(items, function (i) { return i.over; })) / sum(items, function (i) { return i.h; }));
        if (sF < sS) sS = sF = Math.min(cap, (availH - gp * (n - 1) - sum(items, function (i) { return i.over; })) / sum(items, function (i) { return i.h; }), mn(items, function (i) { return (availW - i.ew) / i.w; }));
      }
      return { sS: Math.max(0.05, sS), sF: Math.max(0.05, sF), q: Math.min(sS, sF) };
    }
    var pr = plan(true), pc = plan(false);
    var row = pr.q > pc.q + 1e-6, pl = row ? pr : pc;
    stage.setAttribute("data-dir", row ? "row" : "col");
    function apply(f) {   // 回傳是否放得下（以實際量到的高度判斷；圖說可能換行）
      var tw = 0, th = 0, mw = 0, mh = 0;
      items.forEach(function (it) {
        var sc = it.imgs.length ? pl.sS * f : pl.sF * f;
        it.node.style.flex = "none";
        it.imgs.forEach(function (im) {
          im.style.width = (+im.getAttribute("width") * sc).toFixed(1) + "px"; im.style.height = (+im.getAttribute("height") * sc).toFixed(1) + "px";
        });
        it.node.style.width = (it.w * sc + it.ew + 1).toFixed(1) + "px";
        it.node.style.height = "auto";
        var h = it.imgs.length ? Math.max(it.node.offsetHeight, it.node.scrollHeight) : it.h * sc + it.over;
        it.node.style.height = h.toFixed(1) + "px";
        tw += it.w * sc + it.ew + 1; th += h; mw = Math.max(mw, it.w * sc + it.ew + 1); mh = Math.max(mh, h);
      });
      return row ? (mh <= availH + 1 && tw + gap * (n - 1) <= availW + 1) : (th + gapV * (n - 1) <= availH + 1 && mw <= availW + 1);
    }
    var f = 1;
    for (var k = 0; k < 24 && !apply(f); k++) f *= 0.97;
    stage.setAttribute("data-fit", (row ? "row " : "col ") + (pl.sS * f).toFixed(2) + (flex.length ? " svg " + (pl.sF * f).toFixed(2) : ""));
  }
  /* 截圖：整張圖（圖片、標籤、圖說）等比縮放進視覺區，不裁切；上限為圖檔原尺寸 */
  function fitShot(node, stage) {
    var imgs = shotImgs(node);
    function set(sc) {
      imgs.forEach(function (im) {
        var w = +im.getAttribute("width"), h = +im.getAttribute("height");
        im.style.width = (w * sc).toFixed(1) + "px"; im.style.height = (h * sc).toFixed(1) + "px";
      });
    }
    function sumW(sc) {
      var t = 0; imgs.forEach(function (im) { t += (+im.getAttribute("width")) * sc; }); return t;
    }
    var cs = getComputedStyle(node);
    var availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var availH = stage.clientHeight;
    var maxH = 0;
    imgs.forEach(function (im) { maxH = Math.max(maxH, +im.getAttribute("height") || 0); });
    set(0.01);                                  // 先量出標籤、圖說、內距占的高度（figure 暫時改成依內容高）
    node.style.height = "auto";
    var over = node.offsetHeight - maxH * 0.01;
    node.style.removeProperty("height");
    var gaps = (imgs.length - 1) * (parseFloat(getComputedStyle(node).columnGap) || 0) + 2 * imgs.length;
    var sc = Math.min((availH - over) / maxH, (availW - gaps) / sumW(1));
    var nat = imgs[0].naturalWidth ? imgs[0].naturalWidth / (+imgs[0].getAttribute("width")) : 1;
    sc = Math.max(0.05, Math.min(sc, nat));
    set(sc);
    for (var k = 0; k < 6 && (node.scrollHeight > availH + 1 || node.scrollWidth > node.clientWidth + 1); k++) { sc *= 0.96; set(sc); }
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
    var page = pages[idx], cs = sections[page.si];
    restore();
    var slide = ui.slide;
    ui.stage.style.removeProperty("--lec-scale");
    ui.stage.textContent = "";
    ui.points.textContent = "";
    var title, label;
    if (page.cover) {
      slide.setAttribute("data-kind", "cover");
      slide.setAttribute("data-layout", "bottom");
      ui.coverNo.textContent = cs.no || "";
      ui.coverTitle.textContent = cs.title || "";
      ui.coverQ.textContent = cs.question || "";
      ui.coverTodo.hidden = !!cs.slides;
      title = (cs.no || "") + " " + (cs.title || "");
      label = "封面：" + title;
    } else {
      slide.setAttribute("data-kind", "content");
      var info = headingInfo(page);
      ui.no.textContent = info.no;
      ui.t.textContent = info.title;
      var ids = page.show ? (Array.isArray(page.show) ? page.show : [page.show]) : [];
      var nodes = ids.map(function (id) { return byId(page.si, id); }).filter(Boolean);
      var node = nodes[0] || null;
      slide.setAttribute("data-visual", node ? (nodes.length > 1 ? "multi" : node.tagName.toLowerCase()) : "none");
      ui.stage.setAttribute("data-count", String(nodes.length));
      var layout = page.layout || "auto";
      if (layout === "auto") {
        var asp = node && nodes.length === 1 ? figureAspect(node) : 0;
        layout = asp && asp < 2 ? "side" : "bottom";
      }
      slide.setAttribute("data-layout", layout);
      moveIn(nodes);
      nodes.reduce(function (a, nd) { return a.concat(shotImgs(nd)); }, []).forEach(function (im) { if (!im.complete) im.addEventListener("load", queueFit, { once: true }); });
      (page.points || []).forEach(function (p) {
        var li = el("li");
        li.innerHTML = p;           // 內容來自建置時已驗證的資料（只允許 code、strong）
        ui.points.appendChild(li);
      });
      label = info.no + " " + info.title;
    }
    ui.count.textContent = (idx + 1) + " / " + total;
    ui.secNo.textContent = cs.no || "";
    ui.secTitle.textContent = cs.title || "";
    ui.secOf.textContent = "第 " + (page.si + 1) + " / " + sections.length + " 節";
    updateStrip();
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

  /* 網址 hash：#sec-<節 id> 是該節封面，#sec-<節 id>.<n> 是該節第 n 頁（1 是封面） */
  function hashFor(i) {
    var si = pages[i].si, n = i - firstPage[si] + 1;
    return "#sec-" + sections[si].id + (n > 1 ? "." + n : "");
  }
  function setHash(i) {
    try { history.replaceState(null, "", location.pathname + location.search + hashFor(i)); } catch (e) { /* ignore */ }
  }
  function pageFromHash() {
    var m = HASH.exec(location.hash);
    if (!m) return -1;
    for (var si = 0; si < sections.length; si++) {
      if (sections[si].id !== m[1]) continue;
      var count = (si + 1 < sections.length ? firstPage[si + 1] : total) - firstPage[si];
      return firstPage[si] + Math.max(0, Math.min(count - 1, (m[2] ? parseInt(m[2], 10) : 1) - 1));
    }
    return -1;
  }
  /* 整堂進度：每節一段，寬度依該節頁數；已播的節填滿，目前這節填到目前頁 */
  function updateStrip() {
    var cs = pages[idx].si;
    ui.segs.forEach(function (b, si) {
      var count = (si + 1 < sections.length ? firstPage[si + 1] : total) - firstPage[si];
      var p = si < cs ? 1 : si > cs ? 0 : (idx - firstPage[si] + 1) / count;
      b.style.setProperty("--p", p.toFixed(3));
      b.classList.toggle("is-cur", si === cs);
      if (si === cs) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
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
    overlay.setAttribute("aria-label", "授課模式：" + (session.title || ""));
    overlay.setAttribute("data-sc", String(session.color || 0));
    overlay.tabIndex = -1;
    ui = {};
    sections.forEach(function (s, si) {
      if (!s.body) return;
      var b = el("div", "lec-body content");
      b.hidden = true;
      b.innerHTML = s.body;
      overlay.appendChild(b);
      bodies[si] = b;
    });

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
    ui.coverTodo = el("p", "lec-cover-todo", "本節尚未撰寫");
    cover.appendChild(ui.coverNo); cover.appendChild(ui.coverTitle); cover.appendChild(ui.coverQ); cover.appendChild(ui.coverTodo);
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
    var strip = el("div", "lec-strip");
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "整堂進度");
    ui.segs = sections.map(function (s, si) {
      var count = (si + 1 < sections.length ? firstPage[si + 1] : total) - firstPage[si];
      var b = el("button", "lec-seg");
      b.type = "button";
      b.style.flexGrow = String(count);
      b.title = s.no + " " + s.title;
      b.setAttribute("aria-label", "跳到 " + s.no + " " + s.title);
      b.addEventListener("click", function () { render(firstPage[si]); });
      strip.appendChild(b);
      return b;
    });
    ui.sec = el("span", "lec-sec");
    ui.sess = el("span", "lec-sess", (session.id || "").toUpperCase() + " " + (session.title || ""));
    ui.secNo = el("b", "lec-secno");
    ui.secTitle = el("span", "lec-sectitle");
    ui.secOf = el("span", "lec-secof");
    ui.sec.appendChild(ui.sess); ui.sec.appendChild(ui.secNo); ui.sec.appendChild(ui.secTitle); ui.sec.appendChild(ui.secOf);
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
    ui.exit = button("", "x", "離開授課模式，回到章節索引", "離開（Esc）");
    acts.appendChild(ui.penBtn); acts.appendChild(ui.clearBtn); acts.appendChild(ui.srcBtn); acts.appendChild(ui.exit);
    bar.appendChild(strip); bar.appendChild(ui.sec); bar.appendChild(nav); bar.appendChild(acts);

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
    ui.exit.addEventListener("click", leave);
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
    build();
    active = true;
    d.body.appendChild(overlay);
    root.classList.add("lecture-on");
    setSource(false, false);
    render(i, true);
    overlay.focus();
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(queueFit);
  }

  function toggleFullscreen() {
    try {
      var p = d.fullscreenElement ? d.exitFullscreen() : root.requestFullscreen();
      if (p && p.catch) p.catch(function () { /* 瀏覽器不允許就維持視窗內 */ });
    } catch (e) { /* ignore */ }
  }

  /* 離開：從章節索引進來就回到上一頁（捲動位置原封不動）；直接開網址進來就導向索引頁上目前這節 */
  function leave() {
    if (!active) return;
    var ex = data.exit || {};
    var target = new URL(ex.href || "../../", location.href);
    var back = false;
    var norm = function (p) { return p.replace(/index\.html$/, ""); };
    try { back = history.length > 1 && d.referrer && norm(new URL(d.referrer).pathname) === norm(target.pathname); } catch (e) { /* ignore */ }
    try { if (d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(function () {}); } catch (e) { /* ignore */ }
    if (back) { history.back(); return; }
    location.href = target.pathname + (ex.anchor ? "?g=1" : target.search) + (ex.anchor ? "#" + ex.anchor.replace("@", sec().id || "") : "");
  }

  /* ---------- 鍵盤：方向鍵、翻頁筆（PageUp/PageDown）、Home/End、Esc、D、C、F ---------- */
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    var typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable);
    var key = e.key;
    if (!active) return;
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
        if (!ui.src.hidden) setSource(false, true); else leave();
        break;
      case "f": case "F": if (typing || e.shiftKey) return; toggleFullscreen(); break;
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
  window.addEventListener("hashchange", function () {
    var p = pageFromHash();
    if (active && p >= 0 && p !== idx) render(p, true);
  });

  var p0 = pageFromHash();
  open(p0 >= 0 ? p0 : 0);
})();
