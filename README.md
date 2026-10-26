# İcra Dosya Hesabı

İcra takibindeki para alacağının dosya hesabını **UYAP "Dosya Hesabı" düzeninde** çıkaran,
tarayıcıda çalışan araç: takipte kesinleşen miktar, tahsil harcı, takipten sonra işleyen faiz,
vekâlet ücreti, masraf, ara ödemeler ve bakiye borç.

**Kullanmak için:** https://ertugrul2442.github.io/icra-dosya-hesabi/
Sayfadaki "Bilgisayarına indir" bağlantısı internetsiz çalışan tek dosyayı verir.

## Güncel kalması

Faiz oranları ve harç tutarları her yıl değişir. Bir robot (GitHub Actions, `veri-guncelle.yml`)
her gün resmî kaynaklara bakar:

| Veri | Kaynak | Nasıl |
|---|---|---|
| Yasal faiz (3095 s.K. md. 1) | Merkez Bankası reeskont oranı | otomatik, kanundaki kuralla türetilir |
| Ticari faiz (md. 2) | Merkez Bankası avans oranı | otomatik, kanundaki kuralla türetilir |
| Başvurma, vekâletname sureti, daire dışı haciz harcı | mevzuat.gov.tr, 492 s. Harçlar Kanunu | otomatik |
| Tahsil harcı oranları | aynı metin | her gün kontrol edilir; değişirse robot durur |
| Avukatlık asgari ücret tarifesi | Resmî Gazete | elle eklenir; süresi dolunca robot hatırlatma açar |

Değişiklik varsa site yeniden kurulur ve **testlerden geçerse** yayına çıkar. Okunamayan ya da
denetimden geçmeyen veri yazılmaz; eski veri yayında kalır. Sayfa açılışta güncel veriyi
(`docs/veri.json`) dört kaynaktan dener; ulaşamazsa kendi içindeki veriyle çalışır ve bunu
ekranda yazar. Sayfa yalnız okur, girilen hiçbir bilgiyi bir yere göndermez.

## Geliştirme

```
node test_hesap.js        # hesap motoru
node test_veri.js         # veri ve faiz kuralları
python test_veri_cek.py   # resmî kaynak okuyucuları (ağsız)
node site_yap.js          # docs/ ve dagitim/ kurulur
node test_site.js         # yayına giden sayfa
python test_tarayici.py   # tarayıcıda, internet taklitli
python dogrulama/gun_gun.py 400   # motordan bağımsız gün gün kıyas
```

Hesap yardımcıdır; resmî hesap icra müdürlüğünündür.
