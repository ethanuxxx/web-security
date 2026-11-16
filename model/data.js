// 虛構世界「潮見市」的活動資料（只在前端）。eventId 與票價依 docs/model-site.md。
var EVENTS = {
  1: {title: "城市爵士夜", sale: "2026 年 11 月 18 日", cat: "音樂", date: "2026-12-05 19:30", day: "12/05", venue: "河岸音樂廳", price: "NT$ 800", student: "NT$ 600", bg: "#e8f0fa", fg: "#2b6cb8", soft: "#bcd7f5", art: "notes", blurb: "潮見河岸音樂廳年度爵士夜，三組樂團輪番登台。"},
  2: {title: "光影插畫展", sale: "2026 年 11 月 20 日", cat: "展覽", date: "2026-12-12 10:00", day: "12/12", venue: "潮見市立美術館 2 樓", price: "NT$ 350", student: "NT$ 250", bg: "#fbe7a0", fg: "#9a7200", soft: "#fbcfa8", art: "frame", blurb: "三十位在地插畫家以光與影為題的聯合展覽。"},
  3: {title: "Jazz in the Park 爵士音樂會", sale: "2026 年 11 月 22 日", cat: "音樂", date: "2026-12-20 18:00", day: "12/20", venue: "河岸音樂廳露天廣場", price: "NT$ 1,200", student: "NT$ 900", bg: "#bfe6c9", fg: "#2c8a47", soft: "#aee6da", art: "jazz", blurb: "傍晚的露天爵士音樂會，國內外樂手同台演出。"},
  4: {title: "獨立樂團跨年演出", sale: "2026 年 11 月 25 日", cat: "跨年", date: "2026-12-31 21:00", day: "12/31", venue: "港邊展演空間", price: "NT$ 1,500", student: "NT$ 1,200", bg: "#d9c8f3", fg: "#7b4fc4", soft: "#f6c3c3", art: "star", blurb: "六組獨立樂團接力演出，一起倒數跨年。"}
};
var PAST = [
  {title: "潮見音樂節 2025", date: "2025-10-18", venue: "河岸音樂廳"},
  {title: "老街光影市集", date: "2025-09-06", venue: "港邊展演空間"},
  {title: "春季素描聯展", date: "2025-04-12", venue: "潮見市立美術館"}
];
// 海報：四張都是扁平插畫活動海報（同一 viewBox 640×400，背景／中景／前景三層加排字），配色各有主色調
// 依顯示尺寸裁切：寬幅（首頁小卡）只取插圖；中等（首頁橫幅）含活動名與日期；其餘為完整海報
function posterSVG(e, w, h) {
  var f = {jazz: jazzPoster, notes: cityPoster, frame: exhibitPoster, star: nyePoster}[e.art];
  return f(w, h);
}

// 共用繪圖片段
function posterMode(w, h) {
  var r = w / h, m = r > 2.2 ? "card" : (r > 1.8 ? "hero" : "full");
  return {m: m, vb: {card: "0 110 640 256", hero: "0 20 640 320", full: "0 0 640 400"}[m]};
}
function posterRand(seed) { return function () { seed = (seed * 37 + 11) % 97; return seed; }; }
function posterNote(x, y, s, c) {
  return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><ellipse cx="0" cy="0" rx="11" ry="8" transform="rotate(-20)" fill="' + c + '"/><path d="M9 -3V-38q2 12 16 16" fill="none" stroke="' + c + '" stroke-width="4" stroke-linecap="round"/></g>';
}
function posterBurst(cx, cy, r, c) {
  var o = '<g stroke="' + c + '" stroke-width="3" stroke-linecap="round" fill="' + c + '">';
  for (var i = 0; i < 14; i++) {
    var a = i * Math.PI / 7, ca = Math.cos(a), sa = Math.sin(a), rr = i % 2 ? r * 0.78 : r;
    o += '<line x1="' + (cx + ca * r * 0.34).toFixed(1) + '" y1="' + (cy + sa * r * 0.34).toFixed(1) + '" x2="' + (cx + ca * rr * 0.82).toFixed(1) + '" y2="' + (cy + sa * rr * 0.82).toFixed(1) + '"/><circle cx="' + (cx + ca * rr).toFixed(1) + '" cy="' + (cy + sa * rr).toFixed(1) + '" r="3" stroke="none"/>';
  }
  return o + '<circle cx="' + cx + '" cy="' + cy + '" r="5" stroke="none"/></g>';
}
// 前景人群剪影：xs 為各人的 x 位置，hands 為舉手的人（索引）
function posterCrowd(xs, fill, hands, dark) {
  var rnd = posterRand(7), o = '';
  xs.forEach(function (x0, i) {
    var sd = rnd(), x = x0 + sd % 9, y = 346 + (sd % 5) * 6 - (i % 3) * 4;
    o += '<circle cx="' + x + '" cy="' + y + '" r="' + (15 + sd % 3) + '"/><path d="M' + (x - 30) + ' 410q4-44 30-44t30 44z"/>';
    if (hands.indexOf(i) >= 0) o += '<path d="M' + (x + 14) + ' ' + (y + 12) + 'l16-34" stroke="' + fill + '" stroke-width="7" stroke-linecap="round"/>';
  });
  return '<rect y="318" width="640" height="90" fill="' + dark + '" opacity=".55"/><g fill="' + fill + '">' + o + '</g>';
}
// 排字：活動名、副標（含日期）、場館；完整海報再加底部出演列
function posterText(m, o) {
  var ff = 'font-family="Noto Sans TC,PingFang TC,Microsoft JhengHei,sans-serif"', out = '';
  if (m !== "card") {
    out += '<g ' + ff + ' text-anchor="middle" fill="#fff"><text x="320" y="62" font-size="40" font-weight="800" letter-spacing="' + o.ls + '">' + o.t + '</text>' +
      '<text x="320" y="92" font-size="20" font-weight="700" fill="' + o.sc + '" letter-spacing="2">' + o.sub + '</text>' +
      '<text x="320" y="118" font-size="15" fill="#fff" opacity=".9">' + o.venue + '</text></g>';
  }
  if (m === "full") {
    var bw = Math.min(600, o.cast.length * 14 + 40);
    out += '<g ' + ff + ' text-anchor="middle"><rect x="' + (320 - bw / 2) + '" y="366" width="' + bw + '" height="26" rx="13" fill="' + o.bar + '" opacity=".85"/><text x="320" y="384" font-size="14" fill="' + o.sc + '">' + o.cast + '</text></g>';
  }
  return out;
}
function posterWrap(pm, label, inner) {
  return ('<svg viewBox="' + pm.vb + '" width="@W" height="@H" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + label + '">' + inner + '</svg>');
}

// Jazz in the Park 海報：背景（夕陽天空、遠景樹線）、中景（舞台、燈光、樂手）、前景（觀眾剪影）
// 依顯示尺寸裁切：寬幅（首頁小卡）只取插圖；中等（首頁橫幅）含活動名與日期；其餘為完整海報
function jazzPoster(w, h) {
  var r = w / h, mode = r > 2.2 ? "card" : (r > 1.8 ? "hero" : "full");
  var vb = {card: "0 110 640 256", hero: "0 20 640 320", full: "0 0 640 400"}[mode];
  var k = "jz" + mode, dark = "#1b1530", stage = "#2e2352", out = "";
  // 背景
  out += '<defs><linearGradient id="' + k + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2f7e"/><stop offset=".55" stop-color="#a65a9c"/><stop offset="1" stop-color="#fbcfa8"/></linearGradient>' +
    '<linearGradient id="' + k + 'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>';
  out += '<rect width="640" height="330" fill="url(#' + k + 's)"/><circle cx="520" cy="262" r="52" fill="#fbe7a0" opacity=".9"/>';
  out += '<g fill="#5b3f8f"><path d="M0 262q60-26 130-8t150-6q70-14 140 4t220-4v50H0z"/></g>';
  out += '<g fill="#473173"><circle cx="40" cy="262" r="20"/><circle cx="74" cy="254" r="26"/><circle cx="112" cy="266" r="18"/><circle cx="574" cy="256" r="24"/><circle cx="610" cy="264" r="20"/></g>';
  [[110, 3], [190, 2], [250, 4], [400, 2], [470, 3], [610, 2]].forEach(function (s) { out += '<circle cx="' + s[0] + '" cy="' + (150 - s[1] * 14) + '" r="1.8" fill="#fff" opacity=".7"/>'; });
  // 中景：舞台架構與燈光
  out += '<rect x="76" y="170" width="488" height="9" rx="3" fill="' + stage + '"/><rect x="76" y="170" width="9" height="136" fill="' + stage + '"/><rect x="555" y="170" width="9" height="136" fill="' + stage + '"/>';
  [150, 260, 380, 490].forEach(function (x, i) {
    var tx = [200, 300, 330, 440][i];
    out += '<path d="M' + (x - 5) + ' 184L' + (tx - 46) + ' 296H' + (tx + 46) + 'L' + (x + 5) + ' 184z" fill="url(#' + k + 'b)" opacity=".38"/><circle cx="' + x + '" cy="184" r="7" fill="#fbe7a0" stroke="' + dark + '" stroke-width="2"/>';
  });
  out += '<rect x="90" y="296" width="460" height="14" fill="' + stage + '"/><rect x="90" y="296" width="460" height="3" fill="#d1590a"/>';
  // 鼓手（後排）
  out += '<g fill="#3a2d63"><circle cx="452" cy="236" r="8"/><path d="M438 276l3-30q11-8 22 0l3 30z"/><ellipse cx="452" cy="276" rx="26" ry="9"/><rect x="426" y="276" width="52" height="20"/></g><g stroke="#3a2d63" stroke-width="3" fill="none"><path d="M414 244v50M490 252v44"/></g><g fill="#fbe7a0"><ellipse cx="414" cy="244" rx="17" ry="3.5"/><ellipse cx="490" cy="252" rx="14" ry="3"/></g>';
  // 低音提琴手
  out += '<g fill="' + dark + '"><circle cx="180" cy="230" r="8"/><path d="M167 270l3-30q10-7 20 0l3 30z"/><rect x="168" y="268" width="9" height="28"/><rect x="181" y="268" width="9" height="28"/>' +
    '<ellipse cx="206" cy="270" rx="21" ry="25"/><ellipse cx="206" cy="238" rx="14" ry="14"/><rect x="204" y="190" width="5" height="46"/><circle cx="206" cy="187" r="5"/></g>' +
    '<path d="M186 248l18-14M190 258l12 8" stroke="' + dark + '" stroke-width="5" stroke-linecap="round"/><ellipse cx="206" cy="270" rx="21" ry="25" fill="none" stroke="#d1590a" stroke-width="1.5" opacity=".7"/>';
  // 小號手
  out += '<g fill="' + dark + '"><circle cx="318" cy="228" r="8"/><path d="M304 270l3-32q11-7 22 0l3 32z"/><rect x="306" y="268" width="9" height="28"/><rect x="320" y="268" width="9" height="28"/></g>' +
    '<path d="M326 246l10-14" stroke="' + dark + '" stroke-width="5" stroke-linecap="round"/><path d="M324 224l40-14" stroke="' + dark + '" stroke-width="3.5" stroke-linecap="round"/><path d="M362 203l16-7 3 25-17-4z" fill="' + dark + '"/>' +
    '<path d="M324 224l40-14" stroke="#fbe7a0" stroke-width="1" opacity=".8"/>';
  // 前景：觀眾
  var heads = "", seed = 7;
  for (var i = 0; i < 17; i++) {
    seed = (seed * 37 + 11) % 97;
    var x = 12 + i * 38 + (seed % 9), y = 346 + (seed % 5) * 6 - (i % 3) * 4;
    heads += '<circle cx="' + x + '" cy="' + y + '" r="' + (15 + seed % 3) + '"/><path d="M' + (x - 30) + ' 410q4-44 30-44t30 44z"/>';
    if (i % 5 === 2) heads += '<path d="M' + (x + 14) + ' ' + (y + 12) + 'l16-34" stroke="' + dark + '" stroke-width="7" stroke-linecap="round"/>';
  }
  out += '<rect y="318" width="640" height="90" fill="#25193f" opacity=".55"/><g fill="#150f26">' + heads + '</g>';
  out += '<rect x="60" y="326" width="2" height="2" fill="none"/>';
  // 排字
  var ff = 'font-family="Noto Sans TC,PingFang TC,Microsoft JhengHei,sans-serif"';
  if (mode !== "card") {
    out += '<g ' + ff + ' text-anchor="middle" fill="#fff"><text x="320" y="62" font-size="38" font-weight="800" letter-spacing="2">JAZZ IN THE PARK</text>' +
      '<text x="320" y="92" font-size="20" font-weight="700" fill="#fbcfa8" letter-spacing="2">爵士音樂會｜2026.12.20 SUN 18:00</text>' +
      '<text x="320" y="118" font-size="15" fill="#fff" opacity=".9">河岸音樂廳露天廣場</text>';
  }
  if (mode === "full") {
    out += '<g ' + ff + ' text-anchor="middle"><rect x="104" y="366" width="432" height="26" rx="13" fill="#150f26" opacity=".85"/><text x="320" y="384" font-size="14" fill="#fbcfa8">出演　林嶼川（小號）／蘇靜禾（低音提琴）／何亞庭（鼓）</text></g>';
  }
  if (mode !== "card") out += '</g>';
  return '<svg viewBox="' + vb + '" width="' + w + '" height="' + h + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Jazz in the Park 爵士音樂會海報">' + out + '</svg>';
}

// 城市爵士夜海報：夜空與月亮、兩層天際線、霓虹招牌、音符、街燈
function cityPoster(w, h) {
  var pm = posterMode(w, h), m = pm.m, k = "ct" + m, rnd = posterRand(21), out = '', i;
  out += '<defs><linearGradient id="' + k + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1a47"/><stop offset=".6" stop-color="#2b5aa8"/><stop offset="1" stop-color="#9cc4f0"/></linearGradient></defs>';
  out += '<rect width="640" height="330" fill="url(#' + k + 's)"/><circle cx="96" cy="178" r="44" fill="#fbe7a0" opacity=".16"/><circle cx="96" cy="178" r="30" fill="#fbe7a0" opacity=".92"/>';
  [[40, 140], [170, 132], [260, 150], [350, 138], [430, 146], [610, 138], [560, 128]].forEach(function (p) { out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.8" fill="#fff" opacity=".75"/>'; });
  function row(x0, x1, fill, top0, topR, skip, win) {
    var x = x0, g = '<g fill="' + fill + '">', ws = '';
    while (x < x1) {
      var bw = 34 + rnd() % 30, top = top0 + rnd() % topR;
      if (!(x + bw > skip[0] && x < skip[1])) {
        g += '<rect x="' + x + '" y="' + top + '" width="' + bw + '" height="' + (330 - top) + '"/>';
        if (win) for (var yy = top + 12; yy < 312; yy += 16) for (var xx = x + 8; xx < x + bw - 10; xx += 14) {
          var v = rnd(); if (v % 3 === 0) ws += '<rect x="' + xx + '" y="' + yy + '" width="6" height="8" fill="' + (v % 9 === 0 ? '#ffb0da' : '#fbe7a0') + '" opacity=".85"/>';
        }
      }
      x += bw + 2;
    }
    return g + '</g>' + ws;
  }
  out += row(-10, 640, '#284c8e', 188, 46, [0, 0], false);
  out += row(-6, 640, '#14224f', 224, 60, [446, 566], true);
  // 霓虹招牌所在的大樓
  out += '<rect x="450" y="168" width="112" height="162" fill="#1a2a5e"/><rect x="450" y="168" width="112" height="6" fill="#ff7ac0" opacity=".6"/>';
  for (i = 0; i < 5; i++) for (var j = 0; j < 7; j++) if ((i * 3 + j * 5) % 4 !== 0) out += '<rect x="' + (462 + i * 20) + '" y="' + (250 + j * 10) + '" width="6" height="6" fill="#fbe7a0" opacity=".8"/>';
  out += '<rect x="464" y="188" width="84" height="44" rx="8" fill="#1a0f3a" stroke="#ff7ac0" stroke-width="9" opacity=".28"/><rect x="464" y="188" width="84" height="44" rx="8" fill="#1a0f3a" stroke="#ff7ac0" stroke-width="3"/>' +
    '<text x="506" y="218" text-anchor="middle" font-family="Noto Sans TC,sans-serif" font-size="24" font-weight="800" letter-spacing="3" fill="#ffc0e2">JAZZ</text><path d="M476 196h60" stroke="#fbe7a0" stroke-width="2" opacity=".7"/>';
  // 音符
  out += posterNote(150, 176, 1.1, '#ffc0e2') + posterNote(205, 160, .8, '#fbe7a0') + posterNote(330, 170, .9, '#ffc0e2') + posterNote(405, 150, 1, '#fbe7a0');
  // 街道、街燈
  out += '<rect y="318" width="640" height="90" fill="#0b1233"/><rect y="318" width="640" height="6" fill="#1f3a7a"/><rect x="450" y="332" width="112" height="14" fill="#ff7ac0" opacity=".25"/>';
  for (i = 0; i < 9; i++) out += '<rect x="' + (20 + i * 74) + '" y="352" width="34" height="4" rx="2" fill="#1f3a7a"/>';
  [70, 340].forEach(function (x) {
    out += '<path d="M' + (x - 30) + ' 334L' + (x - 6) + ' 268H' + (x + 6) + 'L' + (x + 30) + ' 334z" fill="#fbe7a0" opacity=".1"/><rect x="' + (x - 2) + '" y="268" width="4" height="70" fill="#050a1f"/><circle cx="' + x + '" cy="264" r="8" fill="#fbe7a0"/><circle cx="' + x + '" cy="264" r="15" fill="#fbe7a0" opacity=".25"/>';
  });
  out += posterText(m, {t: "城市爵士夜", ls: 8, sub: "CITY JAZZ NIGHT｜2026.12.05 SAT 19:30", sc: "#ffc0e2", venue: "河岸音樂廳", cast: "出演　夏棠四重奏／陸野（薩克斯風）／簡洛葵（鋼琴）", bar: "#0b1233"});
  return posterWrap(pm, "城市爵士夜海報", out).replace('@W', w).replace('@H', h);
}

// 光影插畫展海報：美術館展牆、四幅畫框（框內各有插畫）、軌道投射燈與光束、觀展人影
function exhibitPoster(w, h) {
  var pm = posterMode(w, h), m = pm.m, k = "ex" + m, out = '';
  out += '<defs><linearGradient id="' + k + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2008"/><stop offset=".7" stop-color="#6b4a12"/><stop offset="1" stop-color="#8a6218"/></linearGradient></defs>';
  out += '<rect width="640" height="330" fill="url(#' + k + 's)"/><rect y="300" width="640" height="30" fill="#2a1c07"/><rect y="300" width="640" height="3" fill="#d6a43a" opacity=".8"/>';
  [[60, 170, 100, 110], [185, 160, 130, 92], [340, 172, 86, 110], [452, 160, 128, 100]].forEach(function (f) {
    var cx = f[0] + f[2] / 2, bt = f[1] + f[3];
    out += '<path d="M' + (cx - 5) + ' 150L' + (f[0] - 12) + ' ' + (bt + 4) + 'H' + (f[0] + f[2] + 12) + 'L' + (cx + 5) + ' 150z" fill="#fff3b5" opacity=".09"/>';
    out += '<rect x="' + f[0] + '" y="' + f[1] + '" width="' + f[2] + '" height="' + f[3] + '" fill="#f1d27a" stroke="#8a5a10" stroke-width="5"/><rect x="' + (cx - 14) + '" y="' + (bt + 10) + '" width="28" height="6" rx="2" fill="#e6c46a" opacity=".85"/>';
  });
  // 四幅畫
  out += '<rect x="68" y="178" width="84" height="94" fill="#bfe6c9"/><circle cx="110" cy="212" r="14" fill="#fbe7a0"/><path d="M68 272V244q22-20 42-4t42-6V272z" fill="#2c8a47"/>';
  out += '<rect x="193" y="168" width="114" height="76" fill="#f6c3c3"/><circle cx="270" cy="196" r="16" fill="#fff"/><path d="M193 244l34-40 28 26 22-20 30 34z" fill="#7b4fc4"/>';
  out += '<rect x="348" y="180" width="70" height="94" fill="#aee6da"/><circle cx="383" cy="215" r="20" fill="#2b6cb8"/><circle cx="370" cy="246" r="12" fill="#fbe7a0"/><path d="M388 272l16-26 14 26z" fill="#e07b39"/>';
  out += '<rect x="460" y="168" width="112" height="84" fill="#bcd7f5"/><rect x="460" y="242" width="112" height="10" fill="#8fc48f"/><rect x="490" y="214" width="36" height="28" fill="#fff"/><path d="M484 214l24-22 24 22z" fill="#c4452a"/><rect x="500" y="226" width="10" height="16" fill="#9a7200"/><rect x="548" y="226" width="5" height="16" fill="#6b4a12"/><circle cx="550" cy="216" r="14" fill="#2c8a47"/>';
  // 軌道與燈
  out += '<rect x="40" y="132" width="560" height="7" rx="3" fill="#150d03"/>';
  [110, 250, 383, 516].forEach(function (x) { out += '<rect x="' + (x - 2) + '" y="138" width="4" height="6" fill="#150d03"/><circle cx="' + x + '" cy="150" r="8" fill="#fff3b5" stroke="#150d03" stroke-width="2"/><circle cx="' + x + '" cy="150" r="16" fill="#fff3b5" opacity=".2"/>'; });
  out += posterCrowd([60, 190, 330, 470, 570], '#150d03', [3], '#150d03');
  out += posterText(m, {t: "光影插畫展", ls: 8, sub: "LIGHT &amp; SHADOW｜2026.12.12 SAT 10:00 開展", sc: "#fbe7a0", venue: "潮見市立美術館 2 樓", cast: "參展　沈汐／柯映禾／方知遙　等三十位在地插畫家", bar: "#150d03"});
  return posterWrap(pm, "光影插畫展海報", out).replace('@W', w).replace('@H', h);
}

// 獨立樂團跨年演出海報：夜空煙火、港邊天際線與水面倒影、鐘塔、倒數數字、人群
function nyePoster(w, h) {
  var pm = posterMode(w, h), m = pm.m, k = "ny" + m, out = '', i;
  out += '<defs><linearGradient id="' + k + 's" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120a3a"/><stop offset=".55" stop-color="#5a3aa8"/><stop offset="1" stop-color="#f6c3c3"/></linearGradient>' +
    '<linearGradient id="' + k + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2680"/><stop offset="1" stop-color="#1a1048"/></linearGradient></defs>';
  out += '<rect width="640" height="330" fill="url(#' + k + 's)"/>';
  [[40, 140], [170, 128], [300, 136], [420, 130], [520, 134], [610, 144], [90, 200]].forEach(function (p) { out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.8" fill="#fff" opacity=".7"/>'; });
  // 煙火與倒影
  var fw = [[96, 176, 42, '#fbe7a0'], [258, 162, 34, '#ff9ad0'], [468, 186, 46, '#aee6da'], [572, 152, 30, '#fbe7a0']];
  fw.forEach(function (f) { out += posterBurst(f[0], f[1], f[2], f[3]); });
  // 遠岸天際線
  var rnd = posterRand(5), x = -6, g = '<g fill="#2e1d6b">', ws = '';
  while (x < 640) {
    var bw = 26 + rnd() % 24, top = 268 + rnd() % 22;
    g += '<rect x="' + x + '" y="' + top + '" width="' + bw + '" height="' + (302 - top) + '"/>';
    for (var yy = top + 8; yy < 296; yy += 12) if (rnd() % 3 === 0) ws += '<rect x="' + (x + 6 + rnd() % (bw - 14)) + '" y="' + yy + '" width="4" height="5" fill="#fbe7a0" opacity=".8"/>';
    x += bw + 2;
  }
  out += g + '</g>' + ws;
  // 鐘塔
  out += '<rect x="304" y="226" width="44" height="80" fill="#241657"/><path d="M300 226l26-26 26 26z" fill="#241657"/><rect x="324" y="188" width="4" height="14" fill="#241657"/><circle cx="326" cy="250" r="15" fill="#fbe7a0" stroke="#150a3a" stroke-width="3"/><path d="M326 250v-11M326 250l8 3" stroke="#150a3a" stroke-width="3" stroke-linecap="round"/>';
  // 倒數數字
  out += '<g font-family="Noto Sans TC,sans-serif" font-size="48" font-weight="800" fill="none" stroke="#ffd7ea" stroke-width="2.5" letter-spacing="16" text-anchor="middle"><text x="196" y="262">3 2 1</text></g>';
  // 水面、倒影、小船
  out += '<rect y="302" width="640" height="30" fill="url(#' + k + 'w)"/>';
  fw.forEach(function (f) { out += '<path d="M' + (f[0] - 24) + ' 312h48M' + (f[0] - 14) + ' 320h28" stroke="' + f[3] + '" stroke-width="3" stroke-linecap="round" opacity=".5"/>'; });
  out += '<path d="M392 300h52l-8 10h-36z" fill="#150a3a"/><path d="M418 270v30l16-8z" fill="#fff" opacity=".9"/><circle cx="418" cy="266" r="3" fill="#fbe7a0"/>';
  out += '<path d="M326 306v22" stroke="#fbe7a0" stroke-width="10" opacity=".25"/>';
  var xs = []; for (i = 0; i < 17; i++) xs.push(12 + i * 38);
  out += posterCrowd(xs, '#0c0626', [1, 6, 11, 15], '#150a3a');
  out += posterText(m, {t: "獨立樂團跨年演出", ls: 5, sub: "NEW YEAR'S EVE LIVE｜2026.12.31 THU 21:00", sc: "#ffd7ea", venue: "港邊展演空間", cast: "出演　灰鷗電台／潮差／夜班渡輪　等六組獨立樂團", bar: "#0c0626"});
  return posterWrap(pm, "獨立樂團跨年演出海報", out).replace('@W', w).replace('@H', h);
}
