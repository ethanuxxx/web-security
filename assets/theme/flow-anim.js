/* 流程小動畫：<figure data-flow-anim> 內以 data-step="1"… 標記的步驟群組，捲進可見範圍後依序播放。
   預設（無 JS、動畫關閉）顯示全部步驟都畫好的靜態圖；JS 啟動後才加上 .is-live 切換成動畫模式。
   不加任何控制 UI。契約見 site/themes/README.md「流程小動畫」。 */
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  /* 預設時間（毫秒）；可在 <figure> 以 data-flow-travel / data-flow-gap / data-flow-hold 覆寫 */
  var DEF = { travel: 1800, gap: 1500, hold: 3000 };
  var figs = [].slice.call(d.querySelectorAll("[data-flow-anim]"));
  if (!figs.length || !window.IntersectionObserver) return;

  function motionOn() {
    var m = root.getAttribute("data-motion");
    if (m) return m !== "off";
    try { return !matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return true; }
  }

  function num(el, name, def) {
    var v = parseFloat(el.getAttribute("data-" + name));
    return v >= 0 ? v : def;
  }

  function Flow(fig) {
    var self = this;
    this.fig = fig;
    this.svg = fig.querySelector("svg");
    this.steps = [].slice.call(fig.querySelectorAll("[data-step]")).sort(function (a, b) {
      return a.getAttribute("data-step") - b.getAttribute("data-step");
    });
    this.paths = this.steps.map(function (g) { return g.querySelector("path.flow-path"); });
    this.items = this.steps.map(function (g) { return g.querySelector(".flow-item"); });
    this.home = this.items.map(function (e) { return e ? e.getAttribute("transform") : null; });
    this.arrive = [].slice.call(fig.querySelectorAll("[data-arrive]"));
    this.travel = num(fig, "flow-travel", DEF.travel);
    this.gap = num(fig, "flow-gap", DEF.gap);
    this.hold = num(fig, "flow-hold", DEF.hold);
    this.visible = false; this.raf = 0; this.last = 0; this.t = 0; this.state = []; this.arrived = [];
    this.tick = function (now) {
      self.raf = 0;
      if (!self.live()) return;
      self.t += self.last ? Math.min(now - self.last, 100) : 0;
      self.last = now;
      self.draw();
      self.raf = requestAnimationFrame(self.tick);
    };
    new IntersectionObserver(function (es) {
      self.visible = es[es.length - 1].isIntersecting;
      self.sync();
    }, { threshold: 0.35 }).observe(fig);
    new MutationObserver(function () { self.sync(); })
      .observe(root, { attributes: true, attributeFilter: ["data-motion"] });
  }

  Flow.prototype.live = function () { return this.visible && motionOn(); };

  Flow.prototype.sync = function () {
    if (!motionOn()) { this.toStatic(); return; }
    if (!this.fig.classList.contains("is-live")) {
      this.fig.classList.add("is-live");
      this.t = 0; this.state = []; this.arrived = [];
      this.draw();
    }
    if (this.visible) {
      if (!this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.tick); }
    } else if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  };

  Flow.prototype.toStatic = function () {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.fig.classList.remove("is-live");
    var home = this.home;
    this.items.forEach(function (e, i) { if (e && home[i]) e.setAttribute("transform", home[i]); });
    this.steps.forEach(function (g) { g.classList.remove("is-now", "is-past"); });
    this.arrive.forEach(function (e) { e.classList.remove("is-on"); });
    this.state = []; this.arrived = [];
  };

  Flow.prototype.draw = function () {
    var n = this.steps.length, T = this.travel, per = T + this.gap, total = n * per + this.hold;
    if (this.t >= total) this.t -= total;
    var t = this.t, cur = Math.min(Math.floor(t / per), n - 1), local = t - cur * per;
    var hold = t >= n * per, self = this;
    for (var i = 0; i < n; i++) {
      var s = t < i * per ? "" : (i < cur || (i === cur && hold)) ? "past" : "now";
      if (this.state[i] !== s) {
        this.state[i] = s;
        this.steps[i].classList.toggle("is-now", s === "now");
        this.steps[i].classList.toggle("is-past", s === "past");
      }
    }
    /* data-arrive="n" 的元素：第 n 步抵達後出現，循環重新開始時消失 */
    this.arrive.forEach(function (e, j) {
      var k = parseInt(e.getAttribute("data-arrive"), 10) - 1;
      var on = t >= k * per + T;
      if (self.arrived[j] !== on) { self.arrived[j] = on; e.classList.toggle("is-on", on); }
    });
    var p = this.paths[cur], item = this.items[cur];
    if (hold || !p || !item) return;
    var k2 = Math.min(local / T, 1);
    k2 = T ? k2 * k2 * (3 - 2 * k2) : 1;
    var pt = p.getPointAtLength(p.getTotalLength() * k2);
    item.setAttribute("transform", "translate(" + pt.x.toFixed(1) + " " + pt.y.toFixed(1) + ")");
  };

  figs.forEach(function (f) { if (f.querySelector("[data-step]")) new Flow(f); });
})();
