/* Motor testleri. Beklenen degerler ELLE hesaplandi (formul ve gun sayisi yanlarinda) ya da
   GERCEK bir UYAP dosya hesabindan alindi; motordan kopyalanmadi. Calistir: node test_hesap.js */
"use strict";
var H = require("./hesap.js"), O = require("./oranlar.js");
var gecen = 0, kalan = 0;
function esit(ad, bulunan, beklenen) {
  var ok = typeof beklenen === "number" ? Math.abs(bulunan - beklenen) < 0.001 : JSON.stringify(bulunan) === JSON.stringify(beklenen);
  if (ok) gecen++; else { kalan++; console.log("HATA  " + ad + "\n  bulunan:  " + JSON.stringify(bulunan) + "\n  beklenen: " + JSON.stringify(beklenen)); }
}
function var_mi(ad, uyarilar, parca) { esit(ad, uyarilar.some(function (u) { return u.indexOf(parca) >= 0; }), true); }
function tutarli(ad, r) {     // kalanlarin toplami = bakiye, ic tutarsizlik uyarisi yok
  var k = r.ozet.kalan;
  esit(ad + " tutarlilik", Math.round((k.masraf + k.feri + k.sonra + k.asil + k.harc) * 100) / 100, r.ozet.bakiye);
  esit(ad + " ic uyari yok", r.uyarilar.some(function (u) { return u.indexOf("TUTARSIZLIK") >= 0; }), false);
}
var oranlar = { yasal: O.YASAL, ticari: O.ticariDonemler(2015, 2026) };
function g(ek) {
  var x = { gunYil: 365, kalemler: [], masraflar: [], tahsilatlar: [], vekalet: { mod: "yok" },
            harcOrani: 4.55, vergiler: {}, oranlar: oranlar };
  Object.keys(ek).forEach(function (k) { x[k] = ek[k]; });
  return x;
}
function kopya(x) { return JSON.parse(JSON.stringify(x)); }

/* 0) UYAP "Dosya Hesabi" duzeni - UYDURMA ornek (sayfadaki "Ornek dosya" ile ayni). Kurallar
   gercek bir UYAP hesabindan cozuldu (test_gercek.js, yalniz yerelde): TKM x harc orani, faiz
   yalniz asila ve 365 gunle, vekalet TKM uzerinden, ara odeme once masraf ve faize.
   Elle: 01.07->26.10.2026 = 31+31+30+25 = 117 gun; faiz 250000 x ,48 x 117/365 = 38.465,75
         TKM 250000+30000+4000+1700+150 = 285.850; harc x %9,1 = 26.012,35; vekalet %16 = 45.736
         yekun 285850 + 26012,35 + 38465,75 + 45736 + 4000 = 400.064,10 */
var ornek = { takipTarihi: "2026-07-01", hesapTarihi: "2026-10-26", harcOrani: 9.10,
  kalemler: [{ ad: "Asıl alacak", tutar: 250000, tur: "asil", faizTur: "diger", faizOran: 48 },
             { ad: "Akdi faiz", tutar: 30000, tur: "feri" }, { ad: "İşlemiş faiz", tutar: 4000, tur: "feri" },
             { ad: "BSMV", tutar: 1700, tur: "feri" }, { ad: "İhtarname", tutar: 150, tur: "feri" }],
  masraflar: [{ tarih: "2026-07-01", tutar: 4000, aciklama: "Masraf" }],
  vekalet: { mod: "otomatik", suresinde: false } };
var r = H.hesapla(g(ornek)), z = r.ozet;
esit("ornek tkm", z.tkm, 285850);
esit("ornek gun", r.gun, 117);
esit("ornek faiz", z.faiz, 38465.75);
esit("ornek harc", z.harc, 26012.35);
esit("ornek vekalet", z.vekalet, 45736);
esit("ornek vekalet nispi", r.vekalet.maktu, false);
esit("ornek yekun", z.yekun, 400064.10);
esit("ornek bakiye", z.bakiye, 400064.10);
esit("ornek uyari yok", r.uyarilar, []);
tutarli("ornek", r);
var ters = kopya(ornek); ters.kalemler.reverse();
esit("ornek sira", H.hesapla(g(ters)).ozet.yekun, 400064.10);

/* 0b) 15.09.2026'da 50.000 ara odeme: masraf 45.736 + 4.000 = 49.736 -> kalan 264 feri kaleme.
   Asil dokunulmadi -> faiz yine 38.465,75; bakiye 400.064,10 - 50.000 = 350.064,10 */
var ara = kopya(ornek); ara.tahsilatlar = [{ tarih: "2026-09-15", tutar: 50000 }];
r = H.hesapla(g(ara)); z = r.ozet;
esit("ara masrafa", r.tahsilatlar[0].masraf, 49736);
esit("ara feriye", r.tahsilatlar[0].feri, 264);
esit("ara asila", r.tahsilatlar[0].asil, 0);
esit("ara faiz degismedi", z.faiz, 38465.75);
esit("ara bakiye", z.bakiye, 350064.10);
tutarli("ara", r);

/* 0c) Hesap gunu yekunun tamami: masraf 49.736 + feri 35.850 + faiz 38.465,75 + asil 250.000 =
   374.051,75; artan 26.012,35 = harcin tamami -> bakiye 0, iade 0. 100 fazlasi -> iade 100 */
var tam = kopya(ornek); tam.tahsilatlar = [{ tarih: "2026-10-26", tutar: 400064.10 }];
r = H.hesapla(g(tam)); z = r.ozet;
esit("tam bakiye", z.bakiye, 0);
esit("tam harca", r.tahsilatlar[0].harc, 26012.35);
esit("tam iade", z.iade, 0);
tutarli("tam", r);
tam.tahsilatlar[0].tutar = 400164.10;
r = H.hesapla(g(tam));
esit("fazla iade", r.ozet.iade, 100);
esit("fazla bakiye", r.ozet.bakiye, 0);
var_mi("fazla uyari", r.uyarilar, "borçluya iade");
tutarli("fazla", r);

/* 0d) Takip talebinde istenen BSMV %5: 38.465,75 x %5 = 1.923,29 -> yekun 401.987,39 */
var bs = kopya(ornek); bs.vergiler = { bsmv: 5 };
r = H.hesapla(g(bs));
esit("bsmv satiri", r.ozet.vergi.bsmv, 1923.29);
esit("bsmv yekun", r.ozet.yekun, 401987.39);

/* 1) Ticari faiz donemleri - 3095/2 kurali TCMB tablosuna elle uygulandi:
   2017 9,75 | 2018/2 19,50 | 2020 13,75 (30.06'da 10: fark 3,75 <5) | 2021 16,75 | 2022 15,75
   2023 10,75, 2023/2 16,75 (fark 6) | 2024 44,25, 2024/2 51,75 (7,5) | 2025 49,25,
   2025/2 44,25 (fark TAM 5 -> "bes puan veya daha cok" -> degisir) | 2026 39,75 */
esit("ticari donemler", O.ticariDonemler(2017, 2026), [
  { bas: "2017-01-01", oran: 9.75 }, { bas: "2018-07-01", oran: 19.5 }, { bas: "2020-01-01", oran: 13.75 },
  { bas: "2021-01-01", oran: 16.75 }, { bas: "2022-01-01", oran: 15.75 }, { bas: "2023-01-01", oran: 10.75 },
  { bas: "2023-07-01", oran: 16.75 }, { bas: "2024-01-01", oran: 44.25 }, { bas: "2024-07-01", oran: 51.75 },
  { bas: "2025-01-01", oran: 49.25 }, { bas: "2025-07-01", oran: 44.25 }, { bas: "2026-01-01", oran: 39.75 }]);

/* 2) Takip oncesi faizi program hesaplasin. 100.000 asil, yasal, faiz 01.01.2026'dan,
   takip 02.03.2026, hesap 26.10.2026, basvurma 732, harc %4,55.
   islemis: 01.01->02.03 = 31+28+1 = 60 gun %24 -> 3.945,21 ; TKM 103.945,21
   sonra: 02.03->31.07 = 29+30+31+30+31 = 151 gun %24 ; 31.07->26.10 = 31+30+26 = 87 gun %31
          100000 x (36,24 + 26,97)/365 = 17.317,81
   vekalet %16 x 103.945,21 = 16.631,23 ; harc 103.945,21 x %4,55 = 4.729,51
   yekun = 103945,21 + 4729,51 + 732 + 17317,81 + 16631,23 = 143.355,76 */
var ana = { takipTarihi: "2026-03-02", hesapTarihi: "2026-10-26", basvurmaHarci: 732,
  kalemler: [{ ad: "Asıl alacak", tutar: 100000, tur: "asil", faizTur: "yasal",
               oncekiBas: "2026-01-01", oncekiTur: "yasal" }],
  vekalet: { mod: "otomatik" } };
r = H.hesapla(g(ana)); z = r.ozet;
esit("ana islemis", r.kalemler[0].islemis, 3945.21);
esit("ana tkm", z.tkm, 103945.21);
esit("ana faiz", z.faiz, 17317.81);
esit("ana sonra gun", r.kalemler[0].sonraGun, 238);
esit("ana vekalet", z.vekalet, 16631.23);
esit("ana harc", z.harc, 4729.51);
esit("ana yekun", z.yekun, 143355.76);
esit("ana uyari yok", r.uyarilar, []);

/* 3) + 01.05.2026'da 20.000. masraf (732 + 16.631,23 = 17.363,23) -> kalan 2.636,77 hesaplanan
   islemis faize. Asil dokunulmadi -> bakiye 143.355,76 - 20.000 = 123.355,76; kalan feri 1.308,44 */
var t1 = kopya(ana); t1.tahsilatlar = [{ tarih: "2026-05-01", tutar: 20000 }];
r = H.hesapla(g(t1)); z = r.ozet;
esit("t1 masrafa", r.tahsilatlar[0].masraf, 17363.23);
esit("t1 feriye", r.tahsilatlar[0].feri, 2636.77);
esit("t1 bakiye", z.bakiye, 123355.76);
esit("t1 kalan feri", z.kalan.feri, 1308.44);
tutarli("t1", r);

/* 4) Karisik harc orani: dosya %9,10, ilk odeme (20.000) %4,55 ile, ikincisi 01.08.2026'da 100.000.
   01.08'e kadar faiz: 151 gun %24 + 1 gun %31 = 100000 x 36,55/365 = 10.013,70
   ikinci odeme: feri 1.308,44 -> faiz 10.013,70 -> asil 88.677,86 ; kalan asil 11.322,14
   01.08->26.10 = 86 gun %31: 11322,14 x ,31 x 86/365 = 826,98 -> toplam faiz 10.840,68
   harc: 2.636,77 x %4,55 = 119,97 + 89.986,30 x %9,10 = 8.188,75 + kalan 11.322,14 x %9,10 = 1.030,31
         = 9.339,03
   yekun = 103945,21 + 9339,03 + 732 + 10840,68 + 16631,23 = 141.488,15 ; bakiye -120.000 = 21.488,15 */
var t2 = kopya(ana); t2.harcOrani = 9.10;
t2.tahsilatlar = [{ tarih: "2026-05-01", tutar: 20000, harcOrani: 4.55 }, { tarih: "2026-08-01", tutar: 100000 }];
r = H.hesapla(g(t2)); z = r.ozet;
esit("t2 sonraya", r.tahsilatlar[1].sonra, 10013.70);
esit("t2 asila", r.tahsilatlar[1].asil, 88677.86);
esit("t2 kalan asil", z.kalan.asil, 11322.14);
esit("t2 faiz", z.faiz, 10840.68);
esit("t2 tek oran degil", z.tekOran, false);
esit("t2 harc", z.harc, 9339.03);
esit("t2 yekun", z.yekun, 141488.15);
esit("t2 bakiye", z.bakiye, 21488.15);
esit("t2 kalem odenen", r.kalemler[0].odenen, 88677.86);
tutarli("t2", r);

/* 5) Feri kalem asildan SONRA yazilsa da odeme once ona sayilir.
   asil 10.000 Diger %36,5, cek tazminati 1.000 (feri). 10 gun sonra 1.500, harc %0.
   1.000 tazminata -> faiz 10000 x ,365 x 10/365 = 100 -> 400 asila; kalan asil 9.600 */
r = H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-01-11", harcOrani: 0,
  kalemler: [{ ad: "Çek bedeli", tutar: 10000, tur: "asil", faizTur: "diger", faizOran: 36.5 },
             { ad: "Çek tazminatı", tutar: 1000, tur: "feri" }],
  tahsilatlar: [{ tarih: "2026-01-11", tutar: 1500 }] }));
esit("feri once", r.tahsilatlar[0].feri, 1000);
esit("feri sonra faiz", r.tahsilatlar[0].sonra, 100);
esit("feri sonra asil", r.tahsilatlar[0].asil, 400);
esit("feri bakiye", r.ozet.bakiye, 9600);
tutarli("feri", r);

/* 6) Vergiler: 10.000 Diger %36, 01.01->11.04.2026 = 31+28+31+10 = 100 gun
   faiz 10000 x ,36 x 100/365 = 986,30 ; BSMV %5 = 49,32 ; KKDF %15 = 147,95 ; 360 gunle faiz 1.000,00 */
var vg = { takipTarihi: "2026-01-01", hesapTarihi: "2026-04-11", harcOrani: 0, vergiler: { bsmv: 5, kkdf: 15 },
  kalemler: [{ tutar: 10000, tur: "asil", faizTur: "diger", faizOran: 36 }] };
r = H.hesapla(g(vg));
esit("vergi faiz", r.ozet.faiz, 986.30);
esit("vergi bsmv", r.ozet.vergi.bsmv, 49.32);
esit("vergi kkdf", r.ozet.vergi.kkdf, 147.95);
esit("vergi yekun", r.ozet.yekun, 11183.57);
vg.gunYil = 360;
r = H.hesapla(g(vg));
esit("360 faiz", r.ozet.faiz, 1000);
esit("360 bsmv", r.ozet.vergi.bsmv, 50);

/* 7) Vekalet ucreti (AAUT md. 11) */
esit("vek maktu", H.vekaletUcreti(30000, 30000, false, "2026-01-01").ucret, 9000);
esit("vek asil siniri", H.vekaletUcreti(5000, 5000, false, "2026-01-01").ucret, 5000);
esit("vek 3/4", H.vekaletUcreti(30000, 30000, true, "2026-01-01").ucret, 6750);
// 1.000.000: 600.000 x %16 = 96.000 + 400.000 x %15 = 60.000 -> 156.000
esit("vek dilim", H.vekaletUcreti(1000000, 1000000, false, "2026-01-01").ucret, 156000);
esit("vek esik", H.vekaletUcreti(56250, 56250, false, "2026-01-01").ucret, 9000);
esit("vek eski tarife", H.vekaletUcreti(100000, 100000, false, "2025-06-01").ucret, null);
r = H.hesapla(g({ takipTarihi: "2025-06-01", hesapTarihi: "2025-07-01", vekalet: { mod: "otomatik" },
  kalemler: [{ tutar: 1000, tur: "asil", faizTur: "yok" }] }));
var_mi("vek eski tarife uyarisi", r.uyarilar, "elle girin");
esit("vek eski tarife yekuna girmedi", r.ozet.vekalet, 0);
// maktu sinir asil alacaga gore: asil 3.000 + feri 2.000 -> TKM 5.000 <= 56.250, ucret asil 3.000'i gecemez
r = H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-01-01", vekalet: { mod: "otomatik" },
  kalemler: [{ tutar: 3000, tur: "asil", faizTur: "yok" }, { tutar: 2000, tur: "feri" }] }));
esit("vek maktu asil siniri", r.ozet.vekalet, 3000);

/* 8) Takip oncesi ticari faiz 01.07.2025 bolunmesi: 10.000, 01.06.2025'ten, takip 01.08.2025
   01.06->01.07 = 30 gun %49,25 ; 01.07->01.08 = 31 gun %44,25 -> 10000 x 28,4925/365 = 780,62 */
r = H.hesapla(g({ takipTarihi: "2025-08-01", hesapTarihi: "2025-08-01",
  kalemler: [{ tutar: 10000, tur: "asil", faizTur: "ticari", oncekiBas: "2025-06-01", oncekiTur: "ticari" }] }));
esit("ticari bolunme", r.kalemler[0].islemis, 780.62);
esit("ticari bolunme tkm", r.ozet.tkm, 10780.62);

/* 9) Uyarilar */
r = H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-02-01",
  kalemler: [{ tutar: 1000, tur: "asil", faizTur: "yasal", oncekiBas: "2005-01-01", oncekiTur: "yasal" }],
  tahsilatlar: [{ tarih: "2025-12-01", tutar: 10 }, { tarih: "2026-03-01", tutar: 10 }] }));
var_mi("uyari once", r.uyarilar, "takip tarihinden önce");
var_mi("uyari sonra", r.uyarilar, "hesap tarihinden sonra");
var_mi("uyari erken oran", r.uyarilar, "ilk oran uygulandı");
r = H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-02-01", harcOrani: "",
  kalemler: [{ tutar: 1000, tur: "feri" }, { ad: "Boş", tutar: "" }] }));
var_mi("uyari asil yok", r.uyarilar, "Asıl alacak türünde kalem yok");
var_mi("uyari harc yok", r.uyarilar, "harcı oranı seçilmedi");
var_mi("uyari tutarsiz kalem", r.uyarilar, "Boş: tutarı girilmediği");
r = H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-02-01",
  kalemler: [{ tutar: 1000, tur: "asil", faizTur: "diger", faizOran: "" }] }));
var_mi("uyari oran yok", r.uyarilar, "faiz oranı yazılmadı");

/* 10) Teblig oncesi odeme (%0) dosya oranindan ayri: 1.000'in tamami teblig oncesi -> harc 0 */
r = H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-01-01", harcOrani: 4.55,
  kalemler: [{ tutar: 1000, tur: "asil", faizTur: "yok" }], tahsilatlar: [{ tarih: "2026-01-01", tutar: 1000, harcOrani: 0 }] }));
esit("teblig oncesi harc", r.ozet.harc, 0);
esit("teblig oncesi bakiye", r.ozet.bakiye, 0);
tutarli("teblig", r);

/* 11) Hatalar */
esit("hata tarih", !!H.hesapla(g({ takipTarihi: "", hesapTarihi: "2026-01-01" })).hata, true);
esit("hata kalem", !!H.hesapla(g({ takipTarihi: "2026-01-01", hesapTarihi: "2026-01-02" })).hata, true);
esit("hata ters", !!H.hesapla(g({ takipTarihi: "2026-02-01", hesapTarihi: "2026-01-02", kalemler: [{ tutar: 1 }] })).hata, true);

console.log(gecen + " geçti, " + kalan + " kaldı");
process.exit(kalan ? 1 : 0);
