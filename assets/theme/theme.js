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

  // 全站動畫開關：<html data-motion="on|off"> 由 <head> 的小段 script 先設好（預設跟隨 prefers-reduced-motion）；
  // 這裡讓頂端列按鈕切換並記住選擇。所有 localStorage 存取都包 try/catch，失敗就只在本頁生效。
  var KEY = "web-security:motion";
  var mbtn = d.querySelector(".sm-motion");
  if (mbtn) {
    var paint = function () {
      var on = d.documentElement.getAttribute("data-motion") !== "off";
      mbtn.setAttribute("aria-pressed", on ? "true" : "false");
      mbtn.textContent = on ? "動畫：開" : "動畫：關";
    };
    mbtn.hidden = false;
    paint();
    mbtn.addEventListener("click", function () {
      var next = d.documentElement.getAttribute("data-motion") === "off" ? "on" : "off";
      d.documentElement.setAttribute("data-motion", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* 無法儲存：只在這一頁生效 */ }
      paint();
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
        var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "center", inline: "center", behavior: still ? "auto" : "smooth" });
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
