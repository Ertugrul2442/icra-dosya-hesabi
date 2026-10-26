/* Ekran: girilenleri toplar, IcraHesap.hesapla'ya verir, sonucu UYAP "Dosya Hesabi" cizelgesi
   duzeninde basar. Girdi tablolari yalniz satir eklenip silinince ya da bir secim degisince
   yeniden kurulur (yazarken imlec kaybolmasin).

   VERI (oranlar, harclar, AAUT) uc katmandan, sirayla (nafaka + maas haczi projelerinden):
     1) dosyaya gomulu veri (site_yap.js kurarken koyar)
     2) daha once internetten indirilmis veri (localStorage onbellegi)
     3) internet: acilista dort kaynak AYNI ANDA denenir (bu site, github.io, GitHub ham, jsDelivr),
        8 sn sure siniri. Denetimden (veriDenetle) gecen EN YENI olan kullanilir ve onbellege yazilir.
   Hangisinin kullanildigi en ustte yazar; veri eskiyse uyari cikar. Hicbiri sessiz degil. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var kutu = $("yuklemeHatasi");
  if (!window.IcraHesap || !window.IcraOranlar || !window.IcraOranlar.GOMULU) {
    kutu.hidden = false;
    kutu.textContent = "Program eksik yüklendi, hesap yapılamaz: " +
      (!window.ICRA_GOMULU ? "veri.js " : "") + (!window.IcraOranlar ? "oranlar.js " : "") + (!window.IcraHesap ? "hesap.js" : "") +
      " bulunamadı. Tek dosyalık sürümü (Icra Dosya Hesabi.html) kullanın.";
    return;
  }
  var H = window.IcraHesap, O = window.IcraOranlar;
  var ANAHTAR = "icraDosyaHesabi.v3", SURUM = 3, VERI_ANAHTAR = "icraDosyaHesabi.veri.v1";
  var ESKI_GUN = 45;                     // robot ayda bir "kontrol" damgasi atar; bundan eskisi = durmus olabilir
  var DEPO = "Ertugrul2442/icra-dosya-hesabi";
  var SITE = "https://ertugrul2442.github.io/icra-dosya-hesabi/";
  var KAYNAKLAR = [
    { ad: "github.io", adres: SITE + "veri.json" },
    { ad: "GitHub", adres: "https://raw.githubusercontent.com/" + DEPO + "/main/docs/veri.json" },
    { ad: "jsDelivr", adres: "https://cdn.jsdelivr.net/gh/" + DEPO + "@main/docs/veri.json" }
  ];
  if (/^https?:$/.test(location.protocol) && location.href.indexOf(SITE) !== 0) {
    KAYNAKLAR.unshift({ ad: "bu site", adres: "veri.json" });    // baska bir yerde yayindaysa kendi kopyasi
  }
  var HARCLAR = O.TAHSIL_HARCI_LISTESI;
  var FAIZ_TURLERI = [["yasal", "Yasal"], ["ticari", "Ticari (avans)"], ["diger", "Diğer (oran yazın)"], ["yok", "Faiz yok"]];
  var KALEM_TURLERI = [["asil", "Asıl alacak"], ["feri", "Faiz / ferî"]];
  var VERGI_ADLARI = { bsmv: "B.S.M.V", kkdf: "K.K.D.F", kdv: "K.D.V", oiv: "Özel İletişim Vergisi" };

  function bugun() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function gunFarki(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function oranMetni(x) { return String(x).replace(".", ","); }

  /* ---- Veri katmanlari ---- */
  var gomulu = O.GOMULU, aktif = gomulu, aktifKaynak = "dosya", veriSurumu = 0;
  var agSonuc = null;                    // null: kontrol suruyor; [] / [{ad, durum}]: bitti
  try {
    var ob = JSON.parse(localStorage.getItem(VERI_ANAHTAR));
    if (ob && !O.veriDenetle(ob, gomulu).length && O.yeniMi(ob, gomulu) > 0) { aktif = ob; aktifKaynak = "önbellek"; }
  } catch (e) { /* onbellek okunamadi ya da bozuk: gomulu veriyle devam, kutuda yazar */ }
  function tablolar() { return O.faizTablolari(aktif); }
  function getir(k) {
    return new Promise(function (bitir) {
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var zaman = setTimeout(function () { if (ctl) ctl.abort(); bitir({ ad: k.ad, durum: "cevap gelmedi (8 sn)" }); }, 8000);
      fetch(k.adres, { cache: "no-store", signal: ctl ? ctl.signal : undefined })
        .then(function (c) { if (!c.ok) throw new Error("HTTP " + c.status); return c.text(); })
        .then(function (metin) {
          var j; try { j = JSON.parse(metin); } catch (e) { throw new Error("veri değil (engelleme sayfası olabilir)"); }
          var s = O.veriDenetle(j, gomulu);
          clearTimeout(zaman);
          bitir(s.length ? { ad: k.ad, durum: "reddedildi: " + s[0] } : { ad: k.ad, durum: "tamam", veri: j });
        })
        .catch(function (e) { clearTimeout(zaman); bitir({ ad: k.ad, durum: "ulaşılamadı (" + (e && e.message || e) + ")" }); });
    });
  }
  function tazele() {
    if (typeof fetch === "undefined") { agSonuc = []; durumYaz(); return; }
    Promise.all(KAYNAKLAR.map(getir)).then(function (sonuclar) {
      agSonuc = sonuclar;
      var iyi = sonuclar.filter(function (x) { return x.veri; })
                        .sort(function (a, b) { return O.yeniMi(b.veri, a.veri); })[0];
      if (iyi && O.yeniMi(iyi.veri, aktif) > 0) {
        aktif = iyi.veri; aktifKaynak = iyi.ad; veriSurumu++;
        try { localStorage.setItem(VERI_ANAHTAR, JSON.stringify(aktif)); } catch (e) { /* kaydedilemedi: kutuda yazar */ }
        if (!durum.oranlarElle) oranlariKur();
        maktuYaz(); hesapla();
      }
      durumYaz();
    });
  }
  function durumYaz() {
    var el = $("veriDurumu"), k = aktif.kontrol, yas = gunFarki(k, bugun());
    var tamam = agSonuc && agSonuc.some(function (x) { return x.durum === "tamam"; });
    var kaynakAdi = aktifKaynak === "dosya" ? "dosyanın içindeki veri" : aktifKaynak === "önbellek" ? "daha önce indirilmiş veri" : aktifKaynak;
    var metin, uyari = false;
    if (agSonuc === null) metin = "Güncel oranlar kontrol ediliyor… Şimdilik " + kaynakAdi + " (" + trT(k) + " kontrolü) kullanılıyor.";
    else if (tamam) {
      metin = (aktifKaynak !== "dosya" && aktifKaynak !== "önbellek" ? "İnternetten güncellendi. " : "Oranlar güncel. ") +
        "Merkez Bankası ve Harçlar Kanunu en son " + trT(k) + " tarihinde kontrol edildi.";
      if (yas > ESKI_GUN) { uyari = true; metin += " DİKKAT: bu " + yas + " gün önce; otomatik güncelleme durmuş olabilir, programı dağıtana haber verin."; }
    } else {
      var ret = agSonuc.some(function (x) { return x.durum.indexOf("reddedildi") === 0; });
      uyari = ret || yas > ESKI_GUN;
      metin = (ret ? "İnternetten gelen veri denetimden geçmedi, kullanılmadı (sebebi aşağıda); "
                   : "İnternetteki güncel oranlara ulaşılamadı; ") + kaynakAdi + " kullanılıyor (" + trT(k) + " kontrolü" +
        (yas > ESKI_GUN ? ", " + yas + " gün önce — güncel dosyayı " + SITE + " adresinden indirin" : "") + ").";
    }
    el.className = "kutu " + (uyari ? "uyari" : "bilgi");
    el.innerHTML = kac(metin) + (agSonuc && agSonuc.length ? "<span class='kucuk'>" + agSonuc.map(function (x) {
      return kac(x.ad + ": " + x.durum);
    }).join(" · ") + "</span>" : "");
  }

  /* ---- Durum (girilenler) ---- */
  function bosKalem(ad, tur) {
    return { ad: ad || "", tutar: "", tur: tur || "asil", faizTur: tur === "feri" ? "yok" : "yasal", faizOran: "",
             oncekiBas: "", oncekiTur: "yasal", oncekiOran: "" };
  }
  function bosDurum() {
    return { dosyaNo: "", takipTarihi: "", hesapTarihi: bugun(), gunYil: "365", harcSecim: "4.55", harcElle: "",
             kalemler: [bosKalem("Asıl alacak", "asil")], oncekiAcik: false,
             basvurma: "", vekalet: { mod: "otomatik", tutar: "", suresinde: false }, masraflar: [],
             vergiler: { bsmv: "", kkdf: "", kdv: "", oiv: "" }, tahsilatlar: [], oranlarElle: null };
  }
  var durum;
  try { durum = JSON.parse(localStorage.getItem(ANAHTAR)); } catch (e) { durum = null; }
  if (!durum || !durum.kalemler) durum = bosDurum();

  /* "1.234,56" / "1234,56" / "1234.56" / "1.234" hepsini okur. Okunamazsa NaN. */
  function sayiOku(s) {
    if (s === null || s === undefined) return null;
    s = String(s).replace(/[\s₺%]/g, "");
    if (s === "") return null;
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    return /^-?\d*\.?\d+$/.test(s) ? +s : NaN;
  }
  function para(x) {
    return (x === null || x === undefined || isNaN(x)) ? "—" :
      x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
  }
  function yuzde(x) { return "%" + (+x).toLocaleString("tr-TR", { maximumFractionDigits: 4 }); }
  function trT(t) { if (!t) return "—"; var p = t.split("-"); return p[2] + "." + p[1] + "." + p[0]; }
  function kac(s) {
    return String(s === null || s === undefined ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---- Girdi tablolari ---- */
  function secim(alan, i, deger, secenekler, kapali) {
    return '<select data-alan="' + alan + '" data-i="' + i + '"' + (kapali ? " disabled" : "") + ">" + secenekler.map(function (s) {
      return '<option value="' + s[0] + '"' + (s[0] === deger ? " selected" : "") + ">" + s[1] + "</option>";
    }).join("") + "</select>";
  }
  function giris(alan, i, deger, tip, ek) {
    return '<input data-alan="' + alan + '" data-i="' + i + '" value="' + kac(deger) + '"' +
      (tip === "date" ? ' type="date"' : tip === "sayi" ? ' inputmode="decimal"' : "") + (ek || "") + ">";
  }
  var HARC_SECENEK = HARCLAR.map(function (h) { return [String(h.oran), h.kisa]; });
  function harcAciklamaYaz() {
    var h = HARCLAR.filter(function (x) { return String(x.oran) === durum.harcSecim; })[0];
    $("harcAciklama").textContent = h ? h.aciklama : "Listede olmayan bir oran yazın.";
    $("harcElleKap").hidden = durum.harcSecim !== "elle";
  }

  function kalemleriKur() {
    var on = durum.oncekiAcik;
    $("kalemTablo").tHead.innerHTML = "<tr><th>Kalem</th><th>Tutar (₺)</th><th>Tür</th><th>Takipten sonra faiz</th><th>Oran %</th>" +
      (on ? "<th>Önceki faiz başlangıcı</th><th>Önceki faiz</th><th>Oran %</th>" : "") + "<th></th></tr>";
    $("kalemTablo").tBodies[0].innerHTML = durum.kalemler.map(function (k, i) {
      var feri = k.tur === "feri";
      return "<tr>" +
        "<td style='min-width:170px'>" + giris("k.ad", i, k.ad) + "</td>" +
        "<td style='min-width:130px'>" + giris("k.tutar", i, k.tutar, "sayi") + "</td>" +
        "<td style='min-width:120px'>" + secim("k.tur", i, k.tur, KALEM_TURLERI) + "</td>" +
        "<td style='min-width:140px'>" + secim("k.faizTur", i, feri ? "yok" : k.faizTur, FAIZ_TURLERI, feri) + "</td>" +
        "<td style='min-width:70px'>" + giris("k.faizOran", i, k.faizOran, "sayi", !feri && k.faizTur === "diger" ? "" : " disabled") + "</td>" +
        (on ? "<td>" + giris("k.oncekiBas", i, k.oncekiBas, "date", feri ? " disabled" : "") + "</td>" +
              "<td style='min-width:140px'>" + secim("k.oncekiTur", i, k.oncekiTur, FAIZ_TURLERI.slice(0, 3), feri) + "</td>" +
              "<td style='min-width:70px'>" + giris("k.oncekiOran", i, k.oncekiOran, "sayi", !feri && k.oncekiTur === "diger" ? "" : " disabled") + "</td>" : "") +
        "<td><button class='sil' title='Satırı sil' data-sil='kalemler' data-i='" + i + "'>×</button></td></tr>";
    }).join("");
  }
  function masraflariKur() {
    $("masrafTablo").tBodies[0].innerHTML = durum.masraflar.map(function (m, i) {
      return "<tr><td>" + giris("m.tarih", i, m.tarih, "date") + "</td><td style='min-width:200px'>" + giris("m.aciklama", i, m.aciklama) +
        "</td><td style='min-width:120px'>" + giris("m.tutar", i, m.tutar, "sayi") +
        "</td><td><button class='sil' title='Satırı sil' data-sil='masraflar' data-i='" + i + "'>×</button></td></tr>";
    }).join("") || "<tr><td colspan='4' class='kucuk'>Masraf yok.</td></tr>";
  }
  function tahsilatlariKur() {
    var sec = [["", "Dosyadaki oran"]].concat(HARC_SECENEK);
    $("tahsilatTablo").tBodies[0].innerHTML = durum.tahsilatlar.map(function (t, i) {
      return "<tr><td>" + giris("t.tarih", i, t.tarih, "date") + "</td><td style='min-width:120px'>" + giris("t.tutar", i, t.tutar, "sayi") +
        "</td><td style='min-width:260px'>" + secim("t.harcOrani", i, t.harcOrani, sec) +
        "</td><td><button class='sil' title='Satırı sil' data-sil='tahsilatlar' data-i='" + i + "'>×</button></td></tr>";
    }).join("") || "<tr><td colspan='4' class='kucuk'>Ödeme yok.</td></tr>";
  }
  // Ekrandaki tablo: elle degistirildiyse o, degilse guncel veriden turetilen (metin olarak)
  function aktifOranMetni() {
    var t = tablolar();
    function cevir(d) { return { bas: d.bas, oran: oranMetni(d.oran) }; }
    return { yasal: t.yasal.map(cevir), ticari: t.ticari.map(cevir) };
  }
  function oranlariKur() {
    var tab = durum.oranlarElle || aktifOranMetni();
    ["yasal", "ticari"].forEach(function (tur) {
      $(tur + "Tablo").tBodies[0].innerHTML = tab[tur].map(function (d, i) {
        return "<tr><td>" + giris("o." + tur + ".bas", i, d.bas, "date") + "</td><td style='width:90px'>" + giris("o." + tur + ".oran", i, d.oran, "sayi") +
          "</td><td><button class='sil' title='Satırı sil' data-sil='o." + tur + "' data-i='" + i + "'>×</button></td></tr>";
      }).join("");
    });
    $("oranDurumu").hidden = !durum.oranlarElle;
    $("oranDurumu").textContent = "Faiz tablolarını elle değiştirdiniz: güncel oranlar KULLANILMIYOR. " +
      "Güncellemeleri almak için \"Güncel oranlara dön\"e basın.";
  }
  function elleBasla() { if (!durum.oranlarElle) durum.oranlarElle = aktifOranMetni(); }
  function maktuYaz() {
    var yil = durum.takipTarihi ? +durum.takipTarihi.slice(0, 4) : null;
    var mk = yil ? O.maktuHarc(aktif, yil) : null;
    $("basvurmaDugme").textContent = !yil ? "Takip tarihi girin" : mk ? yil + " tutarı: " + para(mk.basvurma) : yil + " tutarı programda yok";
    $("maktuNotu").textContent = !yil ? "" : mk
      ? "Düğmelerin koyduğu tutarlar " + yil + " tarifesinden: suret " + para(mk.vekaletSuret) + ", daire dışı haciz " + para(mk.hacizDisari) + "."
      : "DİKKAT: " + yil + " yılının harç tutarları programda yok; tutarları kendiniz yazın.";
  }
  function ustuKur() {
    $("harcSecim").innerHTML = HARC_SECENEK.concat([["elle", "Başka oran (elle yazın)"]]).map(function (s) {
      return '<option value="' + s[0] + '">' + s[1] + "</option>";
    }).join("");
    ["dosyaNo", "takipTarihi", "hesapTarihi", "gunYil", "harcSecim", "harcElle", "basvurma"].forEach(function (id) { $(id).value = durum[id]; });
    $("vekaletMod").value = durum.vekalet.mod; $("vekaletTutar").value = durum.vekalet.tutar;
    $("suresinde").checked = !!durum.vekalet.suresinde; $("oncekiAcik").checked = !!durum.oncekiAcik;
    Object.keys(VERGI_ADLARI).forEach(function (a) { $("v_" + a).value = durum.vergiler[a] || ""; });
    harcAciklamaYaz(); maktuYaz();
  }
  function hepsiniKur() { ustuKur(); kalemleriKur(); masraflariKur(); tahsilatlariKur(); oranlariKur(); hesapla(); }

  /* ---- Degisiklikleri durum'a yaz ---- */
  var UST = { dosyaNo: 1, takipTarihi: 1, hesapTarihi: 1, gunYil: 1, harcSecim: 1, harcElle: 1, basvurma: 1 };
  function degisti(e) {
    var el = e.target, a = el.getAttribute("data-alan"), i = +el.getAttribute("data-i");
    if (UST[el.id]) {
      durum[el.id] = el.value;
      if (el.id === "harcSecim") harcAciklamaYaz();
      if (el.id === "takipTarihi") maktuYaz();
    }
    else if (el.id === "vekaletMod") durum.vekalet.mod = el.value;
    else if (el.id === "vekaletTutar") durum.vekalet.tutar = el.value;
    else if (el.id === "suresinde") durum.vekalet.suresinde = el.checked;
    else if (el.id === "oncekiAcik") { durum.oncekiAcik = el.checked; kalemleriKur(); }
    else if (a) {
      var p = a.split(".");
      if (p[0] === "k") {
        durum.kalemler[i][p[1]] = el.value;
        if (/tur$|Tur$/.test(p[1]) && e.type === "change") kalemleriKur();
      } else if (p[0] === "m") durum.masraflar[i][p[1]] = el.value;
      else if (p[0] === "t") durum.tahsilatlar[i][p[1]] = el.value;
      else if (p[0] === "o") {
        if (!durum.oranlarElle) { elleBasla(); durum.oranlarElle[p[1]][i][p[2]] = el.value; oranlariKur(); }
        else durum.oranlarElle[p[1]][i][p[2]] = el.value;
      }
      else if (p[0] === "v") durum.vergiler[p[1]] = el.value;
    } else return;
    hesapla();
  }
  document.addEventListener("input", degisti);
  document.addEventListener("change", degisti);

  document.addEventListener("click", function (e) {
    var el = e.target.closest("button"); if (!el) return;
    var sil = el.getAttribute("data-sil"), ekle = el.getAttribute("data-ekle"), oe = el.getAttribute("data-oran-ekle");
    if (sil) {
      var i = +el.getAttribute("data-i");
      if (sil.indexOf("o.") === 0) { elleBasla(); durum.oranlarElle[sil.slice(2)].splice(i, 1); oranlariKur(); }
      else { durum[sil].splice(i, 1); ({ kalemler: kalemleriKur, masraflar: masraflariKur, tahsilatlar: tahsilatlariKur })[sil](); }
      hesapla(); return;
    }
    if (oe) { elleBasla(); durum.oranlarElle[oe].push({ bas: "", oran: "" }); oranlariKur(); hesapla(); return; }
    if (ekle) ekleIslem(ekle);
  });

  function ekleIslem(ne) {
    var ilkAsil = durum.kalemler.filter(function (k) { return k.tur !== "feri"; })[0];
    var asilTutar = ilkAsil ? sayiOku(ilkAsil.tutar) : null;
    var yil = durum.takipTarihi ? +durum.takipTarihi.slice(0, 4) : null, mk = yil ? O.maktuHarc(aktif, yil) : null;
    function tl(x) { return x > 0 ? H.kurus(x).toLocaleString("tr-TR", { minimumFractionDigits: 2 }) : ""; }
    function feri(ad, tutar) { var k = bosKalem(ad, "feri"); k.tutar = tutar || ""; durum.kalemler.push(k); kalemleriKur(); }
    function masraf(ac, tutar, tarih) { durum.masraflar.push({ tarih: tarih, aciklama: ac, tutar: tutar }); masraflariKur(); }
    if (/basvurmaYil|suret|haciz/.test(ne) && !mk) {
      alert(yil ? yil + " yılının harç tutarları programda yok; tutarı kendiniz yazın." : "Önce takip tarihini girin: harç tutarı takip yılına göre değişir.");
    }
    switch (ne) {
      case "asil": durum.kalemler.push(bosKalem("Asıl alacak", "asil")); kalemleriKur(); break;
      case "islemis": feri("İşlemiş faiz"); break;
      case "akdi": feri("Akdi faiz"); break;
      case "bsmvKalem": feri("BSMV"); break;
      case "ihtar": feri("İhtarname / protesto gideri"); break;
      case "cek": feri("Çek tazminatı (%10)", tl(asilTutar * 0.10)); break;
      case "komisyon": feri("Komisyon (binde 3)", tl(asilTutar * 0.003)); break;
      case "basvurmaYil": if (mk) { durum.basvurma = tl(mk.basvurma); $("basvurma").value = durum.basvurma; } break;
      case "masraf": masraf("Masraf", "", durum.takipTarihi); break;
      case "suret": masraf("Vekâletname suret harcı", mk ? tl(mk.vekaletSuret) : "", durum.takipTarihi); break;
      case "tebligat": masraf("Tebligat gideri", "", ""); break;
      case "haciz": masraf("Daire dışı haciz harcı", mk ? tl(mk.hacizDisari) : "", ""); break;
      case "tahsilat": durum.tahsilatlar.push({ tarih: "", tutar: "", harcOrani: "" }); tahsilatlariKur(); break;
    }
    hesapla();
  }

  $("oranSifirla").onclick = function () { durum.oranlarElle = null; oranlariKur(); hesapla(); };
  $("temizle").onclick = function () { if (confirm("Girilen her şey silinsin mi?")) { durum = bosDurum(); hepsiniKur(); } };
  $("kaydet").onclick = function () {
    var blob = new Blob([JSON.stringify({ program: "icra-dosya-hesabi", surum: SURUM, durum: durum }, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dosya-hesabi-" + ((durum.dosyaNo || "kayit").replace(/[^\w\-ğüşıöçĞÜŞİÖÇ]+/g, "_")) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
  };
  $("acDugme").onclick = function () { $("acGiris").click(); };
  $("acGiris").onchange = function () {
    var f = this.files[0]; if (!f) return;
    var okuyucu = new FileReader();
    okuyucu.onload = function () {
      try {
        var j = JSON.parse(okuyucu.result);
        if (!j || j.program !== "icra-dosya-hesabi" || !j.durum || !j.durum.kalemler) throw new Error("bu programın kaydı değil");
        if (j.surum !== SURUM) throw new Error("programın eski sürümüyle kaydedilmiş; bilgileri yeniden girin");
        var b = bosDurum(); Object.keys(b).forEach(function (k) { if (j.durum[k] === undefined) j.durum[k] = b[k]; });
        durum = j.durum; hepsiniKur();
      } catch (e) { alert("Dosya açılamadı: " + e.message); }
    };
    okuyucu.readAsText(f, "utf-8"); this.value = "";
  };
  $("ornek").onclick = function () {
    if (!confirm("Örnek dosya yüklensin mi? Şu an girilenler silinir.")) return;
    durum = bosDurum();
    durum.dosyaNo = "Örnek 2026/1"; durum.takipTarihi = "2026-07-01"; durum.hesapTarihi = "2026-10-26"; durum.harcSecim = "9.1";
    function k(ad, tutar, tur, faizTur, faizOran) { var x = bosKalem(ad, tur); x.tutar = tutar; if (faizTur) { x.faizTur = faizTur; x.faizOran = faizOran; } return x; }
    durum.kalemler = [k("Asıl alacak", "250.000,00", "asil", "diger", "48"), k("Akdi faiz", "30.000,00", "feri"),
                      k("İşlemiş faiz", "4.000,00", "feri"), k("BSMV", "1.700,00", "feri"), k("İhtarname", "150,00", "feri")];
    durum.masraflar = [{ tarih: "2026-07-01", aciklama: "Masraf", tutar: "4.000,00" }];
    durum.tahsilatlar = [{ tarih: "2026-09-15", tutar: "50.000,00", harcOrani: "" }];
    hepsiniKur();
  };

  /* ---- Hesap ---- */
  /* Bir kutudan cikarken gelen "change", "input"un zaten yazdigi durumu tekrar getirir: durum ve
     veri degismediyse yeniden cizme (bosuna is). Not: 26.10.2026'da bir testte tiklama kayboldu
     sanildi; deneyle bulundu ki yalniz Playwright'in TAM SAYFA ekran goruntusunden hemen sonra
     oluyor (sayfa goruntu oncesi kaydirmaya sicriyor). Gercek kullaniciyi etkilemiyor. */
  var sonImza = null;
  function hesapla() {
    var kayit = JSON.stringify(durum), imza = veriSurumu + "|" + kayit;
    if (imza === sonImza) return;
    sonImza = imza;
    try { localStorage.setItem(ANAHTAR, kayit); } catch (e) { /* tarayici izin vermiyor: kayit yok, hesap yine calisir */ }
    var hatali = [];
    function n(s, ad) { var x = sayiOku(s); if (isNaN(x)) { hatali.push(ad + ": \"" + s + "\""); return null; } return x; }
    $("vekaletElleKap").hidden = durum.vekalet.mod !== "elle";
    var tab = tablolar(), elle = durum.oranlarElle;
    var girdi = {
      takipTarihi: durum.takipTarihi, hesapTarihi: durum.hesapTarihi, gunYil: +durum.gunYil,
      harcOrani: durum.harcSecim === "elle" ? n(durum.harcElle, "Tahsil harcı oranı") : +durum.harcSecim,
      kalemler: durum.kalemler.map(function (k, i) {
        var ad = k.ad || (i + 1) + ". kalem";
        return { ad: ad, tutar: n(k.tutar, ad + " tutarı"), tur: k.tur, faizTur: k.faizTur, faizOran: n(k.faizOran, ad + " faiz oranı"),
                 oncekiBas: durum.oncekiAcik ? k.oncekiBas : "", oncekiTur: k.oncekiTur,
                 oncekiOran: durum.oncekiAcik ? n(k.oncekiOran, ad + " önceki faiz oranı") : null };
      }),
      vergiler: {}, basvurmaHarci: n(durum.basvurma, "Başvurma harcı"),
      masraflar: durum.masraflar.map(function (m) { return { tarih: m.tarih, aciklama: m.aciklama, tutar: n(m.tutar, (m.aciklama || "Masraf") + " tutarı") }; }),
      vekalet: { mod: durum.vekalet.mod, tutar: n(durum.vekalet.tutar, "Vekâlet ücreti"), suresinde: durum.vekalet.suresinde },
      vekaletTarifeleri: O.vekaletTarifeleri(aktif),
      tahsilatlar: durum.tahsilatlar.map(function (t) {
        return { tarih: t.tarih, tutar: n(t.tutar, trT(t.tarih) + " ödemesi"), harcOrani: t.harcOrani === "" ? null : +t.harcOrani };
      }),
      oranlar: elle
        ? { yasal: elle.yasal.map(function (d) { return { bas: d.bas, oran: n(d.oran, "Yasal faiz tablosu") }; }),
            ticari: elle.ticari.map(function (d) { return { bas: d.bas, oran: n(d.oran, "Ticari faiz tablosu") }; }) }
        : { yasal: tab.yasal, ticari: tab.ticari },
      oranKesinSon: elle ? null : tab.kesinSon
    };
    Object.keys(VERGI_ADLARI).forEach(function (a) { girdi.vergiler[a] = n(durum.vergiler[a], VERGI_ADLARI[a] + " oranı"); });
    goster(H.hesapla(girdi), hatali);
  }

  /* ---- Sonuc: UYAP Dosya Hesabi cizelgesi + dokumler ---- */
  function goster(r, hatali) {
    var el = $("sonuc"), h = [];
    $("tkmCanli").textContent = r.hata ? "—" : para(r.ozet.tkm);
    h.push("<div class='yazdir-baslik'><h1>DOSYA HESABI</h1></div>");
    if (hatali.length) h.push("<div class='kutu hata'><b>Sayı olarak okunamayan kutular (hesaba katılmadı):</b><ul><li>" +
      hatali.map(kac).join("</li><li>") + "</li></ul></div>");
    if (r.hata) { el.innerHTML = h.join("") + "<div class='kutu bilgi'>" + kac(r.hata) + "</div>"; return; }
    var z = r.ozet;
    h.push("<h2 class='ekran'>Dosya hesabı</h2><dl class='belge-ust'>" +
      (durum.dosyaNo ? "<dt>Dosya No</dt><dd>" + kac(durum.dosyaNo) + "</dd>" : "") +
      "<dt>Takip Tarihi</dt><dd>" + trT(r.takipTarihi) + "</dd><dt>Hesap Tarihi</dt><dd>" + trT(r.hesapTarihi) +
      " <span class='kucuk'>(" + r.gun + " gün)</span></dd></dl>");

    var sira = 0;
    h.push("<div class='tablo-kap'><table class='cizelge'><thead><tr><th>Sıra</th><th>Kalem</th><th class='s'>Alacak Tutar</th>" +
      "<th>Tür</th><th>Faiz Adı</th><th class='s'>Takipten sonra faiz</th></tr></thead><tbody>" +
      r.kalemler.map(function (k) {
        var s = "<tr><td>" + (++sira) + "</td><td>" + kac(k.ad) + "</td><td class='s'>" + para(k.tutar) + "</td><td>" +
          (k.tur === "asil" ? "Asıl alacak" : "Faiz / ferî") + "</td><td>" + kac(k.faizAdi) + "</td><td class='s'>" +
          (k.tur === "asil" && k.faizAdi ? para(k.sonra) + "<div class='kucuk'>" + k.sonraGun + " gün" +
            (k.kapandi ? ", " + trT(k.kapandi) + "'de kapandı" : "") + "</div>" : "") + "</td></tr>";
        if (k.islemis > 0) s += "<tr><td>" + (++sira) + "</td><td>" + kac(k.ad) + " — takipten önceki faiz <span class='kucuk'>(program hesapladı, " +
          k.islemisGun + " gün)</span></td><td class='s'>" + para(k.islemis) + "</td><td>Faiz / ferî</td><td>" + kac(k.oncekiAdi) + "</td><td></td></tr>";
        return s;
      }).join("") + "</tbody></table></div>");

    function satir(isaret, ad, tutar, ac, sinif) {
      var cls = (sinif || "") + (!sinif && !(tutar > 0) ? "sifir" : "");
      return "<tr" + (cls ? " class='" + cls + "'" : "") + "><td class='isaret'>" + isaret + "</td><td>" + ad +
        (ac ? " <span class='ac'>" + ac + "</span>" : "") + "</td><td class='s'>" + para(tutar) + "</td></tr>";
    }
    var v = r.vekalet, vekEtiket = "";
    if (v && v.ucret !== null && v.ucret !== undefined) vekEtiket = v.elle ? "(elle)" : (v.maktu ? "(Maktu)" : "(Nispi)") + (v.suresinde ? "(¾)" : "(Tam)");
    var vergiSatirlari = Object.keys(VERGI_ADLARI).map(function (a) {
      return satir("+", VERGI_ADLARI[a] + (z.vergiOran[a] ? " (" + yuzde(z.vergiOran[a]) + ")" : ""), z.vergi[a]);
    }).join("");
    h.push("<div class='tablo-kap' style='margin-top:14px'><table class='kapak'>" +
      satir("", "Takipte Kesinleşen Miktar", z.tkm, "", "ara") +
      satir("+", "Harç Miktarı (" + yuzde(z.harcOrani) + ")", z.harc, z.tekOran ? "" : "ödemeler farklı oranlarla") +
      satir("+", "Başvurma Harcı", z.basvurma) +
      satir("+", "Toplam Faiz", z.faiz, "takipten sonra, " + r.gun + " gün") +
      satir("+", "Vekâlet Ücreti " + vekEtiket, z.vekalet) +
      satir("+", "Masraf", z.masraf) +
      vergiSatirlari +
      satir("=", "Yekûn Alacak", z.yekun, "", "ara") +
      satir("−", "Yatan Para", z.yatan) +
      satir("=", "Bakiye Borç", z.bakiye, "", "son") +
      satir("", "Borçluya İade Edilecek Tutar", z.iade) +
      "</table></div>");
    if (v && v.ucret !== null && v.ucret !== undefined && !v.elle) {
      h.push("<p class='kucuk'>Avukatlık Ücret Tarifesi (" + kac(v.tarife) + ", md. 11) gereğince " + para(v.ucret) + " " +
        (v.maktu ? "maktu" : "nispi") + " vekâlet ücreti: takip tutarı " + para(v.takipTutari) + " → " +
        (v.maktu ? "maktu" + (v.kirpildi ? ", asıl alacağı geçemeyeceği için " + para(v.tam) : " " + para(v.tam))
                 : v.dilimler.map(function (d) { return para(d.tutar) + " × " + yuzde(d.oran) + " = " + para(d.ucret); }).join(" + ") + " = " + para(v.tam)) +
        (v.suresinde ? "; ödeme süresinde ödendiği için ¾" : "") + ".</p>");
    }
    var uyarilar = r.uyarilar.slice();
    if (durum.oranlarElle) uyarilar.unshift("Faiz tabloları elle değiştirildi; güncel oranlar kullanılmadı.");
    if (uyarilar.length) h.push("<div class='kutu uyari'><b>Dikkat:</b><ul><li>" + uyarilar.map(kac).join("</li><li>") + "</li></ul></div>");

    if (r.tahsilatlar.length) {
      var t = r.tahsilatlar;
      function tt(alan) { return H.kurus(t.reduce(function (s, x) { return s + x[alan]; }, 0)); }
      h.push("<h3>Ara ödemeler nereye sayıldı</h3><div class='tablo-kap'><table><thead><tr><th>Tarih</th><th class='s'>Yatan</th><th class='s'>Harç oranı</th>" +
        "<th class='s'>Masrafa</th><th class='s'>Faiz / ferî kalemlere</th><th class='s'>Takip s. faiz ve vergiye</th><th class='s'>Asıl alacağa</th>" +
        "<th class='s'>Harca</th><th class='s'>İade</th></tr></thead><tbody>" +
        t.map(function (o) {
          return "<tr><td>" + trT(o.tarih) + "</td><td class='s'>" + para(o.tutar) + "</td><td class='s'>" + yuzde(o.harcOrani) +
            "</td><td class='s'>" + para(o.masraf) + "</td><td class='s'>" + para(o.feri) + "</td><td class='s'>" + para(o.sonra) +
            "</td><td class='s'>" + para(o.asil) + "</td><td class='s'>" + para(o.harc) + "</td><td class='s'>" + para(o.iade) + "</td></tr>";
        }).join("") + "<tr><td><b>Toplam</b></td><td class='s'><b>" + para(tt("tutar")) + "</b></td><td></td><td class='s'>" + para(tt("masraf")) +
        "</td><td class='s'>" + para(tt("feri")) + "</td><td class='s'>" + para(tt("sonra")) + "</td><td class='s'>" + para(tt("asil")) +
        "</td><td class='s'>" + para(tt("harc")) + "</td><td class='s'>" + para(tt("iade")) + "</td></tr></tbody></table></div>");
    }
    var k = z.kalan;
    h.push("<p class='kucuk'><b>Bakiye borcun içinde:</b> masraf ve vekâlet " + para(k.masraf) + " · faiz / ferî kalemler " + para(k.feri) +
      " · takipten sonraki faiz ve vergiler " + para(k.sonra) + " · asıl alacak " + para(k.asil) + " · tahsil harcı " + para(k.harc) + "</p>");
    h.push("<p class='kucuk'><b>Harç:</b> " + (z.tekOran
      ? "takipte kesinleşen miktar " + para(z.tkm) + " × " + yuzde(z.harcOrani) + " = " + para(z.harc) + "."
      : "ödemelerin harç matrahı " + para(z.odenenMatrah) + " kendi oranlarıyla + kalan " + para(z.kalanMatrah) + " × " + yuzde(z.harcOrani) + " = " + para(z.harc) + ".") +
      " Takipten sonra işleyen faiz, masraf ve vekâlet ücreti harca girmez (Harçlar K. md. 20). Peşin harç bu harca mahsup edilir," +
      " borçlunun ödeyeceği toplamı değiştirmez (md. 29). Cezaevi harcı (%" + O.CEZAEVI_YUZDE + ") borçluya yüklenemez (2548 s.K. md. 1)," +
      " bu yüzden hesaba girmedi; dosya tamamen tahsil edilirse alacaklıya ödenecek paradan yaklaşık " + para(z.cezaevi) + " kesilir.</p>");
    h.push("<div class='kutu bilgi ekran'><b>Kesinleşmemiş noktalar, icra dairesinde teyit edin:</b><ul>" +
      "<li>Kısmi ödemede tahsil harcı o anda ödemenin <i>içinden</i> mi ayrılıyor? Program ödemeyi önce masrafa, faize ve asıl alacağa sayıyor; harcı en sona bırakıyor.</li>" +
      "<li>UYAP'taki masraf tutarı peşin harcı da içeriyor mu? İçeriyorsa, harç tam alındığı için peşin harç iki kez sayılmış olur.</li>" +
      "<li>Takip talebinde \"faizin %5'i BSMV\" istendiyse takipten sonraki faize de BSMV yazılmalı mı?</li>" +
      "<li>Masrafa ve vekâlet ücretine faiz işletilmiyor.</li>" +
      "<li>Yabancı para, ipotek limiti ve kira/tahliye takipleri bu programın kapsamında değil.</li></ul></div>");
    h.push("<p class='kucuk'>Dayanak: İİK md. 15, 59, 138 · TBK md. 100 · 3095 s.K. md. 1-3 · Harçlar K. md. 20, 23, 24, 28, 29 ve 1 sayılı tarife · " +
      "2548 s.K. md. 1 · AAÜT md. 11 · Merkez Bankası reeskont ve avans oranları (" + trT(aktif.kontrol) + " kontrolü). " +
      "Hesap yardımcıdır; resmî hesap icra müdürlüğünündür.</p>");
    var y = window.scrollY;
    el.innerHTML = h.join("");
    if (window.scrollY !== y) window.scrollTo(0, y);   // yeniden cizim sayfayi kaydirmasin
  }

  if (/^https?:$/.test(location.protocol)) $("indir").hidden = false;   // dosyadan acilinca indirme anlamsiz
  hepsiniKur();
  durumYaz();
  tazele();
})();
