/* Oranlar ve kurallar. VERI (TCMB oran tablosu, maktu harclar, avukatlik ucret tarifesi)
   veri/oranlar.json'da durur; robot (veri_cek.py) her gun resmi kaynaktan tazeler. Bu dosya:
     - o veriden yasal ve ticari faiz tablolarini kanundaki kurala gore TURETIR,
     - internetten gelen veriyi kabul etmeden once DENETLER (veriDenetle),
     - degismeyen kurallari (tahsil harci oranlari, cezaevi harci) tutar.
   Tarayicida veri `window.ICRA_GOMULU`dan (site_yap.js sayfaya gomer), node'da dosyadan okunur. */
(function (kok) {
  "use strict";
  var dugum = typeof module !== "undefined" && module.exports;
  var GOMULU = dugum
    ? JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "veri", "oranlar.json"), "utf8"))
    : kok.ICRA_GOMULU;

  /* Tahsil harci oranlari - 492 s. Harclar K. (1) sayili tarife B/I-3 ("uygulanan miktar").
     Robot her gun a-e bentlerini metinden okuyup bu degerlerle kiyaslar; degisirse DURUR.
     Liste Ertugrul'un getirdigi elle yazilmis oran listesiyle (26.10.2026) birebir ayni dokuz
     oran + %2,27 + %0. 2,84 ve 0,56'nin dayanagi DOGRULANMADI, ekranda da oyle yaziyor. */
  var TAHSIL_HARCI_LISTESI = [
    { oran: 4.55,   kisa: "%4,55 — hacizden önce · maaş haczi",
      aciklama: "Ödeme emri tebliğinden sonra, hacizden önce ödenen para; maaş haczi; icra eliyle tahliye ve teslim (tarife B-I-3 a, d, f-bb, g-bb)." },
    { oran: 9.10,   kisa: "%9,10 — hacizden sonra, satıştan önce",
      aciklama: "Hacizden sonra ve satıştan önce ödenen para (tarife B-I-3 b)." },
    { oran: 11.38,  kisa: "%11,38 — satış yoluyla",
      aciklama: "Haczedilen ya da rehinli malın satışıyla tahsil edilen para (tarife B-I-3 c)." },
    { oran: 2.27,   kisa: "%2,27 — icra emri üzerine tahliye / teslim",
      aciklama: "İcra emri tebliği üzerine tahliye ya da menkul teslimi; İİK 125/3 gereği ödeme (tarife B-I-3 e, f-aa, g-aa)." },
    { oran: 2.275,  kisa: "%2,275 — 4,55'in yarısı · 9,10'un dörtte biri",
      aciklama: "4,55'in yarısı: hacizden önce takipten vazgeçme (Harçlar K. md. 23), icra eliyle taşınmaz tahliyesi (md. 24). 9,10'un dörtte biri: konut finansmanı / TOKİ alacağında hacizden sonra (tarife h)." },
    { oran: 1.135,  kisa: "%1,135 — 2,27'nin yarısı",
      aciklama: "İcra emri üzerine taşınmaz tahliyesi: tarifedeki oranın yarısı (Harçlar K. md. 24)." },
    { oran: 1.1375, kisa: "%1,1375 — 4,55'in dörtte biri",
      aciklama: "Konut finansmanı ve TOKİ rehinli alacaklarında hacizden önce / maaş haczi (tarife h: dörtte biri)." },
    { oran: 2.845,  kisa: "%2,845 — 11,38'in dörtte biri",
      aciklama: "Konut finansmanı ve TOKİ rehinli alacaklarında satış yoluyla (tarife h)." },
    { oran: 2.84,   kisa: "%2,84",
      aciklama: "Elle yazılmış oran listesinde var; dayanağı doğrulanmadı (11,38'in dörtte biri 2,845'tir)." },
    { oran: 0.56,   kisa: "%0,56",
      aciklama: "Elle yazılmış oran listesinde var; dayanağı doğrulanmadı (2,27'nin dörtte biri 0,5675'tir)." },
    { oran: 0,      kisa: "%0 — ödeme emri tebliğinden önce",
      aciklama: "Ödeme emri tebliğinden önce ödenen paradan tahsil harcı alınmaz." }
  ];
  var CEZAEVI_YUZDE = 2;                 // 2548 s.K. md. 1: borcluya YUKLETILEMEZ

  function oranAt(satirlar, t, sutun) {  // t gunu yururlukteki oran; sutun 1 reeskont, 2 avans
    var o = null;
    for (var i = 0; i < satirlar.length; i++) if (satirlar[i][0] <= t) o = satirlar[i][sutun];
    return o;
  }
  function yuvarla4(x) { return Math.round(x * 10000) / 10000; }
  function ekleyici(liste) {
    return function (bas, oran) {
      if (oran === null || oran === undefined) return;
      if (liste.length && liste[liste.length - 1].oran === oran) return;   // ayni oran: donem uzar
      liste.push({ bas: bas, oran: oran });
    };
  }
  function besPuan(a, b) { return Math.abs(a - b) >= 5 - 1e-9; }      // "bes puan veya daha cok"

  /* Ticari temerrut faizi - 3095 md. 2/2 (4489 s.K. ile 1.1.2000'den beri ayni metin): yil boyu
     onceki yilin 31 Aralik AVANS orani; 30 Haziran'daki avans orani ondan bes puan veya daha cok
     farkliysa yilin ikinci yarisinda (1 Temmuz'dan) o oran. Merkez Bankasi'nin her oran
     degisikligi ticari faizi DEGISTIRMEZ. */
  function ticariDonemler(ilkYil, sonYil, satirlar) {
    var liste = [], ekle = ekleyici(liste);
    for (var y = ilkYil; y <= sonYil; y++) {
      var aralik = oranAt(satirlar, (y - 1) + "-12-31", 2), haziran = oranAt(satirlar, y + "-06-30", 2);
      ekle(y + "-01-01", aralik);
      if (aralik !== null && haziran !== null && besPuan(haziran, aralik)) ekle(y + "-07-01", haziran);
    }
    return liste;
  }

  /* Yasal faiz - 3095 md. 1. Gecmis sabit: 01.01.2006 %9, 01.06.2024 %24.
     31.07.2026'dan beri (7589 s.K. md. 10): onceki yilin 31 Aralik REESKONT oraninin %80'i;
     30 Haziran'daki reeskont ondan bes puan veya daha cok farkliysa yilin ikinci yarisinda
     30 Haziran oraninin %80'i. Kural 2026'nin ikinci yarisinda yururluge girdigi icin o gun
     ikinci yari kurali gecerli. */
  var YASAL_GECMIS = [{ bas: "2006-01-01", oran: 9 }, { bas: "2024-06-01", oran: 24 }];
  var YASAL_KURAL = "2026-07-31";
  function yasalDonemler(sonYil, satirlar) {
    var liste = YASAL_GECMIS.map(function (d) { return { bas: d.bas, oran: d.oran }; }), ekle = ekleyici(liste);
    function yil(y) {
      var aralik = oranAt(satirlar, (y - 1) + "-12-31", 1), haziran = oranAt(satirlar, y + "-06-30", 1);
      return { ilk: aralik === null ? null : yuvarla4(aralik * 0.8),
               ikinci: aralik !== null && haziran !== null && besPuan(haziran, aralik) ? yuvarla4(haziran * 0.8) : null };
    }
    var k = yil(2026);
    ekle(YASAL_KURAL, k.ikinci !== null ? k.ikinci : k.ilk);
    for (var y = 2027; y <= sonYil; y++) {
      k = yil(y);
      ekle(y + "-01-01", k.ilk);
      if (k.ikinci !== null) ekle(y + "-07-01", k.ikinci);
    }
    return liste;
  }

  /* Veri hangi gune kadar KESIN? Bir yilin ilk yarisinin orani onceki 31 Aralik'ta, ikinci
     yarisininki 30 Haziran'da belli olur. Veri o gun ya da sonra alinmissa o yarim yil kesin. */
  function kesinSon(kontrol) {
    var y = +kontrol.slice(0, 4);
    if (kontrol >= y + "-12-31") return (y + 1) + "-06-30";
    if (kontrol >= y + "-06-30") return y + "-12-31";
    return y + "-06-30";
  }
  function faizTablolari(veri) {
    var son = +kesinSon(veri.kontrol).slice(0, 4), s = veri.tcmb.satirlar;
    return { yasal: yasalDonemler(son, s), ticari: ticariDonemler(2000, son, s), kesinSon: kesinSon(veri.kontrol) };
  }

  function vekaletTarifeleri(veri) {
    return (veri.vekalet || []).map(function (t) {
      return { ad: t.ad, yururluk: t.yururluk, kaynak: t.kaynak, maktu: t.maktu, esik: t.esik,
               dilimler: t.dilimler.map(function (d) { return [d[0] === null ? Infinity : d[0], d[1]]; }) };
    }).sort(function (a, b) { return a.yururluk < b.yururluk ? -1 : 1; });
  }
  function maktuHarc(veri, yil) { return (veri.harc && veri.harc.yillar && veri.harc.yillar[String(yil)]) || null; }

  /* Internetten gelen veri bununla kabul ya da ret edilir. Bos liste = temiz. `taban` (gomulu
     veri) verilirse onun her TCMB satiri gelende de olmali: kirpilmis sayfa ya da eski kopya
     sessizce kabul edilmesin. Ayni kurallarin Python'u veri_cek.py denetle()'de. */
  var CAPALAR = [["1990-01-01", 40, 45], ["2016-12-31", 8.75, 9.75], ["2024-04-01", 50.75, 51.75],
                 ["2025-12-20", 38.75, 39.75]];
  function tarihMi(t) { return typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t); }
  function veriDenetle(veri, taban) {
    var s = [];
    if (!veri || typeof veri !== "object") return ["veri bir nesne değil"];
    if (veri.surum !== 1) s.push("sürüm " + veri.surum + " (beklenen 1)");
    if (!tarihMi(veri.kontrol)) s.push("kontrol tarihi bozuk");
    var r = veri.tcmb && veri.tcmb.satirlar;
    if (!Array.isArray(r) || r.length < 40) s.push("Merkez Bankası tablosu eksik");
    else {
      for (var i = 0; i < r.length; i++) {
        var x = r[i];
        if (!Array.isArray(x) || !tarihMi(x[0]) || !(x[1] > 0 && x[1] < 200) || !(x[2] > 0 && x[2] < 200)) { s.push("bozuk satır: " + JSON.stringify(x)); break; }
        if (i && r[i - 1][0] >= x[0]) { s.push("tarihler sıralı değil: " + x[0]); break; }
      }
      CAPALAR.forEach(function (c) {
        if (!r.some(function (x) { return x && x[0] === c[0] && x[1] === c[1] && x[2] === c[2]; })) s.push("tarihsel satır eksik: " + c[0]);
      });
      if (taban && taban.tcmb) {
        var kayip = taban.tcmb.satirlar.filter(function (t) {
          return !r.some(function (x) { return x && x[0] === t[0] && x[1] === t[1] && x[2] === t[2]; });
        });
        if (kayip.length) s.push("dosyadaki " + kayip.length + " satır gelen veride yok (ilk: " + kayip[0][0] + ")");
      }
    }
    var h = veri.harc && veri.harc.yillar;
    if (!h || typeof h !== "object" || !Object.keys(h).length) s.push("harç tutarları yok");
    else Object.keys(h).forEach(function (y) {
      if (!/^\d{4}$/.test(y) || !h[y]) { s.push("harç yılı bozuk: " + y); return; }
      ["basvurma", "vekaletSuret", "hacizDisari"].forEach(function (k) {
        if (!(h[y][k] > 0 && h[y][k] < 100000)) s.push("harç " + y + " " + k + " bozuk");
      });
    });
    var v = veri.vekalet;
    if (!Array.isArray(v) || !v.length) s.push("vekâlet tarifesi yok");
    else v.forEach(function (t) {
      var ok = t && typeof t.ad === "string" && tarihMi(t.yururluk) && t.maktu > 0 && t.esik > 0 &&
               Array.isArray(t.dilimler) && t.dilimler.length > 0 &&
               t.dilimler.every(function (d, i) {
                 return Array.isArray(d) && d[1] > 0 && d[1] < 100 && (i < t.dilimler.length - 1 ? d[0] > 0 : d[0] === null);
               });
      if (!ok) s.push("vekâlet tarifesi bozuk: " + (t && t.ad));
    });
    return s;
  }
  /* a, b'den yeni mi: once kontrol tarihi, sonra TCMB satir sayisi, sonra harc yili sayisi. */
  function yeniMi(a, b) {
    var ka = [a.kontrol, a.tcmb.satirlar.length, Object.keys(a.harc.yillar).length, a.vekalet.length];
    var kb = [b.kontrol, b.tcmb.satirlar.length, Object.keys(b.harc.yillar).length, b.vekalet.length];
    for (var i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] > kb[i] ? 1 : -1;
    return 0;
  }

  var api = { GOMULU: GOMULU, TAHSIL_HARCI_LISTESI: TAHSIL_HARCI_LISTESI, CEZAEVI_YUZDE: CEZAEVI_YUZDE,
              CAPALAR: CAPALAR, kesinSon: kesinSon, faizTablolari: faizTablolari,
              vekaletTarifeleri: vekaletTarifeleri, maktuHarc: maktuHarc, veriDenetle: veriDenetle, yeniMi: yeniMi,
              ticariDonemler: function (ilk, son, satirlar) { return ticariDonemler(ilk, son, satirlar || GOMULU.tcmb.satirlar); },
              yasalDonemler: function (son, satirlar) { return yasalDonemler(son, satirlar || GOMULU.tcmb.satirlar); } };
  if (GOMULU) {
    // Testler 2026'ya sabit: gelecekte veri eklense de bu tablolar degismez (nafaka tuzak 9).
    api.YASAL = yasalDonemler(2026, GOMULU.tcmb.satirlar);
    api.VEKALET_TARIFELERI = vekaletTarifeleri(GOMULU);
  }
  if (dugum) module.exports = api;
  else kok.IcraOranlar = api;
})(this);
