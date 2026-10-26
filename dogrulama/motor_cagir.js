// stdin'den vaka listesi (JSON) alir, motorun sonuclarini stdout'a yazar.
var H = require("../hesap.js"), O = require("../oranlar.js");
var vakalar = JSON.parse(require("fs").readFileSync(0, "utf8"));
var oranlar = { yasal: O.YASAL, ticari: O.ticariDonemler(2015, 2026) };
console.log(JSON.stringify({ oranlar: oranlar, sonuc: vakalar.map(function (v) { v.oranlar = oranlar; return H.hesapla(v); }) }));
