// 共用頁頂、頁尾與登入輔助（靜態頁面無後端，用腳本填入）
var ACCOUNTS = {
  alice: {password: "violin2026", session: "a1b2c3d4"},
  bob: {password: "harbor88", session: "b5e6f7a8"},
  carol: {password: "tideway17", session: "c9d0e1f2"},
  admin: {password: "stagedoor42", session: "d3a4f5b6"}
};
// 全部使用者（含沒有設定密碼的 reader）；資料依 docs/model-site.md
var PEOPLE = {
  admin: {id: 1, guid: "3f9a1c7e-5b2d-4e68-9a40-c1d27b8e6f05", role: "admin", color: "#2c8a47", phone: "0900-000-001", apikey: "ak_admin_5c81e0d7", chat: 122},
  bob: {id: 3, guid: "b7e24d90-1a63-4c5f-8e12-9d0f3a6b7c41", role: "member", color: "#d1590a", phone: "0900-000-003", apikey: "ak_bob_2f6a9b14", chat: 121},
  alice: {id: 7, guid: "e5c08a31-7d94-4b26-b3f8-60a1d2c9e754", role: "member", color: "#7b4fc4", phone: "0900-000-007", apikey: "ak_alice_9d4e71c2", chat: 123, ticket: 3},
  carol: {id: 9, guid: "9a1d6f42-c3e8-4075-a2b9-4e7f08d1c36b", role: "member", color: "#0a7f93", phone: "0900-000-009", apikey: "ak_carol_7b03d5e8", chat: 120},
  reader: {id: 12, guid: "4c8b2e69-f1a7-4d03-9e5c-a7b3016d28f9", role: "member", color: "#5d646d", phone: "0900-000-012", apikey: "ak_reader_1e9c4a67"}
};
var DAY = 24 * 3600;
var store = {
  get: function (k, d) { try { var v = localStorage.getItem("tix:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem("tix:" + k, JSON.stringify(v)); } catch (e) {} }
};
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function exists(u) { return has(PEOPLE, u) && store.get("deleted", []).indexOf(u) < 0; }
function passwordOf(u) { return store.get("pw:" + u, has(ACCOUNTS, u) ? ACCOUNTS[u].password : null); }
function roleOf(u) { return store.get("role:" + u, PEOPLE[u].role); }
function emailOf(u) { return store.get("email:" + u, u + "@tickets.example.com"); }
function cookie(n) {
  var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + n + "=([^;]*)"));
  return m ? m[1] : null;
}
function cookieDir() { return location.pathname.replace(/[^\/]*$/, ""); }
function setCookie(n, v, maxAge) {
  document.cookie = n + "=" + v + "; path=" + cookieDir() + "; SameSite=Lax" + (maxAge === undefined ? "" : "; max-age=" + maxAge);
}
function md5(str) {
  function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
  var K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], i, o;
  for (i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  var utf = unescape(encodeURIComponent(str)), n = utf.length, w = [];
  for (i = 0; i < n; i++) w[i >> 2] |= utf.charCodeAt(i) << ((i % 4) * 8);
  w[n >> 2] |= 0x80 << ((n % 4) * 8);
  var len = (((n + 8) >> 6) + 1) * 16;
  for (i = 0; i < len; i++) if (w[i] === undefined) w[i] = 0;
  w[len - 2] = n * 8;
  var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (o = 0; o < len; o += 16) {
    var A = a0, B = b0, C = c0, D = d0, F, g;
    for (i = 0; i < 64; i++) {
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + w[o + g]) | 0;
      A = D; D = C; C = B; B = (B + rl(F, S[(i >> 4) * 4 + (i % 4)])) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  var out = "";
  [a0, b0, c0, d0].forEach(function (x) { for (var j = 0; j < 4; j++) out += ("0" + ((x >>> (j * 8)) & 255).toString(16)).slice(-2); });
  return out;
}
// 保持登入 Cookie 與 session 都能識別身分
function currentUser() {
  var s = cookie("session");
  if (s) for (var n in ACCOUNTS) if (ACCOUNTS[n].session === s && exists(n)) return n;
  var r = cookie("stay-logged-in");
  if (r) {
    try {
      var d = atob(decodeURIComponent(r)), i = d.indexOf(":");
      var u = d.slice(0, i);
      if (has(ACCOUNTS, u) && exists(u) && md5(passwordOf(u)) === d.slice(i + 1)) return u;
    } catch (e) {}
  }
  return null;
}
function setSession(u) {
  setCookie("session", ACCOUNTS[u].session);
  setCookie("admin", roleOf(u) === "admin" ? "true" : "false");
}
function clearSession() {
  ["session", "admin", "account", "stay-logged-in"].forEach(function (n) { setCookie(n, "", 0); });
}
// 站內信箱：信寄到帳號的 email，只有登入該帳號才看得到
function sendMail(u, subject, text, link) {
  var box = store.get("mail:" + u, []);
  box.unshift({subject: subject, text: text, link: link || "", time: new Date().toLocaleString("zh-TW", {hour12: false})});
  store.set("mail:" + u, box);
}
// 登入後只導回站內頁面；其他一律去帳號頁
function safeNext(s) {
  return /^(index\.html|account\.html|event\.html\?eventId=\d+)$/.test(s || "") ? s : "account.html";
}
var ICON = {
  user: '<svg viewBox="0 0 48 48" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 43c0-9 7-14 17-14s17 5 17 14z" fill="#bcd7f5"/><circle cx="24" cy="17" r="12" fill="#bcd7f5"/></svg>',
  ticket: '<svg viewBox="0 0 48 48" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15a5 5 0 0 1 5-5h30a5 5 0 0 1 5 5v4a5 5 0 0 0 0 10v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4a5 5 0 0 0 0-10z" fill="#fbcfa8"/><path d="M30 17L18 31"/><circle cx="19" cy="19" r="3.3" fill="#d1590a" stroke="none"/><circle cx="29" cy="29" r="3.3" fill="#d1590a" stroke="none"/></svg>',
  lock: '<svg viewBox="0 0 48 48" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-7a9 9 0 0 1 18 0v7" stroke-width="4"/><rect x="8" y="20" width="32" height="23" rx="8" fill="#e4cfa8"/><circle cx="24" cy="30" r="3.5" fill="#8a5a22" stroke="none"/></svg>'
};
var me = currentUser();
document.querySelector("header.site").innerHTML =
  '<a class="logo" href="index.html"><span class="mark">' + ICON.ticket + '</span>弦川票務</a>' +
  '<nav><a href="index.html">活動</a>' + (me === "admin" && typeof ROUTES !== "undefined" ? '<a href="' + ROUTES.adminHref + '">後台</a>' : "") + (me
    ? '<a href="account.html" class="me"><span class="dot" style="background:' + PEOPLE[me].color + '"></span>' + me + '</a>'
    : '<a href="login.html">' + ICON.lock + '登入</a>') + '</nav>';
document.querySelector("footer.site").innerHTML =
  '<div><strong>弦川票務</strong>　潮見市最早的活動售票網站，自 2009 年創站</div>' +
  '<div class="small">tickets.example.com｜© 2009–2026 弦川票務股份有限公司，版權所有　<a href="../index.html">回教材</a></div>';
