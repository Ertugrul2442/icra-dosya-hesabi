"""Motordan BAGIMSIZ dogrulama: rastgele dosyalar uretir, her birini gun gun isleyen ayri bir
hesapla cozer, motorla kurus kurus karsilastirir. Kurallar hesap.js'in basindaki yorumla ayni;
kod ayri yazildi (faiz donem donem degil gun gun birikir).
Calistir: py -3.13 dogrulama/gun_gun.py [vaka_sayisi]"""
import json, os, random, subprocess, sys, datetime as dt
from decimal import Decimal, ROUND_HALF_UP
sys.stdout.reconfigure(encoding="utf-8")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 500
random.seed(2027)
D = dt.date.fromisoformat
GUN = dt.timedelta(days=1)
ORANLAR = [4.55, 9.10, 11.38, 2.27, 2.275, 1.135, 1.1375, 2.845, 2.84, 0.56, 0]
VERGI = ["bsmv", "kkdf", "kdv", "oiv"]


def K(x):
    return float(Decimal(repr(x + (1e-9 if x >= 0 else -1e-9))).quantize(Decimal("0.01"), ROUND_HALF_UP))


def rt(a, b):
    a, b = D(a), D(b)
    return (a + dt.timedelta(days=random.randint(0, (b - a).days))).isoformat()


def vaka():
    takip = rt("2019-01-01", "2026-09-30")
    hesap = rt(takip, "2026-10-26")
    kalemler = []
    for i in range(random.randint(1, 5)):
        if i == 0 or random.random() < 0.5:
            k = {"ad": "A%d" % i, "tur": "asil", "tutar": round(random.uniform(500, 2_000_000), 2),
                 "faizTur": random.choice(["yasal", "ticari", "diger", "diger", "yok"]),
                 "faizOran": round(random.uniform(5, 80), 2)}
            if random.random() < 0.3:
                k.update({"oncekiBas": rt("2016-01-01", takip), "oncekiTur": random.choice(["yasal", "ticari", "diger"]),
                          "oncekiOran": round(random.uniform(5, 80), 2)})
        else:
            k = {"ad": "F%d" % i, "tur": "feri", "tutar": round(random.uniform(10, 80_000), 2)}
        kalemler.append(k)
    toplam = sum(k["tutar"] for k in kalemler)
    return {"takipTarihi": takip, "hesapTarihi": hesap, "gunYil": random.choice([365, 365, 360]),
            "kalemler": kalemler,
            "vergiler": {v: random.choice([0, 0, 5, 15, 20, 10]) for v in VERGI},
            "basvurmaHarci": random.choice([0, 732]),
            "masraflar": [{"tarih": rt(takip, hesap), "tutar": round(random.uniform(10, 9000), 2), "aciklama": "m"}
                          for _ in range(random.randint(0, 4))],
            "vekalet": {"mod": random.choice(["yok", "elle"]), "tutar": round(random.uniform(1000, 60000), 2)},
            "harcOrani": random.choice(ORANLAR),
            "tahsilatlar": [{"tarih": rt(takip, hesap), "tutar": round(random.uniform(1, toplam * 0.8), 2),
                             "harcOrani": random.choice(ORANLAR) if random.random() < 0.3 else ""}
                            for _ in range(random.randint(0, 6))]}


def oran_gunu(tablo, gun):          # o gunun orani; tablo oncesi -> ilk oran
    o = tablo[0]["oran"]
    for d in tablo:
        if d["bas"] <= gun:
            o = d["oran"]
    return o


def coz(v, tab):
    TK, T, GY = D(v["takipTarihi"]), D(v["hesapTarihi"]), v["gunYil"]
    def tablo(tur, oran):
        return tab[tur] if tur in ("yasal", "ticari") else [{"bas": "0000-01-01", "oran": oran}] if tur == "diger" else None
    ks = []
    for k in v["kalemler"]:
        x = {"tur": k["tur"], "kalan": K(k["tutar"]), "isl": 0.0, "islOd": 0.0, "son": 0.0, "tablo": None}
        if k["tur"] == "asil":
            x["tablo"] = tablo(k["faizTur"], k["faizOran"])
            if k.get("oncekiBas"):
                t0, f, g = tablo(k["oncekiTur"], k["oncekiOran"]), 0.0, D(k["oncekiBas"])
                while g < TK:
                    f += K(k["tutar"]) * oran_gunu(t0, g.isoformat()) / 100 / GY
                    g += GUN
                x["isl"] = K(f)
        ks.append(x)
    TKM = K(sum(K(k["tutar"]) for k in v["kalemler"]) + sum(x["isl"] for x in ks))
    ms = []
    if v["basvurmaHarci"] > 0:
        ms.append([TK, K(v["basvurmaHarci"])])
    if v["vekalet"]["mod"] == "elle":
        ms.append([TK, K(v["vekalet"]["tutar"])])
    for m in v["masraflar"]:
        ms.append([D(m["tarih"]), K(m["tutar"])])
    ms.sort(key=lambda m: m[0])                      # kararli: ayni gunde giris sirasi
    toplamMasraf = K(sum(m[1] for m in ms))
    r = v["harcOrani"]
    ods = [(D(o["tarih"]), K(o["tutar"]), r if o["harcOrani"] == "" else o["harcOrani"], i)
           for i, o in enumerate(v["tahsilatlar"])]
    ods.sort(key=lambda o: (o[0], o[3]))
    tek = all(abs(o[2] - r) < 1e-9 for o in ods)

    def sonra_toplam():
        F = K(sum(K(x["son"]) for x in ks))
        return F, K(F + sum(K(F * v["vergiler"][a] / 100) for a in VERGI))

    mat, sonOd, harcOd, iade, yatan = [], 0.0, 0.0, 0.0, 0.0
    def harc_borc():
        if tek:
            return K(sum(m for m, _ in mat) * r / 100)
        return K(sum(K(m * o / 100) for m, o in mat))

    g = TK
    while True:
        for (gd, tutar, oran, _) in [o for o in ods if o[0] == g]:
            kal, m_ = tutar, 0.0
            yatan += tutar
            def al(borc):
                nonlocal kal
                x = K(min(K(borc), kal))
                if x > 0:
                    kal = K(kal - x)
                    return x
                return 0.0
            for m in ms:
                if m[0] <= g:
                    m[1] = K(m[1] - al(m[1]))
            for x in ks:
                if x["tur"] == "feri":
                    y = al(x["kalan"]); x["kalan"] = K(x["kalan"] - y)
                else:
                    y = al(x["isl"] - x["islOd"]); x["islOd"] = K(x["islOd"] + y)
                m_ += y
            sonOd = K(sonOd + al(sonra_toplam()[1] - sonOd))
            for x in ks:
                if x["tur"] == "asil":
                    y = al(x["kalan"]); x["kalan"] = K(x["kalan"] - y); m_ += y
            mat.append((K(m_), oran))
            harcOd = K(harcOd + al(harc_borc() - harcOd))
            iade = K(iade + kal)
        if g >= T:
            break
        for x in ks:                                  # g gununun faizi (g dahil, g+1 haric)
            if x["tur"] == "asil" and x["tablo"]:
                x["son"] += x["kalan"] * oran_gunu(x["tablo"], g.isoformat()) / 100 / GY
        g += GUN
    F, sonraTop = sonra_toplam()
    odenenMat = K(sum(m for m, _ in mat))
    harc = K(TKM * r / 100) if tek else K(K(sum(K(m * o / 100) for m, o in mat)) + K(K(TKM - odenenMat) * r / 100))
    yekun = K(TKM + harc + toplamMasraf + sonraTop)
    return {"tkm": TKM, "faiz": F, "harc": harc, "yekun": yekun, "yatan": K(yatan), "iade": iade,
            "bakiye": K(yekun - K(yatan) + iade),
            "k_masraf": K(sum(m[1] for m in ms)),
            "k_feri": K(sum(x["kalan"] if x["tur"] == "feri" else x["isl"] - x["islOd"] for x in ks)),
            "k_sonra": K(sonraTop - sonOd), "k_asil": K(sum(x["kalan"] for x in ks if x["tur"] == "asil")),
            "k_harc": K(harc - harcOd)}


vakalar = [vaka() for _ in range(N)]
KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cikti = subprocess.run(["node", os.path.join("dogrulama", "motor_cagir.js")], input=json.dumps(vakalar), capture_output=True,
                       text=True, encoding="utf-8", cwd=KOK)
if cikti.returncode:
    print(cikti.stderr); sys.exit(1)
m = json.loads(cikti.stdout)
fark, enbuyuk, ornek, odeme, ic, kiyas = 0, 0.0, None, 0, 0, 0
for i, (v, s) in enumerate(zip(vakalar, m["sonuc"])):
    odeme += len(v["tahsilatlar"])
    if any("TUTARSIZLIK" in u for u in s["uyarilar"]):
        ic += 1
    b = coz(v, m["oranlar"])
    z = s["ozet"]
    motor = {"tkm": z["tkm"], "faiz": z["faiz"], "harc": z["harc"], "yekun": z["yekun"], "yatan": z["yatan"],
             "iade": z["iade"], "bakiye": z["bakiye"], "k_masraf": z["kalan"]["masraf"], "k_feri": z["kalan"]["feri"],
             "k_sonra": z["kalan"]["sonra"], "k_asil": z["kalan"]["asil"], "k_harc": z["kalan"]["harc"]}
    for a in motor:
        kiyas += 1
        d = abs(b[a] - motor[a])
        if d > 0.005:
            fark += 1
            if d > enbuyuk:
                enbuyuk, ornek = d, (i, a, b[a], motor[a])
print(f"{N} vaka, {odeme} ödeme, {kiyas} kıyas -> {fark} fark, en büyük {enbuyuk:.2f}; iç tutarsızlık uyarısı {ic}")
if ornek:
    print("örnek:", ornek)
sys.exit(1 if fark or ic else 0)
