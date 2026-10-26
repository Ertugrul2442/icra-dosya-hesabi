/* Icra dosya hesabi motoru - UYAP "Dosya Hesabi" cizelgesinin duzeninde. Saf fonksiyon,
   DOM'a dokunmaz. Tarihler "YYYY-AA-GG"; ic hesapta gun numarasi (UTC). Basit faiz,
   faize faiz yok (3095 s.K. md. 3).

   Cizelge (gercek bir UYAP dosya hesabiyla kurusu kurusuna tutturuldu, 26.10.2026):
       Takipte kesinlesen miktar (TKM) = takip talebindeki butun kalemler
     + Harc miktari    = TKM x secilen tahsil harci orani
     + Basvurma harci
     + Toplam faiz     = takipten sonra, yalniz ASIL alacak kalemlerine, 365 gun
     + Vekalet ucreti  = AAUT, TKM uzerinden
     + Masraf
     + BSMV / KKDF / KDV / OIV = takipten sonraki faizin yuzdesi (takip talebinde istenmisse)
     = Yekun alacak
     - Yatan para
     = Bakiye borc     (yatan para fazlaysa artan "borcluya iade")

   girdi = {
     takipTarihi, hesapTarihi, gunYil: 365 | 360,
     kalemler: [{ ad, tutar, tur: "asil" | "feri",
                  faizTur: "yasal" | "ticari" | "diger" | "yok", faizOran,   // takipten sonra (yalniz asil)
                  oncekiBas, oncekiTur, oncekiOran }],   // istege bagli: takip oncesi faizi program hesaplasin
     vergiler: { bsmv, kkdf, kdv, oiv },                 // yuzde
     basvurmaHarci, masraflar: [{ tarih, tutar, aciklama }],
     vekalet: { mod: "otomatik" | "elle" | "yok", tutar, suresinde },
     harcOrani: 9.10,                                    // dosyanin tahsil harci orani (yuzde)
     tahsilatlar: [{ tarih, tutar, harcOrani }],         // harcOrani bos -> dosyanin orani
     oranlar: { yasal: [{ bas, oran }], ticari: [{ bas, oran }] }
   }

   Ara odeme (her biri kendi gunune kadar isleyen faizle) su siraya sayilir:
     1) o gune kadarki masraflar (basvurma harci ve vekalet ucreti dahil), en eskiden  IIK 59/3, 138/3
     2) faiz / feri kalemler (islemis ve akdi faiz, BSMV, ihtarname...), kalem sirasiyla } TBK 100:
     3) takipten sonra islemis faiz ve vergileri                                        } once faiz, gider
     4) asil alacak, kalem sirasiyla -> asil azalinca faizi de azalir
     5) o ana kadar tahsil edilen paranin tahsil harci
     6) artan -> borcluya iade
   Harc matrahi: tahsilatin TKM'ye (2 ve 4) dusen kismi. Takipten sonraki faiz harca girmez
   (Harclar K. md. 20); masraf ve vekalet TKM'de olmadigi icin girmez. Butun tahsilatlar dosyanin
   oraniyla ise harc = TKM x oran (UYAP boyle gosteriyor).
   Pesin harc hesaba ayrica girmez: tahsil harcina mahsup edilir (Harclar K. md. 29), borclunun
   odeyecegi toplami degistirmez. Cezaevi harci borcluya yukletilemez (2548 s.K. md. 1). */
(function (kok) {
  "use strict";
  var O = typeof module !== "undefined" && module.exports ? require("./oranlar.js") : kok.IcraOranlar;

  function gun(t) {
    var p = t.split("-");
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5);
  }
  function tarih(g) { return new Date(g * 864e5).toISOString().slice(0, 10); }
  function trTarih(t) { var p = t.split("-"); return p[2] + "." + p[1] + "." + p[0]; }
  function kurus(x) { return Math.round(x * 100 + (x >= 0 ? 1e-9 : -1e-9)) / 100; }
  function sayi(x) { return x === null || x === undefined || x === "" ? null : +x; }
  function gecerliTarih(t) { return typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t); }
  function oranYazi(x) { return String(x).replace(".", ","); }

  /* [g1, g2) araliginda `anapara` uzerine islenen faiz, oran donemlerine bolunerek.
     Ilk donemden onceki gunler icin ilk oran kullanilir ve `uyar` cagrilir. */
  function faizHesapla(anapara, g1, g2, donemler, gunYil, uyar) {
    if (!(anapara > 0) || g2 <= g1 || !donemler.length) return 0;
    var toplam = 0;
    for (var i = 0; i < donemler.length; i++) {
      var bas = i === 0 ? -Infinity : donemler[i].g;
      var son = i + 1 < donemler.length ? donemler[i + 1].g : Infinity;
      var a = Math.max(g1, bas), b = Math.min(g2, son);
      if (b > a) toplam += anapara * donemler[i].oran / 100 * (b - a) / gunYil;
    }
    if (g1 < donemler[0].g && uyar) uyar(tarih(g1));
    return toplam;
  }

  function donemHazirla(liste) {
    return (liste || [])
      .filter(function (d) { return d && gecerliTarih(d.bas) && sayi(d.oran) !== null && isFinite(sayi(d.oran)); })
      .map(function (d) { return { g: gun(d.bas), bas: d.bas, oran: +d.oran }; })
      .sort(function (a, b) { return a.g - b.g; });
  }

  /* Icra takibinde vekalet ucreti (AAUT md. 11). `tarifeler` yururluk sirali liste
     (oranlar.js vekaletTarifeleri); takip tarihinde yururlukte olan secilir. Hicbiri yoksa
     ucret null + sebep (elle girilmeli). En yeni tarifenin uzerinden bir yil gectiyse yenisi
     cikmis olabilir: ucret yine hesaplanir ama `uyari` doner (sessiz kalmasin). */
  function vekaletUcreti(takipTutari, asilAlacak, suresinde, takipTarihi, tarifeler) {
    var liste = tarifeler || O.VEKALET_TARIFELERI || [], t = +takipTutari;
    if (!(t > 0)) return { ucret: null, sebep: "Takip tutarı sıfır." };
    var uygun = liste.filter(function (x) { return !takipTarihi || x.yururluk <= takipTarihi; });
    if (!uygun.length) {
      return { ucret: null, sebep: "Takip tarihi " + trTarih(takipTarihi) + ": o gün yürürlükte olan avukatlık ücret " +
               "tarifesi programda yok" + (liste.length ? " (en eskisi " + liste[0].ad + ", " + trTarih(liste[0].yururluk) + ")" : "") +
               ". Vekâlet ücretini elle girin." };
    }
    var V = uygun[uygun.length - 1];
    var r = { takipTutari: t, maktu: t <= V.esik, dilimler: [], suresinde: !!suresinde, tarife: V.ad };
    var sonra = liste[liste.length - 1];
    if (V === sonra && takipTarihi && takipTarihi >= (+V.yururluk.slice(0, 4) + 1) + V.yururluk.slice(4)) {
      r.uyari = "Takip tarihinde " + V.ad + "'nden daha yeni bir avukatlık ücret tarifesi yürürlükte olabilir " +
                "(her yıl Kasım'da yenilenir); programdaki en yeni tarife kullanıldı, ücreti kontrol edin.";
    }
    var asil = +asilAlacak > 0 ? +asilAlacak : t;
    r.asilAlacak = asil;
    var ucret;
    if (r.maktu) {
      ucret = Math.min(V.maktu, asil);
      r.kirpildi = asil < V.maktu;
    } else {
      var kalan = t; ucret = 0;
      V.dilimler.forEach(function (d) {
        if (kalan <= 0) return;
        var p = Math.min(kalan, d[0]);
        r.dilimler.push({ tutar: p, oran: d[1], ucret: kurus(p * d[1] / 100) });
        ucret += p * d[1] / 100; kalan -= p;
      });
    }
    r.tam = kurus(ucret);
    r.ucret = r.suresinde ? kurus(r.tam * 3 / 4) : r.tam;
    return r;
  }

  var VERGILER = ["bsmv", "kkdf", "kdv", "oiv"];

  function hesapla(girdi) {
    var uyarilar = [];
    var gunYil = +girdi.gunYil === 360 ? 360 : 365;
    if (!gecerliTarih(girdi.takipTarihi) || !gecerliTarih(girdi.hesapTarihi)) {
      return { hata: "Takip tarihi ve hesap tarihi girilmeli." };
    }
    var TK = gun(girdi.takipTarihi), T = gun(girdi.hesapTarihi);
    if (T < TK) return { hata: "Hesap tarihi takip tarihinden önce olamaz." };

    var tablolar = { yasal: donemHazirla(girdi.oranlar && girdi.oranlar.yasal),
                     ticari: donemHazirla(girdi.oranlar && girdi.oranlar.ticari) };
    var erkenUyari = {};
    function erken(ad) {
      return function (t) { if (!erkenUyari[ad] || t < erkenUyari[ad]) erkenUyari[ad] = t; };
    }
    var tabloKullanildi = false;
    function donemlerAl(tur, oran, ad) {
      if (tur === "yasal" || tur === "ticari") {
        if (!tablolar[tur].length) {
          uyarilar.push(ad + ": " + (tur === "yasal" ? "yasal" : "ticari") + " faiz tablosu boş; faiz işletilmedi.");
          return [];
        }
        tabloKullanildi = true;
        return tablolar[tur];
      }
      if (tur === "diger" || tur === "sabit") {
        // sayi("") null doner ve JS'te null >= 0 dogrudur: bos oran sessizce %0 olmasin
        if (sayi(oran) === null || !(sayi(oran) >= 0)) { uyarilar.push(ad + ": faiz oranı yazılmadı; faiz işletilmedi."); return []; }
        return [{ g: -Infinity, bas: "-", oran: +oran }];
      }
      return [];
    }
    function faizAdi(tur, oran) {
      if (tur === "yasal") return "Yasal";
      if (tur === "ticari") return "Ticari (avans)";
      if ((tur === "diger" || tur === "sabit") && sayi(oran) !== null && sayi(oran) >= 0) return "Diğer (%" + oranYazi(+oran) + ")";
      return "";
    }

    /* ---- Takipte kesinlesen miktar: kalemler ---- */
    var kalemler = [];
    (girdi.kalemler || []).forEach(function (k, i) {
      var tutar = sayi(k && k.tutar);
      var ad = (k && k.ad) || (i + 1) + ". kalem";
      if (!(tutar > 0)) {
        if (k && (k.ad || tutar !== null)) uyarilar.push(ad + ": tutarı girilmediği için hesaba katılmadı.");
        return;
      }
      var x = { ad: ad, tur: k.tur === "feri" ? "feri" : "asil", tutar: kurus(tutar), kalan: kurus(tutar), odenen: 0,
                islemis: 0, islemisOdenen: 0, islemisGun: 0, oncekiAdi: "", sonra: 0, donemler: [], faizAdi: "", sonIslem: TK };
      if (x.tur === "asil") {
        if (k.faizTur && k.faizTur !== "yok") {
          x.donemler = donemlerAl(k.faizTur, k.faizOran, ad);
          if (x.donemler.length) x.faizAdi = faizAdi(k.faizTur, k.faizOran);
        }
        if (gecerliTarih(k.oncekiBas) && k.oncekiTur && k.oncekiTur !== "yok") {
          var g0 = gun(k.oncekiBas);
          if (g0 >= TK) {
            uyarilar.push(ad + ": takipten önceki faizin başlangıcı takip tarihinden önce olmalı; o faiz hesaplanmadı.");
          } else {
            var on = donemlerAl(k.oncekiTur, k.oncekiOran, ad);
            if (on.length) {
              x.islemis = kurus(faizHesapla(x.tutar, g0, TK, on, gunYil, erken(ad)));
              x.islemisGun = TK - g0; x.oncekiAdi = faizAdi(k.oncekiTur, k.oncekiOran);
            }
          }
        }
      }
      kalemler.push(x);
    });
    if (!kalemler.length) return { hata: "En az bir alacak kalemi (tutarıyla) girilmeli." };
    var asillar = kalemler.filter(function (k) { return k.tur === "asil"; });
    if (!asillar.length) uyarilar.push("Asıl alacak türünde kalem yok: takipten sonra faiz işlemez.");
    var TKM = kurus(kalemler.reduce(function (t, k) { return t + k.tutar + k.islemis; }, 0));
    var asilToplam = kurus(asillar.reduce(function (t, k) { return t + k.tutar; }, 0));

    var vergiOran = {};
    VERGILER.forEach(function (a) { var x = sayi(girdi.vergiler && girdi.vergiler[a]); vergiOran[a] = x > 0 ? x : 0; });

    var r = sayi(girdi.harcOrani);
    if (r === null || !(r >= 0)) { uyarilar.push("Tahsil harcı oranı seçilmedi; harç hesaplanmadı."); r = 0; }

    /* ---- Masraflar: basvurma harci + vekalet ucreti + digerleri ---- */
    var ham = [];
    var bh = sayi(girdi.basvurmaHarci);
    if (bh > 0) ham.push({ tarih: girdi.takipTarihi, tutar: bh, aciklama: "Başvurma harcı", tur: "basvurma" });
    var vk = girdi.vekalet || { mod: "yok" }, vekaletBilgi = null;
    if (vk.mod === "otomatik") {
      vekaletBilgi = vekaletUcreti(TKM, asilToplam, vk.suresinde, girdi.takipTarihi, girdi.vekaletTarifeleri);
      if (vekaletBilgi.ucret === null) uyarilar.push("Vekâlet ücreti hesaplanmadı: " + vekaletBilgi.sebep);
      else ham.push({ tarih: girdi.takipTarihi, tutar: vekaletBilgi.ucret, aciklama: "Vekâlet ücreti", tur: "vekalet" });
      if (vekaletBilgi.uyari) uyarilar.push(vekaletBilgi.uyari);
    } else if (vk.mod === "elle" && sayi(vk.tutar) > 0) {
      vekaletBilgi = { ucret: kurus(+vk.tutar), elle: true };
      ham.push({ tarih: girdi.takipTarihi, tutar: +vk.tutar, aciklama: "Vekâlet ücreti", tur: "vekalet" });
    }
    (girdi.masraflar || []).forEach(function (m) {
      if (m) ham.push({ tarih: m.tarih, tutar: m.tutar, aciklama: m.aciklama, tur: "masraf" });
    });
    var mTarihsiz = 0, mSonra = 0;
    var masraflar = ham.filter(function (m) {
      if (!(sayi(m.tutar) > 0)) return false;
      if (!gecerliTarih(m.tarih)) { mTarihsiz++; return false; }
      if (gun(m.tarih) > T) { mSonra++; return false; }
      return true;
    }).map(function (m, i) {
      return { sira: i, tarih: m.tarih, g: gun(m.tarih), tutar: kurus(+m.tutar), kalan: kurus(+m.tutar), odenen: 0,
               aciklama: m.aciklama || "Masraf", tur: m.tur };
    }).sort(function (a, b) { return a.g - b.g || a.sira - b.sira; });
    if (mTarihsiz) uyarilar.push(mTarihsiz + " masrafın tarihi girilmediği için hesaba katılmadı.");
    if (mSonra) uyarilar.push(mSonra + " masraf hesap tarihinden sonra olduğu için hesaba katılmadı.");

    /* ---- Yatan para ---- */
    var once = 0, sonra = 0, tarihsiz = 0;
    var tahsilatlar = (girdi.tahsilatlar || []).filter(function (o) {
      if (!o || !(sayi(o.tutar) > 0)) return false;
      if (!gecerliTarih(o.tarih)) { tarihsiz++; return false; }
      var g = gun(o.tarih);
      if (g < TK) { once++; return false; }
      if (g > T) { sonra++; return false; }
      return true;
    }).map(function (o, i) {
      var or = sayi(o.harcOrani);
      return { sira: i, tarih: o.tarih, g: gun(o.tarih), tutar: kurus(+o.tutar), oran: or !== null && or >= 0 ? or : r };
    }).sort(function (a, b) { return a.g - b.g || a.sira - b.sira; });
    if (tarihsiz) uyarilar.push(tarihsiz + " ödemenin tarihi girilmediği için hesaba katılmadı.");
    if (once) uyarilar.push(once + " ödeme takip tarihinden önce: takip tutarından zaten düşülmüş olmalı, hesaba katılmadı.");
    if (sonra) uyarilar.push(sonra + " ödeme hesap tarihinden sonra olduğu için hesaba katılmadı.");
    var tekOran = tahsilatlar.every(function (o) { return Math.abs(o.oran - r) < 1e-9; });

    function islet(t) {
      asillar.forEach(function (k) {
        if (!k.donemler.length || t <= k.sonIslem) return;
        k.sonra += faizHesapla(k.kalan, k.sonIslem, t, k.donemler, gunYil, erken(k.ad));
        k.sonIslem = t;
      });
    }
    // Takip sonrasi faiz kalem kalem kurusa yuvarlanip toplanir; vergiler o toplamin yuzdesi.
    function sonraBorc() {
      var F = kurus(asillar.reduce(function (t, k) { return t + kurus(k.sonra); }, 0));
      var v = {}, top = F;
      VERGILER.forEach(function (a) { v[a] = kurus(F * vergiOran[a] / 100); top += v[a]; });
      return { faiz: F, vergi: v, toplam: kurus(top) };
    }
    var matrahlar = [];
    function harcBorcu() {
      if (tekOran) return kurus(matrahlar.reduce(function (t, x) { return t + x.m; }, 0) * r / 100);
      return kurus(matrahlar.reduce(function (t, x) { return t + kurus(x.m * x.oran / 100); }, 0));
    }

    var sonraOdenen = 0, harcOdenen = 0, kayit = [];
    tahsilatlar.forEach(function (o) {
      islet(o.g);
      var kalan = o.tutar, d = { masraf: 0, feri: 0, sonra: 0, asil: 0, harc: 0, matrah: 0 };
      function al(borc) {
        var x = kurus(Math.min(kurus(borc), kalan));
        if (x > 0) { kalan = kurus(kalan - x); return x; }
        return 0;
      }
      masraflar.forEach(function (m) {
        if (m.g > o.g) return;
        var x = al(m.kalan);
        if (x) { m.kalan = kurus(m.kalan - x); m.odenen = kurus(m.odenen + x); d.masraf += x; }
      });
      kalemler.forEach(function (k) {
        var x;
        if (k.tur === "feri") {
          x = al(k.kalan);
          if (x) { k.kalan = kurus(k.kalan - x); k.odenen = kurus(k.odenen + x); }
        } else {
          x = al(k.islemis - k.islemisOdenen);
          if (x) k.islemisOdenen = kurus(k.islemisOdenen + x);
        }
        if (x) { d.feri += x; d.matrah += x; }
      });
      var x = al(sonraBorc().toplam - sonraOdenen);
      if (x) { sonraOdenen = kurus(sonraOdenen + x); d.sonra = x; }
      asillar.forEach(function (k) {
        var y = al(k.kalan);
        if (y) {
          k.kalan = kurus(k.kalan - y); k.odenen = kurus(k.odenen + y); d.asil += y; d.matrah += y;
          if (k.kalan === 0) k.kapanis = o.g;
        }
      });
      d.matrah = kurus(d.matrah);
      matrahlar.push({ m: d.matrah, oran: o.oran });
      x = al(harcBorcu() - harcOdenen);
      if (x) { harcOdenen = kurus(harcOdenen + x); d.harc = x; }
      kayit.push({ tarih: o.tarih, tutar: o.tutar, harcOrani: o.oran, masraf: kurus(d.masraf), feri: kurus(d.feri),
                   sonra: d.sonra, asil: kurus(d.asil), harc: d.harc, iade: kalan, matrah: d.matrah,
                   harcTutari: kurus(d.matrah * o.oran / 100) });
    });
    islet(T);

    Object.keys(erkenUyari).forEach(function (ad) {
      uyarilar.push(ad + ": " + trTarih(erkenUyari[ad]) + " tarihinden önceki günler için faiz tablosunda oran yok; " +
                    "o günlere tablodaki ilk oran uygulandı.");
    });
    // Yasal/ticari oran bir yarim yil icin ancak onceki 31 Aralik / 30 Haziran'dan sonra kesinlesir.
    if (tabloKullanildi && gecerliTarih(girdi.oranKesinSon) && T > gun(girdi.oranKesinSon)) {
      uyarilar.push("Yasal / ticari faiz oranları " + trTarih(girdi.oranKesinSon) + " tarihine kadar kesin. " +
                    "Sonraki günler için son bilinen oran kullanıldı; güncel veri gelince hesap değişebilir.");
    }

    /* ---- Cizelge ---- */
    function top(dizi, f) { return kurus(dizi.reduce(function (t, x) { return t + f(x); }, 0)); }
    var sb = sonraBorc();
    var odenenMatrah = top(matrahlar, function (x) { return x.m; });
    var kalanMatrah = kurus(TKM - odenenMatrah);
    var harc = tekOran ? kurus(TKM * r / 100)
                       : kurus(top(matrahlar, function (x) { return kurus(x.m * x.oran / 100); }) + kurus(kalanMatrah * r / 100));
    function masrafTop(tur) { return top(masraflar.filter(function (m) { return m.tur === tur; }), function (m) { return m.tutar; }); }
    var basvurma = masrafTop("basvurma"), vekalet = masrafTop("vekalet"), masraf = masrafTop("masraf");
    var yekun = kurus(TKM + harc + basvurma + sb.toplam + vekalet + masraf);
    var yatan = top(kayit, function (o) { return o.tutar; });
    var iade = top(kayit, function (o) { return o.iade; });
    var bakiye = kurus(yekun - yatan + iade);
    var kalan = {
      masraf: top(masraflar, function (m) { return m.kalan; }),
      feri: top(kalemler, function (k) { return k.tur === "feri" ? k.kalan : k.islemis - k.islemisOdenen; }),
      sonra: kurus(sb.toplam - sonraOdenen),
      asil: top(asillar, function (k) { return k.kalan; }),
      harc: kurus(harc - harcOdenen)
    };
    var kalanToplam = kurus(kalan.masraf + kalan.feri + kalan.sonra + kalan.asil + kalan.harc);
    if (Math.abs(kalanToplam - bakiye) > 0.001) {
      uyarilar.push("İÇ TUTARSIZLIK: kalanların toplamı " + kalanToplam.toFixed(2) + " ₺, bakiye borç " + bakiye.toFixed(2) +
                    " ₺. Bu bir program hatasıdır; hesabı kullanmayın ve bildirin.");
    }
    if (iade > 0) uyarilar.push("Yatan para borcun tamamını " + iade.toFixed(2) + " ₺ aşıyor: bu tutar borçluya iade edilecek.");

    return {
      takipTarihi: girdi.takipTarihi, hesapTarihi: girdi.hesapTarihi, gun: T - TK, gunYil: gunYil,
      kalemler: kalemler.map(function (k) {
        return { ad: k.ad, tur: k.tur, tutar: k.tutar, faizAdi: k.faizAdi, oncekiAdi: k.oncekiAdi,
                 islemis: k.islemis, islemisGun: k.islemisGun, islemisKalan: kurus(k.islemis - k.islemisOdenen),
                 sonra: kurus(k.sonra),
                 sonraGun: k.tur === "asil" && k.donemler.length ? (k.kapanis !== undefined ? k.kapanis : T) - TK : 0,
                 odenen: k.odenen, kalan: k.kalan, kapandi: k.kapanis !== undefined ? tarih(k.kapanis) : null };
      }),
      masraflar: masraflar.map(function (m) {
        return { tarih: m.tarih, aciklama: m.aciklama, tur: m.tur, tutar: m.tutar, odenen: m.odenen, kalan: m.kalan };
      }),
      tahsilatlar: kayit,
      ozet: {
        tkm: TKM, harcOrani: r, harc: harc, tekOran: tekOran, basvurma: basvurma,
        faiz: sb.faiz, vergi: sb.vergi, vergiOran: vergiOran, vekalet: vekalet, masraf: masraf,
        yekun: yekun, yatan: yatan, iade: iade, bakiye: bakiye, kalan: kalan,
        odenenMatrah: odenenMatrah, kalanMatrah: kalanMatrah,
        cezaevi: kurus(TKM * O.CEZAEVI_YUZDE / 100)
      },
      vekalet: vekaletBilgi,
      uyarilar: uyarilar
    };
  }

  var api = { hesapla: hesapla, vekaletUcreti: vekaletUcreti, faizHesapla: faizHesapla,
              gun: gun, tarih: tarih, kurus: kurus, VERGILER: VERGILER };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else kok.IcraHesap = api;
})(this);
