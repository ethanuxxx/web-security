// 管理頁：列出使用者、刪除使用者（只存在這個瀏覽器）
function renderAdmin() {
  var rows = document.getElementById("rows");
  rows.innerHTML = "";
  Object.keys(PEOPLE).filter(exists).forEach(function (u) {
    var tr = document.createElement("tr");
    tr.innerHTML = "<td></td><td></td><td></td><td></td>";
    var c = tr.children;
    c[0].textContent = u; c[1].textContent = PEOPLE[u].id; c[2].textContent = roleOf(u) === "admin" ? "管理員" : "會員";
    if (u !== "admin") {
      var b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = "刪除";
      b.onclick = function () {
        var d = store.get("deleted", []); d.push(u); store.set("deleted", d);
        renderAdmin();
        document.getElementById("msg").textContent = "已刪除使用者 " + u;
      };
      c[3].appendChild(b);
    }
    rows.appendChild(tr);
  });
}
