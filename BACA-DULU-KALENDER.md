# Kalender & Agenda — tersinkron dengan Penugasan Driver

## Wajib (sekali saja)
Supabase CIKOPS → SQL Editor → jalankan `supabase/025_kalender_agenda.sql`.
Skrip ini menambah kolom jenis agenda, jam selesai, PIC, catatan, dan tautan penugasan, serta izin UBAH.
Aman dijalankan ulang, dan agenda lama tetap ada (jenisnya menjadi "Event").
Sebelum skrip dijalankan, kalender tetap bisa dipakai, tetapi jenis/catatan/PIC tidak tersimpan.

## Yang baru
- Menu **Sistem → Kalender** (`/dashboard/calendar`): kalender bulan penuh.
  - Agenda dan penugasan driver tampil di tiap tanggal.
  - Filter per jenis.
  - Panel tanggal terpilih dan daftar agenda mendatang.
- **Agenda CRUD**:
  - Jenis: Kunjungan, Event, Meeting, Pelatihan, Libur, Lainnya.
  - Isian: judul, tanggal, jam mulai–selesai, lokasi, PIC, catatan.
  - Ubah dengan klik agendanya; hapus dengan tombol 🗑 atau tombol Hapus di formulir.
- **Sinkron penugasan driver**:
  - Penugasan (tasks_detail) muncul otomatis di tanggalnya dan diperbarui tiap 60 detik, termasuk statusnya (Ditugaskan/Berjalan/Selesai/Batal).
  - Agenda bisa **ditautkan** ke penugasan, misalnya kunjungan tamu yang dijemput driver. Status penugasan ikut tampil di agenda.
  - Tombol **+ Agenda** di penugasan membuat agenda kunjungan yang sudah terisi dari data penugasan.
  - **Buka di Penugasan →** membuka menu Penugasan langsung pada tanggal tersebut.
- Home (kolom kanan) memakai kalender yang sama dalam versi ringkas, dengan tautan "Kalender lengkap →".

## File
- Baru:
  - `src/app/dashboard/CalendarAgenda.tsx`
  - `src/app/dashboard/calendar.module.css`
  - `supabase/025_kalender_agenda.sql`
- Berubah:
  - `src/app/dashboard/page.tsx`
  - `src/lib/api.ts`
  - `src/lib/types.ts`
  - `src/components/Icon.tsx`
