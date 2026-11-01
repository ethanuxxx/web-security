/* 節間返回：正文裡連到本站其他節的連結，在目標頁顯示與附錄相同的圓形返回按鈕，回到來源頁的原位置。
 * 點擊時把來源資訊暫存在 sessionStorage；目標頁讀到後存進該筆歷史紀錄的 history.state，
 * 重新整理、上一頁／下一頁回到目標頁時按鈕仍在。直接開啟或由側欄／目錄／上下節進入時不顯示。
 */
(function () {
  "use strict";
  var d = document, KEY = "sm-return", RESTORE = "sm-return-focus", MAX_AGE = 10 * 60 * 1000;
  var article = d.querySelector && d.querySelector("main article.content");
  if (!article) return;
  function get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
  function set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function del(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function links() { return article.querySelectorAll("a[href]"); }

  function trim(c, n) {                                 // 來源鏈最多 n 層
    if (!c || n < 1) return null;
    return { from: c.from, path: c.path, scroll: c.scroll, idx: c.idx, href: c.href, name: c.name, parent: trim(c.parent, n - 1) };
  }
  function applyRestore() {                             // 回到來源頁：恢復捲動、焦點放回當初點的連結；回傳該頁自己的上一層來源
    var rs = get(RESTORE);
    if (!rs) return null;
    del(RESTORE);
    if (rs.path !== location.pathname || Date.now() - rs.ts > MAX_AGE) return null;
    var y = rs.scroll || 0, go = function () { window.scrollTo(0, y); };
    go();
    if (d.readyState !== "complete") window.addEventListener("load", go);   // 字型、圖片載入後版面移動，再恢復一次
    var a = links()[rs.idx];
    if (a && a.getAttribute("href") === rs.href) { try { a.focus({ preventScroll: true }); } catch (e) {} }
    return rs.parent || null;
  }
  var restoredParent = applyRestore();

  var cur = null;                                       // 本頁這筆歷史紀錄的來源資訊
  var st = get(KEY);
  if (st) del(KEY);
  var hs = history.state && history.state.smReturn;
  if (st && st.target === location.pathname && st.path !== location.pathname && Date.now() - st.ts < MAX_AGE) {
    cur = trim(st, 10);
  } else if (restoredParent) {                          // 從更深一層返回到本頁：沿用本頁原本的來源
    cur = trim(restoredParent, 10);
  } else if (hs && hs.from) {
    cur = hs;
  }
  if (cur && cur !== hs) { try { history.replaceState(Object.assign({}, history.state, { smReturn: cur }), ""); } catch (e) {} }

  if (cur && !article.hasAttribute("data-apx")) {
    var b = d.createElement("button");
    b.type = "button"; b.className = "apx-back"; b.setAttribute("data-sec", "");
    b.setAttribute("aria-label", "回到上一處：" + cur.name); b.title = "回到上一處：" + cur.name;
    b.innerHTML = '<svg class="apx-back-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
      '<path d="M10 6 4 12l6 6M4 12h11a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    b.addEventListener("click", function () {
      var c = (history.state && history.state.smReturn) || cur;
      set(RESTORE, { path: c.path, idx: c.idx, href: c.href, scroll: c.scroll, parent: c.parent || null, ts: Date.now() });
      location.href = c.from.split("#")[0];   // 去掉錨點，捲動由 RESTORE 恢復
    });
    d.body.appendChild(b);
    window.addEventListener("hashchange", function () { // 本頁內的錨點跳轉會產生沒有 state 的新紀錄：沿用
      if (history.state && history.state.smReturn) return;
      try { history.replaceState(Object.assign({}, history.state, { smReturn: cur }), ""); } catch (e) {}
    });
    window.addEventListener("popstate", function () {
      var x = history.state && history.state.smReturn;
      if (x) cur = x;
    });
  }

  d.addEventListener("click", function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a || !article.contains(a) || article.hasAttribute("data-apx-view") || a.target === "_blank" || a.hasAttribute("download")) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return; }
    if (u.origin !== location.origin || u.pathname === location.pathname || !/\/index\.html$/.test(u.pathname) || /\/appendix\/[^/]+\/index\.html$/.test(u.pathname)) return;
    var h1 = d.querySelector(".sm-head h1");
    var here = (history.state && history.state.smReturn) || cur;   // 本頁自己的來源，帶給下一層以便返回後重建
    set(KEY, { parent: trim(here, 9), from: location.href, path: location.pathname, scroll: window.pageYOffset, target: u.pathname, ts: Date.now(),
               idx: [].indexOf.call(links(), a), href: a.getAttribute("href"),
               name: h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "" });
  });
})();

/* 附錄：點正文裡的附錄連結時，只把中央內容區換成附錄條目；左側目錄、頂端列與右欄不動。
 * 浮動按鈕「← 回到正文」回到離開時的捲動位置；瀏覽器上一頁也可返回。
 * 沒有這支程式、或直接開附錄網址時，附錄是一般獨立頁面（連結照常跳頁）。
 */
(function () {
  "use strict";
  var d = document;
  if (!d.querySelector || !window.fetch || !window.history || !history.pushState) return;
  var article = d.querySelector("main article.content");
  var head = d.querySelector(".sm-head");
  if (!article || !head) return;
  if (article.hasAttribute("data-apx")) return;        // 獨立的附錄頁：連結照常跳頁

  var HREF = /(?:^|\/)appendix\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.html$/;
  var cache = {};                 // url -> { title, headHTML, bodyHTML, pageTitle }
  var origin = null;              // 離開正文時保存的狀態：{ head, article, scroll, title, label }
  var depth = 0;                  // 離開正文後的附錄歷史步數（附錄連到附錄會增加）；回到正文要倒退這麼多步
  var btn = null, token = 0;
  var mainNode = d.getElementById("main");

  function apxUrl(a) {
    if (!a || !a.getAttribute) return null;
    var h = a.getAttribute("href");
    if (!h || a.target === "_blank" || a.hasAttribute("download")) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin || !HREF.test(u.pathname)) return null;
    return u.pathname;
  }

  function load(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function (text) {
      var doc = new DOMParser().parseFromString(text, "text/html");
      var a = doc.querySelector("main article.content[data-apx]");
      var h = doc.querySelector(".sm-head");
      if (!a || !h) throw new Error("not an appendix page");
      var base = new URL(url, location.href);
      [].forEach.call(a.querySelectorAll("a[href]"), function (x) {   // 連結以附錄頁的位置為準，轉成絕對路徑
        x.setAttribute("href", new URL(x.getAttribute("href"), base).pathname + new URL(x.getAttribute("href"), base).hash);
      });
      var e = { head: h.innerHTML, body: a.innerHTML, pageTitle: doc.title,
                label: (h.querySelector(".num") || {}).textContent || "" };
      cache[url] = e;
      return e;
    });
  }

  function stash(node) {
    var f = d.createDocumentFragment();
    while (node.firstChild) f.appendChild(node.firstChild);
    return f;
  }

  function ensureButton() {
    if (btn) return btn;
    btn = d.createElement("button");
    btn.type = "button";
    btn.className = "apx-back";
    btn.innerHTML = '<svg class="apx-back-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">' +
      '<path d="M10 6 4 12l6 6M4 12h11a5 5 0 0 1 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.addEventListener("click", function () { history.go(-Math.max(depth, 1)); });
    d.body.appendChild(btn);
    return btn;
  }

  function show(e, url, link, from) {
    if (!origin) {
      var h1 = head.querySelector("h1");
      origin = { head: stash(head), article: stash(article), scroll: window.pageYOffset,
                 title: d.title, url: from || null, link: link || null, name: h1 ? h1.textContent.replace(/\s+/g, " ").trim() : "" };
    } else {
      stash(head); stash(article);
    }
    head.innerHTML = e.head;
    var h1n = head.querySelector("h1");
    if (h1n) h1n.setAttribute("tabindex", "-1");
    article.innerHTML = e.body;
    article.setAttribute("data-apx-view", "");
    d.title = e.pageTitle;
    d.body.classList.add("apx-open");
    var b = ensureButton();
    b.setAttribute("aria-label", "回到正文：" + origin.name);
    b.title = "回到正文：" + origin.name;
    b.hidden = false;
    var sb = d.querySelector(".apx-back[data-sec]"); if (sb) sb.hidden = true;   // 節間返回鈕在附錄檢視時隱藏
    window.scrollTo(0, 0);
    var target = h1n || mainNode;                      // 鍵盤使用者：焦點移到附錄標題
    if (target) { try { target.focus({ preventScroll: true }); } catch (x) {} }
  }

  function restore() {
    if (!origin) return;
    var o = origin;
    origin = null; depth = 0;
    head.innerHTML = ""; article.innerHTML = "";
    head.appendChild(o.head); article.appendChild(o.article);
    article.removeAttribute("data-apx-view");
    d.title = o.title;
    d.body.classList.remove("apx-open");
    if (btn) btn.hidden = true;
    var sb = d.querySelector(".apx-back[data-sec]"); if (sb) sb.hidden = false;
    window.scrollTo(0, o.scroll);
    if (o.link && d.contains(o.link)) { try { o.link.focus({ preventScroll: true }); } catch (x) {} }   // 焦點回到原本的連結
  }

  function open(url, push, link) {
    var my = ++token;
    load(url).then(function (e) {
      if (my !== token) return;
      if (push) {
        depth = (origin ? depth : 0) + 1;
        var from = origin ? origin.url : location.href;   // 正文網址（pushState 之前取）
        history.pushState({ apx: url, d: depth }, "", url);
        show(e, url, link, from);
        return;
      }
      show(e, url, link);
    }, function () { location.href = url; });          // 取不到就當一般連結跳頁
  }

  d.addEventListener("click", function (ev) {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest && ev.target.closest("a");
    if (a && a.closest(".sm-aside") && origin && /^#/.test(a.getAttribute("href") || "")) {
      var back = origin.url;
      restore();                                        // 右欄的本節目錄：先回到正文，再跳到該小節
      if (back) { try { history.replaceState(null, "", back); } catch (x) {} }   // 網址也回到正文
      return;
    }
    var url = apxUrl(a);
    if (!url || !(a.closest(".content") || a.closest("main"))) return;
    ev.preventDefault();
    open(url, true, a);
  });

  window.addEventListener("popstate", function (ev) {
    var s = ev.state;
    var my = ++token;                                   // 任何歷史移動都作廢尚未完成的載入
    if (s && s.apx) {
      load(s.apx).then(function (e) {
        if (my !== token) return;
        depth = s.d || 1;
        show(e, s.apx);
      }, function () { location.reload(); });
    } else if (origin) {
      restore();
    }
  });

  // 重新整理後停在附錄網址時，該網址載入的是獨立附錄頁，不會走到這裡
})();
