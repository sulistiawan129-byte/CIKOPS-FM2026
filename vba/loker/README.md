# Label Loker (24 label / A4)

Modul `modLokerLabel.bas` membuat label kecil untuk tiap loker dari sheet **Master**
lalu menyimpannya sebagai PDF. Satu halaman A4 = 3 kolom x 8 baris = 24 label
(63,5 x 33,9 mm, cocok untuk kertas stiker 3x8 seperti Avery L7159 / sejenis).

Isi label:

| Bagian | Sumber kolom Master |
|---|---|
| Strip atas `BLOK BS / SLOT 3` | BLOK, NO.SLOT KUNCI |
| Angka besar "NOMOR LOKER (HOOK)" | NO.URUT PINTU |
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

Saat mencetak, pilih **Actual size / 100%** (bukan *Fit to page*).
Ukuran label, margin, dan tinggi tiap baris bisa diubah lewat konstanta di bagian
atas `modLokerLabel.bas` kalau kertas stiker berbeda. Lakukan satu kali cetak uji di
kertas biasa lalu tumpuk dengan lembar stiker untuk cek posisinya.
