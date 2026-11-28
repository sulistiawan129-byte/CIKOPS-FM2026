# Label Loker (24 label / A4)

Modul `modLokerLabel.bas` membuat label kecil untuk tiap loker dari sheet **Master**
lalu menyimpannya sebagai PDF. Satu halaman A4 = 3 kolom x 8 baris = 24 label,
dengan jarak potong 4 mm antar label dan garis tepi tipis sebagai panduan gunting
(hasil cetak tiap label kira-kira 56 x 29 mm).

Isi label:

| Bagian | Sumber kolom Master |
|---|---|
| Strip atas `BLOK BS / SLOT 3` | BLOK, NO.SLOT KUNCI |
| Angka besar "NOMOR LOKER" | NO.URUT PINTU |
| `NO. KUNCI : 123` | NO.KUNCI |

## Pasang

1. Import `modLokerLabel.bas` (Alt+F11 -> File -> Import File).
2. Tambahkan fungsi ini ke **modLokerSearch** (di mana saja, misalnya paling bawah).
   Fungsinya memberi daftar baris hasil pencarian ke modul label:

```vb
' nomor baris sheet Master dari hasil pencarian saat ini (Empty jika tidak ada)
Public Function LK_BarisHasil() As Variant
    Dim a() As Long, i As Long
    If gHitCount = 0 Then Exit Function
    ReDim a(1 To gHitCount)
    For i = 1 To gHitCount
        a(i) = gHits(i) + 1
    Next i
    LK_BarisHasil = a
End Function
```

3. (Opsional) tombol **LABEL** di dashboard - di **modLokerDash**, sub `GambarDashboard`,
   ganti 5 baris `Pil ws, "b_cari" ...` s/d `Pil ws, "b_segar" ...` dengan:

```vb
    Pil ws, "b_cari", 500, sy + 3, 78, 30, "LK_Cari", RGB(21, 101, 192), RGB(10, 47, 107), "CARI", RGB(255, 255, 255), 10, ChrW(&HE721)
    Pil ws, "b_reset", 584, sy + 3, 74, 30, "LK_Reset", RGB(232, 240, 252), RGB(232, 240, 252), "RESET", RGB(10, 47, 107), 9.5, ChrW(&HE72C)
    Pil ws, "b_export", 664, sy + 3, 80, 30, "LK_Export", RGB(15, 138, 95), RGB(10, 100, 70), "EXPORT", RGB(255, 255, 255), 9.5, ChrW(&HE896)
    Pil ws, "b_tambah", 750, sy + 3, 80, 30, "LK_Tambah", RGB(91, 63, 191), RGB(60, 40, 150), "TAMBAH", RGB(255, 255, 255), 9.5, ChrW(&HE710)
    Pil ws, "b_label", 836, sy + 3, 74, 30, "LK_CetakLabel", RGB(224, 122, 0), RGB(170, 90, 0), "LABEL", RGB(255, 255, 255), 9.5, ChrW(&HE749)
    Pil ws, "b_segar", 916, sy + 3, 84, 30, "LK_Segarkan", RGB(232, 240, 252), RGB(232, 240, 252), "SEGARKAN", RGB(10, 47, 107), 9.5, ChrW(&HE895)
```

   Di sub `PasangIkonKecil`, tambahkan `"b_label"` ke daftar Array, dan di
   `HapusDashboardLoker` ubah `Array(DASH_SHEET, DATA_SHEET)` menjadi
   `Array(DASH_SHEET, DATA_SHEET, "LK_Label")`.

4. Debug -> Compile VBAProject, lalu jalankan `LK_SesuaikanUkuran` supaya tombol baru muncul.

## Pakai

Klik **LABEL** (atau Alt+F8 -> `LK_CetakLabel`; `LK_CetakLabelBlok` = langsung pilih blok):

1. Pilih **YES** = hanya hasil pencarian yang sedang tampil, atau **NO** = pilih blok.
   (Kalau belum ada hasil pencarian, langsung ke pilihan blok.)
2. **Pilih blok**: muncul daftar blok + jumlah lokernya, mis. `BS (24),  BT (30),  C (18)`.
   Ketik blok yang mau dicetak dipisah koma, mis. `BS, C`, atau `SEMUA`.
   Label diurutkan per blok sesuai urutan yang diketik, lalu Slot > Pintu > No. kunci,
   jadi tiap blok rapi berurutan di lembar stiker.
3. Isi posisi awal (1-24) - berguna kalau lembar stiker sudah terpakai sebagian.
4. Pilih lokasi simpan PDF. PDF langsung terbuka.

Saat mencetak, pilih **Actual size / 100%** (bukan *Fit to page*), lalu gunting di
jarak antar label. Ukuran label, jarak potong, margin dan skala cetak (`ZOOM_CETAK`)
bisa diubah lewat konstanta di bagian atas `modLokerLabel.bas`.

## Label induk BLOK (4 per A4)

Label besar untuk ditempel di tiap blok loker (desain: `docs/preview-label-blok/opsi-B.png`).
Satu lembar A4 dibagi 4 (kira-kira 10 x 14 cm per label), dengan garis potong putus-putus.

Isi label: `LOKER KARYAWAN` / `PLANT CIKARANG`, tulisan kecil `BLOK`, **kode blok sangat besar**
(ukuran huruf menyesuaikan panjang nama blok), ringkasan `24 loker - Slot 101-112 - Hook 1-24`
(dihitung otomatis dari Master), lalu footer:

> Jika **kunci loker hilang atau rusak**, silakan hubungi **Facility Management Department**.
> FM DEPT. - PT FRISIAN FLAG INDONESIA

Cara pakai: klik **LABEL** -> pilih **NO** (label induk blok), atau Alt+F8 -> `LK_CetakLabelIndukBlok`.
Ketik blok yang mau dicetak (`AA, BS` atau `SEMUA`), simpan PDF.

Bisa diatur lewat konstanta `LB_...` di `modLokerLabel.bas`:
`LB_SUBJUDUL` (isi `""` untuk menghilangkan "PLANT CIKARANG"), `LB_TULIS_BLOK` (tulisan kecil "BLOK"),
`LB_RINGKASAN` (baris jumlah loker / slot / hook), `LB_FONT_BESAR` (font kode blok).
