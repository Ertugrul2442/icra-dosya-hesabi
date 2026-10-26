"""Yayina giden sayfanin (docs/index.html) tarayicida testi. INTERNET TAKLIT EDILIR: test canli
siteye baglanmaz (canli veriye bagli test, guncellemenin kendisini kilitler - nafaka tuzak 9).
Sayfa dosyadan (file://) acilir; flasa konan kopya da boyle acilir.
Calistir: python test_tarayici.py   (yerelde Chrome, CI'da Playwright'in Chromium'u)"""
import copy
import datetime as dt
import json
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
KOK = pathlib.Path(__file__).resolve().parent
SAYFA = (KOK / "docs" / "index.html").as_uri()
VERI = json.loads((KOK / "veri" / "oranlar.json").read_text(encoding="utf-8"))
ADRESLER = {"https://ertugrul2442.github.io/icra-dosya-hesabi/veri.json",
            "https://raw.githubusercontent.com/Ertugrul2442/icra-dosya-hesabi/main/docs/veri.json",
            "https://cdn.jsdelivr.net/gh/Ertugrul2442/icra-dosya-hesabi@main/docs/veri.json"}
gecen = kalan = 0
butun_istekler, butun_hatalar = [], []


def esit(ad, bulunan, beklenen):
    global gecen, kalan
    if bulunan == beklenen:
        gecen += 1
    else:
        kalan += 1
        print(f"HATA  {ad}\n  bulunan:  {bulunan!r}\n  beklenen: {beklenen!r}")


def icerir(ad, metin, parca):
    esit(f"{ad} ({parca!r})", parca in metin, True)


class Ag:
    """Disariya giden her istegi yakalar; cevap: None = internet yok, dict = o veri, str = o metin."""
    def __init__(self, cevap):
        self.cevap = cevap

    def __call__(self, route):
        butun_istekler.append((route.request.method, route.request.url))
        if self.cevap is None:
            return route.abort()
        metin = isinstance(self.cevap, str)
        govde = self.cevap if metin else json.dumps(self.cevap, ensure_ascii=False)
        return route.fulfill(status=200, body=govde, content_type="text/html" if metin else "application/json",
                             headers={"Access-Control-Allow-Origin": "*"})


def baglam(tarayici, cevap, saat=None):
    b = tarayici.new_context()
    ag = Ag(cevap)
    b.route("https://**/*", ag)
    s = b.new_page()
    s.on("dialog", lambda d: d.accept())
    s.on("pageerror", lambda e: butun_hatalar.append(str(e)))
    if saat:
        s.clock.set_fixed_time(saat)
    return b, s, ag


def ac(s, yenile=False):
    s.reload() if yenile else s.goto(SAYFA)
    s.wait_for_function("() => !document.getElementById('veriDurumu').textContent.includes('kontrol ediliyor')",
                        timeout=20000)
    return s.inner_text("#veriDurumu"), s.get_attribute("#veriDurumu", "class")


def son_satir(s, tablo):
    return [s.locator(f"#{tablo} tbody tr").last.locator("input").nth(i).input_value() for i in (0, 1)]


with sync_playwright() as p:
    t = p.chromium.launch(**({} if os.environ.get("CI") else {"channel": "chrome"}))

    # 1) Internet yok: dosyadaki veriyle calisir ve bunu SOYLER; hesap dogru
    b, s, _ = baglam(t, None)
    metin, sinif = ac(s)
    icerir("internetsiz", metin, "ulaşılamadı")
    icerir("internetsiz", metin, "dosyanın içindeki veri")
    s.click("#ornek")
    icerir("internetsiz ornek bakiye", s.inner_text("#sonuc"), "350.064,10")
    s.fill("#takipTarihi", "2026-07-01")
    esit("basvurma dugmesi 2026", s.inner_text("#basvurmaDugme"), "2026 tutarı: 732,00 ₺")
    s.fill("#takipTarihi", "2031-03-01")
    esit("basvurma dugmesi bilinmeyen yil", s.inner_text("#basvurmaDugme"), "2031 tutarı programda yok")
    b.close()

    # 2) Ayni veri geliyor
    b, s, _ = baglam(t, VERI)
    metin, sinif = ac(s)
    icerir("ayni veri", metin, "Oranlar güncel")
    esit("ayni veri kutu rengi", sinif, "kutu bilgi")
    b.close()

    # 3) Daha yeni veri (uydurma 2027): tablolar ilerler, onbellege yazilir, internetsiz acilista da kalir
    yeni = copy.deepcopy(VERI)
    yeni["kontrol"] = "2027-01-02"
    yeni["tcmb"]["satirlar"].append(["2026-12-27", 35, 36])
    b, s, ag = baglam(t, yeni)
    metin, _ = ac(s)
    icerir("yeni veri", metin, "İnternetten güncellendi")
    icerir("yeni veri tarihi", metin, "02.01.2027")
    esit("yeni veri yasal 2027 (35 x %80)", son_satir(s, "yasalTablo"), ["2027-01-01", "28"])
    esit("yeni veri ticari 2027", son_satir(s, "ticariTablo"), ["2027-01-01", "36"])
    ag.cevap = None
    metin, _ = ac(s, yenile=True)
    icerir("onbellek (internetsiz)", metin, "daha önce indirilmiş veri")
    esit("onbellekteki tablo", son_satir(s, "ticariTablo"), ["2027-01-01", "36"])
    b.close()

    # 4) Bozuk veri reddedilir, dosyadaki kullanilir
    bozuk = copy.deepcopy(VERI)
    bozuk["kontrol"] = "2099-01-01"
    bozuk["tcmb"]["satirlar"] = [r for r in bozuk["tcmb"]["satirlar"] if r[0] != "2024-04-01"]
    b, s, _ = baglam(t, bozuk)
    metin, sinif = ac(s)
    icerir("bozuk veri", metin, "denetimden geçmedi")
    icerir("bozuk veri sebebi", metin, "tarihsel satır eksik: 2024-04-01")
    esit("bozuk veri kutu rengi", sinif, "kutu uyari")
    esit("bozuk veri kullanilmadi", son_satir(s, "ticariTablo")[0] < "2027", True)
    b.close()

    # 5) Engelleme sayfasi (200 + HTML)
    b, s, _ = baglam(t, "<html><body>Bu siteye erişim engellenmiştir</body></html>")
    metin, _ = ac(s)
    icerir("engelleme sayfasi", metin, "veri değil")
    b.close()

    # 6) Eski veri gelirse yok sayilir
    eski = copy.deepcopy(VERI)
    eski["kontrol"] = "2020-01-01"
    b, s, _ = baglam(t, eski)
    metin, _ = ac(s)
    icerir("eski veri yok sayilir", metin, "en son " + ".".join(reversed(VERI["kontrol"].split("-"))))
    b.close()

    # 7) Bayat veri: 60 gun sonra acilirsa uyarir (internet yokken de, varken de)
    k = dt.date.fromisoformat(VERI["kontrol"])
    sonra = dt.datetime.combine(k + dt.timedelta(days=60), dt.time(12))
    b, s, _ = baglam(t, None, saat=sonra)
    metin, sinif = ac(s)
    icerir("bayat internetsiz", metin, "60 gün önce")
    esit("bayat internetsiz rengi", sinif, "kutu uyari")
    b.close()
    b, s, _ = baglam(t, VERI, saat=sonra)
    metin, sinif = ac(s)
    icerir("bayat internetli", metin, "otomatik güncelleme durmuş olabilir")
    b.close()

    # 8) Elle oran: isaretlenir, kalir, geri donulur
    b, s, _ = baglam(t, None)
    ac(s)
    s.click("details summary")
    s.locator("#ticariTablo tbody tr").first.locator("input").nth(1).fill("99")
    esit("elle oran isareti", s.is_visible("#oranDurumu"), True)
    ac(s, yenile=True)
    s.click("details summary")
    esit("elle oran yenileyince kalir", s.is_visible("#oranDurumu"), True)
    s.click("#oranSifirla")
    esit("guncel oranlara donus", s.is_visible("#oranDurumu"), False)
    b.close()

    # 9) Kullanici akisi: masrafa yaz, hemen "+ Odeme". (26.10.2026: tiklama kaybolmasi yalniz
    #    Playwright'in tam sayfa ekran goruntusunden SONRA oluyordu - deneyle olculdu; bu yuzden
    #    tiklama testlerinden once full_page ekran goruntusu ALINMAZ.)
    b, s, _ = baglam(t, None)
    s.set_viewport_size({"width": 1280, "height": 900})
    ac(s)
    s.fill("#dosyaNo", "Deneme")
    s.fill("#takipTarihi", "2026-07-01"); s.fill("#hesapTarihi", "2026-10-26")
    s.select_option("#harcSecim", "9.1")
    s.fill("[data-alan='k.tutar'][data-i='0']", "250.000,00")
    s.select_option("[data-alan='k.faizTur'][data-i='0']", "diger")
    s.fill("[data-alan='k.faizOran'][data-i='0']", "48")
    for i, (d, tutar) in enumerate([("akdi", "30.000,00"), ("islemis", "4.000,00"), ("bsmvKalem", "1.700,00"), ("ihtar", "150,00")], 1):
        s.click(f"[data-ekle='{d}']")
        s.fill(f"[data-alan='k.tutar'][data-i='{i}']", tutar)
    s.click("[data-ekle='masraf']")
    s.fill("[data-alan='m.tutar'][data-i='0']", "4.000,00")
    s.inner_text("#sonuc")
    s.click("[data-ekle='tahsilat']")
    esit("tiklama kaybolmadi", s.locator("[data-alan='t.tarih']").count(), 1)
    b.close()
    t.close()

esit("sayfa hatasi yok", butun_hatalar, [])
esit("yalniz GET", sorted({m for m, _ in butun_istekler}), ["GET"])
esit("yalniz bilinen uc adres", sorted({u for _, u in butun_istekler} - ADRESLER), [])
print(f"{gecen} geçti, {kalan} kaldı ({len(butun_istekler)} dış istek yakalandı)")
sys.exit(1 if kalan else 0)
