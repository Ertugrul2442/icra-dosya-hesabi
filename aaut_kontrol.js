/* Avukatlik asgari ucret tarifesi (AAUT) her yil Kasim basinda yenilenir ve OTOMATIK CEKILMEZ:
   tablosu guvenilir okunamiyor, veri/oranlar.json'daki "vekalet" listesine elle eklenir.
   Programdaki en yeni tarifenin yururlugunden bir yil gectiyse yenisi cikmis olabilir: hatirlatma
   metnini aaut_hatirlatma.md'ye yazar ve 2 ile cikar (is akisi acik hatirlatma yoksa GitHub'da
   "issue" acar, GitHub da depo sahibine e-posta atar). Gerek yoksa 0.
   BUGUN=YYYY-AA-GG ile tarih denenebilir; DENEME=1 hatirlatma yolunu sinamak icin her zaman 2 verir.
   Calistir: node aaut_kontrol.js */
"use strict";
var fs = require("fs"), path = require("path");
var O = require("./oranlar.js");
var bugun = process.env.BUGUN || new Date().toISOString().slice(0, 10);
var liste = O.vekaletTarifeleri(O.GOMULU), son = liste[liste.length - 1];
var esik = (+son.yururluk.slice(0, 4) + 1) + son.yururluk.slice(4);
var deneme = !!process.env.DENEME;
if (!deneme && bugun < esik) {
  console.log("AAÜT güncel görünüyor: en yenisi " + son.ad + " (yürürlük " + son.yururluk + "); hatırlatma " + esik + " tarihinde.");
  process.exit(0);
}
function tr(t) { var p = t.split("-"); return p[2] + "." + p[1] + "." + p[0]; }
var metin = [
  "# " + (deneme ? "Deneme: " : "") + "Avukatlık ücret tarifesi güncellenmeli",
  "",
  "Programdaki en yeni avukatlık asgari ücret tarifesi **" + son.ad + "** (yürürlük " + tr(son.yururluk) + ").",
  "Üzerinden bir yıl geçti; yeni tarife Resmî Gazete'de yayımlanmış olabilir (her yıl Kasım başında).",
  "",
  "**Yapılacak:** Claude'a \"icra dosya hesabına yeni AAÜT'yi ekle\" de. Resmî metinden okunup",
  "`veri/oranlar.json` içindeki `vekalet` listesine yeni satır eklenecek. Eski takipler kendi",
  "tarifeleriyle hesaplanmaya devam eder.",
  "",
  "Eklenene kadar program " + tr(esik) + " ve sonrasındaki takiplerde vekâlet ücretinin altına",
  "\"daha yeni bir tarife yürürlükte olabilir\" uyarısı yazıyor; hesap durmuyor.",
  "",
  "_Bu kayıt robot tarafından açıldı (aaut_kontrol.js). Yeni tarife eklenince kapatılabilir._"
].join("\n") + "\n";
fs.writeFileSync(path.join(__dirname, "aaut_hatirlatma.md"), metin);
console.log((deneme ? "DENEME: " : "") + "AAÜT hatırlatması gerekli (en yenisi " + son.ad + ", eşik " + esik + ").");
process.exit(2);
