Attribute VB_Name = "modSyncGA"
Option Explicit

' ============================================================
' modSyncGA v2 - Sistem Laporan GA (Cleaning, Gardening, TGA)
'                CIKOPS  ->  Excel  (CIKOPS sumber utama)
'
' CIKOPS sekarang tempat input: master pekerjaan, manpower, jadwal,
' checklist actual harian, Event, Improvement, Inventory, dan TGA
' (aplikasi TGA). Excel MENARIK data dan menulis ulang sheet berikut
' persis mengikuti template CIKOPS:
'   DB_PEKERJAAN (A..M)   DB_MANPOWER (A..G)   DATA_PLAN_ACTUAL (A..P)
'   EVENT (A..F)          IMPROVEMENT (A..H)   INVENTORY (A..H)   TGA (A..D)
' Laporan Bulanan, Plan vs Actual dan Dashboard MENU di Excel tetap
' dibuat oleh modGA dari data yang ditarik.
'
' PENTING: perubahan yang diketik langsung di Excel akan DITIMPA saat
' tarik berikutnya. Ubah datanya di CIKOPS.
'
' Kapan menarik:
'   - Tombol "Sinkron CIKOPS" di MENU (macro SinkronKeCIKOPS)
'   - Otomatis 20 detik setelah file dibuka, lalu tiap 10 menit selama
'     file terbuka.
'
' PASANG (ganti modSyncGA versi 1):
'   1. Alt+F11 -> klik kanan modSyncGA -> Remove (No, tidak perlu export)
'   2. File -> Import File -> modSyncGA_v2.bas (nama modul tetap modSyncGA)
'   3. Isi 3 konstanta di bawah (sama dengan versi 1).
'   4. modGA TIDAK perlu diganti (nama macro publik tetap sama).
'   5. Di CIKOPS: Fasilitas -> Cleaning & Gardening -> tab Excel ->
'      "Jadikan CIKOPS sumber utama" (admin).
' ============================================================

' -- KONFIGURASI --
Private Const SUPABASE_URL As String = "https://xxxxxxxxxxxx.supabase.co"
Private Const SUPABASE_ANON_KEY As String = "isi-anon-key-di-sini"
Private Const GA_SYNC_KEY As String = "isi-kunci-sinkron-ga-dari-cikops"

Private Const SH_SYNC As String = "GA_SYNC"
Private Const TARIK_MENIT As Long = 10
Private Const BULAN_KE_BELAKANG As Long = 6   ' tarik cepat: 6 bulan terakhir + bulan berjalan & depan

Private mJadwal As Date
Private mInfoOtomatis As Boolean


' ============================================================
' TOMBOL
' ============================================================
Public Sub SinkronKeCIKOPS()
    TarikDariCIKOPS
End Sub

Public Sub TarikDariCIKOPS()
    Dim pilih As VbMsgBoxResult, dari As Long, hasil As String
    If Not KonfigurasiOK(True) Then Exit Sub
    pilih = MsgBox("Tarik data terbaru dari CIKOPS?" & vbCrLf & vbCrLf & _
                   "YES  = jadwal " & BULAN_KE_BELAKANG & " bulan terakhir s/d bulan depan (cepat)" & vbCrLf & _
                   "NO   = SEMUA jadwal (lengkap, lebih lama)" & vbCrLf & _
                   "Cancel = batal" & vbCrLf & vbCrLf & _
                   "Master, Manpower, Event, Improvement, Inventory & TGA selalu ditarik lengkap." & vbCrLf & _
                   "Isi sheet akan DIGANTI dengan data CIKOPS.", _
                   vbQuestion + vbYesNoCancel, "Tarik dari CIKOPS")
    If pilih = vbCancel Then Exit Sub
    dari = IIf(pilih = vbYes, PeriodeMundur(BULAN_KE_BELAKANG), 200001)
    Application.Cursor = xlWait
    hasil = Tarik(dari, False)
    Application.Cursor = xlDefault
    If Left(hasil, 2) = "OK" Then
        MsgBox "Data CIKOPS berhasil ditarik." & vbCrLf & vbCrLf & Mid(hasil, 4), vbInformation, "Tarik dari CIKOPS"
    Else
        MsgBox "Tarik data belum berhasil:" & vbCrLf & hasil, vbExclamation, "Tarik dari CIKOPS"
    End If
End Sub

Public Sub StatusSinkronCIKOPS()
    MsgBox LabelStatus(True), vbInformation, "Status CIKOPS"
End Sub


' ============================================================
' DIPANGGIL OTOMATIS OLEH modGA (nama tetap sama dengan versi 1)
' ============================================================
' Versi 1: kirim ke CIKOPS setelah Simpan Actual / Generate Plan.
' Versi 2: CIKOPS sumber utama -> tidak ada yang dikirim; beri tahu sekali.
Public Sub GASync_Otomatis(Optional ByVal periodes As String = "")
    On Error Resume Next
    If mInfoOtomatis Then Exit Sub
    mInfoOtomatis = True
    MsgBox "Data Cleaning & Gardening sekarang diinput di CIKOPS." & vbCrLf & _
           "Perubahan yang dibuat di Excel tidak dikirim, dan akan diganti data CIKOPS saat tarik berikutnya." & vbCrLf & vbCrLf & _
           "Silakan input / ubah di CIKOPS: Fasilitas -> Cleaning & Gardening.", vbInformation, "CIKOPS"
End Sub

Public Sub GASync_SaatBuka()
    On Error Resume Next
    If KonfigurasiOK(False) Then
        mJadwal = Now + TimeSerial(0, 0, 20)
        Application.OnTime mJadwal, "GASync_Coba"
        SheetSync().Range("B10").Value = mJadwal
    End If
    PerbaruiLabelMenu
End Sub

' Target OnTime: tarik diam-diam (jadwal cepat), lalu jadwalkan lagi
Public Sub GASync_Coba()
    On Error Resume Next
    mJadwal = 0
    Tarik PeriodeMundur(BULAN_KE_BELAKANG), True
    JadwalkanUlang
End Sub

Public Sub GASync_Batal()
    On Error Resume Next
    Dim t As Variant
    t = mJadwal
    If t = 0 Then t = ThisWorkbook.Sheets(SH_SYNC).Range("B10").Value
    If IsDate(t) Or (IsNumeric(t) And t > 0) Then Application.OnTime CDate(t), "GASync_Coba", , False
    mJadwal = 0
    ThisWorkbook.Sheets(SH_SYNC).Range("B10").ClearContents
End Sub

Public Function GASync_Label() As String
    GASync_Label = LabelStatus(False)
End Function


' ============================================================
' INTI: TARIK & TULIS SHEET
' ============================================================
' Return "OK|ringkasan" atau pesan error
Private Function Tarik(ByVal dariPeriode As Long, ByVal diam As Boolean) As String
    Dim body As String, st As Long, errD As String, resp As String, teks As String
    Dim s As Worksheet
    On Error GoTo EH
    Set s = SheetSync()
    s.Range("B9").Value = Now
    If Not diam Then Application.StatusBar = "CIKOPS: menarik data..."

    body = "{""p_key"":" & JQ(GA_SYNC_KEY) & ",""p_from_periode"":" & dariPeriode & ",""p_computer"":" & JQ(NamaPC()) & "}"
    resp = Post(SUPABASE_URL & "/rest/v1/rpc/ga_pull", body, st, errD)
    If st < 200 Or st > 299 Then
        If st > 0 Then errD = "HTTP " & st & ": " & PesanError(resp)
        CatatError errD
        Application.StatusBar = False
        PerbaruiLabelMenu
        Tarik = errD
        Exit Function
    End If

    teks = resp
    If Left$(teks, 1) = """" Then teks = JsonStr(teks)
    If Left$(teks, 9) <> "##CIKOPS" & vbTab Then
        Tarik = "Jawaban CIKOPS tidak dikenali. Pastikan SQL 038_ga_cikops_master.sql sudah dijalankan."
        CatatError Tarik
        Application.StatusBar = False
        Exit Function
    End If

    Dim ringkas As String
    ringkas = TulisSemua(teks, dariPeriode)
    s.Range("B5").Value = Now
    s.Range("B6").ClearContents
    s.Range("B2").ClearContents: s.Range("B3").ClearContents: s.Range("B4").ClearContents   ' antrean versi 1 tidak dipakai lagi
    Application.StatusBar = False
    PerbaruiLabelMenu
    On Error Resume Next
    Application.Run "RefreshDashboard"
    On Error GoTo 0
    Tarik = "OK|" & ringkas
    Exit Function
EH:
    Tarik = "Gagal menarik data: " & Err.Description
    CatatError Tarik
    Application.StatusBar = False
    Application.ScreenUpdating = True
    Application.EnableEvents = True
    Application.Calculation = xlCalculationAutomatic
End Function

Private Function TulisSemua(ByVal teks As String, ByVal dariPeriode As Long) As String
    Dim baris() As String, i As Long, n As Long, info() As String, nama As String, jml As Long
    Dim mulai As Long, ringkas As String
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    teks = Replace(teks, vbCrLf, vbLf)
    baris = Split(teks, vbLf)
    n = UBound(baris)
    i = 0
    Do While i <= n
        If Left$(baris(i), 8) = "##SHEET" & vbTab Then
            info = Split(baris(i), vbTab)
            nama = info(1)
            jml = CLng(Val(info(2)))
            mulai = i + 1                      ' baris header
            TulisSheet nama, baris, mulai, jml, dariPeriode
            ringkas = ringkas & nama & ": " & jml & " baris" & vbCrLf
            i = mulai + jml + 1
        Else
            i = i + 1
        End If
    Loop

    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    TulisSemua = ringkas
End Function

' Header di baris hdrIdx, data jml baris sesudahnya
Private Sub TulisSheet(ByVal nama As String, baris() As String, ByVal hdrIdx As Long, ByVal jml As Long, ByVal dariPeriode As Long)
    Dim w As Worksheet, hdr() As String, nCol As Long, r As Long, c As Long, v() As String
    Dim data() As Variant, hdrRow As Long, firstRow As Long, lastRow As Long

    If nama = "TGA" And Not AdaSheet("TGA") Then
        On Error Resume Next
        Application.Run "SiapkanSheetTGA"
        On Error GoTo 0
    End If
    If Not AdaSheet(nama) Then Exit Sub
    Set w = ThisWorkbook.Sheets(nama)

    hdr = Split(baris(hdrIdx), vbTab)
    nCol = UBound(hdr) + 1
    If nama = "DATA_PLAN_ACTUAL" Then
        hdrRow = 1: firstRow = 2
    Else
        hdrRow = 4: firstRow = 5
    End If

    ' Header mengikuti template CIKOPS
    For c = 1 To nCol
        w.Cells(hdrRow, c).Value = hdr(c - 1)
    Next c

    ' Data dari CIKOPS
    If jml > 0 Then
        ReDim data(1 To jml, 1 To nCol)
        For r = 1 To jml
            v = Split(baris(hdrIdx + r), vbTab)
            For c = 1 To nCol
                If c - 1 <= UBound(v) Then data(r, c) = Nilai(nama, c, v(c - 1)) Else data(r, c) = Empty
            Next c
        Next r
    End If

    If nama = "DATA_PLAN_ACTUAL" Then
        TulisPlan w, data, jml, nCol, dariPeriode
        Exit Sub
    End If

    lastRow = BarisAkhir(w, 1, firstRow, nCol)
    If lastRow >= firstRow Then w.Range(w.Cells(firstRow, 1), w.Cells(lastRow, nCol)).ClearContents
    If jml > 0 Then w.Range(w.Cells(firstRow, 1), w.Cells(firstRow + jml - 1, nCol)).Value = data
End Sub

' DATA_PLAN_ACTUAL: baris periode < dariPeriode tetap, sisanya diganti data CIKOPS
Private Sub TulisPlan(ByVal w As Worksheet, data() As Variant, ByVal jml As Long, ByVal nCol As Long, ByVal dariPeriode As Long)
    Dim lastRow As Long, lama As Variant, simpan() As Variant, k As Long, r As Long, c As Long, nLama As Long
    lastRow = BarisAkhir(w, 1, 2, nCol)
    If lastRow >= 2 And dariPeriode > 200001 Then
        lama = w.Range(w.Cells(2, 1), w.Cells(lastRow, nCol)).Value
        nLama = UBound(lama, 1)
        ReDim simpan(1 To nLama, 1 To nCol)
        For r = 1 To nLama
            If Val(CStr(lama(r, 2))) > 0 And Val(CStr(lama(r, 2))) < dariPeriode Then
                k = k + 1
                For c = 1 To nCol: simpan(k, c) = lama(r, c): Next c
            End If
        Next r
    End If
    If lastRow >= 2 Then w.Range(w.Cells(2, 1), w.Cells(lastRow, nCol)).ClearContents
    If k > 0 Then
        Dim keep() As Variant
        ReDim keep(1 To k, 1 To nCol)
        For r = 1 To k
            For c = 1 To nCol: keep(r, c) = simpan(r, c): Next c
        Next r
        w.Range(w.Cells(2, 1), w.Cells(1 + k, nCol)).Value = keep
    End If
    If jml > 0 Then w.Range(w.Cells(2 + k, 1), w.Cells(1 + k + jml, nCol)).Value = data
End Sub

' Konversi teks -> tanggal / angka sesuai kolom template
Private Function Nilai(ByVal nama As String, ByVal col As Long, ByVal t As String) As Variant
    If t = "" Then Nilai = Empty: Exit Function
    Select Case nama
        Case "DATA_PLAN_ACTUAL"
            Select Case col
                Case 2, 5, 13, 14: Nilai = CLng(Val(t)): Exit Function           ' Periode, Minggu ke, Plan, Actual
                Case 3: Nilai = TglDari(t): Exit Function                        ' Tanggal
                Case 16: Nilai = WaktuDari(t): Exit Function                     ' Waktu Input
            End Select
        Case "EVENT", "IMPROVEMENT", "TGA"
            If col = 1 Then Nilai = TglDari(t): Exit Function
        Case "INVENTORY"
            If col = 7 Then Nilai = Val(t): Exit Function
            If col = 8 Then Nilai = TglDari(t): Exit Function
    End Select
    ' Teks yang tampak seperti angka / tanggal tetap teks (mis. kode, No HP)
    If IsNumeric(t) Or Left$(t, 1) = "=" Then Nilai = "'" & t Else Nilai = t
End Function

Private Function TglDari(ByVal t As String) As Variant
    If Len(t) >= 10 And Mid$(t, 5, 1) = "-" Then
        TglDari = DateSerial(CInt(Left$(t, 4)), CInt(Mid$(t, 6, 2)), CInt(Mid$(t, 9, 2)))
    Else
        TglDari = t
    End If
End Function

Private Function WaktuDari(ByVal t As String) As Variant
    If Len(t) >= 19 Then
        WaktuDari = TglDari(t) + TimeSerial(CInt(Mid$(t, 12, 2)), CInt(Mid$(t, 15, 2)), CInt(Mid$(t, 18, 2)))
    Else
        WaktuDari = TglDari(t)
    End If
End Function


' ============================================================
' HTTP
' ============================================================
Private Function Post(ByVal url As String, ByVal body As String, ByRef status As Long, ByRef errD As String) As String
    Dim h As Object
    On Error GoTo EH
    status = 0
    Set h = HttpObj()
    On Error Resume Next
    h.setTimeouts 8000, 10000, 90000, 120000
    On Error GoTo EH
    h.Open "POST", url, False
    h.setRequestHeader "apikey", SUPABASE_ANON_KEY
    h.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    h.setRequestHeader "Content-Type", "application/json; charset=utf-8"
    h.setRequestHeader "Accept", "application/json"
    h.send body
    status = h.status
    Post = h.responseText
    Exit Function
EH:
    errD = "Tidak bisa terhubung ke CIKOPS (" & Err.Description & ")"
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

' Ambil "message" dari JSON error PostgREST
Private Function PesanError(ByVal resp As String) As String
    Dim p As Long, q As Long
    p = InStr(resp, """message"":""")
    If p > 0 Then
        p = p + 11
        q = InStr(p, resp, """")
        If q > p Then PesanError = JsonStr("""" & Mid$(resp, p, q - p) & """"): Exit Function
    End If
    PesanError = Left$(resp, 300)
End Function

' Mengubah string JSON ("....") menjadi teks biasa (\n, \t, \", \\, \uXXXX)
Private Function JsonStr(ByVal s As String) As String
    Dim res As String, pos As Long, i As Long, j As Long, n As Long, ch As String, ln As Long
    n = Len(s)
    If n >= 2 And Left$(s, 1) = """" Then s = Mid$(s, 2, n - 2): n = n - 2
    res = Space$(n)
    pos = 1: i = 1
    Do While i <= n
        j = InStr(i, s, "\")
        If j = 0 Then
            ln = n - i + 1
            Mid$(res, pos, ln) = Mid$(s, i, ln)
            pos = pos + ln
            Exit Do
        End If
        If j > i Then
            ln = j - i
            Mid$(res, pos, ln) = Mid$(s, i, ln)
            pos = pos + ln
        End If
        ch = Mid$(s, j + 1, 1)
        Select Case ch
            Case "n": Mid$(res, pos, 1) = vbLf: pos = pos + 1: i = j + 2
            Case "t": Mid$(res, pos, 1) = vbTab: pos = pos + 1: i = j + 2
            Case "r": Mid$(res, pos, 1) = vbCr: pos = pos + 1: i = j + 2
            Case "b", "f": i = j + 2
            Case "u": Mid$(res, pos, 1) = ChrW$(CLng("&H" & Mid$(s, j + 2, 4))): pos = pos + 1: i = j + 6
            Case Else: Mid$(res, pos, 1) = ch: pos = pos + 1: i = j + 2   ' \" \\ \/
        End Select
    Loop
    JsonStr = Left$(res, pos - 1)
End Function

Private Function JQ(ByVal t As String) As String
    t = Replace(t, "\", "\\")
    t = Replace(t, """", "\""")
    JQ = """" & t & """"
End Function


' ============================================================
' HELPER
' ============================================================
Private Function PeriodeMundur(ByVal bulan As Long) As Long
    Dim d As Date
    d = DateSerial(Year(Date), Month(Date) - bulan, 1)
    PeriodeMundur = Year(d) * 100 + Month(d)
End Function

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
        s.Range("A1").Value = "STATUS CIKOPS (modSyncGA v2 - tarik dari CIKOPS)"
        s.Range("A5").Value = "Tarik terakhir berhasil"
        s.Range("A6").Value = "Error terakhir"
        s.Range("A9").Value = "Percobaan terakhir"
        s.Range("A10").Value = "Jadwal tarik berikutnya"
        s.Visible = xlSheetHidden
        On Error Resume Next
        aktif.Activate
    End If
    Set SheetSync = s
End Function

Private Sub CatatError(ByVal t As String)
    On Error Resume Next
    SheetSync().Range("B6").Value = Format(Now, "dd/mm/yyyy hh:nn") & " - " & Left(t, 400)
End Sub

Private Sub JadwalkanUlang()
    On Error Resume Next
    If mJadwal <> 0 Then Application.OnTime mJadwal, "GASync_Coba", , False
    mJadwal = Now + TimeSerial(0, TARIK_MENIT, 0)
    Application.OnTime mJadwal, "GASync_Coba"
    SheetSync().Range("B10").Value = mJadwal
End Sub

Private Function LabelStatus(ByVal panjang As Boolean) As String
    Dim s As Worksheet, t As String, last As Variant
    Set s = SheetSync()
    last = s.Range("B5").Value
    If IsDate(last) Then
        t = "CIKOPS: ditarik " & Format(last, "dd/mm hh:nn")
    Else
        t = "CIKOPS: belum pernah ditarik"
    End If
    If panjang Then
        t = t & vbCrLf & vbCrLf & "Mode: CIKOPS sumber utama (Excel menarik data)."
        If Trim(CStr(s.Range("B6").Value)) <> "" Then t = t & vbCrLf & "Error terakhir: " & s.Range("B6").Value
        If IsDate(s.Range("B10").Value) Then t = t & vbCrLf & "Tarik otomatis berikutnya: " & Format(s.Range("B10").Value, "hh:nn")
    End If
    LabelStatus = t
End Function

Private Sub PerbaruiLabelMenu()
    On Error Resume Next
    ThisWorkbook.Sheets("MENU").Shapes("ga_sync_lbl").TextFrame2.TextRange.Text = ChrW(8645) & "  " & LabelStatus(False)
End Sub

Private Function NamaPC() As String
    NamaPC = Environ("COMPUTERNAME")
    If NamaPC = "" Then NamaPC = Application.UserName
End Function

Private Function KonfigurasiOK(ByVal tampil As Boolean) As Boolean
    If InStr(SUPABASE_URL, "xxxx") > 0 Or InStr(SUPABASE_ANON_KEY, "isi-") > 0 Or InStr(GA_SYNC_KEY, "isi-") > 0 Then
        If tampil Then MsgBox "modSyncGA belum dikonfigurasi." & vbCrLf & "Isi SUPABASE_URL, SUPABASE_ANON_KEY dan GA_SYNC_KEY di bagian atas modul (Alt+F11).", vbExclamation, "CIKOPS"
        Exit Function
    End If
    KonfigurasiOK = True
End Function
