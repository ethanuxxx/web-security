/* 系統地圖主題：可有可無的增強。沒有這支程式時，所有連結、<details> 與 CSS 照常運作。 */
(function () {
  "use strict";
  var d = document;

  // 手機：先收起教材目錄，讓內容先出現；視窗寬度跨過斷點時跟著調整（桌面一律展開）。
  var tree = d.querySelector(".sm-tree-wrap");
  if (tree) {
    var phone = matchMedia("(max-width: 860px)");
    tree.open = !phone.matches;
    var was = phone.matches;
    var sync = function () {
      if (phone.matches === was) return; // 只在跨過斷點時動作，不蓋掉讀者自己的開合
      was = phone.matches;
      tree.open = !was;
    };
    if (phone.addEventListener) phone.addEventListener("change", sync);
    else if (phone.addListener) phone.addListener(sync);
    window.addEventListener("resize", sync);
  }

  // 章節索引頁：按 L 進入／離開「lecture mode」：同一堂在同一張章卡片內相鄰的幾列用框框起來，
  // 點框內任一列從該節進入該堂授課。模式記在網址 ?g=1（授課頁 Esc 回來時帶著它），直接開 /chapters/ 是平常模式。
  var idx = d.querySelector(".sm-idxpage");
  if (idx) {
    var hint = idx.querySelector(".sm-gmhint");
    var cards = [].slice.call(idx.querySelectorAll(".sm-chrow"));
    var setGm = function (on, keep) {
      idx.classList.toggle("sm-gm", on);
      if (hint) hint.hidden = !on;
      cards.forEach(function (a) {      // 整張章卡片都是同一堂：直接標示卡片外框，不畫內框
        var lis = [].slice.call(a.querySelectorAll(".sm-seclist li"));
        var sn = lis[0] && lis[0].getAttribute("data-sn");
        var whole = !!sn && lis.every(function (l) { return l.getAttribute("data-sn") === sn; });
        a.classList.toggle("gm-card", on && whole);
        if (on && whole) { a.setAttribute("data-sc", lis[0].getAttribute("data-sc")); a.setAttribute("title", sn); a.setAttribute("data-sn", sn); }
        else { a.removeAttribute("data-sc"); a.removeAttribute("title"); a.removeAttribute("data-sn"); }
        lis.forEach(function (li) {
          var prev = li.previousElementSibling, next = li.nextElementSibling;
          var same = function (o) { return o && o.getAttribute("data-sn") === li.getAttribute("data-sn"); };
          var framed = on && !whole && !!li.getAttribute("data-sn");
          li.classList.toggle("gm-click", on && !!li.getAttribute("data-sn"));
          li.classList.toggle("gm-in", framed);
          li.classList.toggle("gm-first", framed && !same(prev));
          li.classList.toggle("gm-last", framed && !same(next));
          if (framed) li.setAttribute("title", li.getAttribute("data-sn")); else li.removeAttribute("title");
        });
      });
      if (keep) return;
      try {
        var u = new URL(location.href);
        if (on) u.searchParams.set("g", "1"); else u.searchParams.delete("g");
        history.replaceState(history.state, "", u.pathname + u.search + u.hash);
      } catch (e) { /* ignore */ }
    };
    var gmOn = function () { return idx.classList.contains("sm-gm"); };
    setGm(/(^|[?&])g=1(&|$)/.test(location.search), true);
    d.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      var t = e.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      if (e.key === "l" || e.key === "L") { setGm(!gmOn()); e.preventDefault(); }
      else if (e.key === "Escape" && gmOn()) setGm(false);
    });
    idx.addEventListener("click", function (e) {
      if (!gmOn()) return;
      var li = e.target.closest && e.target.closest(".sm-seclist li");
      if (!li) return;
      if (!li.classList.contains("gm-click")) { if (e.target.closest("a")) e.preventDefault(); return; }
      e.preventDefault();
      location.href = li.getAttribute("data-sp");
    });
  }

  // 首頁：游標或鍵盤焦點落在某章的元件上，同一章的東西一起亮起。
  var root = d.querySelector(".sm-home");
  if (!root) return;
  root.classList.add("js");
  var items = [].slice.call(root.querySelectorAll("[data-ch]:not(.sm-tip-p)"));
  var panels = [].slice.call(root.querySelectorAll(".sm-tip-p"));
  var idle = root.querySelector(".sm-tip-idle");
  var comp = root.querySelector(".sm-tip-comp");
  var timer = 0;
  var pinned = null; // 由 #map-<章 id> 進來時固定亮起的章

  function show(ch, name) {
    root.classList.toggle("has-hl", !!ch);
    items.forEach(function (el) {
      var on = !!ch && el.getAttribute("data-ch") === ch;
      el.classList.toggle("is-hl", on);
      el.classList.toggle("is-dim", !!ch && !on);
    });
    panels.forEach(function (p) { p.hidden = p.getAttribute("data-ch") !== ch; });
    if (idle) idle.hidden = !!ch;
    if (comp) { comp.textContent = ch && name ? name : ""; comp.hidden = !(ch && name); }
  }

  function over(e) {
    var t = e.target.closest && e.target.closest("[data-ch]");
    if (!t || !root.contains(t)) return;
    clearTimeout(timer);
    show(t.getAttribute("data-ch"), t.getAttribute("data-name"));
  }

  function out() {
    clearTimeout(timer);
    timer = setTimeout(function () { show(pinned); }, 220);
  }

  function fromHash() {
    var m = /^#map-([\w-]+)$/.exec(location.hash);
    var ch = m && items.some(function (el) { return el.getAttribute("data-ch") === m[1]; }) ? m[1] : null;
    pinned = ch;
    show(ch);
    if (ch && matchMedia("(min-width: 1011px)").matches) {
      // 桌面：整張地圖本來就在視窗內，只把地圖視窗對齊頂端，不把某個元件捲到中間
      var win = root.querySelector(".sm-mapwrap");
      if (win && win.scrollIntoView) win.scrollIntoView({ block: "start", behavior: "auto" });
    } else if (ch) {
      // 手機：清單裡該章的項目
      var target = [].slice.call(root.querySelectorAll('[data-ch="' + ch + '"]')).filter(function (el) {
        return el.getBoundingClientRect().width > 0 && !el.closest(".sm-tip-p");
      })[0];
      if (target && target.scrollIntoView) {
        target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      }
    }
  }

  root.addEventListener("mouseover", over);
  root.addEventListener("focusin", over);
  root.addEventListener("mouseout", out);
  root.addEventListener("focusout", out);
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
