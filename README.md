# Atlas Ruang Publik

Bukti spasial mengenai ruang publik di Indonesia: **apa yang sebenarnya ada di sekitar
sekolah, rumah, dan fasilitas umum kita** — diukur dari data terbuka, diperiksa
kelengkapannya terhadap statistik resmi, dan diterbitkan agar dapat diperiksa siapa pun.

**🌐 https://firmanhadi21.github.io/atlas-ruang-publik/**

Disusun oleh **Firman Hadi** · Teknik Geodesi, Universitas Diponegoro, Semarang.

---

## Studi

| Studi | Wilayah | Isi |
|---|---|---|
| [Ritel Rokok di Sekitar Sekolah](rokok-sekolah-semarang/) | Kota Semarang | Minimarket penjual rokok terhadap radius 200 m (larangan jual) dan 500 m (larangan iklan) menurut **PP 28/2024** |
| [Visibilitas SMK](smk-visibility/) | Kota Semarang | Skor lokasi SMK untuk unit produksi & jasa: jangkauan calon pelanggan (10 menit), akses jalan arteri/kolektor, kelas jalan di depan gerbang, keramaian komersial, angkutan umum — bobot dapat diatur |

**Temuan utama studi pertama:** **79,6%** minimarket di Kota Semarang berada di dalam radius
200 m dari satuan pendidikan — radius yang penjualan produk tembakaunya dilarang.
Median jarak satuan pendidikan ke minimarket terdekat: **207 m**, praktis tepat di ambang aturan.

> **Kedekatan bukan pelanggaran.** Peta ini menyajikan jarak, bukan penilaian hukum.
> Penetapan pelanggaran adalah kewenangan pemerintah. Agregasi dilakukan per kecamatan;
> tidak ada pelaku usaha yang disebut namanya sebagai pelanggar.

---

## Cara kerja

1. **Menyusun lapisan data** dari sumber terbuka — OpenStreetMap, Overture Maps, data
   pemerintah, dan layanan peta pihak ketiga.
2. **Memeriksa kelengkapannya** terhadap statistik resmi. Langkah ini yang paling sering
   dilewati: data peta hampir selalu tidak lengkap, dan **ketidaklengkapannya tidak merata
   antarwilayah** — sehingga dapat membiaskan kesimpulan, bukan sekadar mengecilkan angka.
3. **Mengukur jarak** terhadap ambang yang diatur peraturan atau yang bermakna bagi warga.
4. **Menerbitkannya secara terbuka**, lengkap dengan batasan datanya.

Angka yang disajikan umumnya merupakan **batas bawah** — keadaan sebenarnya cenderung lebih
besar, bukan lebih kecil.

---

## Data dan lisensi

Data terbitan ada di `public/data/` (GeoJSON + JSON).

| Berkas | Sumber | Lisensi |
|---|---|---|
| `sekolah.geojson` | OpenStreetMap ∪ Dukcapil (Kemendagri, bersumber Kemendikbud) | **ODbL 1.0** (bagian OSM) |
| `minimarket.geojson` | OpenStreetMap ∪ Overture Maps | **ODbL 1.0** / CDLA-Permissive-2.0 |
| `kecamatan.geojson` | OpenStreetMap | **ODbL 1.0** |
| `ringkasan.json` | Statistik turunan | Bebas digunakan dengan atribusi |
| `smk-visibility/smk.geojson` | Dukcapil (nama) + OSM/Overture (koordinat), skor turunan | **ODbL 1.0** (bagian OSM) |
| `smk-visibility/jangkauan.geojson` | Jaringan jalan OSM + WorldPop 2020 | **ODbL 1.0** |
| `smk-visibility/ringkasan.json` | Statistik turunan (penduduk: WorldPop, CC BY 4.0) | Bebas digunakan dengan atribusi |

> ⚠️ **Titik minimarket yang diterbitkan lebih sedikit daripada yang dihitung.**
> Statistik memakai lapisan terlengkap (949 gerai, sebagian bersumber Google Places), tetapi
> ketentuan Google Maps Platform tidak mengizinkan penerbitan ulang titik-titiknya. Karena itu
> `minimarket.geojson` hanya memuat gerai bersumber OSM/Overture (252) yang boleh dibagikan
> kembali. **Angka statistik tetap dihitung dari lapisan penuh** — statistik turunan bukan
> "konten" Google.

> ⚠️ **ODbL bersifat *share-alike*.** Karya turunan dari basis data ini wajib diterbitkan
> dengan lisensi yang sama dan mencantumkan atribusi OpenStreetMap.

---

## Metode lengkap

Pipeline pembangunan dan verifikasi data ada di repositori terpisah:
**[firmanhadi21/food-store-master](https://github.com/firmanhadi21/food-store-master)** —
lihat `scripts/semarang/` dan `docs/semarang/`, termasuk catatan kelengkapan data,
estimasi *capture–recapture*, dan keterbatasan yang diketahui.

Perkakas dasarnya dikembangkan dari
[shiwaku/japan-food-store-master](https://github.com/shiwaku/japan-food-store-master),
sebuah pipeline pemetaan POI toko pangan untuk Jepang, yang diadaptasi untuk konteks Indonesia.

---

## Pengembangan

```bash
npm ci
npm run dev      # http://localhost:5173/atlas-ruang-publik/
npm run build    # dist/ — otomatis ter-deploy ke GitHub Pages via Actions
```

Menambah studi baru: buat direktori berisi `index.html`, lalu daftarkan pada
`build.rollupOptions.input` di `vite.config.ts` dan tambahkan kartunya di `index.html`.

## Lisensi kode

MIT. Data mengikuti lisensi masing-masing sumber (lihat tabel di atas).
