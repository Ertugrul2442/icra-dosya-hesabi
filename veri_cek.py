"""Icra Dosya Hesabi - resmi kaynaklardan oran ve harc verisini ceker, denetler, veri/oranlar.json'a yazar.

Kaynaklar (ikisi de anahtarsiz, kayitsiz):
  1) TCMB "Reeskont ve Avans Faiz Oranlari" sayfasi - HTML tablo, 1990'dan bugune.
     Yasal faiz (3095 md. 1) ve ticari faiz (md. 2) sayfada bu tablodan TURETILIR.
  2) mevzuat.gov.tr 492 sayili Harclar Kanunu PDF'i - maktu harclarin "uygulanan miktar"i
     parantez icinde yaziyor (ornek: "1. Icraya basvurma harci (732,00 TL.)").
Avukatlik ucret tarifesi (AAUT) CEKILMEZ: tablosu otomatik okunamayacak kadar daginik;
dosyada elle tutulur, bu betik ona dokunmaz (bkz. aaut_kontrol.js - hatirlatma).

Cikis kodlari (is akisi buna gore dallanir):
  0 -> yeni veri yazildi (ya da yeni ayin ilk kontrolu: "kontrol" tarihi ilerledi)
  3 -> degisiklik yok, hicbir sey yazilmadi
  1 -> cekme ya da denetim basarisiz, HICBIR SEY YAZILMADI (eski veri yerinde kalir)

Kullanim: python veri_cek.py          (ceker, denetler, gerekirse yazar)
          python veri_cek.py --kuru   (ceker, denetler, NE YAZACAGINI soyler, yazmaz)
Not: argparse yok; --help verirsen gercekten cekip yazar (nafaka projesinde yasandi).
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

KOK = os.path.dirname(os.path.abspath(__file__))
VERI = os.path.join(KOK, "veri", "oranlar.json")
TCMB_URL = ("https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/"
            "Para+Politikasi/Reeskont+ve+Avans+Faiz+Oranlari")
HARC_URL = "https://www.mevzuat.gov.tr/mevzuatmetin/1.5.492.pdf"

# Tarihsel gercekler - hic degismez. Biri eksik ya da farkliysa okuyucu bozulmus demektir.
TCMB_CAPALAR = [("1990-01-01", 40.0, 45.0), ("2016-12-31", 8.75, 9.75),
                ("2024-04-01", 50.75, 51.75), ("2025-12-20", 38.75, 39.75)]
# Harclar K. (1) sayili tarife B-I-3 a-e: tahsil harci "uygulanan" oranlari. Yillardir ayni;
# degisirse sayfadaki oran listesi (oranlar.js) elle gozden gecirilmeli -> betik DURUR.
TAHSIL_BEKLENEN = {"a": 4.55, "b": 9.10, "c": 11.38, "d": 4.55, "e": 2.27}


class Hata(Exception):
    pass


def indir(url, deneme=3, sure=60):
    son = None
    for i in range(deneme):
        try:
            # mevzuat.gov.tr duz "Mozilla/5.0"a 1 sn'de cevap veriyor; icinde baska yazi olan
            # User-Agent'i (Python-urllib dahil) cevapsiz asili tutuyor (26.10.2026'da olculdu).
            istek = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(istek, timeout=sure) as c:
                return c.read()
        except Exception as e:          # ag hatasi: bekle, tekrar dene, sonunda HATA ver
            son = e
            print(f"  {url[:60]}... deneme {i + 1}/{deneme} basarisiz: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise Hata(f"indirilemedi: {url} ({son})")


def sayi_tr(s):
    """'48,25' / '40' / ' 9,00 ' -> float. Okunamazsa None."""
    s = s.replace("\xa0", " ").strip()
    return float(s.replace(".", "").replace(",", ".")) if re.fullmatch(r"\d{1,3}(\.\d{3})*(,\d+)?|\d+(,\d+)?", s) else None


def tcmb_ayikla(html):
    """Tablodaki her satiri hucre hucre okur. Tarihli olup okunamayan satir varsa HATA (sessiz dusurme yok)."""
    if "Reeskont" not in html or "Avans" not in html:
        raise Hata("TCMB sayfasinda 'Reeskont'/'Avans' basliklari yok - sayfa degismis ya da engelleme sayfasi geldi")
    satirlar, okunamayan = [], []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        hucre = [re.sub(r"<[^>]+>", "", h).replace("&nbsp;", " ").replace("\xa0", " ").strip()
                 for h in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S | re.I)]
        if not hucre or not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", hucre[0]):
            continue                     # baslik satiri
        r = sayi_tr(hucre[1]) if len(hucre) > 1 else None
        a = sayi_tr(hucre[2]) if len(hucre) > 2 else None
        if len(hucre) != 3 or r is None or a is None:
            okunamayan.append(" | ".join(hucre))
            continue
        g, ay, y = hucre[0].split(".")
        satirlar.append([f"{y}-{ay}-{g}", r, a])
    if okunamayan:
        raise Hata(f"TCMB tablosunda okunamayan {len(okunamayan)} satir var (bicim degismis): {okunamayan[:3]}")
    return satirlar


def pdf_metni(veri):
    import fitz                          # PyMuPDF; is akisinda pip ile kuruluyor
    with fitz.open(stream=veri, filetype="pdf") as d:
        return "".join(s.get_text() for s in d)


def harc_ayikla(metin):
    """Harclar K. metninden 2026'daki gibi '(732,00 TL.)' bicimindeki uygulanan tutarlar ve tahsil oranlari."""
    def tutar(desen, ad):
        m = re.search(desen, metin, re.S)
        if not m:
            raise Hata(f"Harclar Kanunu metninde '{ad}' bulunamadi - metin bicimi degismis")
        return float(m.group(1).replace(".", "").replace(",", "."))
    TL = r"\(\s*([\d.]+,\d{2})\s*TL\.?\s*\)"
    sonuc = {
        "basvurma": tutar(r"1\.\s*İcraya başvurma harcı\s*" + TL, "icraya basvurma harci"),
        "vekaletSuret": tutar(r"c\)\s*Avukatların tasdik ettiği vekaletname suretlerinden.{0,80}?" + TL, "vekaletname sureti"),
        "hacizDisari": tutar(r"III-\s*Haciz, teslim ve satış harcı:.{0,300}?" + TL, "daire disi haciz harci"),
    }
    bas = metin.find("3. Değeri belli olan icra takiplerinde tahsil harcı")
    if bas < 0:
        raise Hata("Harclar Kanunu metninde tahsil harci bolumu bulunamadi")
    parca = metin[bas:bas + 2500]
    oran = {}
    for harf in "abcde":
        m = re.search(harf + r"\).{0,400}?\(\s*Yüzde\s*([\d,]+)\s*\)", parca, re.S)
        if not m:
            raise Hata(f"tahsil harci ({harf}) bendi okunamadi")
        oran[harf] = float(m.group(1).replace(",", "."))
    sonuc["tahsilOranlari"] = oran
    return sonuc


def denetle(yeni, eski):
    """Yazmadan once. Bos liste = temiz. sayfadaki veriDenetle (oranlar.js) ile ayni kurallar + fazlasi."""
    s = []
    rows = yeni["tcmb"]["satirlar"]
    if len(rows) < 40:
        s.append(f"TCMB satir sayisi {len(rows)} (en az 40 beklenir)")
    for i, (t, r, a) in enumerate(rows):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", t):
            s.append(f"TCMB tarih bozuk: {t}")
        if not (0 < r < 200 and 0 < a < 200):
            s.append(f"TCMB oran aralik disi: {t} {r} {a}")
        if i and rows[i - 1][0] >= t:
            s.append(f"TCMB tarihleri sirali degil: {rows[i - 1][0]} >= {t}")
    for capa in TCMB_CAPALAR:
        if list(capa) not in rows:
            s.append(f"TCMB tarihsel satiri eksik/farkli: {capa}")
    if eski:
        kayip = [r for r in eski["tcmb"]["satirlar"] if r not in rows]
        if kayip:
            s.append(f"eski veride olup yenide olmayan TCMB satirlari: {kayip[:3]} (sayfa kirpilmis olabilir)")
        if len(rows) - len(eski["tcmb"]["satirlar"]) > 5:
            s.append("tek seferde 5'ten fazla yeni TCMB satiri - beklenmedik")
    if yeni["harc"]["tahsilOranlari"] != TAHSIL_BEKLENEN:
        s.append(f"tahsil harci oranlari degismis: {yeni['harc']['tahsilOranlari']} (beklenen {TAHSIL_BEKLENEN}); "
                 "oranlar.js listesini elle gozden gecir")
    yillar = yeni["harc"]["yillar"]
    for yil, h in yillar.items():
        for k in ("basvurma", "vekaletSuret", "hacizDisari"):
            if not (0 < h.get(k, 0) < 100000):
                s.append(f"harc {yil} {k} aralik disi: {h.get(k)}")
    sirali = sorted(yillar)
    for a, b in zip(sirali, sirali[1:]):
        for k in ("basvurma", "vekaletSuret", "hacizDisari"):
            oran = yillar[b][k] / yillar[a][k]
            if not (0.95 <= oran <= 2.5):
                s.append(f"harc {k} {a}->{b} orani {oran:.2f} (beklenen 0,95-2,5): elle bak")
    if not yeni.get("vekalet"):
        s.append("vekalet tarifesi listesi bos")
    return s


def birlestir(eski, satirlar, harc, bugun):
    yeni = json.loads(json.dumps(eski))
    degisen = []
    if satirlar != eski["tcmb"]["satirlar"]:
        eklenen = [r for r in satirlar if r not in eski["tcmb"]["satirlar"]]
        degisen.append("TCMB: " + ", ".join(f"{t} reeskont %{r} avans %{a}" for t, r, a in eklenen) if eklenen
                       else "TCMB tablosu degisti")
        yeni["tcmb"]["satirlar"] = satirlar
    tutarlar = {k: harc[k] for k in ("basvurma", "vekaletSuret", "hacizDisari")}
    son_yil = max(eski["harc"]["yillar"])
    if tutarlar != eski["harc"]["yillar"][son_yil]:
        # Harc tebligi her yil Aralik sonunda cikar ve 1 Ocak'tan gecer: Aralik'ta gorulen yeni tutar
        # gelecek yilindir; Ocak-Kasim'da gorulen bu yilin.
        yil = str(bugun.year + 1 if bugun.month == 12 else bugun.year)
        yeni["harc"]["yillar"][yil] = tutarlar
        degisen.append(f"harc {yil}: basvurma {tutarlar['basvurma']:.2f}, suret {tutarlar['vekaletSuret']:.2f}, "
                       f"daire disi haciz {tutarlar['hacizDisari']:.2f}")
    yeni["harc"]["tahsilOranlari"] = harc["tahsilOranlari"]
    if harc["tahsilOranlari"] != eski["harc"].get("tahsilOranlari"):
        degisen.append("tahsil harci oranlari degisti")
    nabiz = eski["kontrol"][:7] != bugun.isoformat()[:7]
    if degisen or nabiz:
        yeni["kontrol"] = bugun.isoformat()
    return yeni, degisen, nabiz


def ozet_yaz(satir):
    print(satir)
    yol = os.environ.get("GITHUB_STEP_SUMMARY")
    if yol:
        with open(yol, "a", encoding="utf-8") as f:
            f.write(satir + "\n")


def main():
    kuru = "--kuru" in sys.argv
    bugun = dt.date.fromisoformat(os.environ["BUGUN"]) if os.environ.get("BUGUN") else dt.date.today()
    if not os.path.exists(VERI):
        print(f"HATA: {VERI} yok (ilk kurulum elle yapilir)", file=sys.stderr)
        return 1
    eski = json.load(open(VERI, encoding="utf-8"))
    try:
        print("TCMB tablosu indiriliyor...")
        satirlar = tcmb_ayikla(indir(TCMB_URL).decode("utf-8", errors="replace"))
        print(f"  {len(satirlar)} satir, son: {satirlar[-1]}")
        print("Harclar Kanunu metni indiriliyor...")
        harc = harc_ayikla(pdf_metni(indir(HARC_URL)))
        print(f"  basvurma {harc['basvurma']}, suret {harc['vekaletSuret']}, daire disi haciz {harc['hacizDisari']}, "
              f"tahsil oranlari {harc['tahsilOranlari']}")
        yeni, degisen, nabiz = birlestir(eski, satirlar, harc, bugun)
        sorun = denetle(yeni, eski)
    except Hata as e:
        ozet_yaz(f"### VERI CEKILEMEDI - hicbir sey yazilmadi\n{e}")
        return 1
    if sorun:
        ozet_yaz("### DENETIM GECMEDI - hicbir sey yazilmadi\n" + "\n".join("- " + x for x in sorun))
        return 1
    if not degisen and not nabiz:
        print("Degisiklik yok.")
        return 3
    mesaj = ("veri: " + "; ".join(degisen)) if degisen else f"nabiz: {bugun.isoformat()[:7]} kontrolu (veri ayni)"
    if kuru:
        print("KURU CALISMA - yazilmadi. Yazilacakti:", mesaj)
        return 0
    with open(VERI, "w", encoding="utf-8", newline="\n") as f:
        json.dump(yeni, f, ensure_ascii=False, indent=1)
        f.write("\n")
    with open(os.path.join(KOK, "veri", ".commit_mesaji"), "w", encoding="utf-8", newline="\n") as f:
        f.write(mesaj[:200] + "\n")
    ozet_yaz("### " + mesaj)
    return 0


if __name__ == "__main__":
    sys.exit(main())
