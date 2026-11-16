// 登入頁的各種變體；訊息與規則依 docs/model-site.md
function finishLogin(u, remember) {
  setSession(u);
  if (remember) setCookie("stay-logged-in", btoa(u + ":" + md5(passwordOf(u))), 30 * DAY);
  location.href = "account.html";
}
function loginPage(mode) {
  var f = document.getElementById("f"), msg = document.getElementById("msg");
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var u = f.username.value.trim().toLowerCase(), pw = f.password.value;
    var known = exists(u), ok = known && has(ACCOUNTS, u) && passwordOf(u) === pw;
    var generic = "帳號或密碼錯誤";
    if (mode === "weak") {
      if (!known) msg.textContent = "找不到此使用者";
      else if (!ok) msg.textContent = "密碼錯誤";
      else finishLogin(u);
    } else if (mode === "subtle") {
      if (ok) finishLogin(u); else msg.textContent = known ? generic + "。" : generic;
    } else if (mode === "lock") {
      var now = Date.now(), L = store.get("lock:" + u, {n: 0, until: 0});
      if (L.until && now >= L.until) L = {n: 0, until: 0};
      if (known && L.until > now) { msg.textContent = ok ? "登入暫時無法使用" : "帳號已鎖定，請 1 分鐘後再試"; return; }
      if (ok) { store.set("lock:" + u, {n: 0, until: 0}); finishLogin(u); return; }
      if (known) { L.n++; if (L.n >= 3) L.until = now + 60000; store.set("lock:" + u, L); }
      msg.textContent = generic;
    } else if (mode === "remember") {
      if (ok) finishLogin(u, f["stay-logged-in"].checked); else msg.textContent = generic;
    } else if (mode === "2fa") {
      if (!ok) { msg.textContent = generic; return; }
      setSession(u); setCookie("account", u);
      location.href = "login-verify.html";
    } else {   // timing 與預設：兩種情況文字相同
      if (ok) finishLogin(u); else msg.textContent = generic;
    }
  });
}
