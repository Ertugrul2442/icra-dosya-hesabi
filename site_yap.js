/* Siteyi kurar. veri/oranlar.json -> veri.js (window.ICRA_GOMULU), sonra index.html'in
   <script src> ile yukledigi parcalari sayfanin icine gomer:
     docs/index.html                 GitHub Pages bunu yayinlar; tek dosya, internetsiz de calisir
     docs/veri.json                  sayfa acilista buradan tazelenir (veri/oranlar.json'in birebir kopyasi)
     dagitim/Icra Dosya Hesabi.html  flasa konacak kopya (docs/index.html ile ayni)
   Veri denetimden (veriDenetle) gecmezse HICBIR SEY yazmaz, hata verir.
   --kontrol: yazmaz; docs/ kaynaklarla guncel mi bakar (kurulmayi unutulan degisiklik CI'da yakalansin).
   Calistir: node site_yap.js [--kontrol] */
"use strict";
var fs = require("fs"), path = require("path");
var kok = __dirname, kontrol = process.argv.indexOf("--kontrol") >= 0;
var O = require("./oranlar.js");

var veriMetni = fs.readFileSync(path.join(kok, "veri", "oranlar.json"), "utf8");
var veri = JSON.parse(veriMetni);
var sorun = O.veriDenetle(veri);
if (sorun.length) { console.error("VERI DENETIMDEN GECMEDI, site kurulmadi:\n- " + sorun.join("\n- ")); process.exit(1); }
var veriJs = "/* site_yap.js uretti - elle duzenleme; kaynak veri/oranlar.json */\nwindow.ICRA_GOMULU = " + JSON.stringify(veri) + ";\n";

var html = fs.readFileSync(path.join(kok, "index.html"), "utf8");
var sayi = 0;
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, dosya) {
  var js = dosya === "veri.js" ? veriJs : fs.readFileSync(path.join(kok, dosya), "utf8");
  if (js.indexOf("</script") >= 0) throw new Error(dosya + " icinde </script geciyor; gomulemez.");
  sayi++;
  return "<script>/* " + dosya + " */\n" + js + "\n</script>";
});
if (/<script src=/.test(html)) throw new Error("Gomulmemis script kaldi.");

var ciktilar = [
  ["docs/index.html", html], ["docs/veri.json", veriMetni], ["docs/.nojekyll", ""],
  ["dagitim/Icra Dosya Hesabi.html", html], ["veri.js", veriJs]
];
if (kontrol) {
  var eski = ciktilar.filter(function (c) {
    if (c[0].indexOf("dagitim/") === 0 || c[0] === "veri.js") return false;      // depoda degiller
    var yol = path.join(kok, c[0]);
    return !fs.existsSync(yol) || fs.readFileSync(yol, "utf8") !== c[1];
  });
  if (eski.length) {
    console.error("docs/ kaynaklarla GUNCEL DEGIL: " + eski.map(function (c) { return c[0]; }).join(", ") +
                  "\n'node site_yap.js' calistirip commit et.");
    process.exit(1);
  }
  console.log("docs/ guncel (" + sayi + " parça, veri " + veri.kontrol + ").");
  process.exit(0);
}
ciktilar.forEach(function (c) {
  var yol = path.join(kok, c[0]);
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, c[1]);
});
console.log(sayi + " parça gömüldü, veri " + veri.kontrol + " -> docs/index.html (" + Math.round(html.length / 1024) +
            " KB), docs/veri.json, dagitim/Icra Dosya Hesabi.html");
