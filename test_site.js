/* Yayina giden sayfanin (docs/) testleri - tarayicisiz, hizli. Robot her yeni veride kosar.
   Tarayicida davranis (internetten tazeleme, onbellek, ret) test_tarayici.py'de.
   Calistir: node test_site.js */
"use strict";
var fs = require("fs"), path = require("path");
var O = require("./oranlar.js");
var kok = __dirname, gecen = 0, kalan = 0;
function esit(ad, bulunan, beklenen) {
  var ok = JSON.stringify(bulunan) === JSON.stringify(beklenen);
  if (ok) gecen++; else { kalan++; console.log("HATA  " + ad + "\n  bulunan:  " + JSON.stringify(bulunan) + "\n  beklenen: " + JSON.stringify(beklenen)); }
}
var html = fs.readFileSync(path.join(kok, "docs", "index.html"), "utf8");
var veriMetni = fs.readFileSync(path.join(kok, "veri", "oranlar.json"), "utf8");

esit("docs/veri.json = veri/oranlar.json (bayt bayt)", fs.readFileSync(path.join(kok, "docs", "veri.json"), "utf8") === veriMetni, true);
esit(".nojekyll var", fs.existsSync(path.join(kok, "docs", ".nojekyll")), true);
esit("dis script yok (tek dosya)", /<script[^>]+src=/.test(html), false);
esit("dis stil yok", /<link[^>]+stylesheet/.test(html), false);
var m = html.match(/window\.ICRA_GOMULU = (\{[\s\S]*?\});\n/);
esit("gomulu veri var", !!m, true);
var gomulu = m ? JSON.parse(m[1]) : null;
esit("gomulu veri = veri dosyasi", JSON.stringify(gomulu) === JSON.stringify(JSON.parse(veriMetni)), true);
esit("gomulu veri denetimden gecer", gomulu ? O.veriDenetle(gomulu) : ["yok"], []);
esit("dort parca gomulu", (html.match(/<script>\/\* (veri|oranlar|hesap|arayuz)\.js \*\//g) || []).length, 4);
esit("boyut 300 KB alti", html.length < 300 * 1024, true);

// Sayfa disariya YALNIZ bu adreslere gidebilir (veri.json'u okumak icin) - baska hicbir sey.
var izinli = ["https://ertugrul2442.github.io/icra-dosya-hesabi/", "https://raw.githubusercontent.com/",
              "https://cdn.jsdelivr.net/gh/", "https://www.tcmb.gov.tr/", "https://www.mevzuat.gov.tr/"];
var adresler = (html.match(/https?:\/\/[^\s"'<>)\\]+/g) || []).filter(function (a) {
  return !izinli.some(function (i) { return a.indexOf(i) === 0; });
});
esit("izinsiz dis adres yok", adresler, []);
// Gizlilik: sayfa hicbir yere veri GONDERMEZ - yalniz okur.
["XMLHttpRequest", "sendBeacon", "WebSocket", "method:", "\"POST\"", "'POST'", "navigator.sendBeacon", "<form"].forEach(function (y) {
  esit("gonderen kod yok: " + y, html.indexOf(y) >= 0, false);
});
esit("fetch yalniz okur (cache no-store)", (html.match(/fetch\(/g) || []).length, 1);

console.log(gecen + " geçti, " + kalan + " kaldı");
process.exit(kalan ? 1 : 0);
