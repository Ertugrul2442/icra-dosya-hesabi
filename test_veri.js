/* Veri ve kural testleri: veri/oranlar.json denetimden geciyor mu, faiz tablolari kanundaki kurala
   gore turetiliyor mu, gelecekte gelecek veriye (yeni TCMB orani, yeni AAUT) dogru davraniyor mu.
   GELECEK VERI UYDURMA: testler gercek verinin bir gun degisecek "son" satirina BAGLANMAZ
   (nafaka tuzak 9). Calistir: node test_veri.js */
"use strict";
var O = require("./oranlar.js"), H = require("./hesap.js");
var gecen = 0, kalan = 0;
function esit(ad, bulunan, beklenen) {
  var ok = JSON.stringify(bulunan) === JSON.stringify(beklenen);
  if (ok) gecen++; else { kalan++; console.log("HATA  " + ad + "\n  bulunan:  " + JSON.stringify(bulunan) + "\n  beklenen: " + JSON.stringify(beklenen)); }
}
function kopya(x) { return JSON.parse(JSON.stringify(x)); }
function sorunVar(ad, veri, parca, taban) {
  var s = O.veriDenetle(veri, taban);
  esit(ad, s.some(function (x) { return x.indexOf(parca) >= 0; }), true);
}
var G = O.GOMULU;

/* 1) Depodaki veri temiz ve tarihsel gerceklerle tutarli */
esit("gomulu veri denetimden gecer", O.veriDenetle(G, G), []);
esit("yasal gecmis (2026'ya kadar)", O.yasalDonemler(2026),
     [{ bas: "2006-01-01", oran: 9 }, { bas: "2024-06-01", oran: 24 }, { bas: "2026-07-31", oran: 31 }]);
esit("ticari 2017-2026 (3095/2)", O.ticariDonemler(2017, 2026).map(function (d) { return d.bas + " " + d.oran; }),
     ["2017-01-01 9.75", "2018-07-01 19.5", "2020-01-01 13.75", "2021-01-01 16.75", "2022-01-01 15.75", "2023-01-01 10.75",
      "2023-07-01 16.75", "2024-01-01 44.25", "2024-07-01 51.75", "2025-01-01 49.25", "2025-07-01 44.25", "2026-01-01 39.75"]);
// 2000'den beri: 31.12.1999 avans orani tablodan (1999'da yururlukteki satir)
esit("ticari 2000 basliyor", O.ticariDonemler(2000, 2000)[0].bas, "2000-01-01");
esit("2026 harc", O.maktuHarc(G, 2026), { basvurma: 732, vekaletSuret: 104, hacizDisari: 1718.8 });
esit("olmayan yilin harci", O.maktuHarc(G, 1999), null);
esit("vekalet son dilim sonsuz", O.vekaletTarifeleri(G)[0].dilimler.slice(-1)[0], [Infinity, 1]);

/* 2) Gelecek veri (uydurma): 27.12.2026'da reeskont %35 / avans %36 olsun */
var s1 = G.tcmb.satirlar.concat([["2026-12-27", 35, 36]]);
esit("2027 yasal = 35 x %80 = 28", O.yasalDonemler(2027, s1).slice(-1)[0], { bas: "2027-01-01", oran: 28 });
esit("2027 ticari = 36", O.ticariDonemler(2027, 2027, s1), [{ bas: "2027-01-01", oran: 36 }]);
// 30 Haziran kurali: fark 6 -> ikinci yari degisir; tam 5 -> degisir; 4,99 -> degismez
var s6 = s1.concat([["2027-05-01", 29, 30]]);
esit("haziran farki 6: yasal 2027/2 = 23,2", O.yasalDonemler(2027, s6).slice(-1)[0], { bas: "2027-07-01", oran: 23.2 });
esit("haziran farki 6: ticari 2027/2 = 30", O.ticariDonemler(2027, 2027, s6).slice(-1)[0], { bas: "2027-07-01", oran: 30 });
var s5 = s1.concat([["2027-05-01", 30, 31]]);
esit("haziran farki tam 5: yasal degisir (24)", O.yasalDonemler(2027, s5).slice(-1)[0], { bas: "2027-07-01", oran: 24 });
esit("haziran farki tam 5: ticari degisir (31)", O.ticariDonemler(2027, 2027, s5).slice(-1)[0], { bas: "2027-07-01", oran: 31 });
var s4 = s1.concat([["2027-05-01", 30.01, 31.01]]);
esit("haziran farki 4,99: yasal degismez", O.yasalDonemler(2027, s4).slice(-1)[0], { bas: "2027-01-01", oran: 28 });
esit("haziran farki 4,99: ticari degismez", O.ticariDonemler(2027, 2027, s4).length, 1);
// 2026'nin ikinci yarisi: 30.06.2026 reeskontu 31.12.2025'ten 5+ farkli olsaydi 31.07.2026'dan o gecerdi
var s26 = G.tcmb.satirlar.filter(function (x) { return x[0] < "2026-01-01"; }).concat([["2026-05-01", 33, 34]]);
esit("2026/2 kurali: 33 x %80 = 26,4", O.yasalDonemler(2026, s26).slice(-1)[0], { bas: "2026-07-31", oran: 26.4 });
// Ayni oran: donem uzar, yeni satir acilmaz (2027'de de 38,75 -> yine %31)
esit("oran degismezse satir eklenmez", O.yasalDonemler(2027).length, 3);

/* 3) Kesinlik: yarim yilin orani 31.12 / 30.06'dan sonra kesin */
esit("kesin 29.06", O.kesinSon("2026-06-29"), "2026-06-30");
esit("kesin 30.06", O.kesinSon("2026-06-30"), "2026-12-31");
esit("kesin 27.10", O.kesinSon("2026-10-27"), "2026-12-31");
esit("kesin 31.12", O.kesinSon("2026-12-31"), "2027-06-30");
esit("kesin 02.01", O.kesinSon("2027-01-02"), "2027-06-30");
var ileri = kopya(G); ileri.kontrol = "2027-01-02"; ileri.tcmb.satirlar = s1;
var ft = O.faizTablolari(ileri);
esit("faizTablolari 2027'yi kapsar", [ft.yasal.slice(-1)[0], ft.ticari.slice(-1)[0], ft.kesinSon],
     [{ bas: "2027-01-01", oran: 28 }, { bas: "2027-01-01", oran: 36 }, "2027-06-30"]);
var ft0 = O.faizTablolari(kopya(G));
esit("faizTablolari yasal = kural", ft0.yasal.slice(0, 3), O.YASAL);

/* 4) Disaridan gelen bozuk veri reddedilir */
sorunVar("nesne degil", "<html>engellendi</html>", "nesne değil");
var b = kopya(G); b.surum = 2; sorunVar("surum", b, "sürüm 2");
b = kopya(G); b.tcmb.satirlar = b.tcmb.satirlar.filter(function (x) { return x[0] !== "2024-04-01"; });
sorunVar("capa eksik", b, "tarihsel satır eksik: 2024-04-01");
b = kopya(G); b.tcmb.satirlar.push(["2025-01-01", 40, 41]); sorunVar("sirasiz", b, "sıralı değil");
b = kopya(G); b.tcmb.satirlar = b.tcmb.satirlar.slice(0, 30); sorunVar("kirpik tablo", b, "tablosu eksik");
b = kopya(G); b.tcmb.satirlar[5] = [b.tcmb.satirlar[5][0], "on", 12]; sorunVar("bozuk satir", b, "bozuk satır");
b = kopya(G); b.harc.yillar = {}; sorunVar("harc yok", b, "harç tutarları yok");
b = kopya(G); b.harc.yillar["2026"].basvurma = -1; sorunVar("harc eksi", b, "harç 2026 basvurma");
b = kopya(G); b.vekalet[0].dilimler[9][0] = 5; sorunVar("vekalet son dilim", b, "vekâlet tarifesi bozuk");
b = kopya(G); b.kontrol = "dun"; sorunVar("kontrol bozuk", b, "kontrol tarihi");
var taban = kopya(G); taban.tcmb.satirlar = s1;      // dosyada olan satir gelende yoksa
sorunVar("gelende eksik satir", kopya(G), "gelen veride yok", taban);

/* 5) Hangisi yeni */
var y1 = kopya(G); y1.kontrol = "2099-01-01";
esit("yeni kontrol daha yeni", [O.yeniMi(y1, G), O.yeniMi(G, y1), O.yeniMi(G, kopya(G))], [1, -1, 0]);
var y2 = kopya(G); y2.tcmb.satirlar = s1;
esit("ayni gun, daha cok satir daha yeni", O.yeniMi(y2, G), 1);

/* 6) Iki tarife: takip tarihine gore secim + "yenisi cikmis olabilir" uyarisi
   T2 (uydurma) 05.11.2026'dan: maktu 10.000, esik 62.500, ilk dilim %16 */
var T1 = O.vekaletTarifeleri(G)[0];
var T2 = { ad: "2026-2027 AAÜT (uydurma)", yururluk: "2026-11-05", maktu: 10000, esik: 62500,
           dilimler: [[Infinity, 16]] };
var iki = [T1, T2];
esit("04.11.2026 takibi eski tarife, uyarisiz", [H.vekaletUcreti(60000, 60000, false, "2026-11-04", iki).ucret,
     H.vekaletUcreti(60000, 60000, false, "2026-11-04", iki).uyari], [9600, undefined]);
esit("10.11.2026 takibi yeni tarife (maktu 10.000)", H.vekaletUcreti(60000, 60000, false, "2026-11-10", iki).ucret, 10000);
esit("tek tarife + bir yil gecti -> uyari", !!H.vekaletUcreti(60000, 60000, false, "2026-11-04", [T1]).uyari, true);
esit("tek tarife + bir yil dolmadi -> uyari yok", H.vekaletUcreti(60000, 60000, false, "2026-11-03", [T1]).uyari, undefined);
esit("yeni tarife + bir yil sonra -> uyari", !!H.vekaletUcreti(60000, 60000, false, "2027-11-05", iki).uyari, true);
esit("tarife oncesi -> elle", H.vekaletUcreti(60000, 60000, false, "2025-11-03", iki).ucret, null);

/* 7) Motor: oranlar kesin degilse uyari, Diger oranda uyari yok */
function motor(tur, kesin) {
  return H.hesapla({ takipTarihi: "2026-01-01", hesapTarihi: "2026-10-26", harcOrani: 0, oranKesinSon: kesin,
    kalemler: [{ tutar: 1000, tur: "asil", faizTur: tur, faizOran: 20 }],
    oranlar: { yasal: O.YASAL, ticari: O.ticariDonemler(2015, 2026) } }).uyarilar;
}
esit("kesin degil + yasal -> uyari", motor("yasal", "2026-06-30").some(function (u) { return u.indexOf("kesin") >= 0; }), true);
esit("kesin + yasal -> uyari yok", motor("yasal", "2026-12-31"), []);
esit("kesin degil + Diger -> uyari yok", motor("diger", "2026-06-30"), []);

console.log(gecen + " geçti, " + kalan + " kaldı");
process.exit(kalan ? 1 : 0);
