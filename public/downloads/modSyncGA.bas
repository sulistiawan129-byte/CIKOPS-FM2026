Attribute VB_Name = "modSyncGA"
Option Explicit

' ============================================================
' modSyncGA - Sinkron Sistem Laporan GA (Cleaning, Gardening, TGA)
'             Excel  ->  CIKOPS (satu arah, CIKOPS hanya menampilkan)
'
' Yang dikirim:
'   - DB_PEKERJAAN & DB_MANPOWER (tanpa No. HP)        -> cermin penuh
'   - DATA_PLAN_ACTUAL per periode (bulan)              -> plan + actual
'   - EVENT, IMPROVEMENT, INVENTORY, TGA                -> cermin penuh
'   (Foto / dokumentasi TIDAK dikirim, hanya nama file-nya.)
'
' Kapan:
'   - OTOMATIS setelah Simpan Actual, Generate Plan, Hapus Plan
'     (dipanggil dari modGA versi 1.7).
'   - MANUAL lewat tombol "Sinkron CIKOPS" di MENU (macro SinkronKeCIKOPS).
'   - Kalau sedang offline: data dicatat di antrean (sheet GA_SYNC) lalu
'     dicoba lagi otomatis tiap 10 menit selama file terbuka, dan saat
'     file dibuka berikutnya.
'
' Aman dari beberapa PC: actual dari salinan file yang lebih lama tidak
' menimpa actual yang lebih baru (dibandingkan dari kolom Waktu Input).
' Untuk membatasi PC yang boleh sinkron, isi daftar nama komputer di
' sheet GA_SYNC sel B7 (kosong = semua PC boleh).
'
' PASANG:
'   1. Alt+F11 -> File -> Import File -> modSyncGA.bas
'   2. Isi 3 konstanta di bawah (URL & anon key sama dengan modul ATK,
'      GA_SYNC_KEY dari hasil SQL 027_ga_facility.sql atau dari CIKOPS:
'      Fasilitas -> Cleaning, Gardening & TGA -> tab Sinkron).
'   3. Import juga modGA versi 1.7 (sudah berisi pemanggilan otomatis),
'      lalu jalankan Setup_Tombol sekali.
' ============================================================

' -- KONFIGURASI --
Private Const SUPABASE_URL As String = "https://xxxxxxxxxxxx.supabase.co"
Private Const SUPABASE_ANON_KEY As String = "isi-anon-key-di-sini"
Private Const GA_SYNC_KEY As String = "isi-kunci-sinkron-ga-dari-cikops"

Private Const SH_SYNC As String = "GA_SYNC"
Private Const CHUNK As Long = 400
Private Const RETRY_MENIT As Long = 10

Private mJadwal As Date


' ============================================================
' TOMBOL MANUAL
' ============================================================
Public Sub SinkronKeCIKOPS()
    Dim pilih As VbMsgBoxResult, per As String
    If Not KonfigurasiOK(True) Then Exit Sub
    If Not PCBoleh() Then
        MsgBox "Komputer ini (" & NamaPC() & ") tidak termasuk daftar PC yang boleh sinkron (sheet GA_SYNC sel B7).", vbExclamation, "Sinkron CIKOPS"
        Exit Sub
    End If
    pilih = MsgBox("Kirim data ke CIKOPS sekarang?" & vbCrLf & vbCrLf & _
                   "YES  = bulan ini & bulan lalu (cepat)" & vbCrLf & _
                   "NO   = SEMUA periode plan (lengkap, lebih lama)" & vbCrLf & _
                   "Cancel = batal" & vbCrLf & vbCrLf & _
                   "Master, Event, Improvement, Inventory & TGA selalu ikut dikirim.", _
                   vbQuestion + vbYesNoCancel, "Sinkron CIKOPS")
    If pilih = vbCancel Then Exit Sub
    If pilih = vbYes Then
        per = Format(Date, "yyyymm") & "," & Format(DateSerial(Year(Date), Month(Date) - 1, 1), "yyyymm")
    Else
        per = SemuaPeriode()
    End If
    TandaiTertunda per, True, True

    Dim hasil As String
    Application.Cursor = xlWait
    hasil = KirimTertunda(False)
    Application.Cursor = xlDefault
    If Left(hasil, 2) = "OK" Then
        MsgBox "Sinkron ke CIKOPS berhasil." & vbCrLf & vbCrLf & Mid(hasil, 4), vbInformation, "Sinkron CIKOPS"
    Else
        MsgBox "Sinkron belum berhasil:" & vbCrLf & hasil & vbCrLf & vbCrLf & _
               "Data tetap disimpan di antrean dan akan dicoba lagi otomatis.", vbExclamation, "Sinkron CIKOPS"
    End If
End Sub

' Status singkat (untuk MENU / informasi)
Public Sub StatusSinkronCIKOPS()
    MsgBox LabelStatus(True), vbInformation, "Status Sinkron CIKOPS"
End Sub


' ============================================================
' DIPANGGIL OTOMATIS OLEH modGA
' ============================================================
' periodes: daftar yyyymm dipisah koma; "" = ambil dari minggu di INPUT_ACTUAL
Public Sub GASync_Otomatis(Optional ByVal periodes As String = "")
    On Error GoTo Selesai
    If Not KonfigurasiOK(False) Then Exit Sub
    If Not PCBoleh() Then Exit Sub
    If periodes = "" Then periodes = PeriodeMingguInput()
    TandaiTertunda periodes, True, True
    Dim hasil As String
    hasil = KirimTertunda(True)
    If Left(hasil, 2) <> "OK" Then JadwalkanUlang
Selesai:
End Sub

' Saat file dibuka: kalau ada antrean, coba kirim sebentar lagi
Public Sub GASync_SaatBuka()
    On Error Resume Next
    If AdaTertunda() And KonfigurasiOK(False) And PCBoleh() Then
        mJadwal = Now + TimeSerial(0, 0, 20)
        Application.OnTime mJadwal, "GASync_Coba"
        SheetSync().Range("B10").Value = mJadwal
    End If
    PerbaruiLabelMenu
End Sub

' Target OnTime
Public Sub GASync_Coba()
    On Error Resume Next
    mJadwal = 0
    If Not AdaTertunda() Then Exit Sub
    Dim hasil As String
    hasil = KirimTertunda(True)
    If Left(hasil, 2) <> "OK" Then JadwalkanUlang
End Sub

' Saat file ditutup: batalkan jadwal coba-ulang
Public Sub GASync_Batal()
    On Error Resume Next
    Dim t As Variant
    t = mJadwal
    If t = 0 Then t = ThisWorkbook.Sheets(SH_SYNC).Range("B10").Value
    If IsDate(t) Or (IsNumeric(t) And t > 0) Then Application.OnTime CDate(t), "GASync_Coba", , False
    mJadwal = 0
    ThisWorkbook.Sheets(SH_SYNC).Range("B10").ClearContents
End Sub

' Teks status untuk dashboard MENU
Public Function GASync_Label() As String
    GASync_Label = LabelStatus(False)
End Function


' ============================================================
' INTI PENGIRIMAN
' ============================================================
' Return "OK|ringkasan" atau pesan error
Private Function KirimTertunda(ByVal diam As Boolean) As String
    Dim s As Worksheet, periodes As String, ringkas As String, err1 As String
    Set s = SheetSync()
    s.Range("B9").Value = Now
    periodes = Trim(CStr(s.Range("B2").Value))

    Application.StatusBar = "CIKOPS: memeriksa koneksi..."
    If Not Ping(err1) Then
        CatatError "Offline / tidak tersambung: " & err1
        Application.StatusBar = "CIKOPS: offline - data disimpan di antrean, dicoba lagi otomatis."
        PerbaruiLabelMenu
        KirimTertunda = "Tidak bisa terhubung ke CIKOPS (" & err1 & ")."
        Exit Function
    End If

    ' 1) master
    If CBool(NilaiBool(s.Range("B3").Value)) Then
        Application.StatusBar = "CIKOPS: mengirim master pekerjaan & manpower..."
        If Not KirimMaster(err1) Then GoTo Gagal
        s.Range("B3").Value = False
        ringkas = ringkas & "Master pekerjaan & manpower" & vbCrLf
    End If

    ' 2) plan & actual
    If periodes <> "" Then
        Dim nKirim As Long
        If Not KirimPlan(periodes, nKirim, err1) Then GoTo Gagal
        s.Range("B2").Value = ""
        ringkas = ringkas & "Plan & actual: " & Format(nKirim, "#,##0") & " jadwal (" & LabelPeriode(periodes) & ")" & vbCrLf
    End If

    ' 3) log
    If CBool(NilaiBool(s.Range("B4").Value)) Then
        Application.StatusBar = "CIKOPS: mengirim Event, Improvement, Inventory, TGA..."
        Dim nLog As String
        If Not KirimLog(nLog, err1) Then GoTo Gagal
        s.Range("B4").Value = False
        ringkas = ringkas & nLog & vbCrLf
    End If

    s.Range("B5").Value = Now
    s.Range("B6").Value = ""
    Application.StatusBar = "CIKOPS: sinkron berhasil " & Format(Now, "hh:nn")
    PerbaruiLabelMenu
    KirimTertunda = "OK|" & IIf(ringkas = "", "Tidak ada data baru.", ringkas)
    Exit Function
Gagal:
    CatatError err1
    Application.StatusBar = "CIKOPS: sinkron gagal - " & Left(err1, 120)
    PerbaruiLabelMenu
    KirimTertunda = err1
End Function

Private Function KirimMaster(ByRef errD As String) As Boolean
    Dim w As Worksheet, lr As Long, r As Long, arr As Variant, rows As Collection, js As String
    Dim jobs As String, mp As String, hari As String, h As Long

    ' DB_PEKERJAAN: header baris 4, data baris 5, kolom 1..13
    Set w = ThisWorkbook.Sheets(SH_JOB)
    Set rows = New Collection
    lr = BarisAkhir(w, 1, 5)
    If lr >= 5 Then
        arr = w.Range(w.Cells(5, 1), w.Cells(lr, 13)).Value
        For r = 1 To UBound(arr, 1)
            If Tx(arr(r, 1)) <> "" Then
                hari = ""
                For h = 7 To 10
                    If Tx(arr(r, h)) <> "" Then hari = hari & IIf(hari = "", "", ", ") & Tx(arr(r, h))
                Next h
                rows.Add "{""id"":" & JQ(arr(r, 1)) & ",""tim"":" & JQ(arr(r, 2)) & ",""lokasi"":" & JQ(arr(r, 3)) & _
                         ",""tipe"":" & JQ(arr(r, 4)) & ",""area"":" & JQ(arr(r, 5)) & ",""frek"":" & JQ(arr(r, 6)) & _
                         ",""hari"":" & JQ(hari) & ",""petugas"":" & JQ(arr(r, 11)) & ",""aktif"":" & JQ(arr(r, 12)) & _
                         ",""catatan"":" & JQ(arr(r, 13)) & "}"
            End If
        Next r
    End If
    jobs = GabungJSON(rows)

    ' DB_MANPOWER: ID, Nama, Tim, Jabatan, Area Tugas, No HP (TIDAK dikirim), Status
    Set w = ThisWorkbook.Sheets(SH_MP)
    Set rows = New Collection
    lr = BarisAkhir(w, 2, 5)
    If lr >= 5 Then
        arr = w.Range(w.Cells(5, 1), w.Cells(lr, 7)).Value
        For r = 1 To UBound(arr, 1)
            If Tx(arr(r, 2)) <> "" Then
                rows.Add "{""id"":" & JQ(arr(r, 1)) & ",""nama"":" & JQ(arr(r, 2)) & ",""tim"":" & JQ(arr(r, 3)) & _
                         ",""jabatan"":" & JQ(arr(r, 4)) & ",""area_tugas"":" & JQ(arr(r, 5)) & ",""status"":" & JQ(arr(r, 7)) & "}"
            End If
        Next r
    End If
    mp = GabungJSON(rows)

    js = "{""p_key"":" & JQ(GA_SYNC_KEY) & ",""p_jobs"":" & jobs & ",""p_manpower"":" & mp & ",""p_computer"":" & JQ(NamaPC()) & "}"
    KirimMaster = Rpc("ga_sync_master", js, errD)
End Function

Private Function KirimPlan(ByVal periodes As String, ByRef nKirim As Long, ByRef errD As String) As Boolean
    Dim w As Worksheet, lr As Long, arr As Variant, r As Long, setP As Object, syncId As String
    Dim rows As Collection, p As Variant, js As String, perArr As String, nBatch As Long

    Set setP = CreateObject("Scripting.Dictionary")
    For Each p In Split(periodes, ",")
        If Len(Trim(p)) = 6 And IsNumeric(Trim(p)) Then setP(Trim(p)) = True
    Next p
    If setP.Count = 0 Then KirimPlan = True: Exit Function

    Randomize
    syncId = Format(Now, "yyyymmddhhnnss") & "-" & Int(Rnd() * 100000)
    Set w = ThisWorkbook.Sheets(SH_DATA)
    lr = w.Cells(w.Rows.Count, 1).End(xlUp).Row
    Set rows = New Collection
    If lr >= 2 Then
        arr = w.Range(w.Cells(2, 1), w.Cells(lr, 16)).Value
        For r = 1 To UBound(arr, 1)
            If Tx(arr(r, 1)) <> "" Then
                If setP.Exists(Tx(arr(r, 2))) Then
                    rows.Add "{""key"":" & JQ(arr(r, 1)) & ",""periode"":" & Val(Tx(arr(r, 2))) & _
                             ",""tanggal"":" & JQ(TglISO(arr(r, 3))) & ",""hari"":" & JQ(arr(r, 4)) & _
                             ",""minggu"":" & AngkaAtauNull(arr(r, 5)) & ",""job_id"":" & JQ(arr(r, 6)) & _
                             ",""tim"":" & JQ(arr(r, 7)) & ",""lokasi"":" & JQ(arr(r, 8)) & ",""tipe"":" & JQ(arr(r, 9)) & _
                             ",""area"":" & JQ(arr(r, 10)) & ",""frek"":" & JQ(arr(r, 11)) & ",""petugas"":" & JQ(arr(r, 12)) & _
                             ",""plan"":" & IIf(Tx(arr(r, 13)) = "", "1", AngkaAtauNull(arr(r, 13))) & _
                             ",""actual"":" & AngkaAtauNull(arr(r, 14)) & ",""spv"":" & JQ(arr(r, 15)) & _
                             ",""waktu"":" & JQ(WaktuISO(arr(r, 16))) & "}"
                    If rows.Count >= CHUNK Then
                        nBatch = nBatch + 1
                        Application.StatusBar = "CIKOPS: mengirim plan & actual (bagian " & nBatch & ")..."
                        js = "{""p_key"":" & JQ(GA_SYNC_KEY) & ",""p_sync_id"":" & JQ(syncId) & ",""p_rows"":" & GabungJSON(rows) & "}"
                        If Not Rpc("ga_sync_plan", js, errD) Then Exit Function
                        nKirim = nKirim + rows.Count
                        Set rows = New Collection
                        DoEvents
                    End If
                End If
            End If
        Next r
    End If
    If rows.Count > 0 Then
        nBatch = nBatch + 1
        Application.StatusBar = "CIKOPS: mengirim plan & actual (bagian " & nBatch & ")..."
        js = "{""p_key"":" & JQ(GA_SYNC_KEY) & ",""p_sync_id"":" & JQ(syncId) & ",""p_rows"":" & GabungJSON(rows) & "}"
        If Not Rpc("ga_sync_plan", js, errD) Then Exit Function
        nKirim = nKirim + rows.Count
    End If

    ' selesai: hapus di CIKOPS jadwal periode ini yang sudah tidak ada di Excel
    perArr = ""
    For Each p In setP.Keys
        perArr = perArr & IIf(perArr = "", "", ",") & p
    Next p
    js = "{""p_key"":" & JQ(GA_SYNC_KEY) & ",""p_sync_id"":" & JQ(syncId) & ",""p_periodes"":[" & perArr & "],""p_computer"":" & JQ(NamaPC()) & "}"
    KirimPlan = Rpc("ga_sync_plan_finish", js, errD)
End Function

Private Function KirimLog(ByRef ringkas As String, ByRef errD As String) As Boolean
    Dim n As Long
    ' EVENT: Tanggal, Nama Event, Description, Waktu, Support GA, Documentation
    If Not KirimSatuLog(SH_EVENT, "events", 6, Array("tanggal:d", "nama", "deskripsi", "waktu", "support", "dok"), n, errD) Then Exit Function
    ringkas = "Event " & n
    ' IMPROVEMENT: Tanggal, Kategori, Jenis, Description, Area, Petugas, Pengawas, Dokumentasi
    If Not KirimSatuLog(SH_IMP, "improvements", 8, Array("tanggal:d", "kategori", "jenis", "deskripsi", "area", "petugas", "pengawas", "dok"), n, errD) Then Exit Function
    ringkas = ringkas & " " & ChrW(183) & " Improvement " & n
    ' INVENTORY: Kode, Nama, Jenis, Area, Status, Foto, Jumlah, Tgl Update
    If Not KirimSatuLog(SH_INV, "inventory", 8, Array("kode", "nama", "jenis", "area", "status", "foto", "jumlah:n", "tgl_update:d"), n, errD) Then Exit Function
    ringkas = ringkas & " " & ChrW(183) & " Inventory " & n
    ' TGA: Tanggal, Nama TGA, Activity, Request By
    If AdaSheet(SH_TGA) Then
        If Not KirimSatuLog(SH_TGA, "tga", 4, Array("tanggal:d", "nama_tga", "activity", "request_by"), n, errD) Then Exit Function
        ringkas = ringkas & " " & ChrW(183) & " TGA " & n
    End If
    KirimLog = True
End Function

' Kirim seluruh isi 1 sheet log (header baris 4, data mulai baris 5)
Private Function KirimSatuLog(ByVal namaSheet As String, ByVal tabel As String, ByVal nCol As Long, ByVal fields As Variant, _
                              ByRef n As Long, ByRef errD As String) As Boolean
    Dim w As Worksheet, lr As Long, r As Long, c As Long, arr As Variant, rows As Collection, js As String
    Dim nm As String, tipe As String, pos As Long, isi As Boolean, item As String
    n = 0
    Set w = ThisWorkbook.Sheets(namaSheet)
    Set rows = New Collection
    lr = BarisAkhir(w, 1, 5, nCol)
    If lr >= 5 Then
        arr = w.Range(w.Cells(5, 1), w.Cells(lr, nCol)).Value
        For r = 1 To UBound(arr, 1)
            isi = False
            For c = 1 To nCol
                If Tx(arr(r, c)) <> "" Then isi = True: Exit For
            Next c
            If isi Then
                item = "{""baris"":" & (r + 4)
                For c = 1 To nCol
                    nm = CStr(fields(c - 1)): tipe = ""
                    pos = InStr(nm, ":")
                    If pos > 0 Then tipe = Mid(nm, pos + 1): nm = Left(nm, pos - 1)
                    Select Case tipe
                        Case "d": item = item & ",""" & nm & """:" & JQ(TglISO(arr(r, c)))
                        Case "n": item = item & ",""" & nm & """:" & AngkaAtauNull(arr(r, c))
                        Case Else
                            ' kolom dokumentasi/foto: pakai teks yang tampil (nama file)
                            item = item & ",""" & nm & """:" & JQ(w.Cells(r + 4, c).Text)
                    End Select
                Next c
                rows.Add item & "}"
            End If
        Next r
    End If
    n = rows.Count
    js = "{""p_key"":" & JQ(GA_SYNC_KEY) & ",""p_table"":" & JQ(tabel) & ",""p_rows"":" & GabungJSON(rows) & ",""p_computer"":" & JQ(NamaPC()) & "}"
    KirimSatuLog = Rpc("ga_sync_logs", js, errD)
End Function


' ============================================================
' ANTREAN (sheet GA_SYNC, tersembunyi)
'   B2 periode tertunda (yyyymm,...)   B3 master tertunda   B4 log tertunda
'   B5 sinkron berhasil terakhir       B6 error terakhir    B7 PC yang boleh
'   B8 nama PC ini                     B9 percobaan terakhir
' ============================================================
Private Function SheetSync() As Worksheet
    Dim s As Worksheet
    On Error Resume Next
    Set s = ThisWorkbook.Sheets(SH_SYNC)
    On Error GoTo 0
    If s Is Nothing Then
        Dim aktif As Object
        Set aktif = ActiveSheet
        Set s = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        s.Name = SH_SYNC
        s.Range("A1").Value = "STATUS SINKRON KE CIKOPS (jangan diubah kecuali B7)"
        s.Range("A2").Value = "Periode tertunda"
        s.Range("A3").Value = "Master tertunda"
        s.Range("A4").Value = "Log tertunda"
        s.Range("A5").Value = "Sinkron berhasil terakhir"
        s.Range("A6").Value = "Error terakhir"
        s.Range("A7").Value = "PC yang boleh sinkron (nama komputer, pisahkan koma; kosong = semua)"
        s.Range("A8").Value = "Nama PC ini"
        s.Range("A9").Value = "Percobaan terakhir"
        s.Range("A10").Value = "Jadwal coba ulang"
        s.Range("B3:B4").Value = False
        s.Columns("A").ColumnWidth = 60
        s.Columns("B").ColumnWidth = 50
        s.Range("A1").Font.Bold = True
        s.Visible = xlSheetHidden
        If Not aktif Is Nothing Then aktif.Activate
    End If
    s.Range("B8").Value = NamaPC()
    Set SheetSync = s
End Function

Private Sub TandaiTertunda(ByVal periodes As String, ByVal master As Boolean, ByVal logs As Boolean)
    Dim s As Worksheet, d As Object, p As Variant, out As String
    Set s = SheetSync()
    Set d = CreateObject("Scripting.Dictionary")
    For Each p In Split(CStr(s.Range("B2").Value) & "," & periodes, ",")
        If Len(Trim(p)) = 6 And IsNumeric(Trim(p)) Then d(Trim(p)) = True
    Next p
    For Each p In d.Keys
        out = out & IIf(out = "", "", ",") & p
    Next p
    s.Range("B2").NumberFormat = "@"
    s.Range("B2").Value = out
    If master Then s.Range("B3").Value = True
    If logs Then s.Range("B4").Value = True
End Sub

Private Function AdaTertunda() As Boolean
    Dim s As Worksheet
    Set s = SheetSync()
    AdaTertunda = (Trim(CStr(s.Range("B2").Value)) <> "") Or CBool(NilaiBool(s.Range("B3").Value)) Or CBool(NilaiBool(s.Range("B4").Value))
End Function

Private Sub CatatError(ByVal t As String)
    SheetSync().Range("B6").Value = Format(Now, "dd/mm/yyyy hh:nn") & " - " & Left(t, 400)
End Sub

Private Sub JadwalkanUlang()
    On Error Resume Next
    If mJadwal <> 0 Then Application.OnTime mJadwal, "GASync_Coba", , False
    mJadwal = Now + TimeSerial(0, RETRY_MENIT, 0)
    Application.OnTime mJadwal, "GASync_Coba"
    SheetSync().Range("B10").Value = mJadwal
End Sub

Private Function LabelStatus(ByVal panjang As Boolean) As String
    Dim s As Worksheet, t As String, nP As Long, last As Variant
    Set s = SheetSync()
    last = s.Range("B5").Value
    If Trim(CStr(s.Range("B2").Value)) <> "" Then nP = UBound(Split(CStr(s.Range("B2").Value), ",")) + 1
    If AdaTertunda() Then
        t = "CIKOPS: ada data menunggu dikirim" & IIf(nP > 0, " (" & nP & " periode)", "")
    ElseIf IsDate(last) Then
        t = "CIKOPS: tersinkron " & Format(last, "dd/mm hh:nn")
    Else
        t = "CIKOPS: belum pernah sinkron"
    End If
    If panjang Then
        t = t & vbCrLf & vbCrLf & "Sinkron berhasil terakhir: " & IIf(IsDate(last), Format(last, "dd/mm/yyyy hh:nn"), "-") & vbCrLf & _
            "Periode tertunda: " & IIf(CStr(s.Range("B2").Value) = "", "-", CStr(s.Range("B2").Value)) & vbCrLf & _
            "Error terakhir: " & IIf(CStr(s.Range("B6").Value) = "", "-", CStr(s.Range("B6").Value)) & vbCrLf & _
            "PC ini: " & NamaPC() & IIf(PCBoleh(), "", " (TIDAK diizinkan sinkron)")
    End If
    LabelStatus = t
End Function

Private Sub PerbaruiLabelMenu()
    On Error Resume Next
    ThisWorkbook.Sheets(SH_MENU).Shapes("ga_sync_lbl").TextFrame2.TextRange.Text = ChrW(8645) & "  " & LabelStatus(False)
End Sub

Private Function PCBoleh() As Boolean
    Dim daftar As String, p As Variant
    daftar = Trim(CStr(SheetSync().Range("B7").Value))
    If daftar = "" Then PCBoleh = True: Exit Function
    For Each p In Split(daftar, ",")
        If StrComp(Trim(p), NamaPC(), vbTextCompare) = 0 Then PCBoleh = True: Exit Function
    Next p
End Function

Private Function NamaPC() As String
    NamaPC = Environ("COMPUTERNAME")
    If NamaPC = "" Then NamaPC = Application.UserName
End Function

Private Function KonfigurasiOK(ByVal tampil As Boolean) As Boolean
    If InStr(SUPABASE_URL, "xxxx") > 0 Or InStr(SUPABASE_ANON_KEY, "isi-") > 0 Or InStr(GA_SYNC_KEY, "isi-") > 0 Then
        If tampil Then MsgBox "modSyncGA belum dikonfigurasi." & vbCrLf & "Isi SUPABASE_URL, SUPABASE_ANON_KEY dan GA_SYNC_KEY di bagian atas modul (Alt+F11).", vbExclamation, "Sinkron CIKOPS"
        Exit Function
    End If
    KonfigurasiOK = True
End Function


' ============================================================
' PERIODE
' ============================================================
Private Function SemuaPeriode() As String
    Dim w As Worksheet, lr As Long, arr As Variant, r As Long, d As Object, k As Variant, out As String
    Set w = ThisWorkbook.Sheets(SH_DATA)
    Set d = CreateObject("Scripting.Dictionary")
    lr = w.Cells(w.Rows.Count, 1).End(xlUp).Row
    If lr >= 2 Then
        arr = w.Range(w.Cells(2, 2), w.Cells(lr, 2)).Value
        For r = 1 To UBound(arr, 1)
            If Len(Tx(arr(r, 1))) = 6 Then d(Tx(arr(r, 1))) = True
        Next r
    End If
    For Each k In d.Keys
        out = out & IIf(out = "", "", ",") & k
    Next k
    SemuaPeriode = out
End Function

' Periode (bulan) dari minggu yang sedang tampil di INPUT_ACTUAL (sel C7)
Private Function PeriodeMingguInput() As String
    Dim v As Variant, d As Date, senin As Date
    On Error GoTo Cadangan
    v = ThisWorkbook.Sheets(SH_INPUT).Range("C7").Value
    If Not IsDate(v) Then GoTo Cadangan
    d = CDate(v)
    senin = d - Weekday(d, vbMonday) + 1
    PeriodeMingguInput = Format(senin, "yyyymm")
    If Format(senin + 6, "yyyymm") <> Format(senin, "yyyymm") Then PeriodeMingguInput = PeriodeMingguInput & "," & Format(senin + 6, "yyyymm")
    Exit Function
Cadangan:
    PeriodeMingguInput = Format(Date, "yyyymm")
End Function

Private Function LabelPeriode(ByVal periodes As String) As String
    Dim p As Variant, out As String, bln
    bln = Array("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")
    For Each p In Split(periodes, ",")
        If Len(Trim(p)) = 6 Then out = out & IIf(out = "", "", ", ") & bln(Val(Right(Trim(p), 2)) - 1) & " " & Left(Trim(p), 4)
    Next p
    LabelPeriode = out
End Function


' ============================================================
' HTTP
' ============================================================
Private Function Ping(ByRef errD As String) As Boolean
    Dim st As Long, resp As String
    resp = Post(SUPABASE_URL & "/rest/v1/rpc/ga_ping", "{""p_key"":" & JQ(GA_SYNC_KEY) & "}", st, errD, True)
    If st >= 200 And st <= 299 Then
        Ping = True
    ElseIf st > 0 Then
        errD = "HTTP " & st & ": " & Left(resp, 200)
    End If
End Function

Private Function Rpc(ByVal fn As String, ByVal body As String, ByRef errD As String) As Boolean
    Dim st As Long, resp As String
    resp = Post(SUPABASE_URL & "/rest/v1/rpc/" & fn, body, st, errD, False)
    If st >= 200 And st <= 299 Then
        Rpc = True
    ElseIf st > 0 Then
        errD = fn & " - HTTP " & st & ": " & Left(resp, 300)
    End If
End Function

Private Function Post(ByVal url As String, ByVal body As String, ByRef status As Long, ByRef errD As String, ByVal cepat As Boolean) As String
    Dim h As Object
    On Error GoTo EH
    status = 0
    Set h = HttpObj()
    On Error Resume Next
    If cepat Then
        h.setTimeouts 4000, 6000, 8000, 10000
    Else
        h.setTimeouts 8000, 10000, 60000, 90000
    End If
    On Error GoTo EH
    h.Open "POST", url, False
    h.setRequestHeader "apikey", SUPABASE_ANON_KEY
    h.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    h.setRequestHeader "Content-Type", "application/json; charset=utf-8"
    h.setRequestHeader "Prefer", "return=minimal"
    h.send body
    status = h.status
    Post = h.responseText
    Exit Function
EH:
    errD = Err.Description
    status = 0
End Function

Private Function HttpObj() As Object
    Dim h As Object
    On Error Resume Next
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If h Is Nothing Then Set h = CreateObject("MSXML2.ServerXMLHTTP")
    If h Is Nothing Then Set h = CreateObject("WinHttp.WinHttpRequest.5.1")
    On Error GoTo 0
    If h Is Nothing Then Err.Raise vbObjectError + 1, , "Komponen HTTP tidak tersedia di komputer ini."
    Set HttpObj = h
End Function


' ============================================================
' HELPER
' ============================================================
Private Function AdaSheet(ByVal nm As String) As Boolean
    Dim s As Object
    On Error Resume Next
    Set s = ThisWorkbook.Sheets(nm)
    AdaSheet = Not s Is Nothing
End Function

Private Function BarisAkhir(ByVal w As Worksheet, ByVal col As Long, ByVal minRow As Long, Optional ByVal nCol As Long = 0) As Long
    Dim c As Long, r As Long
    BarisAkhir = w.Cells(w.Rows.Count, col).End(xlUp).Row
    If nCol > 0 Then
        For c = 1 To nCol
            r = w.Cells(w.Rows.Count, c).End(xlUp).Row
            If r > BarisAkhir Then BarisAkhir = r
        Next c
    End If
    If BarisAkhir < minRow Then BarisAkhir = minRow - 1
End Function

Private Function Tx(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Or IsNull(v) Then Exit Function
    Tx = Trim(CStr(v))
End Function

Private Function NilaiBool(ByVal v As Variant) As Boolean
    If VarType(v) = vbBoolean Then
        NilaiBool = v
    Else
        NilaiBool = (UCase(Tx(v)) = "TRUE" Or UCase(Tx(v)) = "BENAR" Or Tx(v) = "1")
    End If
End Function

Private Function JQ(ByVal v As Variant) As String
    Dim t As String, i As Long, ch As Long, out As String
    t = Tx(v)
    t = Replace(t, "\", "\\")
    t = Replace(t, """", "\""")
    t = Replace(t, vbCrLf, "\n")
    t = Replace(t, vbCr, "\n")
    t = Replace(t, vbLf, "\n")
    t = Replace(t, vbTab, " ")
    ' karakter non-ASCII -> \uXXXX supaya aman di semua komputer
    For i = 1 To Len(t)
        ch = AscW(Mid(t, i, 1))
        If ch < 0 Then ch = ch + 65536
        If ch > 126 Or ch < 32 Then
            out = out & "\u" & Right("000" & Hex(ch), 4)
        Else
            out = out & Mid(t, i, 1)
        End If
    Next i
    JQ = """" & out & """"
End Function

Private Function AngkaAtauNull(ByVal v As Variant) As String
    Dim t As String
    t = Tx(v)
    If t = "" Then AngkaAtauNull = "null": Exit Function
    t = Replace(t, ",", ".")
    If IsNumeric(t) Or IsNumeric(Replace(t, ".", Application.International(xlDecimalSeparator))) Then
        AngkaAtauNull = Replace(CStr(Val(t)), ",", ".")
    Else
        AngkaAtauNull = "null"
    End If
End Function

Private Function TglISO(ByVal v As Variant) As String
    Dim s As String, p() As String
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbDate Then TglISO = Format(v, "yyyy-mm-dd"): Exit Function
    If IsNumeric(v) And VarType(v) <> vbString Then
        If v > 20000 And v < 80000 Then TglISO = Format(CDate(v), "yyyy-mm-dd")
        Exit Function
    End If
    s = Trim(CStr(v))
    If s Like "####-##-##*" Then TglISO = Left(s, 10): Exit Function
    If s Like "*/*/*" Then
        p = Split(s, "/")
        If UBound(p) = 2 Then
            If IsNumeric(p(0)) And IsNumeric(p(1)) And IsNumeric(Left(p(2), 4)) Then
                Dim y As Long
                y = Val(Left(p(2), 4)): If y < 100 Then y = y + 2000
                TglISO = Format(DateSerial(y, Val(p(1)), Val(p(0))), "yyyy-mm-dd")
            End If
        End If
    End If
End Function

Private Function WaktuISO(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbDate Or (IsNumeric(v) And VarType(v) <> vbString) Then
        If CDbl(v) > 20000 Then WaktuISO = Format(CDate(v), "yyyy-mm-dd hh:nn:ss")
    ElseIf IsDate(v) Then
        WaktuISO = Format(CDate(v), "yyyy-mm-dd hh:nn:ss")
    End If
End Function

Private Function GabungJSON(ByVal rows As Collection) As String
    Dim a() As String, i As Long
    If rows.Count = 0 Then GabungJSON = "[]": Exit Function
    ReDim a(1 To rows.Count)
    For i = 1 To rows.Count
        a(i) = rows(i)
    Next i
    GabungJSON = "[" & Join(a, ",") & "]"
End Function
