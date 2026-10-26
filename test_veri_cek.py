"""veri_cek.py okuyucularinin ve denetimlerinin testleri. Ag kullanmaz: test_veri/ altindaki
gercek kaynak kesitleriyle (26.10.2026'da indirildi) calisir. Calistir: python test_veri_cek.py"""
import copy
import datetime as dt
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")
sys.argv = [sys.argv[0]]
import veri_cek as v

KOK = os.path.dirname(os.path.abspath(__file__))
gecen = kalan = 0


def esit(ad, bulunan, beklenen):
    global gecen, kalan
    if bulunan == beklenen:
        gecen += 1
    else:
        kalan += 1
        print(f"HATA  {ad}\n  bulunan:  {bulunan!r}\n  beklenen: {beklenen!r}")


def hata_mi(ad, f, parca):
    try:
        f()
    except v.Hata as e:
        esit(ad, parca in str(e), True)
        return
    esit(ad + " (hata vermedi)", False, True)


html = open(os.path.join(KOK, "test_veri", "tcmb.html"), encoding="utf-8").read()
metin = open(os.path.join(KOK, "test_veri", "harclar_kesit.txt"), encoding="utf-8").read()

# --- TCMB okuyucu ---
s = v.tcmb_ayikla(html)
esit("tcmb satir sayisi", len(s), 51)
esit("tcmb ilk satir (eski bicim: virgulsuz, &nbsp;'li)", s[0], ["1990-01-01", 40.0, 45.0])
esit("tcmb 1990 nbsp'li satir", s[1], ["1990-09-20", 43.0, 48.25])
esit("tcmb son satir", s[-1], ["2025-12-20", 38.75, 39.75])
esit("tcmb capalar", all(list(c) in s for c in v.TCMB_CAPALAR), True)
hata_mi("tcmb engelleme sayfasi", lambda: v.tcmb_ayikla("<html>Erisim engellendi</html>"), "basliklari yok")
bozuk = html.replace(">38,75<", ">38,7x<")
hata_mi("tcmb okunamayan satir", lambda: v.tcmb_ayikla(bozuk), "okunamayan 1 satir")

# --- Harc okuyucu ---
h = v.harc_ayikla(metin)
esit("harc basvurma", h["basvurma"], 732.0)
esit("harc vekaletname sureti", h["vekaletSuret"], 104.0)
esit("harc daire disi haciz", h["hacizDisari"], 1718.8)
esit("harc tahsil oranlari", h["tahsilOranlari"], v.TAHSIL_BEKLENEN)
hata_mi("harc basvurma yok", lambda: v.harc_ayikla(metin.replace("1. İcraya başvurma harcı", "1. Başka")), "icraya basvurma")
hata_mi("harc tahsil bolumu yok", lambda: v.harc_ayikla(metin.replace("3. Değeri belli olan", "3. Değeri")), "tahsil harci bolumu")

# --- Birlestirme ---
eski = json.load(open(os.path.join(KOK, "veri", "oranlar.json"), encoding="utf-8"))
eski["kontrol"] = "2026-10-27"
eski["tcmb"]["satirlar"] = s
eski["harc"]["yillar"] = {"2026": {"basvurma": 732.0, "vekaletSuret": 104.0, "hacizDisari": 1718.8}}
eski["harc"]["tahsilOranlari"] = dict(v.TAHSIL_BEKLENEN)
yeni, deg, nabiz = v.birlestir(eski, s, h, dt.date(2026, 10, 30))
esit("ayni veri ayni ay: degisiklik yok", (deg, nabiz), ([], False))
yeni, deg, nabiz = v.birlestir(eski, s, h, dt.date(2026, 11, 1))
esit("yeni ay: nabiz", (deg, nabiz, yeni["kontrol"]), ([], True, "2026-11-01"))
s2 = s + [["2026-12-27", 36.25, 37.25]]
yeni, deg, nabiz = v.birlestir(eski, s2, h, dt.date(2026, 12, 28))
esit("yeni tcmb satiri", (len(yeni["tcmb"]["satirlar"]), "2026-12-27" in deg[0]), (52, True))
h2 = dict(h, basvurma=950.0, vekaletSuret=130.0, hacizDisari=2200.0)
yeni, deg, _ = v.birlestir(eski, s, h2, dt.date(2026, 12, 31))
esit("aralikta gorulen harc gelecek yilin", sorted(yeni["harc"]["yillar"]), ["2026", "2027"])
yeni, deg, _ = v.birlestir(eski, s, h2, dt.date(2027, 1, 14))
esit("ocakta gorulen harc bu yilin", yeni["harc"]["yillar"]["2027"]["basvurma"], 950.0)
esit("eski yilin harci korunur", yeni["harc"]["yillar"]["2026"]["basvurma"], 732.0)

# --- Denetim ---
esit("denetim temiz", v.denetle(eski, eski), [])
d = copy.deepcopy(eski); d["tcmb"]["satirlar"] = [r for r in s if r[0] != "2024-04-01"]
esit("denetim capa eksik", any("2024-04-01" in x for x in v.denetle(d, None)), True)
d = copy.deepcopy(eski); d["tcmb"]["satirlar"] = s[:-1] + [["2026-01-10", 30.0, 31.0]]
esit("denetim eski satir kayboldu", any("eski veride olup" in x for x in v.denetle(d, eski)), True)
d = copy.deepcopy(eski); d["harc"]["tahsilOranlari"]["b"] = 9.5
esit("denetim tahsil orani degisti", any("tahsil harci oranlari" in x for x in v.denetle(d, eski)), True)
d = copy.deepcopy(eski); d["harc"]["yillar"]["2027"] = {"basvurma": 7320.0, "vekaletSuret": 130.0, "hacizDisari": 2200.0}
esit("denetim harc 10 kat", any("basvurma 2026->2027" in x for x in v.denetle(d, eski)), True)
d = copy.deepcopy(eski); d["tcmb"]["satirlar"] = s + [["2025-12-01", 30.0, 31.0]]
esit("denetim sirasiz tarih", any("sirali degil" in x for x in v.denetle(d, None)), True)

print(f"{gecen} geçti, {kalan} kaldı")
sys.exit(1 if kalan else 0)
