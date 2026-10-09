---
title: "DESIGN.md — Daster Tasbon Shop"
document_id: "DTS-DESIGN-001"
version: "1.0"
date: "2026-10-09"
status: "USULAN DESAIN — menunggu ACC owner sebelum prompt Google Stitch"
language: "id-ID"
owner: "Daster Tasbon Shop"
design_direction_recommended: "A — Warm Modern Feminine"
source_prd: "02_PRD_Daster_Tasbon_Shop_v1.1.md"
target_platform: "Responsive web, mobile-first; customer dan admin"
next_artifact: "07_STITCH_PROMPTS_Daster_Tasbon_Shop_v1.0.md"
---

# DESIGN.md — Daster Tasbon Shop

> **Catatan status:** Owner telah mengonfirmasi cakupan **daster dan pakaian wanita lainnya**, operasional **kombinasi**, **checkout dan pembayaran otomatis di website**, pengiriman dengan target **seluruh Indonesia**, serta **belum ada logo maupun identitas visual**. Seluruh warna, konsep logo, font, dan tone brand dalam dokumen ini adalah **USULAN** sampai owner memberikan ACC. Referensi fungsional: `02_PRD_Daster_Tasbon_Shop_v1.1.md`. Referensi bentuk dokumen: knowledge base Santriman App Architect §9. Desain **tidak** mengklaim fitur marketplace multi-vendor.

## Daftar Isi

- [0. Kontrol Dokumen](#0-kontrol-dokumen)
- [1. Product Design Intent dan Identitas Brand](#1-product-design-intent-dan-identitas-brand)
- [2. Design Principles](#2-design-principles)
- [3. Tiga Arah Visual dan Rekomendasi](#3-tiga-arah-visual-dan-rekomendasi)
- [4. Color System](#4-color-system)
- [5. Typography](#5-typography)
- [6. Spacing, Layout, dan Density](#6-spacing-layout-dan-density)
- [7. Shape, Border, Elevation](#7-shape-border-elevation)
- [8. Imagery dan Iconography](#8-imagery-dan-iconography)
- [9. Component Language](#9-component-language)
- [10. Interaction, Motion, dan Feedback](#10-interaction-motion-dan-feedback)
- [11. Responsive Behavior dan Navigasi](#11-responsive-behavior-dan-navigasi)
- [12. Accessibility dan Inclusive Design](#12-accessibility-dan-inclusive-design)
- [13. Content, Microcopy, dan Lokalisasi](#13-content-microcopy-dan-lokalisasi)
- [14. E-commerce Platform Patterns](#14-e-commerce-platform-patterns)
- [15. Screen-by-Screen Design Contract](#15-screen-by-screen-design-contract)
- [16. Do dan Don't](#16-do-dan-dont)
- [17. Design QA Checklist](#17-design-qa-checklist)
- [18. Kontrak Prompt Google Stitch](#18-kontrak-prompt-google-stitch)
- [19. Keputusan Terbuka, Risiko, dan Riwayat](#19-keputusan-terbuka-risiko-dan-riwayat)

## 0. Kontrol Dokumen

| Item | Isi |
|---|---|
| Dokumen | DESIGN.md v1.0 |
| Basis PRD | `02_PRD_Daster_Tasbon_Shop_v1.1.md` |
| Mode kerja | Guided — tahap desain, menunggu ACC sebelum Stitch |
| Cakupan | UI/UX storefront, checkout/payment, order tracking, customer account, backoffice |
| Bukan cakupan | Pemilihan teknologi, desain database rinci, desain logo final yang sudah diekspor, pengembangan backend |
| Level keputusan | Arah A direkomendasikan namun **belum disetujui** |
| Prioritas | Kejelasan produk → kepercayaan → konversi → kemudahan operasi |
| Status aset | Logo nyata, foto asli, copy promosi, kurir/gateway, kontak bisnis belum diberikan |

**Aturan penggunaan:** Desain adalah panduan untuk pengembangan visual dan prompt Google Stitch, bukan pengganti kebutuhan server-side pada PRD. Setiap konsep yang bertentangan dengan PRD harus diajukan sebagai revisi, bukan diam-diam diubah.

## 1. Product Design Intent dan Identitas Brand

### 1.1 Design intent

**Daster Tasbon Shop** ingin terasa seperti butik online pakaian harian yang **hangat, rapi, menyenangkan, dan dapat dipercaya**, bukan toko diskon yang berisik. Pengguna perlu cepat menemukan pakaian menurut model, bahan, ukuran, dan harga; memahami varian serta estimasi sebelum membayar; kemudian memantau pesanan tanpa harus menghubungi admin untuk hal mendasar.

**Rasa yang dituju:** “Produknya mudah dipahami, pilihannya menarik, belanjanya simpel, dan toko ini transparan.”

**Kata sifat brand [USULAN]:** hangat, ramah, feminim inklusif, praktis, terpercaya, ringan, rapi, anggun tanpa berlebihan.

**Janji brand [USULAN]:** “Pilihan daster dan busana wanita yang nyaman untuk keseharian, dengan belanja yang mudah dan jelas.”

**Target pelanggan [HIPOTESIS PRD]:** pembeli mobile di Indonesia, pembeli teliti ukuran/bahan, pelanggan berulang. Rentang usia, daya beli, dan lokasi konsentrasi belum diverifikasi.

### 1.2 Brand name, tagline, dan logo brief [USULAN]

- **Nama utama yang harus ditulis konsisten:** `Daster Tasbon Shop`.
- **Tampilan logo utama:** wordmark `Daster Tasbon` beraksen typographic lembut; `SHOP` sebagai sublabel kecil atau hilangkan di lebar kecil dengan tetap mempertahankan nama brand secara aksesibel.
- **Logomark:** huruf `T` sederhana yang menyiratkan lipatan kain atau pita jahitan; bentuk harus jelas pada 24×24 px dan 48×48 px. Hindari ikon dress/wanita generik yang menurunkan keunikan.
- **Varian logo yang diperlukan setelah approval:** horizontal, stacked, monokrom gelap, monokrom putih, logomark/favicon. Semua butuh clear space minimal setara tinggi huruf `D`.
- **Tagline utama [USULAN]:** “Nyaman Dipakai, Senang Belanjanya.”
- **Tagline alternatif [USULAN]:** “Teman Nyaman Setiap Hari.” Jangan memakai klaim “termurah”, “100% ori”, atau “gratis ongkir se-Indonesia” tanpa pembuktian.
- **Logo belum dibuat:** Stitch boleh memakai temporary typographic wordmark berlabel *placeholder*, **jangan** mengarang logo final.

### 1.3 Architecture of meaning

- **Brand layer:** kehangatan, kurasi, konsistensi visual.
- **Commerce layer:** harga Rp, varian, informasi bahan dan size chart, ketersediaan.
- **Trust layer:** alamat/kurir, estimasi pemrosesan, biaya final, kebijakan, dukungan.
- **Operation layer:** admin memisahkan katalog/stok/pemasok/order/keuangan.
- Jangan membiarkan estetika menutupi informasi transaksi yang penting.

## 2. Design Principles

| ID | Prinsip | Perwujudan dan QA |
|---|---|---|
| DP-01 | **Produk sebagai pusat perhatian** | Foto produk dominan, latar tenang, harga dan detail ukuran terbaca. |
| DP-02 | **Bisa belanja dari ponsel** | Satu tugas utama terlihat tanpa zoom; form tidak sempit; CTA terjangkau jempol. |
| DP-03 | **Kepercayaan berasal dari kejelasan** | Tidak menyembunyikan ongkir, ketersediaan, estimasi preorder, kebijakan, atau status pembayaran. |
| DP-04 | **Pilih cepat, koreksi mudah** | Varian jelas, tombol kembali tanpa kehilangan input, validasi spesifik per kolom. |
| DP-05 | **Cantik tetapi aksesibel** | Kontras teks sesuai WCAG, fokus keyboard, ukuran target minimum, bukan status berbasis warna saja. |
| DP-06 | **Satu bahasa desain** | Token sama di storefront/checkout/admin; admin dibuat lebih padat tanpa berubah karakter. |
| DP-07 | **Jujur tentang kombinasi stok** | Ready/preorder/pemasok hanya diberi label jika mode benar-benar aktif dan terverifikasi. |

## 3. Tiga Arah Visual dan Rekomendasi

### 3.1 Direction A — Warm Modern Feminine **[REKOMENDASI]**

**Visual:** soft ivory + berry plum + rose tint; typography sans yang bersih; fotografi produk nyata; card lembut tanpa dekorasi berlebihan.

**Rasa:** hangat, rapi, modern, percaya diri, cocok untuk toko daster yang juga menjual beragam busana wanita.

**Kelebihan:** mudah menjaga harga/ukuran tetap terlihat, foto produk tidak berkompetisi dengan warna UI, fleksibel bila koleksi bertambah, mudah diterapkan ke checkout maupun admin.

**Trade-off:** bila foto buruk dan copy lemah, tampilannya bisa terasa terlalu sederhana. Perlu foto katalog konsisten dan hero yang relevan.

### 3.2 Direction B — Earthy Botanical

**Visual:** off-white `#FAF8F1`, sage gelap `#365F52`, clay muted `#AB735E`, serif editorial yang dibatasi ke headline.

**Rasa:** natural, lembut, homewear-oriented; efektif bila produk dominan motif bunga dan bahan breathable.

**Trade-off:** lebih mudah dianggap brand lifestyle premium atau kosmetik; bila stok pakaian wanita sangat beragam, tema botanical dapat membatasi ekspresi koleksi.

### 3.3 Direction C — Playful Chic

**Visual:** clean white `#FFFFFF`, raspberry gelap `#9E245B`, peach muda `#FFE3D4`, typography lebih berani, layout promo aktif.

**Rasa:** muda, energik, campaign-friendly untuk flash collection.

**Trade-off:** cepat lelah secara visual, lebih sulit menjaga kredibilitas checkout jika badge/promo terlalu dominan, risiko kontras jika menggunakan pastel sebagai tombol.

### 3.4 Keputusan desain saat ini

**Pilih Direction A sebagai baseline [USULAN].** Gunakan satu sumber token pada §4–§7. Arah B/C adalah alternatif referensi—**jangan campur palet** tanpa revisi. Pemilihan akhir menunggu ACC owner. Arah A lebih serbaguna bagi brand dengan produk daster **dan** pakaian wanita lainnya, serta alur pembayaran otomatis yang membutuhkan kejelasan.

## 4. Color System

### 4.1 Semantic tokens — light theme utama [USULAN]

| Token | HEX | Pemakaian | Aturan kontras |
|---|---|---|---|
| `color.primary.600` | `#813A56` | CTA utama, link brand, fokus visual | Teks putih di atasnya ±7,86:1 |
| `color.primary.700` | `#672B44` | Hover/pressed CTA | Teks putih ±10,47:1 |
| `color.primary.050` | `#FAEBF0` | Latar lembut pada informasi/promosi | Teks gelap tetap diperlukan |
| `color.primary.100` | `#F1DAE2` | Badge/selection tint | **Bukan** warna teks utama |
| `color.canvas` | `#FFF9F5` | Latar storefront |
| `color.surface` | `#FFFFFF` | Card, form, drawer |
| `color.surface.muted` | `#F9ECF0` | Strip editorial/section |
| `color.text.primary` | `#292126` | Headline, body, nominal |
| `color.text.secondary` | `#6D5B64` | Label sekunder; putih ±6,30:1 |
| `color.text.inverse` | `#FFFFFF` | Teks di atas primary/dark |
| `color.border.default` | `#DFD1D7` | Border dekoratif dan pemisah, **bukan** satu-satunya penanda input |
| `color.accent.neutral` | `#7A6756` | Info tekstur/bahan dan accent kecil |
| `color.success.700` | `#20654B` | Teks sukses dengan ikon/label |
| `color.warning.700` | `#89510B` | Teks peringatan dengan ikon/label |
| `color.danger.700` | `#AC2F45` | Error dengan ikon/teks |
| `color.info.700` | `#315E8B` | Informasi sistem |

> Angka kontras contoh adalah perhitungan warna statis terhadap putih, bukan sertifikasi UI final. Semua gabungan warna aktual (termasuk overlay gambar, opacity, disabled, focus) harus diaudit ulang saat implementasi.

### 4.2 Semantic aliases (supaya mudah diterapkan di Stitch dan kode)

```yaml
color:
  brand:
    primary: "#813A56"
    primary_hover: "#672B44"
    primary_subtle: "#FAEBF0"
  surface:
    canvas: "#FFF9F5"
    card: "#FFFFFF"
    muted: "#F9ECF0"
  text:
    primary: "#292126"
    secondary: "#6D5B64"
    on_primary: "#FFFFFF"
  border:
    subtle: "#DFD1D7"
  feedback:
    success: "#20654B"
    warning: "#89510B"
    danger: "#AC2F45"
    info: "#315E8B"
```

### 4.3 Palet penggunaan

- Latar dasar: `canvas`. Card tetap putih agar foto terlihat bersih.
- CTA tunggal primer per zona: `primary.600` + teks putih. Hover `primary.700`.
- Secondary button: surface putih, border primary gelap, label primary.
- Link berupa underline pada konten teks, **tidak hanya perubahan warna**.
- Badge preorder/supplier memakai latar pucat + **teks gelap dan ikon**, jangan semata warna.
- Status order `paid`, `pending`, `error` harus punya label literal dan ikon.
- Jangan taruh teks harga/bahan yang penting langsung di atas foto tanpa scrim opaque yang teruji.

### 4.4 Dark theme

**Di luar MVP.** Dashboard dan storefront memakai light theme dulu untuk konsistensi warna dan akurasi foto. Jika dark mode ditambahkan, perlu palet semantik terpisah, QA foto, tabel, chart, input, dan payment widget; tidak cukup membalik warna otomatis.

## 5. Typography

### 5.1 Font dan hierarki

- **Family UI utama [USULAN]:** `Plus Jakarta Sans`, fallback `Arial, sans-serif`. Gunakan satu family utama untuk mengurangi variasi visual dan biaya pemuatan.
- **Display editorial opsional:** `DM Serif Display` hanya untuk satu headline hero kampanye; fallback Georgia/serif. **Jangan** gunakan untuk harga, form, navbar, angka nominal, dan admin.
- Gunakan font sumber berlisensi yang sesuai saat implementasi dan fallback yang aman; jangan mensyaratkan file font rahasia.

| Token | Desktop | Mobile | Weight / line-height | Contoh |
|---|---|---|---|---|
| `type.display` | 48px | 32px | 700 / 1.15 | Headline beranda |
| `type.h1` | 36px | 28px | 700 / 1.2 | Judul halaman/produk |
| `type.h2` | 28px | 24px | 700 / 1.25 | Section |
| `type.h3` | 22px | 20px | 650–700 / 1.3 | Card informasi |
| `type.body` | 16px | 16px | 400 / 1.55 | Deskripsi, form |
| `type.body.small` | 14px | 14px | 400–500 / 1.5 | Detail sekunder |
| `type.caption` | 12px | 12px | 500 / 1.45 | Metadata non-kritis |
| `type.price` | 24px | 22px | 700 / 1.2 | Harga PDP |
| `type.button` | 15px | 15px | 650–700 / 1.2 | Tombol |

**Aturan:** teks kritis (stok, ongkir, warning, error, harga) minimal 14px dan tidak bergantung pada caption 12px. Jangan menggunakan uppercase panjang untuk instruksi.

### 5.2 Angka, uang, tanggal, satuan

- Mata uang `IDR`: `Rp89.000`, `Rp129.000` (contoh). Konsisten sebagai tampilan, bukan representasi floating-point internal.
- Berat: `250 g` / `1,2 kg`; ukuran: `LD 110 cm`, `Panjang 105 cm`, `Pinggang 70–110 cm`.
- Estimasi: “Disiapkan 2–3 hari kerja” berbeda dari “Estimasi kurir 3–5 hari kerja”.
- Harga promo: harga coret **hanya** bila benar ada referensi historis yang sah.
- Nomor pesanan/kode tracking gunakan angka tabular bila font mendukung.

## 6. Spacing, Layout, dan Density

### 6.1 Design tokens

```yaml
spacing:
  base_unit: "4px"
  scale: ["4px", "8px", "12px", "16px", "20px", "24px", "32px", "40px", "48px", "64px", "80px"]
  card_padding_mobile: "12px"
  card_padding_desktop: "16px"
  section_gap_mobile: "40px"
  section_gap_desktop: "64px"
layout:
  max_content_width: "1200px"
  mobile_gutter: "16px"
  tablet_gutter: "24px"
  desktop_gutter: "32px"
  checkout_content_max: "960px"
  text_readable_max: "68ch"
```

### 6.2 Grid

| Viewport | Product grid | Navigation | Catatan |
|---|---|---|---|
| `320–359px` | 1 kolom (safe fallback) | Top + bottom navigation | Lebih aman daripada card 140px terlalu sempit |
| `360–767px` | 2 kolom | Top + bottom navigation | Gap 12px; foto 4:5 |
| `768–1023px` | 3 kolom | Header compact | Gap 20px |
| `≥1024px` | 4 kolom | Desktop full header | Gap 24px, container max 1200px |

- Listing harus mempertahankan order foto → nama → harga → badge ketersediaan → varian relevan.
- Page checkout pakai layout 1 kolom di mobile, 2 kolom di desktop (form utama + ringkasan sticky yang tidak menghalangi).
- Halaman admin memakai content width lebih lebar jika perlu tetapi tetap grid berbasis token.

### 6.3 Rhythm dan density

- Section home: judul, subtitle singkat, CTA opsional, product grid. Jangan lebih dari dua elemen dekoratif dominan berturutan.
- Jarak antarfield form 16px, antargrup form 24px, antarsection 40–64px.
- Porsi foto produk: dominan, umumnya 4:5. Hindari crop yang memotong panjang pakaian bila foto full body tersedia.
- Dashboard admin lebih padat daripada storefront, tetapi tetap 44px minimum untuk kontrol sentuh kritis.

## 7. Shape, Border, Elevation

```yaml
shape:
  radius_sm: "8px"
  radius_md: "12px"
  radius_lg: "16px"
  radius_xl: "24px"
  radius_pill: "999px"
  border_width: "1px"
  focus_ring: "3px solid #813A56"
elevation:
  low: "0 2px 10px rgba(41,33,38,0.06)"
  medium: "0 8px 24px rgba(41,33,38,0.10)"
  high: "0 16px 40px rgba(41,33,38,0.16)"
```

- Product card default datar/border lembut; hover hanya sedikit terangkat.
- Button: `radius_md`, bukan pill berlebihan pada semua komponen.
- Modal/drawer: `radius_lg` atas (mobile bottom sheet) atau `radius_xl` (desktop).
- Alert status: tint halus, ikon, teks, action; bukan shadow mencolok.

## 8. Imagery dan Iconography

### 8.1 Fotografi produk [DIPERLUKAN PEMILIK]

- Foto utama: pakaian terlihat jelas, pencahayaan konsisten, background netral; foto model jika hak pakai jelas dan representatif.
- Foto tambahan: close-up motif/kain, bagian belakang, detail jahitan, referensi panjang/fit, chart ukuran yang bisa dibaca.
- Variasi warna dan motif **wajib cocok** dengan SKU yang dipilih; jangan menggunakan gambar motif lain.
- Jika produk dipasok pihak lain, foto tetap harus memiliki izin penggunaan; hindari watermark pihak ketiga.
- Avatar/testimonial/ratings: tampil hanya bila data nyata dan sah. Untuk mockup Stitch gunakan *dummy sample* yang **jelas dinyatakan contoh**, jangan menggambarkan ulasan sebagai bukti.
- Prefer visual keseharian yang relevan, bukan stok foto glamour yang tidak merepresentasikan barang.

### 8.2 Iconography

- Ikon line 20–24px, stroke konsisten 1.75–2px, sudut lembut.
- Konsep ikon: `search`, `shopping-bag`, `user-round`, `heart`, `truck`, `ruler`, `package`, `clock`, `shield-check`, `alert-circle`, `help-circle`, `sliders-horizontal`.
- Ikon di samping teks harus memperjelas makna; simbol saja untuk tindakan kritis wajib berlabel atau accessible name.
- Jangan gunakan emotikon sebagai icon set utama, kecuali konten promosi yang sah.

## 9. Component Language

### 9.1 Buttons

| Varian | Visual dan perilaku | Penggunaan |
|---|---|---|
| Primary | Plum + putih; min-height 44px; loading spinner + label | `Tambah ke Keranjang`, `Lanjut ke Pembayaran` |
| Secondary | Putih + outline plum gelap | `Lihat Detail`, `Simpan`, `Kembali` |
| Tertiary | Link gelap berunderline saat fokus/hover | Bantuan, size guide |
| Destructive | Danger + konfirmasi sesuai dampak | Hapus data permanen / tindakan admin |
| Disabled | Tampak nonaktif + alasan di dekat CTA | Stok kosong, checkout belum valid |

States wajib: `default`, `hover`, `focus-visible`, `pressed`, `loading`, `disabled`, `success/error feedback`. Hindari perubahan ukuran saat loading.

### 9.2 Product card

Komposisi: thumbnail rasio 4:5 → nama maksimal dua baris → harga IDR jelas → metadata ukuran/label mode → tindakan menuju PDP (quick add hanya bila varian sederhana). Badge: `Ready stock`, `Preorder`, atau `Dikirim dari mitra` **hanya jika valid**.

Card dengan stok habis menampilkan `Stok habis` dan CTA nonaktif; jangan tampil seolah bisa checkout. Gunakan badge kecil tanpa menutupi pakaian.

### 9.3 Variant selector, size guide, dan quantity

- Varian berupa swatch berlabel teks atau segmented option; motif punya thumbnail terpilih.
- Tampilkan stok per varian jika benar ada; untuk preorder gunakan kuota/estimasi bukan label “stok tersedia tanpa batas”.
- Size guide inline modal/drawer dengan tabel pengukuran (LD/panjang/fit, cara mengukur); ukuran tabel bisa scroll horizontal **hanya bila diberi affordance**.
- Quantity stepper `− 1 +`, batas min 1, max ketersediaan. Tampilkan error langsung jika nilai berubah sementara stok tak lagi tersedia.
- Warna pilihan tidak boleh satu-satunya pembeda; teks/nama varian wajib.

### 9.4 Forms & checkout

- Label permanen di atas field; placeholder contoh, bukan label.
- Grup: kontak pembeli, penerima, alamat (provinsi/kab/kecamatan/kode pos/jalan), pengiriman, pembayaran, ringkasan.
- Error spesifik di bawah input; validasi pada blur/submit, tidak menumpuk toasts.
- Radio shipping menampilkan kurir, layanan, tarif, estimasi transit, dan origin relevan; tidak mengarang nama layanan.
- Order summary memperlihatkan item, varian, mode, subtotal, diskon, ongkir, fee transparan, **total final** sebelum action.
- Checkbox opt-in promosi terpisah dan tidak prechecked.
- Mobile checkout: CTA sticky bawah **boleh** asal ringkasan total terlihat dan tidak menutupi field/keyboard.

### 9.5 Payment status dan status pesanan

- **Pembayaran otomatis** wajib memakai halaman status yang mencerminkan data server/gateway, bukan mengasumsikan redirect browser berarti lunas.
- `pending`: ikon jam + “Menunggu konfirmasi pembayaran”.
- `paid`: ikon cek + “Pembayaran terkonfirmasi”.
- `failed/expired`: pesan dan opsi aman.
- `fulfillment_exception`: info tindakan dukungan, bukan badge hijau menyesatkan.
- Timeline `Dibayar → Disiapkan → Dikirim → Diterima`, dengan cabang `Preorder diproses` atau `Dikonfirmasi mitra` jika relevan.
- Nomor resi hanya ditampilkan jika benar-benar ada.

### 9.6 Navigation, search, filters

- Desktop: logo, pencarian, katalog/kategori, promo (jika ada), akun, keranjang. Sticky header boleh, tidak mengonsumsi area layar berlebihan.
- Mobile: top bar logo/search/cart + bottom nav (Beranda/Kategori/Cari/Keranjang/Akun) di layar browse; checkout dan pembayaran memakai layout lebih fokus tanpa bottom nav penuh.
- Search: keyboard enter mengeksekusi; hasil kosong beri saran kategori, clear query yang jelas.
- Filter: mobile drawer dengan Apply/Reset; desktop sidebar atau horizontal row.
- Selalu tampilkan indikator filter aktif dan hasil pencarian.

### 9.7 Cart, coupon, modals dan notifications

- Cart item: foto, nama/varian, harga, kuantitas, hapus, info ketersediaan, mode asal/ETA bila relevan.
- Bila keranjang punya **kelompok fulfillment/asal tak kompatibel**, tampilkan panel “Pesanan perlu dipisah” dengan kelompok jelas dan tombol lanjut ke checkout per kelompok; jangan menampilkan satu total ongkir palsu.
- Coupon: field + `Terapkan`, status memenuhi syarat/tidak, harga sesudah diskon.
- Modal konfirmasi hanya untuk aksi penting (hapus staf, batalkan pesanan, refund); modal harus punya focus management.
- Toast: tindakan ringan, non-blocking, auto-dismiss yang cukup lama dan bisa dibaca.
- Empty state: judul membantu + satu CTA nyata; tidak perlu ilustrasi berlebihan.

### 9.8 Admin components

- Dashboard: KPI ringkas (order pending, paid perlu proses, SKU bermasalah, refund pending), timestamp/periode, link ke antrian tindakan.
- Tabel: sorting yang jelas, filter status, pagination, overflow horizontal pada viewport kecil **dengan opsi card view**.
- Editor produk: field dinamis per kategori; varian; jenis fulfillment; source; kapasitas/stock; estimasi; pratinjau produk sebelum publish.
- Panel supplier internal (SCR-022): daftar pemasok, kota asal, validasi stok/kuota, waktu verifikasi, warning stale. **Tidak** dipublikasikan sebagai halaman seller.
- Refund: dialog alasan/nominal/approval dan status provider; warna tidak menggantikan bukti.
- Audit: actor, time, event, object, reason; data sensitif minimal.

## 10. Interaction, Motion, dan Feedback

| Komponen | Durasi [USULAN] | Efek |
|---|---|---|
| Hover button | 120–160ms | Warna, bukan scale agresif |
| Hover product card | 160–200ms | Lift 2px/shadow halus |
| Drawer/filter/cart | 180–240ms | Translate + opacity |
| Inline validation | 100–150ms | Muncul tanpa menggoyang layout |
| Page loading | Tidak pakai delay palsu | Skeleton stabil sesuai foto/card |

- Hormati `prefers-reduced-motion: reduce`: nonaktifkan transform/transisi non-esensial.
- Jangan menggunakan auto-rotating carousel sebagai media utama untuk instruksi checkout.
- Jangan blok UI menunggu toast sukses bila aksi belum terkonfirmasi server.
- Loading payment: tulis “Memeriksa status pembayaran…”, dengan akses bantuan bila lama.

## 11. Responsive Behavior dan Navigasi

### 11.1 Breakpoints [USULAN]

- Small mobile: `320–359px` (satu product card/row, form penuh, tombol penuh).
- Mobile: `360–767px` (dua product cards, filters drawer, sticky total checkout).
- Tablet: `768–1023px` (tiga product cards, header compact).
- Desktop: `≥1024px` (empat product cards, side filter, dua kolom checkout, sidebar admin).
- Wide desktop: `≥1440px` (container maksimal 1200px; whitespace di samping).

### 11.2 Halaman khusus

- **PDP:** mobile foto carousel → ringkasan → varian → size guide → ETA + shipping info → CTA sticky sesuai layout; desktop foto kiri 55% + detail kanan 45%.
- **Cart:** mobile daftar vertikal dan sticky lanjut; desktop item list + order summary kanan.
- **Checkout:** form step-by-step yang jelas; jangan memaksa login; kembali ke langkah sebelumnya mempertahankan input.
- **Order status:** timeline vertikal dan link aman.
- **Admin:** sidebar collapsible desktop, header/top action mobile, card view untuk tabel kecil.

### 11.3 Navigation & breadcrumbs

- Breadcrumb untuk kategori/PDP, tetapi tidak mengambil dua baris pada mobile.
- Fokus pada tahap checkout dan tombol kembali yang mempertahankan input.
- Halaman legal/FAQ ditempatkan di footer, juga tautan kontekstual dekat checkout.
- Footer harus menyediakan kontak dan kebijakan yang benar **setelah owner mengisinya**.

## 12. Accessibility dan Inclusive Design

**Target:** WCAG 2.2 AA sebagai baseline pengujian utama. Prinsip spesifik:

1. Teks normal minimal kontras **4,5:1**; teks besar **3:1**; batas komponen/indikator non-teks penting **3:1**.
2. Focus-visible tegas dan tak terpotong; semua fungsi penting bisa lewat keyboard.
3. Target sentuh minimum praktis **44×44px** untuk tombol/action kritis, dengan jarak memadai; exception hanya bila disetujui saat audit.
4. Form memakai label yang tetap terlihat, pesan error dengan teks, `aria-describedby`/hubungan semantik saat implementasi.
5. Jangan menandakan preorder/stock/pembayaran/size hanya melalui warna atau ikon.
6. Heading `h1` tunggal per halaman; heading berikutnya hierarkis.
7. Alt foto menjelaskan motif, warna, model pakaian secara jujur; gambar dekoratif alt kosong.
8. Zoom 200–400% tidak memotong kemampuan inti; formulir tidak bergantung drag/gesture eksklusif.
9. Motion dikurangi sesuai preferensi; modals menjaga fokus serta menyediakan cara keluar yang aman.
10. Bagi pembaca layar, harga lama/harga promo dan pilihan varian memiliki label eksplisit yang tidak ambigu.

**Pemeriksaan kontras final:** gunakan warna **dan** kombinasi latar sebenarnya, termasuk palet info/error, tombol disabled, foto banner, filter pills. Jangan menganggap tabel nilai HEX sudah otomatis memenuhi semua kondisi.

## 13. Content, Microcopy, dan Lokalisasi

### 13.1 Bahasa

- Bahasa Indonesia ramah, sopan, pendek, tidak terlalu santai.
- Gunakan panggilan netral “kamu” pada storefront atau “Anda” pada komunikasi resmi jika owner memilih konsistensi; **[USULAN]** gunakan “kamu” pada belanja, gaya profesional netral pada admin.
- Hindari menyebut “gratis ongkir”, “besok sampai”, “stok tinggal 2”, atau “aman 100%” kecuali berdasarkan data sah.

### 13.2 Contoh teks produk untuk Stitch — DATA FIKTIF

| Nama contoh | Harga contoh | Varian contoh | Status contoh |
|---|---:|---|---|
| Daster Katun Motif Bunga | Rp89.000 | Navy / L | Ready stock |
| Daster Jumbo Rayon | Rp109.000 | Maroon / Jumbo | Ready stock |
| Setelan Rumah Lengan Pendek | Rp129.000 | Sage / XL | Preorder — estimasi 5–8 hari kerja |
| Piyama Wanita Katun | Rp149.000 | Cream / M | Dikirim dari mitra — konfirmasi ketersediaan |
| Tunik Santai Rayon | Rp119.000 | Dusty Pink / L | Ready stock |

**Penting:** ini hanyalah *content seed* untuk mockup, bukan inventaris, harga, komitmen supplier, SKU, atau SLA yang sebenarnya. Jika data mode belum terkonfirmasi, gunakan “Ilustrasi contoh — belum tersedia untuk pembelian” pada mockup internal.

### 13.3 Microcopy transaksi

| Situasi | Contoh |
|---|---|
| Tambah keranjang | “Ditambahkan ke keranjang.” |
| Size guide | “Lihat panduan ukuran sebelum memilih.” |
| Habis | “Varian ini sedang habis. Pilih warna atau ukuran lain.” |
| Preorder | “Produk ini preorder. Estimasi disiapkan 5–8 hari kerja (contoh).” |
| Dari pemasok | “Ketersediaan barang akan dikonfirmasi sebelum pembayaran.” |
| Campuran asal | “Produk ini perlu checkout terpisah agar ongkirnya akurat.” |
| Ongkir belum tersedia | “Belum ada kurir aktif untuk alamat ini. Coba alamat lain atau hubungi bantuan.” |
| Pembayaran tertunda | “Kami masih memeriksa konfirmasi pembayaran. Jangan bayar ulang dulu.” |
| Sudah dibayar | “Pembayaran terkonfirmasi. Kami mulai menyiapkan pesananmu.” |
| Kendala pemenuhan | “Ada kendala dalam menyiapkan pesanan. Tim kami akan menghubungimu untuk pilihan solusi.” |
| Error umum | “Ada kendala memuat halaman. Coba lagi.” |

### 13.4 Content safety/trust

- Alamat, nomor WA, domain, slogan diskon, testimoni, rating dan nama admin jangan diisi dengan identitas nyata yang belum diberikan.
- Klaim stok dan review harus berasal dari data.
- Informasi pengiriman nasional harus punya catatan “Tergantung jangkauan kurir, asal kirim, dan alamat tujuan.”
- FAQ minimal: cara ukuran, mode pemenuhan, pembayaran otomatis, ongkir, status pesanan, retur/refund, privasi.

## 14. E-commerce Platform Patterns

### 14.1 Trust signals

- Penjelasan toko yang singkat, kontak resmi, kebijakan pembayaran/pengiriman/retur terlihat, info keamanan dengan klaim moderat.
- Harga final tidak berubah tiba-tiba pada langkah pembayaran.
- Pelanggan memahami apa yang dibeli **per SKU** dan dari mode apa barang akan disiapkan.
- Jangan tampilkan fake trust badge atau logo pembayaran/kurir yang belum terintegrasi.

### 14.2 Operational combination

- Mode `ready_stock`: label “Ready stock”; stok dari sumber internal; ETA pemrosesan aktual.
- Mode `preorder`: label “Preorder”; rentang estimasi proses yang disetujui; kuota/kapasitas dan aturan pembatalan.
- Mode `supplier_fulfilled`: label “Dikirim dari mitra”; tampilkan ketersediaan hanya jika dikonfirmasi pemasok.
- **Tidak semua mode harus diaktifkan saat MVP.** Template komponen disiapkan, aktivasi sesuai keputusan OD-002.
- **Keranjang campuran:** kelompok asal/mode tak kompatibel menghasilkan checkout terpisah agar ongkir dan status tidak palsu. Jangan menyajikan combined total sebagai satu pembayaran jika belum didukung PRD.
- Pemrosesan `awaiting_supply`/`supplier_confirmed` harus bisa ditampilkan tanpa mengklaim barang “sudah dikirim”.

### 14.3 System states

Setiap screen kritis harus memuat:
`initial`, `loading/skeleton`, `populated`, `empty`, `validation_error`, `network_error`, `unauthorized/expired` (bila relevan), `disabled`, `success`, dan `edge/domain_specific`. Tidak perlu membuat semua variasi visual sebagai layar terpisah jika prompt Stitch dapat menjabarkan component variants.

### 14.4 SEO

- H1 unik; navigasi kategori deskriptif; breadcrumb, metadata, alt, structured product data **hanya dari harga/stok/ulasan faktual**.
- Hindari teks SEO yang panjang di atas tombol beli.
- Produk tidak aktif atau varian tak tersedia tidak boleh tampak dapat dibeli karena komponen mockup.

## 15. Screen-by-Screen Design Contract

| SCR | Nama | Fokus komposisi | Komponen/empty/error/edge wajib | FR |
|---|---|---|---|---|
| SCR-001 | Beranda | Hero kurasi, kategori daster/pakaian wanita, grid unggulan, info toko | Placeholder foto, empty koleksi, CTA katalog | FR-001, FR-006, FR-013 |
| SCR-002 | Katalog dan pencarian | Search, filter/sort, grid product card | No-results, filter aktif, stok/mode badge, load error | FR-002–FR-005, FR-067 |
| SCR-003 | Detail produk | Galeri 4:5, harga, varian, size, bahan, ETA, CTA | Varian habis, preorder, mitra, invalid selection, foto tidak ada | FR-006–FR-010, FR-066–FR-068 |
| SCR-004 | Keranjang | Item/varian/qty dan summary | Empty cart, harga/stok berubah, split origin/mode | FR-011–FR-014, FR-070 |
| SCR-005 | Checkout: pembeli/alamat | Stepper minimal, form label jelas | Guest, error alamat, input tersimpan, validasi | FR-015–FR-018 |
| SCR-006 | Checkout: pengiriman/summary | Layanan kurir, ongkir, ETA pemrosesan vs transit, total final | Ongkir timeout, lokasi tidak terlayani, split origin | FR-019–FR-022, FR-070–FR-072 |
| SCR-007 | Payment | Jumlah bayar, instruksi dari gateway, countdown jika sah | Pending/failed/expired/verified, jangan fake paid | FR-023–FR-026, FR-077 |
| SCR-008 | Detail/status pesanan | Timeline order, item snapshot, resi, bantuan | Guest token expired, preorder/supplier states, refund | FR-027–FR-030, FR-076 |
| SCR-009 | Masuk/daftar | Minimal, secondary untuk customer | Invalid credentials, reset, loading, anti-abuse | FR-031–FR-034 |
| SCR-010 | Akun/pesanan/alamat | Ringkasan pesanan dan alamat | Empty orders, data milik sendiri, edit/validasi | FR-035–FR-037 |
| SCR-011 | FAQ/kontak/kebijakan | Navigasi topik, accordion sederhana, kontak resmi | Empty FAQ, policy belum terbit, kanal bantuan | FR-038–FR-040 |
| SCR-012 | Dashboard admin | KPI dan antrean tindakan | Empty sales, alert, pemisahan role, loading | FR-041, FR-058 |
| SCR-013 | Admin katalog | Listing SKU, editor kategori/varian/foto/mode | Publish validation, stock conflict, stale supplier flag | FR-042–FR-047, FR-066–FR-069 |
| SCR-014 | Admin pesanan | List/filter, detail, picking/fulfillment, resi | State ilegal, preorder, supplier exception, cancel/refund | FR-048–FR-053, FR-074–FR-076 |
| SCR-015 | Admin promosi/konten | Editor banner/coupon, validity | Expired promo, validation error, preview | FR-054–FR-055 |
| SCR-016 | Admin finance/refund | Payment ledger, case, reconciliation | No permission, mismatch, refund failure | FR-056–FR-057 |
| SCR-017 | Admin akses/config/audit | Role permissions, settings, audit | Denied, double confirmation, dangerous action | FR-059–FR-061 |
| SCR-018 | Error/404/maintenance | Pesan aman, link kembali | Error 403/404/500/maintenance tanpa debug | FR-062 |
| SCR-019 | Wishlist (post-MVP) | Simpan/batal simpan | Guest behavior, stok berubah | FR-063 |
| SCR-020 | Reviews (post-MVP) | Ulasan verified jika ada | Empty/no verified, report/spam | FR-064 |
| SCR-021 | Panduan ukuran/bahan (post-MVP) | Size chart adaptif, bahan/care | Data kategori kosong, link ke PDP | FR-065 |
| SCR-022 | Admin sumber pemenuhan | Source/supplier table, origin, kuota dan SLA | Stale availability, disabled mode, approval | FR-073–FR-075 |

**Prioritas generasi Stitch:** SCR-001 → SCR-002 → SCR-003 → SCR-004 → SCR-005 → SCR-006 → SCR-007 → SCR-008 → SCR-011 → SCR-009 → SCR-010 → SCR-012 → SCR-013 → SCR-014 → SCR-022 (bila mode terkait aktif) → SCR-015 → SCR-016 → SCR-017 → SCR-018 → post-MVP SCR-019/020/021. Admin bisa memakai design tokens yang sama namun density lebih tinggi.

## 16. Do dan Don't

| DO | DON'T |
|---|---|
| Pakai satu primary action per zona | Banyak tombol plum primer berebut perhatian |
| Foto produk nyata dan varian akurat | Mengarang warna/motif yang tidak tersedia |
| Desain bersih dengan whitespace | Banner/flash-sale berlapis yang mengganggu |
| Informasi mode dan estimasi jelas | Tulis semua produk “ready stock” |
| Tonjolkan total biaya sebelum bayar | Menyembunyikan ongkir sampai setelah bayar |
| Gunakan warna semantik + teks/ikon | Status hanya warna |
| Guest checkout praktis | Memaksa pembuatan akun untuk membeli tanpa keputusan bisnis |
| Tampilkan payment **pending** sampai diverifikasi | Mengklaim `paid` hanya karena redirect sukses |
| Buat dashboard audit-friendly | Menggabungkan payment/fulfillment/refund jadi satu status ambigu |
| Copy hangat namun faktual | Fake review, stok palsu, “gratis ongkir Indonesia” tanpa syarat |
| Pertahankan input saat langkah checkout mundur | Menghapus alamat saat pembayaran gagal |
| Screen state lengkap | Hanya mockup “happy path” |

## 17. Design QA Checklist

### 17.1 Brand

- [ ] Nama `Daster Tasbon Shop` konsisten, arah A/B/C telah diputuskan owner.
- [ ] Logo/wordmark disetujui atau jelas masih placeholder.
- [ ] Palet semantik dan typography disepakati, tanpa campur B/C.
- [ ] Foto asli dan lisensinya jelas sebelum publikasi.

### 17.2 Storefront dan transaksi

- [ ] Produk daster **dan** fashion wanita lain dapat dideskripsikan tanpa field tidak relevan.
- [ ] Harga/varian/ukuran/bahan terlihat pada PDP.
- [ ] Semua mode fulfillment yang **aktif** memiliki label ketersediaan dan estimasi yang jujur.
- [ ] Mode supplier stale/preorder unavailable **tidak** bisa dibayar.
- [ ] Cart campuran asal/mode incompatible menunjukkan split checkout.
- [ ] Checkout menampilkan ongkir aktual dan total akhir sebelum tombol bayar.
- [ ] Payment verified, pending, failed, expired berbeda secara jelas.
- [ ] Tracking/resi tidak muncul sebelum ada referensi valid.
- [ ] Kebijakan dan dukungan bisa ditemukan.

### 17.3 Technical/accessibility handoff

- [ ] Token warna punya peran semantik; kontras layout nyata diuji.
- [ ] Layout 320/360/768/1024/1440px sudah diperiksa.
- [ ] Semua tombol kritis berukuran memadai; fokus keyboard terlihat.
- [ ] Loading/empty/error/success/disabled dapat diamati.
- [ ] Admin role dan data pribadi tidak dibocorkan pada mockup.
- [ ] Data mockup fiktif diberi label sampel.
- [ ] Semua screen kritis terhubung dengan FR dan edge case dalam PRD.

## 18. Kontrak Prompt Google Stitch

### 18.1 Global design context — disalin pada setiap batch prompt

```text
PROJECT: Daster Tasbon Shop.
PRODUCT: Indonesian mobile-first, single-store e-commerce for daster and other women's clothing.
OPERATIONS: Combination fulfillment; exact live modes not confirmed. Proposed UI states: ready stock, preorder, supplier fulfilled. Never present unverified stock as available. In MVP, incompatible fulfillment origins/modes use separate checkout orders.
PAYMENT: Checkout and automated payment on the website; provider not chosen. Never fake paid status from UI redirect.
SHIPPING: Target all Indonesia, only available when real courier coverage and shipping quote exist.
VISUAL DIRECTION [PROPOSED]: Warm Modern Feminine — ivory #FFF9F5, white surfaces #FFFFFF, berry plum primary #813A56, hover #672B44, text #292126, secondary #6D5B64, light rose #FAEBF0.
TYPE: Plus Jakarta Sans for UI, DM Serif Display only optional for hero; strong accessible hierarchy.
GRID: mobile-first, 1 card <360px, 2 cards 360–767, 3 cards 768–1023, 4 cards >=1024. Max container 1200px.
STYLE: warm, simple, truthful, product-led, tasteful; rounded 12–16px, subtle elevation, clear labels, no clutter.
ACCESSIBILITY: WCAG 2.2 AA target, strong focus states, accessible field labels, 44px critical touch targets, never use color alone.
CONTENT: Bahasa Indonesia, prices in IDR, realistic but fictional product sample data clearly marked.
BRAND ASSET: Logo is not provided; show a clearly temporary typographic wordmark, do not invent an approved logo.
AVOID: Multi-vendor seller features, invented payment provider/discounts/testimonials/real contact details, misleading shipping guarantees, checkout by WhatsApp, fake stock or fake verified payment.
```

### 18.2 Template untuk prompt per layar

Setiap prompt final harus memuat:
1. **ID SCR, role, tujuan, FR PRD, ukuran device**.
2. Hirarki komposisi, layout, CTA, komponen dan format data lokal realistis.
3. States: initial/populated/loading/empty/validation_error/success/disabled/unauthorized, yang relevan.
4. Interaksi: klik/pilih/submit/back dengan perubahan yang seharusnya terlihat; **hanya rancangan UI**, bukan bukti sistem sudah bekerja.
5. Responsif: bagaimana susunan berubah pada 360px, 768px, 1280px; target 320px tetap aman.
6. Aksesibilitas: label, kontras, focus, keyboard, ukuran target, alt.
7. Konsistensi visual: gunakan token global tanpa membuat varian style lokal yang konflik.
8. **Avoid list**: jangan mengarang data penting, supplier, kurir, gateway, diskon, testimoni, payment success.

### 18.3 Tahap kerja berikutnya

**Setelah ACC DESIGN.md:** buat prompt **satu layar per respons** di Guided Mode, dimulai SCR-001 Beranda, lalu audit hasil Google Stitch untuk critical/major/polish sebelum SCR-002. Jika owner secara eksplisit meminta mode Auto/“langsung buat semua”, prompts dapat disiapkan sekaligus sebagai paket tanpa gate.

## 19. Keputusan Terbuka, Risiko, dan Riwayat

### 19.1 Known–Assumed–Unknown

| ID | Status | Keputusan |
|---|---|---|
| DEC-01 | **Confirmed** | Jual daster dan pakaian wanita lainnya. |
| DEC-02 | **Confirmed + details open** | Operasional kombinasi; mode persis, supplier, origin, kuota dan SLA belum final. |
| DEC-03 | **Confirmed** | Pembayaran otomatis dalam checkout website. |
| DEC-04 | **Confirmed + limitations** | Pengiriman target seluruh Indonesia; coverage kurir nyata masih harus diverifikasi. |
| DEC-05 | **Confirmed** | Belum ada identitas visual yang dimiliki; buat usulan baru. |
| DEC-06 | **Proposed** | Arah A — Warm Modern Feminine; palet plum/ivory. |
| DEC-07 | **Proposed** | Wordmark `Daster Tasbon` + sublabel `SHOP`, ikon kain/T opsional. |
| DEC-08 | **Proposed** | Plus Jakarta Sans + DM Serif Display terbatas untuk hero. |
| DEC-09 | **Open** | Foto produk/aset, kategori riil, sasaran harga, target pelanggan dan volume SKU. |
| DEC-10 | **Open — blocker build/launch** | Lokasi usaha dan supplier, penyedia pembayaran, penyedia ongkir, kebijakan retur/preorder, ketersediaan merchant dan legal. |

### 19.2 Risiko desain

- **RISK-DES-01 — brand terlalu generik:** kurangi melalui komposisi editorial, microcopy unik dan fotografi konsisten, bukan memperbanyak dekorasi.
- **RISK-DES-02 — persepsi stok/ETA salah:** badge berbasis data dan copy terpisah untuk ETA persiapan vs pengiriman.
- **RISK-DES-03 — mockup menyesatkan tentang pembayaran:** tampilkan gateway integration sebagai placeholder desain jika provider belum dipilih; jangan berpura-pura benar-benar dibayar.
- **RISK-DES-04 — aksesibilitas pastel:** simpan pastel untuk background, gunakan teks dan aksi berkontras tinggi.
- **RISK-DES-05 — banyak kategori menyebabkan IA kacau:** kategorikan dari model pakaian dan kegunaan, bukan promosi yang berubah-ubah.

### 19.3 Riwayat

| Versi | Tanggal | Catatan |
|---|---|---|
| 1.0 | 2026-10-09 | DESIGN foundation baru berdasarkan PRD v1.1, tiga arah visual (A direkomendasikan), token, komponen, responsif, WCAG, 22 screen contract, dan handoff Google Stitch. **Menunggu ACC owner.** |
