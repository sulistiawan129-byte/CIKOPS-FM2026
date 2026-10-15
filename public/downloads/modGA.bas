Attribute VB_Name = "modGA"
'==================================================================
'  SISTEM LAPORAN GA - PLANT CIKARANG                  Versi 1.7
'  - Plan vs Actual Cleaning & Gardening
'  - Event Plant, Improvement / Inovasi, Inventory Tools
'  - Aktivitas TGA (Teknisi GA)                                [baru 1.7]
'  - Laporan Bulanan gabungan + Export PDF
'  - Sinkron otomatis ke CIKOPS (butuh modul modSyncGA)        [baru 1.7]
'
'  Setelah import modul ini, jalankan sekali: Setup_Tombol
'  (membangun dashboard MENU + tombol di setiap sheet)
'==================================================================
Option Explicit

' ---------- nama sheet ----------
Public Const SH_MENU As String = "MENU"
Public Const SH_INPUT As String = "INPUT_ACTUAL"
Public Const SH_LAPBUL As String = "LAPORAN_BULANAN"
Public Const SH_LAPPA As String = "LAP_PLAN_ACTUAL"
Public Const SH_EVENT As String = "EVENT"
Public Const SH_IMP As String = "IMPROVEMENT"
Public Const SH_INV As String = "INVENTORY"
Public Const SH_TGA As String = "TGA"
Public Const SH_JOB As String = "DB_PEKERJAAN"
Public Const SH_MP As String = "DB_MANPOWER"
Public Const SH_DATA As String = "DATA_PLAN_ACTUAL"

' ---------- sheet input user: header baris 4, data mulai baris 5 ----------
Private Const HDR_ROW As Long = 4
Private Const FIRST_ROW As Long = 5

' ---------- kolom DB_PEKERJAAN ----------
Private Const J_ID As Long = 1
Private Const J_TIM As Long = 2
Private Const J_LOK As Long = 3
Private Const J_TIPE As Long = 4
Private Const J_AREA As Long = 5
Private Const J_FREK As Long = 6
Private Const J_H1 As Long = 7          ' Hari 1..4 = kolom 7..10
Private Const J_PTG As Long = 11
Private Const J_AKTIF As Long = 12
Private Const J_LASTCOL As Long = 13

' ---------- kolom DATA_PLAN_ACTUAL (header baris 1) ----------
Private Const D_KEY As Long = 1
Private Const D_PER As Long = 2
Private Const D_TGL As Long = 3
Private Const D_HARI As Long = 4
Private Const D_MGG As Long = 5
Private Const D_ID As Long = 6
Private Const D_TIM As Long = 7
Private Const D_LOK As Long = 8
Private Const D_TIPE As Long = 9
Private Const D_AREA As Long = 10
Private Const D_FREK As Long = 11
Private Const D_PTG As Long = 12
Private Const D_PLAN As Long = 13
Private Const D_ACT As Long = 14
Private Const D_SPV As Long = 15
Private Const D_WAKTU As Long = 16
Private Const D_NCOL As Long = 16

' ---------- INPUT_ACTUAL ----------
Private Const IN_FIRST As Long = 11
Private Const IN_NCOL As Long = 9
Private Const IN_ACT As Long = 9

' ---------- laporan bulanan ----------
Private Const LB_NCOL As Long = 10

' ---------- tema dashboard ----------
Private Const FONT_UI As String = "Segoe UI"
Private Const FONT_ICON As String = "Segoe MDL2 Assets"

' Ukuran dashboard (point)
Private Const DB_X As Double = 12
Private Const DB_Y As Double = 10

' ukuran dashboard dihitung dari ukuran jendela Excel (zoom 100%)
Private mDbW As Double
Private mDbH As Double
Private mLastW As Double
Private mLastH As Double

'==================================================================
'  UTILITAS
'==================================================================
Private Function Sh(ByVal nama As String) As Worksheet
    Set Sh = ThisWorkbook.Worksheets(nama)
End Function

Private Sub SpeedOn()
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual
End Sub

Private Sub SpeedOff()
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Application.StatusBar = False
End Sub

Private Sub TampilError(ByVal pesan As String, ByVal judul As String)
    SpeedOff
    MsgBox pesan, vbExclamation, judul
End Sub

Private Function NewDict() As Object
    Set NewDict = CreateObject("Scripting.Dictionary")
    NewDict.CompareMode = vbTextCompare
End Function

Private Function LastRow(ByVal w As Worksheet, ByVal col As Long) As Long
    LastRow = w.Cells(w.Rows.Count, col).End(xlUp).Row
End Function

Private Function LastRowAny(ByVal w As Worksheet, ByVal c1 As Long, ByVal c2 As Long) As Long
    Dim c As Long, r As Long, mx As Long
    For c = c1 To c2
        r = w.Cells(w.Rows.Count, c).End(xlUp).Row
        If r > mx Then mx = r
    Next c
    LastRowAny = mx
End Function

' Selalu mengembalikan array 2 dimensi (1-based), walau range cuma 1 sel
Private Function Baca(ByVal rg As Range) As Variant
    Dim a() As Variant
    If rg.Cells.Count = 1 Then
        ReDim a(1 To 1, 1 To 1)
        a(1, 1) = rg.Value
        Baca = a
    Else
        Baca = rg.Value
    End If
End Function

Private Function Teks(ByVal v As Variant) As String
    If IsError(v) Then
        Teks = ""
    ElseIf IsEmpty(v) Or IsNull(v) Then
        Teks = ""
    Else
        Teks = Trim$(CStr(v))
    End If
End Function

Private Function KeTanggal(ByVal v As Variant, ByRef ok As Boolean) As Date
    ok = False
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbDate Then
        KeTanggal = DateSerial(Year(v), Month(v), Day(v))
        ok = True
    ElseIf IsNumeric(v) Then
        If CDbl(v) > 20000 And CDbl(v) < 80000 Then
            KeTanggal = CDate(Int(CDbl(v)))
            ok = True
        End If
    ElseIf IsDate(v) Then
        KeTanggal = DateSerial(Year(CDate(v)), Month(CDate(v)), Day(CDate(v)))
        ok = True
    End If
End Function

Private Function NamaHari(ByVal d As Date) As String
    NamaHari = Choose(Weekday(d, vbMonday), "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")
End Function

Private Function HariSingkat(ByVal d As Date) As String
    HariSingkat = Choose(Weekday(d, vbMonday), "Sn", "Sl", "Rb", "Km", "Jm", "Sb", "Mg")
End Function

Private Function HariKeAngka(ByVal s As String) As Long
    Select Case LCase$(Replace(Trim$(s), "'", ""))
        Case "senin": HariKeAngka = 1
        Case "selasa": HariKeAngka = 2
        Case "rabu": HariKeAngka = 3
        Case "kamis": HariKeAngka = 4
        Case "jumat": HariKeAngka = 5
        Case "sabtu": HariKeAngka = 6
        Case "minggu": HariKeAngka = 7
        Case Else: HariKeAngka = 0
    End Select
End Function

Private Function NamaBulan(ByVal m As Long) As String
    NamaBulan = Choose(m, "Januari", "Februari", "Maret", "April", "Mei", "Juni", _
        "Juli", "Agustus", "September", "Oktober", "November", "Desember")
End Function

Private Function BulanKeAngka(ByVal s As String) As Long
    Dim m As Long
    s = LCase$(Trim$(s))
    For m = 1 To 12
        If s = LCase$(NamaBulan(m)) Then
            BulanKeAngka = m
            Exit Function
        End If
    Next m
    If IsNumeric(s) And s <> "" Then
        If Val(s) >= 1 And Val(s) <= 12 Then BulanKeAngka = CLng(Val(s))
    End If
End Function

' W = 1x seminggu, 2W = 2x seminggu, dst.
Private Function FrekKeJumlah(ByVal f As String) As Long
    f = UCase$(Replace(Trim$(f), " ", ""))
    If f = "W" Then
        FrekKeJumlah = 1
    ElseIf Len(f) > 1 And Right$(f, 1) = "W" Then
        FrekKeJumlah = CLng(Val(Left$(f, Len(f) - 1)))
    End If
End Function

Private Function GetPeriode() As Date
    Dim w As Worksheet, b As Long, t As Long
    Set w = Sh(SH_MENU)
    b = BulanKeAngka(Teks(MenuCell("MenuBulan", "C6").Value))
    t = CLng(Val(Teks(MenuCell("MenuTahun", "C7").Value)))
    If b = 0 Or t < 2000 Or t > 2100 Then
        Err.Raise vbObjectError + 513, , "Periode di MENU belum benar." & vbCrLf & "Isi Bulan dan Tahun di bagian PERIODE (bawah dashboard)."
    End If
    GetPeriode = DateSerial(t, b, 1)
End Function

Private Function LabelPeriode(ByVal p As Date) As String
    LabelPeriode = NamaBulan(Month(p)) & " " & Year(p)
End Function

Private Function KodePeriode(ByVal p As Date) As Long
    KodePeriode = Year(p) * 100 + Month(p)
End Function

' Minggu ke-n dalam bulan (minggu dimulai hari Senin)
Private Function MingguKe(ByVal d As Date) As Long
    Dim awal As Date
    awal = DateSerial(Year(d), Month(d), 1)
    MingguKe = Int((Day(d) + Weekday(awal, vbMonday) - 2) / 7) + 1
End Function

Private Sub ResetSheet(ByVal w As Worksheet)
    Do While w.ChartObjects.Count > 0
        w.ChartObjects(1).Delete
    Loop
    w.Cells.FormatConditions.Delete
    w.Cells.Hyperlinks.Delete
    w.Cells.UnMerge
    w.Cells.Clear
    w.Cells.RowHeight = w.StandardHeight
    w.Cells.ColumnWidth = w.StandardWidth
End Sub

Private Sub Banner(ByVal w As Worksheet, ByVal nCol As Long, ByVal ukuran As Double)
    With w.Range(w.Cells(1, 1), w.Cells(1, nCol))
        .Interior.Color = RGB(17, 82, 170)
        .Font.Name = "Segoe UI"
        .Font.Bold = True
        .Font.Size = ukuran
        .Font.Color = vbWhite
        .VerticalAlignment = xlCenter
        With .Borders(xlEdgeBottom)
            .LineStyle = xlContinuous
            .Weight = xlThick
            .Color = RGB(215, 25, 32)
        End With
    End With
    w.Rows(1).RowHeight = 32
End Sub

Private Sub SetHalaman(ByVal w As Worksheet, ByVal landscape As Boolean, Optional ByVal judulBaris As String = "")
    On Error Resume Next
    Application.PrintCommunication = False
    With w.PageSetup
        .Orientation = IIf(landscape, xlLandscape, xlPortrait)
        .PaperSize = xlPaperA4
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        .LeftMargin = Application.CentimetersToPoints(1)
        .RightMargin = Application.CentimetersToPoints(1)
        .TopMargin = Application.CentimetersToPoints(1.2)
        .BottomMargin = Application.CentimetersToPoints(1.2)
        .PrintTitleRows = judulBaris
        .CenterFooter = "Halaman &P dari &N"
        .LeftFooter = "GA Plant Cikarang"
    End With
    Application.PrintCommunication = True
End Sub

'==================================================================
'  ID PEKERJAAN OTOMATIS  (CS-001, GD-001, ...)
'==================================================================
Public Sub IsiIDOtomatis()
    Dim n As Long
    On Error GoTo EH
    n = IsiID()
    If n = 0 Then
        MsgBox "Semua pekerjaan sudah punya ID.", vbInformation, "Isi ID"
    Else
        MsgBox n & " ID pekerjaan baru sudah dibuat.", vbInformation, "Isi ID"
    End If
    Exit Sub
EH:
    TampilError Err.Description, "Isi ID"
End Sub

Private Function PrefixTim(ByVal tim As String) As String
    Select Case LCase$(Trim$(tim))
        Case "cleaning service": PrefixTim = "CS"
        Case "gardener": PrefixTim = "GD"
        Case Else
            If Len(Trim$(tim)) >= 2 Then
                PrefixTim = UCase$(Left$(Trim$(tim), 2))
            Else
                PrefixTim = "XX"
            End If
    End Select
End Function

Private Function IsiID() As Long
    Dim w As Worksheet, lr As Long, r As Long, id As String, p As String
    Dim mx As Object, n As Long, cnt As Long, pos As Long
    Set w = Sh(SH_JOB)
    Set mx = NewDict()
    lr = LastRowAny(w, J_ID, J_AREA)
    If lr < FIRST_ROW Then Exit Function
    For r = FIRST_ROW To lr
        id = Teks(w.Cells(r, J_ID).Value)
        pos = InStr(id, "-")
        If pos > 1 Then
            p = UCase$(Left$(id, pos - 1))
            n = CLng(Val(Mid$(id, pos + 1)))
            If Not mx.Exists(p) Then mx(p) = 0
            If n > mx(p) Then mx(p) = n
        End If
    Next r
    For r = FIRST_ROW To lr
        If Teks(w.Cells(r, J_ID).Value) = "" And Teks(w.Cells(r, J_TIM).Value) <> "" Then
            p = PrefixTim(Teks(w.Cells(r, J_TIM).Value))
            If Not mx.Exists(p) Then mx(p) = 0
            mx(p) = mx(p) + 1
            w.Cells(r, J_ID).Value = p & "-" & Format$(mx(p), "000")
            cnt = cnt + 1
        End If
    Next r
    IsiID = cnt
End Function

'==================================================================
'  1. GENERATE PLAN BULANAN
'==================================================================
Public Sub GeneratePlan()
    Dim per As Date, wJ As Worksheet, wD As Worksheet
    Dim dict As Object, ids As Object, lrD As Long, lrJ As Long, i As Long, h As Long, dd As Long
    Dim arr As Variant, jobs As Variant, outA() As Variant
    Dim hariSet(1 To 7) As Boolean, nH As Long, k As Long, fq As Long
    Dim nDays As Long, tgl As Date, key As String, n As Long, ada As Long
    Dim kode As Long, warn As String, nWarn As Long, idJob As String, aktif As String
    On Error GoTo EH

    per = GetPeriode()
    kode = KodePeriode(per)
    Set wJ = Sh(SH_JOB)
    Set wD = Sh(SH_DATA)

    ' cek plan yang sudah ada
    Set dict = NewDict()
    lrD = LastRow(wD, D_KEY)
    If lrD >= 2 Then
        arr = Baca(wD.Range(wD.Cells(2, D_KEY), wD.Cells(lrD, D_PER)))
        For i = 1 To UBound(arr, 1)
            dict(Teks(arr(i, 1))) = True
            If Teks(arr(i, 2)) = CStr(kode) Then ada = ada + 1
        Next i
    End If
    If ada > 0 Then
        If MsgBox("Plan " & LabelPeriode(per) & " sudah ada (" & ada & " jadwal)." & vbCrLf & vbCrLf & _
                  "Lanjutkan untuk menambah jadwal yang BELUM ADA saja?" & vbCrLf & _
                  "(Actual yang sudah diisi tidak berubah.)", vbQuestion + vbYesNo, "Generate Plan") = vbNo Then Exit Sub
    End If

    SpeedOn
    IsiID
    lrJ = LastRowAny(wJ, J_ID, J_AREA)
    If lrJ < FIRST_ROW Then Err.Raise vbObjectError + 514, , "DB_PEKERJAAN masih kosong."
    jobs = Baca(wJ.Range(wJ.Cells(FIRST_ROW, 1), wJ.Cells(lrJ, J_LASTCOL)))
    nDays = Day(DateSerial(Year(per), Month(per) + 1, 0))
    ReDim outA(1 To UBound(jobs, 1) * nDays, 1 To D_NCOL)
    Set ids = NewDict()

    For i = 1 To UBound(jobs, 1)
        idJob = Teks(jobs(i, J_ID))
        If idJob = "" Then GoTo NextJob
        aktif = UCase$(Teks(jobs(i, J_AKTIF)))
        If aktif = "TIDAK" Or aktif = "NO" Or aktif = "N" Then GoTo NextJob
        If ids.Exists(idJob) Then
            nWarn = nWarn + 1
            warn = warn & "- ID " & idJob & " dobel (baris " & (i + FIRST_ROW - 1) & "), dilewati." & vbCrLf
            GoTo NextJob
        End If
        ids(idJob) = True

        Erase hariSet
        nH = 0
        For h = J_H1 To J_H1 + 3
            k = HariKeAngka(Teks(jobs(i, h)))
            If k > 0 Then
                If Not hariSet(k) Then
                    hariSet(k) = True
                    nH = nH + 1
                End If
            End If
        Next h
        If nH = 0 Then
            nWarn = nWarn + 1
            warn = warn & "- " & idJob & ": Hari belum diisi, dilewati." & vbCrLf
            GoTo NextJob
        End If
        fq = FrekKeJumlah(Teks(jobs(i, J_FREK)))
        If fq > 0 And fq <> nH Then
            nWarn = nWarn + 1
            warn = warn & "- " & idJob & ": frekuensi " & Teks(jobs(i, J_FREK)) & " tapi hari terisi " & nH & "." & vbCrLf
        End If

        For dd = 1 To nDays
            tgl = DateSerial(Year(per), Month(per), dd)
            If hariSet(Weekday(tgl, vbMonday)) Then
                key = idJob & "|" & Format$(tgl, "yyyymmdd")
                If Not dict.Exists(key) Then
                    dict(key) = True
                    n = n + 1
                    outA(n, D_KEY) = key
                    outA(n, D_PER) = kode
                    outA(n, D_TGL) = tgl
                    outA(n, D_HARI) = NamaHari(tgl)
                    outA(n, D_MGG) = MingguKe(tgl)
                    outA(n, D_ID) = idJob
                    outA(n, D_TIM) = Teks(jobs(i, J_TIM))
                    outA(n, D_LOK) = Teks(jobs(i, J_LOK))
                    outA(n, D_TIPE) = Teks(jobs(i, J_TIPE))
                    outA(n, D_AREA) = Teks(jobs(i, J_AREA))
                    outA(n, D_FREK) = Teks(jobs(i, J_FREK))
                    outA(n, D_PTG) = Teks(jobs(i, J_PTG))
                    outA(n, D_PLAN) = 1
                End If
            End If
        Next dd
NextJob:
    Next i

    If n > 0 Then
        wD.Cells(lrD + 1, 1).Resize(n, D_NCOL).Value = outA
        wD.Columns(D_TGL).NumberFormat = "dd/mm/yyyy"
        wD.Columns(D_WAKTU).NumberFormat = "dd/mm/yyyy hh:mm"
        wD.Cells(1, 1).Resize(1, D_NCOL).NumberFormat = "General"
    End If
    SpeedOff
    PerbaruiSemua
    If n > 0 Then SyncCIKOPS CStr(kode)

    If Len(warn) > 700 Then warn = Left$(warn, 700) & vbCrLf & "... (dan lainnya)"
    MsgBox "Generate plan " & LabelPeriode(per) & " selesai." & vbCrLf & _
           n & " jadwal baru ditambahkan." & vbCrLf & _
           "Laporan Plan vs Actual & Laporan Bulanan sudah diperbarui." & _
           IIf(nWarn > 0, vbCrLf & vbCrLf & "PERHATIAN (" & nWarn & "):" & vbCrLf & warn, ""), _
           IIf(nWarn > 0, vbExclamation, vbInformation), "Generate Plan"
    Exit Sub
EH:
    TampilError Err.Description, "Generate Plan"
End Sub

Public Sub HapusPlanPeriode()
    Dim per As Date, kode As Long, wD As Worksheet, lr As Long, arr As Variant, keep() As Variant
    Dim i As Long, j As Long, m As Long, nDel As Long, nAct As Long
    On Error GoTo EH
    per = GetPeriode()
    kode = KodePeriode(per)
    Set wD = Sh(SH_DATA)
    lr = LastRow(wD, D_KEY)
    If lr < 2 Then
        MsgBox "Belum ada data plan.", vbInformation
        Exit Sub
    End If
    arr = Baca(wD.Range(wD.Cells(2, 1), wD.Cells(lr, D_NCOL)))
    For i = 1 To UBound(arr, 1)
        If Teks(arr(i, D_PER)) = CStr(kode) Then
            nDel = nDel + 1
            If Teks(arr(i, D_ACT)) <> "" Then nAct = nAct + 1
        End If
    Next i
    If nDel = 0 Then
        MsgBox "Tidak ada plan untuk " & LabelPeriode(per) & ".", vbInformation
        Exit Sub
    End If
    If MsgBox("Hapus " & nDel & " jadwal plan " & LabelPeriode(per) & "?", vbQuestion + vbYesNo, "Hapus Plan") = vbNo Then Exit Sub
    If nAct > 0 Then
        If MsgBox("PERHATIAN: " & nAct & " jadwal sudah ada ACTUAL-nya dan ikut terhapus." & vbCrLf & "Yakin lanjut?", _
                  vbExclamation + vbYesNo, "Hapus Plan") = vbNo Then Exit Sub
    End If
    SpeedOn
    ReDim keep(1 To UBound(arr, 1), 1 To D_NCOL)
    For i = 1 To UBound(arr, 1)
        If Teks(arr(i, D_PER)) <> CStr(kode) Then
            m = m + 1
            For j = 1 To D_NCOL
                keep(m, j) = arr(i, j)
            Next j
        End If
    Next i
    wD.Range(wD.Cells(2, 1), wD.Cells(lr, D_NCOL)).ClearContents
    If m > 0 Then wD.Cells(2, 1).Resize(m, D_NCOL).Value = keep
    SpeedOff
    PerbaruiSemua
    SyncCIKOPS CStr(kode)
    MsgBox nDel & " jadwal " & LabelPeriode(per) & " sudah dihapus.", vbInformation, "Hapus Plan"
    Exit Sub
EH:
    TampilError Err.Description, "Hapus Plan"
End Sub

'==================================================================
'  2. INPUT ACTUAL MINGGUAN (SPV)
'==================================================================
' Tombol bergaya (shape). gaya: 1 = biru, 2 = garis biru, 3 = hijau
Private Sub TombolXY(ByVal w As Worksheet, ByVal nama As String, ByVal x As Double, ByVal y As Double, _
                     ByVal wd As Double, ByVal ht As Double, ByVal cap As String, ByVal mac As String, ByVal gaya As Long)
    Dim s As Shape, warna As Long
    Select Case gaya
        Case 3: warna = C_GREEN()
        Case 2: warna = vbWhite
        Case Else: warna = C_BLUE()
    End Select
    Set s = Kotak(w, nama, x, y, wd, ht, warna, 6)
    If gaya = 2 Then
        s.Line.Visible = -1
        s.Line.ForeColor.RGB = C_BLUE()
        s.Line.Weight = 1.25
    End If
    Bayangan s
    With s.TextFrame2
        .VerticalAnchor = 3
        .WordWrap = -1
        .TextRange.Text = cap
        .TextRange.Font.Name = FONT_UI
        .TextRange.Font.Size = 9.5
        .TextRange.Font.Bold = -1
        .TextRange.Font.Fill.ForeColor.RGB = IIf(gaya = 2, C_BLUE_DK(), vbWhite)
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    s.OnAction = mac
End Sub

' Bangun tampilan form INPUT_ACTUAL (bagian atas). Data grid tidak dihapus.
Public Sub BangunFormInput()
    Dim w As Worksheet, vSpv As Variant, vTim As Variant, vLok As Variant, vTgl As Variant
    Dim i As Long, x As Double, y As Double, tw As Double, tht As Double, xs As Double, xe As Double
    Dim lbl As Variant, warna As Variant, pesan As Variant, hdr As Variant, rg As Range
    On Error GoTo EH
    Set w = Sh(SH_INPUT)
    vSpv = w.Range("C4").Value
    vTim = w.Range("C5").Value
    vLok = w.Range("C6").Value
    vTgl = w.Range("C7").Value
    If Teks(vTim) = "" Then vTim = "Semua"
    If Teks(vTgl) = "" Then vTgl = Date

    SpeedOn
    For i = w.Shapes.Count To 1 Step -1
        If Left$(w.Shapes(i).Name, 3) = "fi_" Or Left$(w.Shapes(i).Name, 4) = "btn_" Then w.Shapes(i).Delete
    Next i
    On Error Resume Next
    w.Buttons.Delete
    On Error GoTo EH
    With w.Range("A1:K10")
        .UnMerge
        .Validation.Delete
        .FormatConditions.Delete
        .Clear
    End With

    ' kolom grid: A key (tersembunyi), B tanggal, C hari, D tim, E lokasi, F tipe, G area, H petugas, I actual
    w.Columns(1).ColumnWidth = 2
    w.Columns(1).Hidden = True
    w.Columns(2).ColumnWidth = 17
    w.Columns(3).ColumnWidth = 10
    w.Columns(4).ColumnWidth = 17
    w.Columns(5).ColumnWidth = 24
    w.Columns(6).ColumnWidth = 20
    w.Columns(7).ColumnWidth = 32
    w.Columns(8).ColumnWidth = 20
    w.Columns(9).ColumnWidth = 14
    w.Columns(10).ColumnWidth = 3
    With w.Range("A1:J9")
        .Interior.Color = C_BG()
        .Font.Name = FONT_UI
    End With
    w.Range("A10:I10").Font.Name = FONT_UI

    ' banner
    With w.Range("A1:J2")
        .Interior.Color = C_BLUE()
        .Font.Color = vbWhite
        .VerticalAlignment = xlCenter
    End With
    w.Range("B1").Value = "INPUT ACTUAL MINGGUAN"
    w.Range("B1").Font.Size = 16
    w.Range("B1").Font.Bold = True
    w.Range("B2").Value = "Diisi SPV setiap minggu" & Dot() & "1 = dikerjakan" & Dot() & "0 = tidak dikerjakan" & Dot() & _
                          "klik Simpan Actual setelah selesai"
    w.Range("B2").Font.Size = 9
    w.Range("B2").Font.Color = RGB(220, 232, 250)
    w.Rows(1).RowHeight = 34
    w.Rows(2).RowHeight = 18
    With w.Range("A2:J2").Borders(xlEdgeBottom)
        .LineStyle = xlContinuous
        .Weight = xlThick
        .Color = C_RED()
    End With
    w.Rows(3).RowHeight = 10

    ' field isian
    lbl = Array("Nama SPV", "Tim", "Lokasi", "Tanggal (minggu)")
    pesan = Array("Pilih nama SPV yang mengisi.", "Pilih tim, atau Semua.", _
                  "Kosongkan untuk menampilkan semua lokasi.", "Isi tanggal mana saja di minggu yang mau diinput (dd/mm/yyyy).")
    For i = 0 To 3
        With w.Cells(4 + i, 2)
            .Value = lbl(i)
            .Font.Size = 9
            .Font.Bold = True
            .Font.Color = C_MUTED()
            .HorizontalAlignment = xlRight
            .VerticalAlignment = xlCenter
        End With
        Set rg = w.Range(w.Cells(4 + i, 3), w.Cells(4 + i, 4))
        rg.Merge
        rg.Interior.Color = vbWhite
        rg.Font.Size = 10
        rg.Font.Bold = True
        rg.Font.Color = C_TXT()
        rg.HorizontalAlignment = xlLeft
        rg.IndentLevel = 1
        rg.VerticalAlignment = xlCenter
        rg.BorderAround LineStyle:=xlContinuous, Weight:=xlThin, Color:=RGB(160, 180, 210)
        w.Rows(4 + i).RowHeight = 22
    Next i
    w.Range("C4").Value = vSpv
    w.Range("C5").Value = vTim
    w.Range("C6").Value = vLok
    w.Range("C7").Value = vTgl
    w.Range("C7").NumberFormat = "dd/mm/yyyy"
    On Error Resume Next
    w.Range("C4").Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertInformation, Operator:=xlBetween, Formula1:="=lstNama"
    w.Range("C5").Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=lstTimFilter"
    w.Range("C6").Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=lstLokasi"
    w.Range("C7").Validation.Add Type:=xlValidateDate, AlertStyle:=xlValidAlertStop, Operator:=xlGreater, _
                                 Formula1:=CStr(CLng(DateSerial(2020, 1, 1)))
    For i = 0 To 3
        With w.Cells(4 + i, 3).Validation
            .InputTitle = lbl(i)
            .InputMessage = pesan(i)
            .ShowInput = True
            .ErrorMessage = "Pilih dari daftar."
        End With
    Next i
    w.Range("C7").Validation.ErrorMessage = "Isi tanggal yang benar (dd/mm/yyyy)."
    On Error GoTo EH

    ' periode minggu
    With w.Range("B8")
        .Value = "Periode minggu"
        .Font.Size = 9
        .Font.Bold = True
        .Font.Color = C_MUTED()
        .HorizontalAlignment = xlRight
    End With
    With w.Range("C8:I8")
        .Merge
        .Font.Size = 10
        .Font.Bold = True
        .Font.Color = C_BLUE()
        .HorizontalAlignment = xlLeft
        .IndentLevel = 1
    End With
    w.Rows(8).RowHeight = 22
    w.Rows(9).RowHeight = 38

    ' header grid
    hdr = Array("Key", "Tanggal", "Hari", "Tim", "Lokasi", "Tipe Pekerjaan", "Area Pekerjaan", "Petugas", "ACTUAL (1/0)")
    For i = 0 To 8
        w.Cells(10, i + 1).Value = hdr(i)
    Next i
    With w.Range("A10:I10")
        .Interior.Color = C_BLUE_DK()
        .Font.Color = vbWhite
        .Font.Bold = True
        .Font.Size = 9.5
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(60, 90, 140)
    End With
    w.Range("I10").Interior.Color = C_ORANGE()
    w.Rows(10).RowHeight = 26

    ' kartu ringkasan (kanan atas)
    xs = w.Cells(4, 5).Left
    xe = w.Cells(4, 10).Left - 4
    y = w.Cells(4, 1).Top
    tht = w.Cells(8, 1).Top - y - 4
    tw = (xe - xs - 3 * 10) / 4
    lbl = Array("JADWAL MINGGU INI", "SUDAH DIISI", "DIKERJAKAN (1)", "TIDAK DIKERJAKAN (0)")
    warna = Array(C_BLUE(), C_ORANGE(), C_GREEN(), C_RED())
    For i = 0 To 3
        x = xs + i * (tw + 10)
        KartuAksen w, "fi_k" & (i + 1), x, y, tw, tht, CLng(warna(i))
        Tulisan w, "fi_l" & (i + 1), x + 16, y + 8, tw - 22, 14, CStr(lbl(i)), 8, True, RGB(55, 65, 82)
        Tulisan w, "fi_v" & (i + 1), x + 16, y + 24, tw - 22, 32, "0", 20, True, CLng(warna(i))
        Tulisan w, "fi_s" & (i + 1), x + 16, y + tht - 20, tw - 22, 14, "", 7.5, False, C_MUTED()
    Next i

    ' tombol
    y = w.Cells(9, 1).Top + 6
    x = w.Cells(9, 2).Left
    TombolXY w, "fi_prev", x, y, 104, 26, ChrW(9664) & "  Minggu lalu", "MingguLalu", 2
    TombolXY w, "fi_show", x + 112, y, 140, 26, "Tampilkan Jadwal", "TampilkanJadwal", 1
    TombolXY w, "fi_next", x + 260, y, 110, 26, "Minggu depan  " & ChrW(9654), "MingguDepan", 2
    TombolXY w, "fi_isi", x + 392, y, 136, 26, "Isi yang kosong = 1", "IsiKosongSatu", 2
    TombolXY w, "fi_save", x + 536, y, 140, 26, "Simpan Actual", "SimpanActual", 3
    TombolXY w, "fi_menu", xe - 130, y, 130, 26, "Kembali ke MENU", "KeMenuDariInput", 2

    HitungRingkasInput w
    SpeedOff
    w.Activate
    With ActiveWindow
        .FreezePanes = False
        .ScrollRow = 1
        .ScrollColumn = 1
        .DisplayGridlines = False
        .DisplayHeadings = False
    End With
    w.Range("A11").Select
    ActiveWindow.FreezePanes = True
    w.Range("C4").Select
    Exit Sub
EH:
    TampilError Err.Description, "Form Input"
End Sub

Private Sub HitungRingkasInput(ByVal w As Worksheet)
    Dim lr As Long, r As Long, n As Long, isi As Long, satu As Long, nol As Long, v As String
    lr = LastRow(w, 1)
    For r = IN_FIRST To lr
        If Teks(w.Cells(r, 1).Value) <> "" Then
            n = n + 1
            v = Teks(w.Cells(r, IN_ACT).Value)
            If v <> "" Then isi = isi + 1
            If v = "1" Then satu = satu + 1
            If v = "0" Then nol = nol + 1
        End If
    Next r
    SetTeks w, "fi_v1", Format$(n, "#,##0")
    SetTeks w, "fi_s1", "pekerjaan sesuai filter"
    SetTeks w, "fi_v2", Format$(isi, "#,##0") & " / " & Format$(n, "#,##0")
    SetTeks w, "fi_s2", IIf(n > 0, Persen(isi, n) & " terisi", "-")
    SetTeks w, "fi_v3", Format$(satu, "#,##0")
    SetTeks w, "fi_s3", IIf(isi > 0, Persen(satu, isi) & " dari yang terisi", "-")
    SetTeks w, "fi_v4", Format$(nol, "#,##0")
    SetTeks w, "fi_s4", IIf(isi > 0, Persen(nol, isi) & " dari yang terisi", "-")
End Sub

' Jumlah isian di grid yang berbeda dengan database (belum disimpan)
Private Function HitungBelumDisimpan(ByVal w As Worksheet) As Long
    Dim wD As Worksheet, lr As Long, lrD As Long, grid As Variant, d As Variant, dict As Object, i As Long, k As String
    Set wD = Sh(SH_DATA)
    lr = LastRow(w, 1)
    If lr < IN_FIRST Then Exit Function
    lrD = LastRow(wD, D_KEY)
    If lrD < 2 Then Exit Function
    grid = Baca(w.Range(w.Cells(IN_FIRST, 1), w.Cells(lr, IN_NCOL)))
    d = Baca(wD.Range(wD.Cells(2, 1), wD.Cells(lrD, D_ACT)))
    Set dict = NewDict()
    For i = 1 To UBound(d, 1)
        dict(Teks(d(i, D_KEY))) = Teks(d(i, D_ACT))
    Next i
    For i = 1 To UBound(grid, 1)
        k = Teks(grid(i, 1))
        If k <> "" Then
            If dict.Exists(k) Then
                If dict(k) <> Teks(grid(i, IN_ACT)) Then HitungBelumDisimpan = HitungBelumDisimpan + 1
            End If
        End If
    Next i
End Function

' True jika boleh meninggalkan / mengganti tampilan grid
Private Function BolehGanti() As Boolean
    Dim n As Long, jwb As Long
    On Error Resume Next
    n = HitungBelumDisimpan(Sh(SH_INPUT))
    On Error GoTo 0
    If n = 0 Then
        BolehGanti = True
        Exit Function
    End If
    jwb = MsgBox(n & " isian actual belum disimpan." & vbCrLf & vbCrLf & _
                 "Yes  = simpan dulu" & vbCrLf & "No   = abaikan perubahan" & vbCrLf & "Cancel = batal", _
                 vbExclamation + vbYesNoCancel, "Input Actual")
    Select Case jwb
        Case vbYes: BolehGanti = SimpanInti()
        Case vbNo: BolehGanti = True
        Case Else: BolehGanti = False
    End Select
End Function

Public Sub TampilkanJadwal()
    If BolehGanti() Then TampilJadwalInti False
End Sub

Public Sub MingguLalu()
    GeserMinggu -7
End Sub

Public Sub MingguDepan()
    GeserMinggu 7
End Sub

Private Sub GeserMinggu(ByVal hari As Long)
    Dim w As Worksheet, d As Date, ok As Boolean
    If Not BolehGanti() Then Exit Sub
    Set w = Sh(SH_INPUT)
    d = KeTanggal(w.Range("C7").Value, ok)
    If Not ok Then d = Date
    w.Range("C7").Value = d + hari
    TampilJadwalInti False
End Sub

Public Sub KeMenuDariInput()
    If BolehGanti() Then KeMenu
End Sub

Private Sub TampilJadwalInti(ByVal diam As Boolean)
    Dim w As Worksheet, wD As Worksheet, ok As Boolean, d0 As Date, senin As Date, mgg As Date
    Dim tim As String, lok As String, arr As Variant, lr As Long, i As Long, n As Long
    Dim outA() As Variant, t As Date
    On Error GoTo EH
    Set w = Sh(SH_INPUT)
    Set wD = Sh(SH_DATA)
    If Not AdaShape(w, "fi_v1") Then BangunFormInput
    d0 = KeTanggal(w.Range("C7").Value, ok)
    If Not ok Then Err.Raise vbObjectError + 515, , "Isi Tanggal dengan salah satu tanggal di minggu yang mau diinput."
    senin = d0 - Weekday(d0, vbMonday) + 1
    mgg = senin + 6
    tim = Teks(w.Range("C5").Value)
    If LCase$(tim) = "semua" Then tim = ""
    lok = Teks(w.Range("C6").Value)
    If LCase$(lok) = "semua" Then lok = ""

    SpeedOn
    BersihkanGrid w
    lr = LastRow(wD, D_KEY)
    If lr >= 2 Then
        arr = Baca(wD.Range(wD.Cells(2, 1), wD.Cells(lr, D_NCOL)))
        ReDim outA(1 To UBound(arr, 1), 1 To IN_NCOL)
        For i = 1 To UBound(arr, 1)
            t = KeTanggal(arr(i, D_TGL), ok)
            If ok Then
                If t >= senin And t <= mgg Then
                    If (tim = "" Or LCase$(Teks(arr(i, D_TIM))) = LCase$(tim)) And _
                       (lok = "" Or LCase$(Teks(arr(i, D_LOK))) = LCase$(lok)) Then
                        n = n + 1
                        outA(n, 1) = arr(i, D_KEY)
                        outA(n, 2) = t
                        outA(n, 3) = arr(i, D_HARI)
                        outA(n, 4) = arr(i, D_TIM)
                        outA(n, 5) = arr(i, D_LOK)
                        outA(n, 6) = arr(i, D_TIPE)
                        outA(n, 7) = arr(i, D_AREA)
                        outA(n, 8) = arr(i, D_PTG)
                        outA(n, 9) = arr(i, D_ACT)
                    End If
                End If
            End If
        Next i
    End If

    w.Range("C8").Value = "Senin " & Format$(senin, "dd/mm/yyyy") & "  s/d  Minggu " & Format$(mgg, "dd/mm/yyyy") & _
                          "     " & ChrW(183) & "     " & n & " pekerjaan" & _
                          IIf(tim = "", "", "  " & ChrW(183) & "  " & tim) & IIf(lok = "", "", "  " & ChrW(183) & "  " & lok)
    If n > 0 Then
        With w.Cells(IN_FIRST, 1).Resize(n, IN_NCOL)
            .Value = outA
            .Sort Key1:=.Columns(2), Order1:=xlAscending, Key2:=.Columns(5), Order2:=xlAscending, _
                  Key3:=.Columns(6), Order3:=xlAscending, Header:=xlNo
        End With
        FormatGrid w, n
    End If
    HitungRingkasInput w
    SpeedOff
    w.Activate
    If n = 0 Then
        If Not diam Then
            MsgBox "Tidak ada jadwal pada minggu tersebut." & vbCrLf & _
                   "Pastikan plan bulan itu sudah di-Generate di MENU.", vbInformation, "Input Actual"
        End If
    Else
        w.Cells(IN_FIRST, IN_ACT).Select
    End If
    Exit Sub
EH:
    TampilError Err.Description, "Tampilkan Jadwal"
End Sub

Private Sub BersihkanGrid(ByVal w As Worksheet)
    Dim lr As Long
    lr = LastRowAny(w, 1, IN_NCOL)
    If lr >= IN_FIRST Then
        With w.Range(w.Cells(IN_FIRST, 1), w.Cells(lr, IN_NCOL))
            .FormatConditions.Delete
            .Validation.Delete
            .Clear
        End With
        w.Range(w.Cells(IN_FIRST, 1), w.Cells(lr, 1)).EntireRow.RowHeight = w.StandardHeight
    End If
End Sub

Private Sub FormatGrid(ByVal w As Worksheet, ByVal n As Long)
    Dim fc As Object, r As Long, band As Boolean, sama As Boolean
    With w.Range(w.Cells(IN_FIRST, 1), w.Cells(IN_FIRST + n - 1, IN_NCOL))
        .Font.Name = FONT_UI
        .Font.Size = 9.5
        .Font.Color = C_TXT()
        .VerticalAlignment = xlCenter
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(214, 221, 232)
        .RowHeight = 19
    End With
    w.Range(w.Cells(IN_FIRST, 2), w.Cells(IN_FIRST + n - 1, 2)).NumberFormat = "dd/mm/yyyy"
    w.Range(w.Cells(IN_FIRST, 2), w.Cells(IN_FIRST + n - 1, 3)).HorizontalAlignment = xlCenter

    ' pita per hari: warna selang-seling + garis pemisah antar hari
    For r = IN_FIRST To IN_FIRST + n - 1
        sama = False
        If r > IN_FIRST Then sama = (CDbl(w.Cells(r, 2).Value) = CDbl(w.Cells(r - 1, 2).Value))
        If r > IN_FIRST And Not sama Then
            band = Not band
            With w.Range(w.Cells(r, 2), w.Cells(r, IN_ACT)).Borders(xlEdgeTop)
                .LineStyle = xlContinuous
                .Weight = xlMedium
                .Color = C_BLUE()
            End With
        End If
        If band Then
            w.Range(w.Cells(r, 2), w.Cells(r, IN_ACT - 1)).Interior.Color = RGB(240, 245, 252)
        Else
            w.Range(w.Cells(r, 2), w.Cells(r, IN_ACT - 1)).Interior.Color = vbWhite
        End If
        If sama Then
            w.Range(w.Cells(r, 2), w.Cells(r, 3)).Font.Color = RGB(165, 172, 184)
        Else
            w.Range(w.Cells(r, 2), w.Cells(r, 3)).Font.Bold = True
        End If
    Next r

    With w.Range(w.Cells(IN_FIRST, IN_ACT), w.Cells(IN_FIRST + n - 1, IN_ACT))
        .HorizontalAlignment = xlCenter
        .Font.Bold = True
        .Font.Size = 11
        .Interior.Color = RGB(255, 242, 204)
        .Validation.Delete
        .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=lstActual"
        .Validation.ErrorTitle = "Actual"
        .Validation.ErrorMessage = "Isi 1 (dikerjakan) atau 0 (tidak dikerjakan)."
        .FormatConditions.Delete
        Set fc = .FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=1")
        fc.Interior.Color = RGB(198, 239, 206)
        fc.Font.Color = RGB(0, 97, 0)
        Set fc = .FormatConditions.Add(Type:=xlTextString, String:="0", TextOperator:=xlContains)
        fc.Interior.Color = RGB(255, 199, 206)
        fc.Font.Color = RGB(156, 0, 6)
    End With
End Sub

Public Sub IsiKosongSatu()
    Dim w As Worksheet, lr As Long, r As Long, n As Long
    Set w = Sh(SH_INPUT)
    lr = LastRow(w, 1)
    If lr < IN_FIRST Then
        MsgBox "Klik 'Tampilkan Jadwal' dulu.", vbInformation
        Exit Sub
    End If
    For r = IN_FIRST To lr
        If Teks(w.Cells(r, IN_ACT).Value) = "" Then
            w.Cells(r, IN_ACT).Value = 1
            n = n + 1
        End If
    Next r
    HitungRingkasInput w
    MsgBox n & " baris diisi 1." & vbCrLf & "Ubah ke 0 untuk pekerjaan yang TIDAK dikerjakan, lalu klik 'Simpan Actual'.", _
           vbInformation, "Input Actual"
End Sub

Public Sub SimpanActual()
    SimpanInti
End Sub

Private Function SimpanInti() As Boolean
    Dim w As Worksheet, wD As Worksheet, spv As String, lr As Long, lrD As Long
    Dim grid As Variant, keys As Variant, blok As Variant, dict As Object
    Dim i As Long, r As Long, v As String, nKosong As Long, nSimpan As Long, nHilang As Long, salah As String
    On Error GoTo EH
    Set w = Sh(SH_INPUT)
    Set wD = Sh(SH_DATA)
    spv = Teks(w.Range("C4").Value)
    If spv = "" Then Err.Raise vbObjectError + 516, , "Isi Nama SPV dulu."
    lr = LastRow(w, 1)
    If lr < IN_FIRST Then Err.Raise vbObjectError + 517, , "Belum ada jadwal yang ditampilkan."
    grid = Baca(w.Range(w.Cells(IN_FIRST, 1), w.Cells(lr, IN_NCOL)))

    For i = 1 To UBound(grid, 1)
        v = Teks(grid(i, IN_ACT))
        If v = "" Then
            nKosong = nKosong + 1
        ElseIf v <> "1" And v <> "0" Then
            salah = salah & (i + IN_FIRST - 1) & " "
        End If
    Next i
    If salah <> "" Then Err.Raise vbObjectError + 518, , "Actual hanya boleh 1 atau 0." & vbCrLf & "Cek baris: " & salah
    If nKosong > 0 Then
        If MsgBox(nKosong & " pekerjaan belum diisi (kosong)." & vbCrLf & "Tetap simpan?", _
                  vbQuestion + vbYesNo, "Simpan Actual") = vbNo Then Exit Function
    End If

    SpeedOn
    lrD = LastRow(wD, D_KEY)
    If lrD < 2 Then Err.Raise vbObjectError + 519, , "DATA_PLAN_ACTUAL kosong."
    keys = Baca(wD.Range(wD.Cells(2, D_KEY), wD.Cells(lrD, D_KEY)))
    blok = Baca(wD.Range(wD.Cells(2, D_ACT), wD.Cells(lrD, D_WAKTU)))
    Set dict = NewDict()
    For i = 1 To UBound(keys, 1)
        dict(Teks(keys(i, 1))) = i
    Next i
    For i = 1 To UBound(grid, 1)
        If dict.Exists(Teks(grid(i, 1))) Then
            r = dict(Teks(grid(i, 1)))
            v = Teks(grid(i, IN_ACT))
            If v = "" Then
                blok(r, 1) = Empty
                blok(r, 2) = Empty
                blok(r, 3) = Empty
            Else
                blok(r, 1) = CLng(v)
                blok(r, 2) = spv
                blok(r, 3) = Now
                nSimpan = nSimpan + 1
            End If
        Else
            nHilang = nHilang + 1
        End If
    Next i
    wD.Range(wD.Cells(2, D_ACT), wD.Cells(lrD, D_WAKTU)).Value = blok
    wD.Columns(D_WAKTU).NumberFormat = "dd/mm/yyyy hh:mm"
    wD.Cells(1, D_WAKTU).NumberFormat = "General"
    SpeedOff
    HitungRingkasInput w
    PerbaruiSemua
    MsgBox nSimpan & " actual tersimpan oleh " & spv & "." & _
           IIf(nHilang > 0, vbCrLf & nHilang & " baris tidak ditemukan di database (plan mungkin dihapus).", ""), _
           vbInformation, "Simpan Actual"
    SimpanInti = True
    SyncCIKOPS ""
    Exit Function
EH:
    TampilError Err.Description, "Simpan Actual"
End Function

' Sinkron ke CIKOPS (modul modSyncGA). Aman bila modul belum dipasang / offline.
Private Sub SyncCIKOPS(ByVal periodes As String)
    On Error Resume Next
    Application.Run "GASync_Otomatis", periodes
    Err.Clear
End Sub

Public Sub KeSinkronCIKOPS()
    On Error GoTo EH
    Application.Run "SinkronKeCIKOPS"
    Exit Sub
EH:
    MsgBox "Modul sinkron CIKOPS (modSyncGA) belum dipasang." & vbCrLf & "Import modSyncGA.bas lewat Alt+F11 > File > Import File.", vbExclamation, "Sinkron CIKOPS"
End Sub

'==================================================================
'  3. LAPORAN PLAN VS ACTUAL (format matriks)
'==================================================================
Public Sub BuatLaporanPlanActual()
    On Error GoTo EH
    SpeedOn
    BuatLapPA GetPeriode(), Teks(MenuCell("MenuTim", "C8").Value)
    SpeedOff
    KeluarLayarPenuhDiam
    Sh(SH_LAPPA).Activate
    Sh(SH_LAPPA).Range("A1").Select
    Exit Sub
EH:
    TampilError Err.Description, "Laporan Plan vs Actual"
End Sub

Private Sub BuatLapPA(ByVal per As Date, ByVal timF As String)
    Dim w As Worksheet, wD As Worksheet, wJ As Worksheet, lr As Long, arr As Variant, i As Long, j As Long
    Dim kode As Long, urut As Object, jobIdx As Object, nJob As Long, idx As Long, dd As Long, nDays As Long
    Dim info() As Variant, pl() As Long, ac() As Variant, ord() As Long, outA() As Variant
    Dim c0 As Long, cA As Long, cT As Long, nCol As Long, rLast As Long
    Dim tp As Long, ta As Long, gp As Long, ga As Long, t As Date, ok As Boolean, hdr As Variant
    Dim fc As Object

    Set w = Sh(SH_LAPPA)
    Set wD = Sh(SH_DATA)
    Set wJ = Sh(SH_JOB)
    If LCase$(timF) = "semua" Then timF = ""
    kode = KodePeriode(per)
    nDays = Day(DateSerial(Year(per), Month(per) + 1, 0))

    ' urutan baris mengikuti urutan di DB_PEKERJAAN
    Set urut = NewDict()
    lr = LastRow(wJ, J_ID)
    If lr >= FIRST_ROW Then
        arr = Baca(wJ.Range(wJ.Cells(FIRST_ROW, J_ID), wJ.Cells(lr, J_ID)))
        For i = 1 To UBound(arr, 1)
            If Not urut.Exists(Teks(arr(i, 1))) Then urut(Teks(arr(i, 1))) = i
        Next i
    End If

    ' kumpulkan data
    Set jobIdx = NewDict()
    lr = LastRow(wD, D_KEY)
    If lr >= 2 Then
        arr = Baca(wD.Range(wD.Cells(2, 1), wD.Cells(lr, D_NCOL)))
        ReDim info(1 To UBound(arr, 1), 1 To 8)
        ReDim pl(1 To UBound(arr, 1), 1 To 31)
        ReDim ac(1 To UBound(arr, 1), 1 To 31)
        For i = 1 To UBound(arr, 1)
            If Teks(arr(i, D_PER)) = CStr(kode) Then
                t = KeTanggal(arr(i, D_TGL), ok)
                If ok And (timF = "" Or LCase$(Teks(arr(i, D_TIM))) = LCase$(timF)) Then
                    If Not jobIdx.Exists(Teks(arr(i, D_ID))) Then
                        nJob = nJob + 1
                        jobIdx(Teks(arr(i, D_ID))) = nJob
                        info(nJob, 1) = arr(i, D_ID)
                        info(nJob, 2) = arr(i, D_TIM)
                        info(nJob, 3) = arr(i, D_PTG)
                        info(nJob, 4) = arr(i, D_LOK)
                        info(nJob, 5) = arr(i, D_TIPE)
                        info(nJob, 6) = arr(i, D_AREA)
                        info(nJob, 7) = arr(i, D_FREK)
                        If urut.Exists(Teks(arr(i, D_ID))) Then
                            info(nJob, 8) = urut(Teks(arr(i, D_ID)))
                        Else
                            info(nJob, 8) = 100000 + nJob
                        End If
                    End If
                    idx = jobIdx(Teks(arr(i, D_ID)))
                    dd = Day(t)
                    pl(idx, dd) = 1
                    If Teks(arr(i, D_ACT)) <> "" Then ac(idx, dd) = CLng(Val(Teks(arr(i, D_ACT))))
                End If
            End If
        Next i
    End If

    ResetSheet w
    w.Cells.Font.Name = FONT_UI
    w.Cells.Font.Size = 9
    c0 = 9
    cA = c0 + nDays
    cT = cA + nDays
    nCol = cT + 3

    w.Range("A1").Value = "PLAN VS ACTUAL CLEANING & GARDENING - GA PLANT CIKARANG"
    Banner w, nCol, 14
    If timF = "" Then
        w.Range("A2").Value = "Periode: " & LabelPeriode(per) & "     Tim: Semua     Diperbarui: " & Format$(Now, "dd/mm/yyyy hh:nn")
    Else
        w.Range("A2").Value = "Periode: " & LabelPeriode(per) & "     Tim: " & timF & "     Diperbarui: " & Format$(Now, "dd/mm/yyyy hh:nn")
    End If
    w.Range("A2").Font.Bold = True

    ' header
    hdr = Array("No", "ID", "Tim", "Petugas", "Lokasi", "Tipe Pekerjaan", "Area Pekerjaan", "Frek")
    For j = 0 To 7
        w.Cells(6, j + 1).Value = hdr(j)
    Next j
    w.Range(w.Cells(4, c0), w.Cells(4, cA - 1)).Merge
    w.Cells(4, c0).Value = "PLAN"
    w.Range(w.Cells(4, cA), w.Cells(4, cT - 1)).Merge
    w.Cells(4, cA).Value = "ACTUAL"
    w.Range(w.Cells(4, cT), w.Cells(4, nCol)).Merge
    w.Cells(4, cT).Value = "ACHIEVEMENT"
    w.Cells(6, cT).Value = "Total Plan"
    w.Cells(6, cT + 1).Value = "Total Actual"
    w.Cells(6, cT + 2).Value = "Plan vs Actual (%)"
    w.Cells(6, cT + 3).Value = "Status"
    With w.Range(w.Cells(4, 1), w.Cells(6, nCol))
        .Font.Bold = True
        .Font.Color = vbWhite
        .Interior.Color = RGB(17, 82, 170)
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .WrapText = True
    End With
    w.Range(w.Cells(4, cA), w.Cells(6, cT - 1)).Interior.Color = RGB(84, 130, 53)
    w.Range(w.Cells(4, cT), w.Cells(6, nCol)).Interior.Color = RGB(191, 143, 0)
    For dd = 1 To nDays
        t = DateSerial(Year(per), Month(per), dd)
        w.Cells(5, c0 + dd - 1).Value = HariSingkat(t)
        w.Cells(5, cA + dd - 1).Value = HariSingkat(t)
        w.Cells(6, c0 + dd - 1).Value = dd
        w.Cells(6, cA + dd - 1).Value = dd
        If Weekday(t, vbMonday) = 7 Then
            w.Range(w.Cells(5, c0 + dd - 1), w.Cells(6, c0 + dd - 1)).Interior.Color = RGB(192, 0, 0)
            w.Range(w.Cells(5, cA + dd - 1), w.Cells(6, cA + dd - 1)).Interior.Color = RGB(192, 0, 0)
        End If
    Next dd

    If nJob = 0 Then
        w.Range("A7").Value = "Belum ada data plan untuk periode ini. Klik 'Generate Plan Bulanan' di MENU."
        w.Range("A7").Font.Italic = True
    Else
        ' urutkan (insertion sort)
        ReDim ord(1 To nJob)
        For i = 1 To nJob
            ord(i) = i
        Next i
        For i = 2 To nJob
            idx = ord(i)
            j = i - 1
            Do While j >= 1
                If info(ord(j), 8) <= info(idx, 8) Then Exit Do
                ord(j + 1) = ord(j)
                j = j - 1
            Loop
            ord(j + 1) = idx
        Next i

        ReDim outA(1 To nJob + 1, 1 To nCol)
        For i = 1 To nJob
            idx = ord(i)
            outA(i, 1) = i
            For j = 1 To 7
                outA(i, j + 1) = info(idx, j)
            Next j
            tp = 0
            ta = 0
            For dd = 1 To nDays
                If pl(idx, dd) = 1 Then
                    outA(i, c0 + dd - 1) = "/"
                    tp = tp + 1
                End If
                If Not IsEmpty(ac(idx, dd)) Then
                    outA(i, cA + dd - 1) = ac(idx, dd)
                    ta = ta + ac(idx, dd)
                End If
            Next dd
            outA(i, cT) = tp
            outA(i, cT + 1) = ta
            If tp > 0 Then
                outA(i, cT + 2) = ta / tp
                If ta >= tp Then outA(i, cT + 3) = "Achieve" Else outA(i, cT + 3) = "Not Achieve"
            Else
                outA(i, cT + 3) = "-"
            End If
            gp = gp + tp
            ga = ga + ta
        Next i
        outA(nJob + 1, 2) = "TOTAL"
        outA(nJob + 1, cT) = gp
        outA(nJob + 1, cT + 1) = ga
        If gp > 0 Then
            outA(nJob + 1, cT + 2) = ga / gp
            If ga >= gp Then outA(nJob + 1, cT + 3) = "Achieve" Else outA(nJob + 1, cT + 3) = "Not Achieve"
        End If
        w.Cells(7, 1).Resize(nJob + 1, nCol).Value = outA
        rLast = 7 + nJob

        With w.Range(w.Cells(7, 1), w.Cells(rLast, nCol))
            .Font.Size = 9
            .VerticalAlignment = xlCenter
        End With
        w.Range(w.Cells(7, c0), w.Cells(rLast, nCol)).HorizontalAlignment = xlCenter
        w.Range(w.Cells(7, 1), w.Cells(rLast, 1)).HorizontalAlignment = xlCenter
        w.Range(w.Cells(7, cT + 2), w.Cells(rLast, cT + 2)).NumberFormat = "0.0%"
        With w.Range(w.Cells(rLast, 1), w.Cells(rLast, nCol))
            .Font.Bold = True
            .Interior.Color = RGB(217, 217, 217)
        End With

        ' warna
        Set fc = w.Range(w.Cells(7, c0), w.Cells(rLast - 1, cA - 1)).FormatConditions.Add( _
                 Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""/""")
        fc.Interior.Color = RGB(189, 215, 238)
        With w.Range(w.Cells(7, cA), w.Cells(rLast - 1, cT - 1))
            Set fc = .FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=1")
            fc.Interior.Color = RGB(198, 239, 206)
            fc.Font.Color = RGB(0, 97, 0)
            Set fc = .FormatConditions.Add(Type:=xlTextString, String:="0", TextOperator:=xlContains)
            fc.Interior.Color = RGB(255, 199, 206)
            fc.Font.Color = RGB(156, 0, 6)
        End With
        With w.Range(w.Cells(7, cT + 3), w.Cells(rLast, cT + 3))
            Set fc = .FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""Achieve""")
            fc.Interior.Color = RGB(198, 239, 206)
            fc.Font.Color = RGB(0, 97, 0)
            Set fc = .FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""Not Achieve""")
            fc.Interior.Color = RGB(255, 199, 206)
            fc.Font.Color = RGB(156, 0, 6)
        End With
        For dd = 1 To nDays
            t = DateSerial(Year(per), Month(per), dd)
            If Weekday(t, vbMonday) = 7 Then
                w.Range(w.Cells(7, c0 + dd - 1), w.Cells(rLast - 1, c0 + dd - 1)).Interior.Color = RGB(242, 242, 242)
                w.Range(w.Cells(7, cA + dd - 1), w.Cells(rLast - 1, cA + dd - 1)).Interior.Color = RGB(242, 242, 242)
            End If
        Next dd
    End If

    If rLast < 7 Then rLast = 7
    With w.Range(w.Cells(4, 1), w.Cells(rLast, nCol)).Borders
        .LineStyle = xlContinuous
        .Color = RGB(166, 166, 166)
    End With

    ' lebar kolom
    w.Columns(1).ColumnWidth = 4
    w.Columns(2).ColumnWidth = 8
    w.Columns(3).ColumnWidth = 14
    w.Columns(4).ColumnWidth = 15
    w.Columns(5).ColumnWidth = 18
    w.Columns(6).ColumnWidth = 16
    w.Columns(7).ColumnWidth = 24
    w.Columns(8).ColumnWidth = 5
    w.Range(w.Cells(1, c0), w.Cells(1, cT - 1)).EntireColumn.ColumnWidth = 3
    w.Range(w.Cells(1, cT), w.Cells(1, cT + 1)).EntireColumn.ColumnWidth = 7
    w.Columns(cT + 2).ColumnWidth = 10
    w.Columns(cT + 3).ColumnWidth = 12
    w.Rows(6).RowHeight = 30

    w.Activate
    ActiveWindow.FreezePanes = False
    ActiveWindow.ScrollRow = 1
    ActiveWindow.ScrollColumn = 1
    w.Cells(7, c0).Select
    ActiveWindow.FreezePanes = True
    ActiveWindow.DisplayGridlines = False
    SetHalaman w, True, "$4:$6"
End Sub

'==================================================================
'  4. LAPORAN BULANAN GABUNGAN (format laporan resmi, A4 portrait)
'==================================================================
Public Sub BuatLaporanBulanan()
    On Error GoTo EH
    SpeedOn
    BuatLapBul GetPeriode()
    SpeedOff
    KeluarLayarPenuhDiam
    Sh(SH_LAPBUL).Activate
    Sh(SH_LAPBUL).Range("A1").Select
    Exit Sub
EH:
    TampilError Err.Description, "Laporan Bulanan"
End Sub

' agregat: a(0)=plan, a(1)=dikerjakan, a(2)=tidak dikerjakan, a(3)=belum diinput
Private Sub Tambah(ByVal d As Object, ByVal k As String, ByVal act As Variant)
    Dim a As Variant
    If d.Exists(k) Then
        a = d(k)
    Else
        a = Array(0&, 0&, 0&, 0&)
    End If
    a(0) = a(0) + 1
    Select Case Teks(act)
        Case "": a(3) = a(3) + 1
        Case "1": a(1) = a(1) + 1
        Case Else: a(2) = a(2) + 1
    End Select
    d(k) = a
End Sub

Private Function AmbilLink(ByVal c As Range) As String
    Dim s As String
    If c.Hyperlinks.Count > 0 Then
        AmbilLink = c.Hyperlinks(1).Address
    Else
        s = Teks(c.Value)
        If InStr(s, "\") > 0 Or InStr(s, "/") > 0 Or LCase$(Left$(s, 4)) = "http" Then AmbilLink = s
    End If
End Function

Private Function StatusAch(ByVal plan As Variant, ByVal done As Variant) As String
    If Val(Teks(plan)) <= 0 Then
        StatusAch = "-"
    ElseIf Val(Teks(done)) >= Val(Teks(plan)) Then
        StatusAch = "Achieve"
    Else
        StatusAch = "Not Achieve"
    End If
End Function

Private Function Banding(ByVal x As Variant, ByVal y As Variant) As Long
    Dim a As Double, b As Double
    If IsEmpty(x) And IsEmpty(y) Then Exit Function
    If IsEmpty(x) Then
        Banding = 1
        Exit Function
    End If
    If IsEmpty(y) Then
        Banding = -1
        Exit Function
    End If
    If (IsNumeric(x) Or VarType(x) = vbDate) And (IsNumeric(y) Or VarType(y) = vbDate) Then
        a = CDbl(x)
        b = CDbl(y)
        If a < b Then
            Banding = -1
        ElseIf a > b Then
            Banding = 1
        End If
    Else
        Banding = StrComp(CStr(x), CStr(y), vbTextCompare)
    End If
End Function

' Urutkan baris array 2D (1..n) berdasarkan kolom col
Private Sub UrutBaris(ByRef a As Variant, ByVal n As Long, ByVal col As Long, ByVal naik As Boolean)
    Dim i As Long, j As Long, k As Long, c1 As Long, c2 As Long, tmp() As Variant, geser As Boolean
    If n < 2 Then Exit Sub
    c1 = LBound(a, 2)
    c2 = UBound(a, 2)
    ReDim tmp(c1 To c2)
    For i = 2 To n
        For k = c1 To c2
            tmp(k) = a(i, k)
        Next k
        j = i - 1
        Do While j >= 1
            If naik Then
                geser = (Banding(a(j, col), tmp(col)) > 0)
            Else
                geser = (Banding(a(j, col), tmp(col)) < 0)
            End If
            If Not geser Then Exit Do
            For k = c1 To c2
                a(j + 1, k) = a(j, k)
            Next k
            j = j - 1
        Loop
        For k = c1 To c2
            a(j + 1, k) = tmp(k)
        Next k
    Next i
End Sub

' Dictionary agregat -> array baris: label..., plan, dikerjakan, tidak, belum, achievement
Private Function AggKeBaris(ByVal d As Object, ByVal nLabel As Long, ByRef n As Long) As Variant
    Dim out() As Variant, k As Variant, a As Variant, p As Variant, i As Long, j As Long
    n = d.Count
    If n = 0 Then
        ReDim out(1 To 1, 1 To nLabel + 5)
        AggKeBaris = out
        Exit Function
    End If
    ReDim out(1 To n, 1 To nLabel + 5)
    For Each k In d.Keys
        i = i + 1
        p = Split(CStr(k), "|")
        For j = 0 To nLabel - 1
            If j <= UBound(p) Then out(i, j + 1) = p(j)
        Next j
        a = d(k)
        For j = 0 To 3
            out(i, nLabel + 1 + j) = a(j)
        Next j
        If a(0) > 0 Then out(i, nLabel + 5) = a(1) / a(0)
    Next k
    AggKeBaris = out
End Function

' Susun baris agregat menjadi tabel tampilan
Private Function AggOut(ByVal src As Variant, ByVal n As Long, ByVal nLabel As Long, ByVal urutLabel As Variant, _
                        ByVal denganNo As Boolean, ByVal denganBelum As Boolean, ByVal denganGap As Boolean, _
                        ByVal denganTotal As Boolean, ByRef nOut As Long) As Variant
    Dim out() As Variant, i As Long, j As Long, c As Long, nc As Long, nL As Long, t(1 To 4) As Double
    nL = UBound(urutLabel) - LBound(urutLabel) + 1
    nc = nL + 5
    If denganNo Then nc = nc + 1
    If denganBelum Then nc = nc + 1
    If denganGap Then nc = nc + 1
    nOut = n
    If denganTotal And n > 0 Then nOut = n + 1
    If nOut < 1 Then
        ReDim out(1 To 1, 1 To nc)
    Else
        ReDim out(1 To nOut, 1 To nc)
    End If
    For i = 1 To n
        c = 0
        If denganNo Then
            c = c + 1
            out(i, c) = i
        End If
        For j = LBound(urutLabel) To UBound(urutLabel)
            c = c + 1
            out(i, c) = src(i, urutLabel(j))
        Next j
        out(i, c + 1) = src(i, nLabel + 1)
        out(i, c + 2) = src(i, nLabel + 2)
        out(i, c + 3) = src(i, nLabel + 3)
        c = c + 3
        If denganBelum Then
            c = c + 1
            out(i, c) = src(i, nLabel + 4)
        End If
        If denganGap Then
            c = c + 1
            out(i, c) = src(i, nLabel + 1) - src(i, nLabel + 2)
        End If
        out(i, c + 1) = src(i, nLabel + 5)
        out(i, c + 2) = StatusAch(src(i, nLabel + 1), src(i, nLabel + 2))
        For j = 1 To 4
            t(j) = t(j) + src(i, nLabel + j)
        Next j
    Next i
    If denganTotal And n > 0 Then
        i = n + 1
        c = 0
        If denganNo Then c = c + 1
        out(i, c + 1) = "TOTAL"
        c = c + nL
        out(i, c + 1) = t(1)
        out(i, c + 2) = t(2)
        out(i, c + 3) = t(3)
        c = c + 3
        If denganBelum Then
            c = c + 1
            out(i, c) = t(4)
        End If
        If denganGap Then
            c = c + 1
            out(i, c) = t(1) - t(2)
        End If
        If t(1) > 0 Then out(i, c + 1) = t(2) / t(1)
        out(i, c + 2) = StatusAch(t(1), t(2))
    End If
    AggOut = out
End Function

'------------------------------------------------------------------
'  Komponen tampilan laporan
'------------------------------------------------------------------
Private Sub WarnaPersen(ByVal rg As Range)
    Dim fc As Object
    On Error Resume Next
    Set fc = rg.FormatConditions.Add(Type:=xlCellValue, Operator:=xlGreaterEqual, Formula1:="=1")
    fc.Font.Color = RGB(0, 120, 60)
    fc.Font.Bold = True
    Set fc = rg.FormatConditions.Add(Type:=xlCellValue, Operator:=xlBetween, Formula1:="=95/100", Formula2:="=99999/100000")
    fc.Font.Color = RGB(191, 120, 0)
    fc.Font.Bold = True
    Set fc = rg.FormatConditions.Add(Type:=xlCellValue, Operator:=xlLess, Formula1:="=95/100")
    fc.Font.Color = RGB(192, 0, 0)
    fc.Font.Bold = True
End Sub

Private Sub WarnaStatus(ByVal rg As Range)
    Dim fc As Object
    On Error Resume Next
    Set fc = rg.FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""Achieve""")
    fc.Interior.Color = RGB(214, 240, 222)
    fc.Font.Color = RGB(0, 110, 50)
    fc.Font.Bold = True
    Set fc = rg.FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""Not Achieve""")
    fc.Interior.Color = RGB(253, 222, 222)
    fc.Font.Color = RGB(176, 0, 0)
    fc.Font.Bold = True
End Sub

Private Sub DataBar(ByVal rg As Range)
    Dim db As Object
    On Error Resume Next
    Set db = rg.FormatConditions.AddDatabar
    db.MinPoint.Modify newtype:=xlConditionValueNumber, newvalue:=0
    db.MaxPoint.Modify newtype:=xlConditionValueNumber, newvalue:=1
    db.BarColor.Color = RGB(166, 197, 238)
    db.BarFillType = xlDataBarFillSolid
End Sub

Private Sub LbSection(ByVal w As Worksheet, ByRef r As Long, ByVal judul As String, Optional ByVal halamanBaru As Boolean = False)
    r = r + 1
    If halamanBaru Then
        On Error Resume Next
        w.HPageBreaks.Add Before:=w.Cells(r, 1)
        On Error GoTo 0
    End If
    With w.Range(w.Cells(r, 1), w.Cells(r, LB_NCOL))
        .Interior.Color = C_BLUE()
        .Font.Color = vbWhite
        .Font.Bold = True
        .Font.Size = 10.5
        .VerticalAlignment = xlCenter
        With .Borders(xlEdgeBottom)
            .LineStyle = xlContinuous
            .Weight = xlMedium
            .Color = C_RED()
        End With
    End With
    w.Cells(r, 1).Value = " " & judul
    w.Rows(r).RowHeight = 22
    r = r + 2
End Sub

Private Sub LbSub(ByVal w As Worksheet, ByRef r As Long, ByVal judul As String)
    With w.Cells(r, 1)
        .Value = judul
        .Font.Bold = True
        .Font.Size = 9.5
        .Font.Color = C_BLUE_DK()
    End With
    w.Rows(r).RowHeight = 17
    r = r + 1
End Sub

Private Function LebarKolom(ByVal w As Worksheet, ByVal c1 As Long, ByVal span As Long) As Double
    Dim k As Long
    For k = c1 To c1 + span - 1
        LebarKolom = LebarKolom + w.Columns(k).ColumnWidth
    Next k
End Function

Private Sub LbParagraf(ByVal w As Worksheet, ByRef r As Long, ByVal txt As String, Optional ByVal miring As Boolean = False, _
                       Optional ByVal ukuran As Double = 9)
    Dim rg As Range, nBaris As Long
    Set rg = w.Range(w.Cells(r, 1), w.Cells(r, LB_NCOL))
    rg.Merge
    rg.WrapText = True
    rg.VerticalAlignment = xlTop
    rg.Cells(1, 1).Value = txt
    rg.Font.Size = ukuran
    rg.Font.Italic = miring
    rg.Font.Color = C_TXT()
    nBaris = Int(Len(txt) / (LebarKolom(w, 1, LB_NCOL) * 1.05)) + 1
    w.Rows(r).RowHeight = nBaris * 12.5 + 3
    r = r + 1
End Sub

Private Sub LbInfo(ByVal w As Worksheet, ByVal r As Long, ByVal c As Long, ByVal span As Long, ByVal label As String, _
                   ByVal nilai As Variant, ByVal cVal As Long, ByVal spanVal As Long)
    With w.Range(w.Cells(r, c), w.Cells(r, c + span - 1))
        .Merge
        .Cells(1, 1).Value = label
        .Font.Size = 8
        .Font.Bold = True
        .Font.Color = C_MUTED()
        .VerticalAlignment = xlCenter
    End With
    With w.Range(w.Cells(r, cVal), w.Cells(r, cVal + spanVal - 1))
        .Merge
        .NumberFormat = "@"
        .Cells(1, 1).Value = nilai
        .Font.Size = 9
        .Font.Bold = True
        .Font.Color = C_TXT()
        .HorizontalAlignment = xlLeft
        .VerticalAlignment = xlCenter
    End With
End Sub

Private Sub LbTile(ByVal w As Worksheet, ByVal r As Long, ByVal c As Long, ByVal label As String, ByVal nilai As Variant, _
                   ByVal fmt As String, ByVal ket As String, ByVal warna As Long)
    Dim rg As Range
    Set rg = w.Range(w.Cells(r, c), w.Cells(r, c + 1))
    rg.Merge
    rg.Cells(1, 1).Value = " " & label
    rg.Font.Size = 7.5
    rg.Font.Bold = True
    rg.Font.Color = RGB(70, 80, 95)
    rg.VerticalAlignment = xlBottom
    Set rg = w.Range(w.Cells(r + 1, c), w.Cells(r + 1, c + 1))
    rg.Merge
    If fmt <> "" Then rg.NumberFormat = fmt
    rg.Cells(1, 1).Value = nilai
    rg.HorizontalAlignment = xlLeft
    rg.IndentLevel = 1
    rg.Font.Size = 17
    rg.Font.Bold = True
    rg.Font.Color = warna
    rg.VerticalAlignment = xlCenter
    Set rg = w.Range(w.Cells(r + 2, c), w.Cells(r + 2, c + 1))
    rg.Merge
    rg.Cells(1, 1).Value = " " & ket
    rg.Font.Size = 7
    rg.Font.Color = C_MUTED()
    rg.ShrinkToFit = True
    rg.VerticalAlignment = xlTop
    With w.Range(w.Cells(r, c), w.Cells(r + 2, c + 1))
        .Interior.Color = RGB(248, 250, 253)
        .BorderAround LineStyle:=xlContinuous, Weight:=xlThin, Color:=C_LINE()
        With .Borders(xlEdgeLeft)
            .LineStyle = xlContinuous
            .Weight = xlThick
            .Color = warna
        End With
    End With
End Sub

' spec: Array(Array("Header", span, fmt, align), ...)
'   fmt: "t" teks, "n" angka, "p" persen, "d" tanggal, "dt" tanggal-jam, "s" status, "l" link
Private Function LbTabel(ByVal w As Worksheet, ByVal r As Long, ByVal spec As Variant, ByVal data As Variant, _
                         ByVal n As Long, Optional ByVal adaTotal As Boolean = False, _
                         Optional ByVal kosong As String = "(tidak ada data)", Optional ByVal barCol As Long = 0, _
                         Optional ByVal links As Variant, Optional ByVal linkCol As Long = 0) As Long
    Dim nc As Long, j As Long, i As Long, c As Long, totalSpan As Long, rg As Range, tinggi As Double, nBaris As Long
    Dim hdr() As String, sp() As Long, fm() As String, al() As Long, c0() As Long, colData() As Variant
    nc = UBound(spec) - LBound(spec) + 1
    ReDim hdr(1 To nc)
    ReDim sp(1 To nc)
    ReDim fm(1 To nc)
    ReDim al(1 To nc)
    ReDim c0(1 To nc)
    c = 1
    For j = 1 To nc
        hdr(j) = spec(LBound(spec) + j - 1)(0)
        sp(j) = spec(LBound(spec) + j - 1)(1)
        fm(j) = spec(LBound(spec) + j - 1)(2)
        al(j) = spec(LBound(spec) + j - 1)(3)
        c0(j) = c
        c = c + sp(j)
    Next j
    totalSpan = c - 1

    ' header
    For j = 1 To nc
        Set rg = w.Range(w.Cells(r, c0(j)), w.Cells(r, c0(j) + sp(j) - 1))
        If sp(j) > 1 Then rg.Merge
        rg.Cells(1, 1).Value = hdr(j)
    Next j
    With w.Range(w.Cells(r, 1), w.Cells(r, totalSpan))
        .Interior.Color = C_BLUE_DK()
        .Font.Color = vbWhite
        .Font.Bold = True
        .Font.Size = 8
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .WrapText = True
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(60, 90, 140)
    End With
    w.Rows(r).RowHeight = 26

    If n <= 0 Then
        Set rg = w.Range(w.Cells(r + 1, 1), w.Cells(r + 1, totalSpan))
        rg.Merge
        rg.Cells(1, 1).Value = kosong
        rg.Font.Italic = True
        rg.Font.Color = C_MUTED()
        rg.HorizontalAlignment = xlCenter
        rg.BorderAround LineStyle:=xlContinuous, Weight:=xlThin, Color:=C_LINE()
        w.Rows(r + 1).RowHeight = 18
        LbTabel = r + 3
        Exit Function
    End If

    ' data per kolom
    ReDim colData(1 To n, 1 To 1)
    For j = 1 To nc
        For i = 1 To n
            colData(i, 1) = data(i, j)
        Next i
        Set rg = w.Range(w.Cells(r + 1, c0(j)), w.Cells(r + n, c0(j)))
        If fm(j) = "t" Or fm(j) = "l" Then rg.NumberFormat = "@"
        rg.Value = colData
        Set rg = w.Range(w.Cells(r + 1, c0(j)), w.Cells(r + n, c0(j) + sp(j) - 1))
        If sp(j) > 1 Then rg.Merge True
        rg.HorizontalAlignment = al(j)
        rg.VerticalAlignment = xlCenter
        Select Case fm(j)
            Case "n": rg.NumberFormat = "#,##0"
            Case "p"
                rg.NumberFormat = "0.0%"
                WarnaPersen rg
            Case "d": rg.NumberFormat = "dd/mm/yyyy"
            Case "dt": rg.NumberFormat = "dd/mm/yyyy hh:mm"
            Case "s": WarnaStatus rg
            Case "t": rg.WrapText = True
            Case "l"
                rg.Font.Color = RGB(5, 99, 193)
                rg.Font.Underline = xlUnderlineStyleSingle
        End Select
    Next j

    With w.Range(w.Cells(r + 1, 1), w.Cells(r + n, totalSpan))
        .Font.Size = 8.5
        .Font.Color = C_TXT()
        .Borders.LineStyle = xlContinuous
        .Borders.Color = RGB(214, 221, 232)
    End With
    For i = 1 To n
        If i Mod 2 = 0 Then w.Range(w.Cells(r + i, 1), w.Cells(r + i, totalSpan)).Interior.Color = RGB(244, 247, 252)
        tinggi = 16
        For j = 1 To nc
            If fm(j) = "t" Then
                nBaris = Int(Len(Teks(data(i, j))) / (LebarKolom(w, c0(j), sp(j)) * 1.15)) + 1
                If nBaris * 11.5 + 4 > tinggi Then tinggi = nBaris * 11.5 + 4
            End If
        Next j
        If tinggi > 160 Then tinggi = 160
        w.Rows(r + i).RowHeight = tinggi
    Next i
    If adaTotal Then
        With w.Range(w.Cells(r + n, 1), w.Cells(r + n, totalSpan))
            .Font.Bold = True
            .Interior.Color = RGB(222, 231, 245)
            With .Borders(xlEdgeTop)
                .LineStyle = xlContinuous
                .Weight = xlMedium
                .Color = C_BLUE()
            End With
        End With
    End If
    If barCol > 0 Then
        If adaTotal Then
            If n > 1 Then DataBar w.Range(w.Cells(r + 1, c0(barCol)), w.Cells(r + n - 1, c0(barCol)))
        Else
            DataBar w.Range(w.Cells(r + 1, c0(barCol)), w.Cells(r + n, c0(barCol)))
        End If
    End If
    If linkCol > 0 And Not IsMissing(links) Then
        On Error Resume Next
        For i = 1 To n
            If CStr(links(i)) <> "" Then
                w.Hyperlinks.Add Anchor:=w.Cells(r + i, c0(linkCol)), Address:=CStr(links(i)), TextToDisplay:="Lihat"
            End If
        Next i
        On Error GoTo 0
    End If
    LbTabel = r + n + 2
End Function

Private Function LbChart(ByVal w As Worksheet, ByVal rTop As Long, ByVal nRows As Long, ByVal c1 As Long, ByVal c2 As Long, _
                         ByVal judul As String, ByVal tipe As Long, ByVal rgX As Range, ByVal rgY As Range, _
                         Optional ByVal denganTarget As Boolean = False) As Object
    Dim co As ChartObject, nTitik As Long, tgt() As Double, i As Long
    On Error Resume Next
    Set co = w.ChartObjects.Add(w.Cells(rTop, c1).Left + 3, w.Cells(rTop, 1).Top + 3, _
             w.Cells(rTop, c2 + 1).Left - w.Cells(rTop, c1).Left - 6, w.Cells(rTop + nRows, 1).Top - w.Cells(rTop, 1).Top - 6)
    With co.Chart
        Do While .SeriesCollection.Count > 0
            .SeriesCollection(1).Delete
        Loop
        With .SeriesCollection.NewSeries
            .Name = "Achievement"
            .Values = rgY
            .XValues = rgX
        End With
        .ChartType = tipe
        .HasTitle = True
        .ChartTitle.Text = judul
        .ChartTitle.Font.Size = 10
        .ChartTitle.Font.Bold = True
        .ChartTitle.Font.Color = C_TXT()
        .HasLegend = False
        .ChartArea.Font.Name = FONT_UI
        .ChartArea.Format.Line.ForeColor.RGB = C_LINE()
        With .SeriesCollection(1)
            .Format.Fill.ForeColor.RGB = C_BLUE()
            .HasDataLabels = True
            .DataLabels.NumberFormat = "0%"
            .DataLabels.Font.Size = 7.5
        End With
        .Axes(xlValue).MinimumScale = 0
        .Axes(xlValue).MaximumScale = 1.15
        .Axes(xlValue).MajorUnit = 0.25
        .Axes(xlValue).TickLabels.NumberFormat = "0%"
        .Axes(xlValue).TickLabels.Font.Size = 7.5
        .Axes(xlValue).MajorGridlines.Format.Line.ForeColor.RGB = RGB(228, 233, 240)
        .Axes(xlCategory).TickLabels.Font.Size = 7.5
        If tipe = xlBarClustered Then .Axes(xlCategory).ReversePlotOrder = True
        If denganTarget Then
            nTitik = rgY.Cells.Count
            ReDim tgt(1 To nTitik)
            For i = 1 To nTitik
                tgt(i) = 1
            Next i
            With .SeriesCollection.NewSeries
                .Name = "Target 100%"
                .Values = tgt
                .XValues = rgX
                .ChartType = xlLine
                .Format.Line.ForeColor.RGB = C_RED()
                .Format.Line.Weight = 1.75
                .Format.Line.DashStyle = 4
            End With
            .HasLegend = True
            .Legend.Position = xlLegendPositionBottom
            .Legend.Font.Size = 7.5
        End If
    End With
    Set LbChart = co
End Function

Private Function LbLog(ByVal namaSheet As String, ByVal nCol As Long, ByVal colDoc As Long, ByVal per As Date, _
                       ByRef n As Long, ByRef links() As String) As Variant
    Dim s As Worksheet, lr As Long, src As Variant, out() As Variant, i As Long, j As Long, ok As Boolean, t As Date
    Set s = Sh(namaSheet)
    n = 0
    ReDim out(1 To 1, 1 To nCol)
    ReDim links(1 To 1)
    lr = LastRowAny(s, 1, nCol)
    If lr >= FIRST_ROW Then
        src = Baca(s.Range(s.Cells(FIRST_ROW, 1), s.Cells(lr, nCol)))
        ReDim out(1 To UBound(src, 1), 1 To nCol)
        ReDim links(1 To UBound(src, 1))
        For i = 1 To UBound(src, 1)
            t = KeTanggal(src(i, 1), ok)
            If ok Then
                If Year(t) = Year(per) And Month(t) = Month(per) Then
                    n = n + 1
                    For j = 1 To nCol
                        If Not IsError(src(i, j)) Then out(n, j) = src(i, j)
                    Next j
                    out(n, 1) = t
                    links(n) = AmbilLink(s.Cells(FIRST_ROW + i - 1, colDoc))
                End If
            End If
        Next i
    End If
    LbLog = out
End Function

Private Function Persen(ByVal a As Double, ByVal b As Double) As String
    If b <= 0 Then
        Persen = "-"
    Else
        Persen = Format$(a / b, "0.0%")
    End If
End Function

'------------------------------------------------------------------
'  Penyusun laporan bulanan
'------------------------------------------------------------------
Private Sub BuatLapBul(ByVal per As Date)
    Dim w As Worksheet, wD As Worksheet, s As Worksheet
    Dim arr As Variant, lr As Long, i As Long, j As Long, r As Long, rH As Long, kode As Long, kd As Long
    Dim dTim As Object, dLok As Object, dTipe As Object, dPtg As Object, dMgg As Object, dBulan As Object
    Dim dMin As Object, dMax As Object, dDue As Object, dInp As Object, dSpv As Object, dSpvLast As Object
    Dim dJob As Object, dOrang As Object, dKat As Object, dSt As Object
    Dim tgl As Date, ok As Boolean, act As String, ptg As String, mg As String, spv As String
    Dim batas As Date, akhirBulan As Date, perLalu As Date, kodeAwal As Long
    Dim nPlan As Long, nDone As Long, nTidak As Long, nBelum As Long, nDue As Long, nInp As Long
    Dim ex() As Variant, nEx As Long, src As Variant, n As Long, nOut As Long, data As Variant
    Dim rowsLok As Variant, nLok As Long, rowsTipe As Variant, nTipe As Long, rowsMgg As Variant, nMgg As Long
    Dim ach As Variant, achLalu As Variant, a As Variant, k As Variant, txt As String, noDok As String
    Dim nEv As Long, nImp As Long, lkEv() As String, lkImp() As String, ev As Variant, im As Variant
    Dim nTga As Long, lkTga() As String, tg As Variant, dTga As Object, dReq As Object
    Dim totItem As Long, totUnit As Double, nBaik As Long, inv As Variant, nPerlu As Long, perlu() As Variant
    Dim tl() As Variant, nTl As Long, rC As Long, nRowsChart As Long, nb As Long, rTbl1 As Long, rTbl2 As Long
    Dim waktu As Variant

    Set w = Sh(SH_LAPBUL)
    Set wD = Sh(SH_DATA)
    kode = KodePeriode(per)
    perLalu = DateSerial(Year(per), Month(per) - 1, 1)
    kodeAwal = KodePeriode(DateSerial(Year(per), Month(per) - 5, 1))
    akhirBulan = DateSerial(Year(per), Month(per) + 1, 0)
    batas = akhirBulan
    If Date < batas Then batas = Date
    noDok = "GA-CKR/LB/" & Year(per) & "/" & Format$(Month(per), "00")

    Set dTim = NewDict(): Set dLok = NewDict(): Set dTipe = NewDict(): Set dPtg = NewDict()
    Set dMgg = NewDict(): Set dBulan = NewDict(): Set dMin = NewDict(): Set dMax = NewDict()
    Set dDue = NewDict(): Set dInp = NewDict(): Set dSpv = NewDict(): Set dSpvLast = NewDict()
    Set dJob = NewDict(): Set dOrang = NewDict(): Set dKat = NewDict(): Set dSt = NewDict()

    ' ---------- kumpulkan data ----------
    lr = LastRow(wD, D_KEY)
    ReDim ex(1 To 1, 1 To 6)
    If lr >= 2 Then
        arr = Baca(wD.Range(wD.Cells(2, 1), wD.Cells(lr, D_NCOL)))
        ReDim ex(1 To UBound(arr, 1), 1 To 6)
        For i = 1 To UBound(arr, 1)
            kd = CLng(Val(Teks(arr(i, D_PER))))
            act = Teks(arr(i, D_ACT))
            If kd >= kodeAwal And kd <= kode Then Tambah dBulan, CStr(kd), act
            If kd = kode Then
                tgl = KeTanggal(arr(i, D_TGL), ok)
                nPlan = nPlan + 1
                If act = "1" Then
                    nDone = nDone + 1
                ElseIf act <> "" Then
                    nTidak = nTidak + 1
                Else
                    nBelum = nBelum + 1
                End If
                Tambah dTim, Teks(arr(i, D_TIM)), act
                Tambah dLok, Teks(arr(i, D_TIM)) & "|" & Teks(arr(i, D_LOK)), act
                Tambah dTipe, Teks(arr(i, D_TIPE)) & "|" & Teks(arr(i, D_TIM)), act
                ptg = Teks(arr(i, D_PTG))
                If ptg = "" Then ptg = "(belum ditentukan)" Else dOrang(ptg) = True
                Tambah dPtg, ptg & "|" & Teks(arr(i, D_TIM)), act
                mg = "Minggu " & Teks(arr(i, D_MGG))
                Tambah dMgg, mg, act
                dJob(Teks(arr(i, D_ID))) = True
                If ok Then
                    If Not dMin.Exists(mg) Then
                        dMin(mg) = tgl
                        dMax(mg) = tgl
                    End If
                    If tgl < dMin(mg) Then dMin(mg) = tgl
                    If tgl > dMax(mg) Then dMax(mg) = tgl
                    If tgl <= batas Then
                        nDue = nDue + 1
                        dDue(mg) = dDue(mg) + 1
                        If act <> "" Then
                            nInp = nInp + 1
                            dInp(mg) = dInp(mg) + 1
                        End If
                    End If
                End If
                If act <> "" Then
                    spv = Teks(arr(i, D_SPV))
                    If spv = "" Then spv = "(tanpa nama)"
                    dSpv(spv) = dSpv(spv) + 1
                    waktu = arr(i, D_WAKTU)
                    If VarType(waktu) = vbDate Or IsNumeric(waktu) Then
                        If Not IsEmpty(waktu) Then
                            If Not dSpvLast.Exists(spv) Then
                                dSpvLast(spv) = CDate(waktu)
                            ElseIf CDate(waktu) > dSpvLast(spv) Then
                                dSpvLast(spv) = CDate(waktu)
                            End If
                        End If
                    End If
                End If
                If act <> "" And act <> "1" Then
                    nEx = nEx + 1
                    If ok Then ex(nEx, 2) = tgl
                    ex(nEx, 3) = Teks(arr(i, D_LOK))
                    ex(nEx, 4) = Teks(arr(i, D_TIPE))
                    ex(nEx, 5) = Teks(arr(i, D_AREA))
                    ex(nEx, 6) = Teks(arr(i, D_PTG))
                End If
            End If
        Next i
    End If
    If nPlan > 0 Then ach = nDone / nPlan
    If dBulan.Exists(CStr(KodePeriode(perLalu))) Then
        a = dBulan(CStr(KodePeriode(perLalu)))
        If a(0) > 0 Then achLalu = a(1) / a(0)
    End If

    ' event, improvement, inventory
    ev = LbLog(SH_EVENT, 6, 6, per, nEv, lkEv)
    im = LbLog(SH_IMP, 8, 8, per, nImp, lkImp)
    For i = 1 To nImp
        txt = Teks(im(i, 2))
        If txt = "" Then txt = "(tanpa kategori)"
        dKat(txt) = dKat(txt) + 1
    Next i
    Set s = Sh(SH_INV)
    lr = LastRowAny(s, 1, 8)
    ReDim perlu(1 To 1, 1 To 8)
    If lr >= FIRST_ROW Then
        inv = Baca(s.Range(s.Cells(FIRST_ROW, 1), s.Cells(lr, 8)))
        ReDim perlu(1 To UBound(inv, 1), 1 To 8)
        For i = 1 To UBound(inv, 1)
            If Teks(inv(i, 2)) <> "" Then
                txt = Teks(inv(i, 5))
                If txt = "" Then txt = "(belum diisi)"
                If dSt.Exists(txt) Then a = dSt(txt) Else a = Array(0#, 0#)
                a(0) = a(0) + 1
                a(1) = a(1) + Val(Teks(inv(i, 7)))
                dSt(txt) = a
                totItem = totItem + 1
                totUnit = totUnit + Val(Teks(inv(i, 7)))
                If LCase$(txt) = "baik" Then
                    nBaik = nBaik + 1
                Else
                    nPerlu = nPerlu + 1
                    perlu(nPerlu, 1) = nPerlu
                    perlu(nPerlu, 2) = Teks(inv(i, 1))
                    perlu(nPerlu, 3) = Teks(inv(i, 2))
                    perlu(nPerlu, 4) = Teks(inv(i, 3))
                    perlu(nPerlu, 5) = Teks(inv(i, 4))
                    perlu(nPerlu, 6) = txt
                    perlu(nPerlu, 7) = Val(Teks(inv(i, 7)))
                End If
            End If
        Next i
    End If

    ' ---------- siapkan sheet ----------
    ResetSheet w
    On Error Resume Next
    w.ResetAllPageBreaks
    On Error GoTo 0
    w.Cells.Font.Name = FONT_UI
    w.Cells.Font.Size = 9
    w.Cells.VerticalAlignment = xlCenter
    w.Columns(1).ColumnWidth = 5
    w.Columns(2).ColumnWidth = 13
    w.Columns(3).ColumnWidth = 13
    For j = 4 To 9
        w.Columns(j).ColumnWidth = 10.5
    Next j
    w.Columns(10).ColumnWidth = 12

    ' ---------- kop laporan ----------
    With w.Range(w.Cells(1, 1), w.Cells(2, LB_NCOL))
        .Interior.Color = C_BLUE()
        .Font.Color = vbWhite
    End With
    w.Cells(1, 1).Value = " LAPORAN BULANAN GENERAL AFFAIRS"
    w.Cells(1, 1).Font.Size = 16
    w.Cells(1, 1).Font.Bold = True
    w.Cells(2, 1).Value = " Cleaning Service & Gardening" & Dot() & "Event" & Dot() & "Improvement / Inovasi" & Dot() & _
                          "Inventory Tools   |   PT Frisian Flag Indonesia " & ChrW(8212) & " Plant Cikarang"
    w.Cells(2, 1).Font.Size = 8.5
    w.Cells(2, 1).Font.Color = RGB(220, 232, 250)
    w.Rows(1).RowHeight = 32
    w.Rows(2).RowHeight = 18
    With w.Range(w.Cells(2, 1), w.Cells(2, LB_NCOL)).Borders(xlEdgeBottom)
        .LineStyle = xlContinuous
        .Weight = xlThick
        .Color = C_RED()
    End With
    LbInfo w, 4, 1, 2, "PERIODE", LabelPeriode(per), 3, 2
    LbInfo w, 4, 5, 2, "NO. DOKUMEN", noDok, 7, 2
    LbInfo w, 4, 9, 1, "DICETAK", Format$(Now, "dd/mm/yyyy hh:nn"), 10, 1
    LbInfo w, 5, 1, 2, "CAKUPAN", dLok.Count & " lokasi", 3, 2
    LbInfo w, 5, 5, 2, "PEKERJAAN AKTIF", dJob.Count & " pekerjaan", 7, 2
    LbInfo w, 5, 9, 1, "PETUGAS", dOrang.Count & " orang", 10, 1
    With w.Range(w.Cells(5, 1), w.Cells(5, LB_NCOL)).Borders(xlEdgeBottom)
        .LineStyle = xlContinuous
        .Color = C_LINE()
    End With
    r = 6

    ' ---------- 1. RINGKASAN EKSEKUTIF ----------
    LbSection w, r, "1. RINGKASAN EKSEKUTIF"
    If IsEmpty(ach) Then
        LbTile w, r, 1, "ACHIEVEMENT", "-", "", "target 100%", C_PURPLE()
    Else
        LbTile w, r, 1, "ACHIEVEMENT", ach, "0.0%", "target 100%" & Dot() & StatusAch(nPlan, nDone), C_PURPLE()
    End If
    LbTile w, r, 3, "PLAN", nPlan, "#,##0", "jadwal pekerjaan", C_BLUE()
    LbTile w, r, 5, "DIKERJAKAN", nDone, "#,##0", "actual = 1", C_GREEN()
    LbTile w, r, 7, "TIDAK DIKERJAKAN", nTidak, "#,##0", "actual = 0", C_RED()
    LbTile w, r, 9, "BELUM DIINPUT", nBelum, "#,##0", "jadwal tanpa actual", C_ORANGE()
    w.Rows(r).RowHeight = 15
    w.Rows(r + 1).RowHeight = 28
    w.Rows(r + 2).RowHeight = 14
    w.Rows(r + 3).RowHeight = 6
    r = r + 4
    If IsEmpty(ach) Or IsEmpty(achLalu) Then
        LbTile w, r, 1, "VS BULAN LALU", "-", "", NamaBulan(Month(perLalu)) & ": belum ada data", RGB(90, 100, 115)
    Else
        LbTile w, r, 1, "VS BULAN LALU", Format$((ach - achLalu) * 100, "+0.0;-0.0;0.0") & " poin", "", _
               NamaBulan(Month(perLalu)) & " " & Year(perLalu) & ": " & Format$(achLalu, "0.0%"), _
               IIf(ach >= achLalu, C_GREEN(), C_RED())
    End If
    If nDue > 0 Then
        LbTile w, r, 3, "KEPATUHAN INPUT", nInp / nDue, "0.0%", nInp & " dari " & nDue & " jadwal s/d " & Format$(batas, "dd/mm"), C_BLUE()
    Else
        LbTile w, r, 3, "KEPATUHAN INPUT", "-", "", "belum ada jadwal jatuh tempo", C_BLUE()
    End If
    LbTile w, r, 5, "EVENT", nEv, "#,##0", "kegiatan bulan ini", C_GREEN()
    LbTile w, r, 7, "IMPROVEMENT / INOVASI", nImp, "#,##0", "usulan / realisasi", C_PURPLE()
    If totItem > 0 Then
        LbTile w, r, 9, "ALAT KONDISI BAIK", nBaik / totItem, "0.0%", nBaik & " dari " & totItem & " jenis alat", C_ORANGE()
    Else
        LbTile w, r, 9, "ALAT KONDISI BAIK", "-", "", "inventory belum diisi", C_ORANGE()
    End If
    w.Rows(r).RowHeight = 15
    w.Rows(r + 1).RowHeight = 28
    w.Rows(r + 2).RowHeight = 14
    r = r + 4

    LbSub w, r, "Catatan utama"
    rowsLok = AggKeBaris(dLok, 2, nLok)
    UrutBaris rowsLok, nLok, 7, True
    rowsTipe = AggKeBaris(dTipe, 2, nTipe)
    UrutBaris rowsTipe, nTipe, 5, False        ' urut jumlah tidak dikerjakan terbanyak
    If nPlan = 0 Then
        LbParagraf w, r, ChrW(8226) & "  Belum ada data plan untuk periode " & LabelPeriode(per) & ". Jalankan Generate Plan Bulanan terlebih dahulu."
    Else
        txt = ChrW(8226) & "  Achievement pekerjaan Cleaning & Gardening periode " & LabelPeriode(per) & " sebesar " & _
              Format$(ach, "0.0%") & " dari target 100% (" & StatusAch(nPlan, nDone) & ")"
        If Not IsEmpty(achLalu) Then
            If ach > achLalu Then
                txt = txt & ", naik " & Format$((ach - achLalu) * 100, "0.0") & " poin dibanding " & LabelPeriode(perLalu) & " (" & Format$(achLalu, "0.0%") & ")."
            ElseIf ach < achLalu Then
                txt = txt & ", turun " & Format$((achLalu - ach) * 100, "0.0") & " poin dibanding " & LabelPeriode(perLalu) & " (" & Format$(achLalu, "0.0%") & ")."
            Else
                txt = txt & ", sama dengan " & LabelPeriode(perLalu) & "."
            End If
        Else
            txt = txt & "."
        End If
        LbParagraf w, r, txt
        LbParagraf w, r, ChrW(8226) & "  Dari " & Format$(nPlan, "#,##0") & " jadwal, " & Format$(nDone, "#,##0") & " dikerjakan, " & _
            Format$(nTidak, "#,##0") & " tidak dikerjakan, dan " & Format$(nBelum, "#,##0") & " belum diinput. " & _
            "Gap terhadap target: " & Format$(nPlan - nDone, "#,##0") & " jadwal."
        If nLok > 0 Then
            txt = ChrW(8226) & "  Lokasi dengan achievement terendah: " & rowsLok(1, 2) & " (" & Persen(rowsLok(1, 4), rowsLok(1, 3)) & ")"
            nb = 0
            For i = 1 To nLok
                If StatusAch(rowsLok(i, 3), rowsLok(i, 4)) = "Achieve" Then nb = nb + 1
            Next i
            txt = txt & "; tertinggi: " & rowsLok(nLok, 2) & " (" & Persen(rowsLok(nLok, 4), rowsLok(nLok, 3)) & "). " & _
                  nb & " dari " & nLok & " lokasi mencapai target 100%."
            LbParagraf w, r, txt
        End If
        If nTidak > 0 And nTipe > 0 Then
            LbParagraf w, r, ChrW(8226) & "  Tipe pekerjaan paling sering tidak dikerjakan: " & rowsTipe(1, 1) & " (" & rowsTipe(1, 2) & ") sebanyak " & _
                rowsTipe(1, 5) & " kali. Rincian ada di bagian 7."
        End If
        If nDue > 0 Then
            LbParagraf w, r, ChrW(8226) & "  Kepatuhan input actual oleh SPV: " & Format$(nInp / nDue, "0.0%") & " (" & nInp & " dari " & nDue & _
                " jadwal sampai " & Format$(batas, "dd/mm/yyyy") & " sudah diinput)."
        End If
    End If
    LbParagraf w, r, ChrW(8226) & "  Kegiatan pendukung: " & nEv & " event dan " & nImp & " improvement / inovasi tercatat. " & _
        IIf(totItem > 0, "Inventory: " & nBaik & " dari " & totItem & " jenis alat dalam kondisi baik (" & Persen(nBaik, totItem) & "), " & _
        nPerlu & " perlu tindak lanjut.", "Data inventory belum diisi.")
    r = r + 1
    LbParagraf w, r, "Kriteria warna persentase:  " & ChrW(8805) & " 100% hijau (Achieve)  " & ChrW(183) & "  95% - <100% kuning (perlu perhatian)  " & _
        ChrW(183) & "  < 95% merah.  Status Achieve hanya jika actual = plan (target 100%).", True, 7.5

    ' ---------- 2. KINERJA PER TIM ----------
    LbSection w, r, "2. KINERJA PER TIM"
    src = AggKeBaris(dTim, 1, n)
    data = AggOut(src, n, 1, Array(1), False, True, True, True, nOut)
    r = LbTabel(w, r, Array(Array("Tim", 3, "t", xlLeft), Array("Plan", 1, "n", xlCenter), Array("Dikerjakan", 1, "n", xlCenter), _
        Array("Tidak Dikerjakan", 1, "n", xlCenter), Array("Belum Diinput", 1, "n", xlCenter), Array("Gap", 1, "n", xlCenter), _
        Array("Achievement", 1, "p", xlCenter), Array("Status", 1, "s", xlCenter)), data, IIf(n > 0, nOut, 0), True)

    ' ---------- 3. KINERJA PER LOKASI ----------
    LbSection w, r, "3. KINERJA PER LOKASI (diurutkan dari achievement terendah)", True
    data = AggOut(rowsLok, nLok, 2, Array(2, 1), True, False, False, True, nOut)
    rH = r
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Lokasi", 2, "t", xlLeft), Array("Tim", 2, "t", xlLeft), _
        Array("Plan", 1, "n", xlCenter), Array("Dikerjakan", 1, "n", xlCenter), Array("Tidak Dikerjakan", 1, "n", xlCenter), _
        Array("Achievement", 1, "p", xlCenter), Array("Status", 1, "s", xlCenter)), data, IIf(nLok > 0, nOut, 0), True, , 7)
    If nLok > 0 Then
        nRowsChart = Int((nLok * 17 + 70) / 15) + 1
        LbChart w, r, nRowsChart, 1, LB_NCOL, "Achievement per Lokasi", xlBarClustered, _
            w.Range(w.Cells(rH + 1, 2), w.Cells(rH + nLok, 2)), w.Range(w.Cells(rH + 1, 9), w.Cells(rH + nLok, 9)), True
        r = r + nRowsChart + 1
    End If

    ' ---------- 4. KINERJA PER TIPE PEKERJAAN ----------
    LbSection w, r, "4. KINERJA PER TIPE PEKERJAAN", True
    UrutBaris rowsTipe, nTipe, 7, True
    data = AggOut(rowsTipe, nTipe, 2, Array(1, 2), True, False, False, True, nOut)
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Tipe Pekerjaan", 2, "t", xlLeft), Array("Tim", 2, "t", xlLeft), _
        Array("Plan", 1, "n", xlCenter), Array("Dikerjakan", 1, "n", xlCenter), Array("Tidak Dikerjakan", 1, "n", xlCenter), _
        Array("Achievement", 1, "p", xlCenter), Array("Status", 1, "s", xlCenter)), data, IIf(nTipe > 0, nOut, 0), True, , 7)

    ' ---------- 5. KINERJA PER PETUGAS ----------
    LbSection w, r, "5. KINERJA PER PETUGAS"
    src = AggKeBaris(dPtg, 2, n)
    UrutBaris src, n, 7, True
    data = AggOut(src, n, 2, Array(1, 2), True, False, False, True, nOut)
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Petugas", 2, "t", xlLeft), Array("Tim", 2, "t", xlLeft), _
        Array("Plan", 1, "n", xlCenter), Array("Dikerjakan", 1, "n", xlCenter), Array("Tidak Dikerjakan", 1, "n", xlCenter), _
        Array("Achievement", 1, "p", xlCenter), Array("Status", 1, "s", xlCenter)), data, IIf(n > 0, nOut, 0), True, , 7)

    ' ---------- 6. TREN KINERJA ----------
    LbSection w, r, "6. TREN KINERJA", True
    LbSub w, r, "6.1  Per minggu (" & LabelPeriode(per) & ")"
    rowsMgg = AggKeBaris(dMgg, 1, nMgg)
    UrutBaris rowsMgg, nMgg, 1, True
    ReDim data(1 To Application.Max(nMgg, 1), 1 To 8)
    For i = 1 To nMgg
        data(i, 1) = rowsMgg(i, 1)
        k = rowsMgg(i, 1)
        If dMin.Exists(k) Then data(i, 2) = Format$(dMin(k), "dd/mm") & " - " & Format$(dMax(k), "dd/mm")
        data(i, 3) = rowsMgg(i, 2)
        data(i, 4) = rowsMgg(i, 3)
        data(i, 5) = rowsMgg(i, 4)
        data(i, 6) = rowsMgg(i, 5)
        data(i, 7) = rowsMgg(i, 6)
        data(i, 8) = StatusAch(rowsMgg(i, 2), rowsMgg(i, 3))
    Next i
    rTbl1 = r
    r = LbTabel(w, r, Array(Array("Minggu", 2, "t", xlLeft), Array("Tanggal", 2, "t", xlCenter), Array("Plan", 1, "n", xlCenter), _
        Array("Dikerjakan", 1, "n", xlCenter), Array("Tidak Dikerjakan", 1, "n", xlCenter), Array("Belum Diinput", 1, "n", xlCenter), _
        Array("Achievement", 1, "p", xlCenter), Array("Status", 1, "s", xlCenter)), data, nMgg)

    LbSub w, r, "6.2  Enam bulan terakhir"
    ReDim data(1 To 6, 1 To 6)
    For i = 1 To 6
        tgl = DateSerial(Year(per), Month(per) - 6 + i, 1)
        data(i, 1) = LabelPeriode(tgl)
        k = CStr(KodePeriode(tgl))
        If dBulan.Exists(k) Then
            a = dBulan(k)
            data(i, 2) = a(0)
            data(i, 3) = a(1)
            data(i, 4) = a(2)
            If a(0) > 0 Then data(i, 5) = a(1) / a(0)
            data(i, 6) = StatusAch(a(0), a(1))
        Else
            data(i, 6) = "Belum ada data"
        End If
    Next i
    rTbl2 = r
    r = LbTabel(w, r, Array(Array("Bulan", 2, "t", xlLeft), Array("Plan", 2, "n", xlCenter), Array("Dikerjakan", 2, "n", xlCenter), _
        Array("Tidak Dikerjakan", 1, "n", xlCenter), Array("Achievement", 2, "p", xlCenter), Array("Status", 1, "s", xlCenter)), data, 6)
    rC = r
    If nMgg > 0 Then
        LbChart w, rC, 16, 1, 5, "Achievement per Minggu", xlColumnClustered, _
            w.Range(w.Cells(rTbl1 + 1, 1), w.Cells(rTbl1 + nMgg, 1)), w.Range(w.Cells(rTbl1 + 1, 9), w.Cells(rTbl1 + nMgg, 9)), True
    End If
    LbChart w, rC, 16, 6, LB_NCOL, "Tren Achievement 6 Bulan", xlColumnClustered, _
        w.Range(w.Cells(rTbl2 + 1, 1), w.Cells(rTbl2 + 6, 1)), w.Range(w.Cells(rTbl2 + 1, 8), w.Cells(rTbl2 + 6, 8)), True
    r = rC + 17

    ' ---------- 7. PEKERJAAN TIDAK DIKERJAKAN ----------
    LbSection w, r, "7. DAFTAR PEKERJAAN TIDAK DIKERJAKAN (ACTUAL = 0)", True
    UrutBaris ex, nEx, 2, True
    For i = 1 To nEx
        ex(i, 1) = i
    Next i
    LbParagraf w, r, "Total " & nEx & " jadwal tidak dikerjakan pada periode ini. Setiap item perlu dikonfirmasi penyebabnya dan dijadwalkan ulang.", True, 8.5
    r = r + 1
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Tanggal", 1, "d", xlCenter), Array("Lokasi", 2, "t", xlLeft), _
        Array("Tipe Pekerjaan", 2, "t", xlLeft), Array("Area Pekerjaan", 2, "t", xlLeft), Array("Petugas", 2, "t", xlLeft)), _
        ex, nEx, False, "Tidak ada - seluruh jadwal yang sudah diinput telah dikerjakan.")

    ' ---------- 8. KEPATUHAN INPUT ACTUAL ----------
    LbSection w, r, "8. KEPATUHAN INPUT ACTUAL (SPV)"
    LbParagraf w, r, "Mengukur jadwal yang sudah jatuh tempo (s/d " & Format$(batas, "dd/mm/yyyy") & ") dan sudah diisi actual-nya oleh SPV.", True, 8.5
    r = r + 1
    ReDim data(1 To Application.Max(nMgg, 1), 1 To 5)
    For i = 1 To nMgg
        k = rowsMgg(i, 1)
        data(i, 1) = k
        If dMin.Exists(k) Then data(i, 2) = Format$(dMin(k), "dd/mm") & " - " & Format$(dMax(k), "dd/mm")
        data(i, 3) = Val(dDue(k) & "")
        data(i, 4) = Val(dInp(k) & "")
        If data(i, 3) > 0 Then data(i, 5) = data(i, 4) / data(i, 3)
    Next i
    r = LbTabel(w, r, Array(Array("Minggu", 2, "t", xlLeft), Array("Tanggal", 2, "t", xlCenter), Array("Jadwal Jatuh Tempo", 2, "n", xlCenter), _
        Array("Sudah Diinput", 2, "n", xlCenter), Array("Kepatuhan", 2, "p", xlCenter)), data, nMgg)
    ReDim data(1 To Application.Max(dSpv.Count, 1), 1 To 3)
    i = 0
    For Each k In dSpv.Keys
        i = i + 1
        data(i, 1) = k
        data(i, 2) = dSpv(k)
        If dSpvLast.Exists(k) Then data(i, 3) = dSpvLast(k)
    Next k
    r = LbTabel(w, r, Array(Array("Nama SPV", 4, "t", xlLeft), Array("Jumlah Actual Diinput", 3, "n", xlCenter), _
        Array("Input Terakhir", 3, "dt", xlCenter)), data, dSpv.Count, False, "Belum ada input actual pada periode ini.")

    ' ---------- 9. EVENT ----------
    LbSection w, r, "9. EVENT PLANT CIKARANG", True
    LbParagraf w, r, "Jumlah event periode ini: " & nEv & ".", True, 8.5
    r = r + 1
    ReDim data(1 To Application.Max(nEv, 1), 1 To 7)
    For i = 1 To nEv
        data(i, 1) = i
        data(i, 2) = ev(i, 1)
        data(i, 3) = Teks(ev(i, 2))
        data(i, 4) = Teks(ev(i, 3))
        data(i, 5) = Teks(ev(i, 4))
        data(i, 6) = Teks(ev(i, 5))
        If lkEv(i) <> "" Then data(i, 7) = "Lihat"
    Next i
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Tanggal", 1, "d", xlCenter), Array("Nama Event", 2, "t", xlLeft), _
        Array("Deskripsi", 3, "t", xlLeft), Array("Waktu", 1, "t", xlCenter), Array("Support GA", 1, "t", xlLeft), _
        Array("Dok.", 1, "l", xlCenter)), data, nEv, False, "Tidak ada event tercatat pada periode ini.", 0, lkEv, 7)

    ' ---------- 10. IMPROVEMENT / INOVASI ----------
    LbSection w, r, "10. IMPROVEMENT / INOVASI"
    txt = "Jumlah improvement / inovasi periode ini: " & nImp
    If dKat.Count > 0 Then
        txt = txt & " ("
        i = 0
        For Each k In dKat.Keys
            i = i + 1
            txt = txt & IIf(i > 1, ", ", "") & k & ": " & dKat(k)
        Next k
        txt = txt & ")"
    End If
    LbParagraf w, r, txt & ".", True, 8.5
    r = r + 1
    ReDim data(1 To Application.Max(nImp, 1), 1 To 9)
    For i = 1 To nImp
        data(i, 1) = i
        data(i, 2) = im(i, 1)
        data(i, 3) = Teks(im(i, 2))
        data(i, 4) = Teks(im(i, 3))
        data(i, 5) = Teks(im(i, 4))
        data(i, 6) = Teks(im(i, 5))
        data(i, 7) = Teks(im(i, 6))
        data(i, 8) = Teks(im(i, 7))
        If lkImp(i) <> "" Then data(i, 9) = "Lihat"
    Next i
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Tanggal", 1, "d", xlCenter), Array("Kategori", 1, "t", xlCenter), _
        Array("Jenis Pekerjaan", 1, "t", xlLeft), Array("Deskripsi", 2, "t", xlLeft), Array("Area", 1, "t", xlLeft), _
        Array("Petugas", 1, "t", xlLeft), Array("Pengawas", 1, "t", xlLeft), Array("Dok.", 1, "l", xlCenter)), _
        data, nImp, False, "Tidak ada improvement / inovasi tercatat pada periode ini.", 0, lkImp, 9)

    ' ---------- 11. INVENTORY TOOLS ----------
    LbSection w, r, "11. INVENTORY TOOLS"
    If totItem > 0 Then
        LbParagraf w, r, "Total " & totItem & " jenis alat (" & Format$(totUnit, "#,##0") & " unit). Kondisi baik: " & Persen(nBaik, totItem) & _
            ". Status per tanggal cetak laporan.", True, 8.5
    Else
        LbParagraf w, r, "Data inventory belum diisi.", True, 8.5
    End If
    r = r + 1
    ReDim data(1 To Application.Max(dSt.Count + 1, 1), 1 To 4)
    i = 0
    For Each k In dSt.Keys
        i = i + 1
        a = dSt(k)
        data(i, 1) = k
        data(i, 2) = a(0)
        data(i, 3) = a(1)
        If totItem > 0 Then data(i, 4) = a(0) / totItem
    Next k
    If i > 0 Then
        data(i + 1, 1) = "TOTAL"
        data(i + 1, 2) = totItem
        data(i + 1, 3) = totUnit
        data(i + 1, 4) = 1
        i = i + 1
    End If
    rH = r
    r = LbTabel(w, r, Array(Array("Status Alat", 4, "t", xlLeft), Array("Jumlah Jenis Alat", 2, "n", xlCenter), _
        Array("Total Unit", 2, "n", xlCenter), Array("Porsi", 2, "n", xlCenter)), data, i, (i > 0))
    If i > 0 Then w.Range(w.Cells(rH + 1, 9), w.Cells(rH + i, 9)).NumberFormat = "0.0%"
    LbSub w, r, "Alat yang perlu tindak lanjut (status selain Baik)"
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Kode", 1, "t", xlCenter), Array("Nama Alat", 3, "t", xlLeft), _
        Array("Jenis", 1, "t", xlLeft), Array("Area", 2, "t", xlLeft), Array("Status", 1, "t", xlCenter), _
        Array("Jumlah", 1, "n", xlCenter)), perlu, nPerlu, False, "Semua alat dalam kondisi baik.")

    ' ---------- 12. AKTIVITAS TGA (TEKNISI GA) ----------
    LbSection w, r, "12. AKTIVITAS TGA (TEKNISI GA)", True
    Set dTga = NewDict(): Set dReq = NewDict()
    nTga = 0
    If AdaSheetGA(SH_TGA) Then
        tg = LbLog(SH_TGA, 4, 4, per, nTga, lkTga)
        For i = 1 To nTga
            txt = Teks(tg(i, 2)): If txt = "" Then txt = "(tanpa nama)"
            dTga(txt) = dTga(txt) + 1
            txt = Teks(tg(i, 4)): If txt = "" Then txt = "(tidak diisi)"
            dReq(txt) = dReq(txt) + 1
        Next i
    End If
    txt = "Jumlah aktivitas TGA periode ini: " & nTga
    If dTga.Count > 0 Then
        txt = txt & " oleh " & dTga.Count & " teknisi"
        a = Empty: j = 0
        For Each k In dReq.Keys
            If dReq(k) > j Then j = dReq(k): a = k
        Next k
        If Not IsEmpty(a) Then txt = txt & ". Pemohon terbanyak: " & a & " (" & j & " aktivitas)"
    End If
    LbParagraf w, r, txt & ".", True, 8.5
    r = r + 1
    ReDim data(1 To Application.Max(dTga.Count, 1), 1 To 3)
    i = 0
    For Each k In dTga.Keys
        i = i + 1
        data(i, 1) = k
        data(i, 2) = dTga(k)
        If nTga > 0 Then data(i, 3) = dTga(k) / nTga
    Next k
    rH = r
    r = LbTabel(w, r, Array(Array("Nama TGA", 5, "t", xlLeft), Array("Jumlah Aktivitas", 3, "n", xlCenter), _
        Array("Porsi", 2, "n", xlCenter)), data, i, False, "Tidak ada aktivitas TGA tercatat pada periode ini.")
    If i > 0 Then w.Range(w.Cells(rH + 1, 9), w.Cells(rH + i, 10)).NumberFormat = "0.0%"
    If nTga > 0 Then
        LbSub w, r, "Daftar aktivitas"
        ReDim data(1 To nTga, 1 To 5)
        For i = 1 To nTga
            data(i, 1) = i
            data(i, 2) = tg(i, 1)
            data(i, 3) = Teks(tg(i, 2))
            data(i, 4) = Teks(tg(i, 3))
            data(i, 5) = Teks(tg(i, 4))
        Next i
        r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Tanggal", 1, "d", xlCenter), Array("Nama TGA", 2, "t", xlLeft), _
            Array("Activity", 4, "t", xlLeft), Array("Request By", 2, "t", xlLeft)), data, nTga)
    End If

    ' ---------- 13. CATATAN & RENCANA TINDAK LANJUT ----------
    LbSection w, r, "13. CATATAN & RENCANA TINDAK LANJUT", True
    LbParagraf w, r, "Temuan diisi otomatis dari data (lokasi belum mencapai target & alat bermasalah). Kolom tindakan, PIC dan target diisi oleh SPV / GA.", True, 8.5
    r = r + 1
    ReDim tl(1 To 12, 1 To 5)
    For i = 1 To nLok
        If nTl >= 6 Then Exit For
        If StatusAch(rowsLok(i, 3), rowsLok(i, 4)) = "Not Achieve" Then
            nTl = nTl + 1
            tl(nTl, 2) = "Achievement " & rowsLok(i, 2) & " " & Persen(rowsLok(i, 4), rowsLok(i, 3)) & _
                         " (" & rowsLok(i, 5) & " jadwal tidak dikerjakan, " & rowsLok(i, 6) & " belum diinput)"
        End If
    Next i
    For i = 1 To nPerlu
        If nTl >= 10 Then Exit For
        nTl = nTl + 1
        tl(nTl, 2) = "Alat " & perlu(i, 3) & " (" & perlu(i, 5) & ") status " & perlu(i, 6)
    Next i
    If nTl < 5 Then nTl = 5
    For i = 1 To nTl
        tl(i, 1) = i
    Next i
    rH = r
    r = LbTabel(w, r, Array(Array("No", 1, "n", xlCenter), Array("Temuan / Isu", 4, "t", xlLeft), Array("Rencana Tindakan", 3, "t", xlLeft), _
        Array("PIC", 1, "t", xlCenter), Array("Target Selesai", 1, "t", xlCenter)), tl, nTl)
    For i = 1 To nTl
        If w.Rows(rH + i).RowHeight < 26 Then w.Rows(rH + i).RowHeight = 26
    Next i

    ' ---------- 14. PENGESAHAN ----------
    LbSection w, r, "14. PENGESAHAN"
    PengesahanBox w, r, 1, 3, "Dibuat oleh,", "SPV Cleaning & Gardening"
    PengesahanBox w, r, 4, 6, "Diperiksa oleh,", "GA Supervisor"
    PengesahanBox w, r, 7, 10, "Disetujui oleh,", "GA Manager"
    r = r + 8
    LbParagraf w, r, "Dokumen ini dibuat otomatis oleh Sistem Laporan GA - Plant Cikarang pada " & Format$(Now, "dd/mm/yyyy hh:nn") & _
        ". Sumber data: DATA_PLAN_ACTUAL, EVENT, IMPROVEMENT, INVENTORY, TGA.", True, 7.5

    ' ---------- tampilan & cetak ----------
    w.Activate
    ActiveWindow.FreezePanes = False
    ActiveWindow.DisplayGridlines = False
    ActiveWindow.ScrollRow = 1
    SetHalaman w, False
    On Error Resume Next
    Application.PrintCommunication = False
    w.PageSetup.PrintArea = w.Range(w.Cells(1, 1), w.Cells(r, LB_NCOL)).Address
    w.PageSetup.LeftFooter = "&8" & noDok
    w.PageSetup.RightFooter = "&8Laporan Bulanan GA - " & LabelPeriode(per)
    w.PageSetup.CenterHorizontally = True
    Application.PrintCommunication = True
    On Error GoTo 0
End Sub

Private Sub PengesahanBox(ByVal w As Worksheet, ByVal r As Long, ByVal c1 As Long, ByVal c2 As Long, _
                          ByVal judul As String, ByVal jabatan As String)
    Dim i As Long
    For i = 0 To 6
        w.Range(w.Cells(r + i, c1), w.Cells(r + i, c2)).Merge
        w.Range(w.Cells(r + i, c1), w.Cells(r + i, c2)).HorizontalAlignment = xlCenter
    Next i
    w.Cells(r, c1).Value = judul
    w.Cells(r, c1).Font.Size = 8.5
    w.Cells(r, c1).Font.Color = C_MUTED()
    w.Cells(r + 5, c1).Value = "( ................................................ )"
    w.Cells(r + 6, c1).Value = jabatan
    w.Cells(r + 6, c1).Font.Bold = True
    w.Cells(r + 6, c1).Font.Size = 8.5
    With w.Range(w.Cells(r, c1), w.Cells(r + 6, c2))
        .BorderAround LineStyle:=xlContinuous, Weight:=xlThin, Color:=C_LINE()
    End With
End Sub

'==================================================================
'  5. EXPORT PDF (Laporan Bulanan + Plan vs Actual)
'==================================================================
Public Sub ExportPDF()
    Dim per As Date, f As String, folder As String, pesan As String
    On Error GoTo EH
    per = GetPeriode()
    If ThisWorkbook.Path = "" Then Err.Raise vbObjectError + 520, , "Simpan workbook dulu (sebagai .xlsm) sebelum export PDF."
    folder = FolderKerja()
    If folder = "" Then folder = Environ$("USERPROFILE") & "\Documents"
    SpeedOn
    BuatLapBul per
    BuatLapPA per, Teks(MenuCell("MenuTim", "C8").Value)
    f = folder & Application.PathSeparator & "Laporan_GA_Cikarang_" & Format$(per, "yyyy-mm") & ".pdf"
    ThisWorkbook.Activate
    ThisWorkbook.Worksheets(Array(SH_LAPBUL, SH_LAPPA)).Select
    ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=f, Quality:=xlQualityStandard, _
        IncludeDocProperties:=True, IgnorePrintAreas:=False, OpenAfterPublish:=True
    Sh(SH_MENU).Select
    SpeedOff
    MsgBox "PDF tersimpan:" & vbCrLf & f, vbInformation, "Export PDF"
    Exit Sub
EH:
    pesan = Err.Description
    On Error Resume Next
    Sh(SH_MENU).Select
    TampilError pesan, "Export PDF"
End Sub

'==================================================================
'  6. LAMPIRKAN FOTO / DOKUMEN (EVENT, IMPROVEMENT, INVENTORY)
'==================================================================
Private Function UrlDecode(ByVal s As String) As String
    Dim i As Long, hasil As String, h As String
    i = 1
    Do While i <= Len(s)
        If Mid$(s, i, 1) = "%" And i + 2 <= Len(s) Then
            h = Mid$(s, i + 1, 2)
            If h Like "[0-9A-Fa-f][0-9A-Fa-f]" Then
                hasil = hasil & Chr$(CLng("&H" & h))
                i = i + 3
            Else
                hasil = hasil & "%"
                i = i + 1
            End If
        Else
            hasil = hasil & Mid$(s, i, 1)
            i = i + 1
        End If
    Loop
    UrlDecode = hasil
End Function

' True jika folder berisi file workbook ini (memastikan folder lokal yang benar)
Private Function FolderCocok(ByVal cand As String) As Boolean
    On Error Resume Next
    If Right$(cand, 1) = "\" Then cand = Left$(cand, Len(cand) - 1)
    FolderCocok = (Dir(cand & "\" & ThisWorkbook.Name) <> "")
End Function

' Ubah alamat OneDrive/SharePoint (https://...) menjadi folder lokal hasil sinkron.
Private Function PathLokal(ByVal p As String) As String
    Dim reg As Object, kunci As Variant, k As Variant, ns As String, mp As String
    Dim sisa As String, cand As String, pos As Long, env As Variant, vNs As Variant, vMp As Variant
    Const HKCU As Long = &H80000001
    Const KEY_OD As String = "Software\SyncEngines\Providers\OneDrive\"

    If LCase$(Left$(p, 4)) <> "http" Then
        PathLokal = p
        Exit Function
    End If
    p = UrlDecode(p)
    On Error Resume Next

    ' 1) cocokkan dengan daftar folder sinkron OneDrive di registry
    Set reg = GetObject("winmgmts:{impersonationLevel=impersonate}!\\.\root\default:StdRegProv")
    If Not reg Is Nothing Then
        reg.EnumKey HKCU, Left$(KEY_OD, Len(KEY_OD) - 1), kunci
        If IsArray(kunci) Then
            For Each k In kunci
                vNs = Empty
                vMp = Empty
                reg.GetStringValue HKCU, KEY_OD & k, "UrlNamespace", vNs
                reg.GetStringValue HKCU, KEY_OD & k, "MountPoint", vMp
                ns = UrlDecode(vNs & "")
                mp = vMp & ""
                If Len(ns) > 8 And mp <> "" Then
                    If Right$(ns, 1) <> "/" Then ns = ns & "/"
                    If LCase$(Left$(p & "/", Len(ns))) = LCase$(ns) Then
                        sisa = Mid$(p & "/", Len(ns) + 1)
                        cand = mp & "\" & Replace(sisa, "/", "\")
                        If FolderCocok(cand) Then
                            PathLokal = cand
                            If Right$(PathLokal, 1) = "\" Then PathLokal = Left$(PathLokal, Len(PathLokal) - 1)
                            Exit Function
                        End If
                    End If
                End If
            Next k
        End If
    End If

    ' 2) tebak dari folder OneDrive di komputer
    For Each env In Array("OneDriveCommercial", "OneDriveConsumer", "OneDrive")
        mp = Environ$(CStr(env))
        If mp <> "" Then
            If FolderCocok(mp) Then
                PathLokal = mp
                Exit Function
            End If
            sisa = p
            pos = InStr(9, sisa, "/")
            Do While pos > 0
                sisa = Mid$(sisa, pos + 1)
                cand = mp & "\" & Replace(sisa, "/", "\")
                If FolderCocok(cand) Then
                    PathLokal = cand
                    Exit Function
                End If
                pos = InStr(sisa, "/")
            Loop
        End If
    Next env
    PathLokal = ""
End Function

Private Function FolderSetting() As String
    Dim s As String
    On Error Resume Next
    s = ThisWorkbook.Names("cfgFolderDok").RefersTo
    If Len(s) > 3 Then FolderSetting = Mid$(s, 3, Len(s) - 3)     ' format: ="C:\..."
End Function

' Pilih folder penyimpanan dokumentasi secara manual (dipakai jika lokasi file tidak terbaca)
Public Sub AturFolderDokumentasi()
    Dim fd As Object, p As String
    Set fd = Application.FileDialog(4)       ' 4 = folder picker
    fd.Title = "Pilih folder untuk menyimpan foto dokumentasi"
    If fd.Show <> -1 Then Exit Sub
    p = fd.SelectedItems(1)
    On Error Resume Next
    ThisWorkbook.Names("cfgFolderDok").Delete
    On Error GoTo 0
    ThisWorkbook.Names.Add Name:="cfgFolderDok", RefersTo:="=""" & p & """", Visible:=False
    MsgBox "Folder dokumentasi diset ke:" & vbCrLf & p, vbInformation, "Folder Dokumentasi"
End Sub

' Folder kerja: folder lokal tempat workbook berada (sudah menangani OneDrive),
' atau folder yang diset manual. Kosong jika tidak bisa ditentukan.
Private Function FolderKerja() As String
    Dim p As String
    p = FolderSetting()
    If p <> "" Then
        If Dir(p, vbDirectory) <> "" Then
            FolderKerja = p
            Exit Function
        End If
    End If
    If ThisWorkbook.Path = "" Then Exit Function
    FolderKerja = PathLokal(ThisWorkbook.Path)
End Function

Public Sub LampirkanDokumentasi()
    Dim w As Worksheet, c As Range, hdrTxt As String, f As Variant, base As String
    Dim ext As String, nama As String, tujuan As String, alamat As String, pos As Long
    Dim relatif As Boolean, errCopy As String
    On Error GoTo EH
    If TypeName(ActiveSheet) <> "Worksheet" Then Exit Sub
    Set w = ActiveSheet
    Set c = ActiveCell
    If w.Name <> SH_EVENT And w.Name <> SH_IMP And w.Name <> SH_INV Then
        Err.Raise vbObjectError + 521, , "Buka sheet EVENT / IMPROVEMENT / INVENTORY, lalu pilih sel di kolom Documentation / Foto."
    End If
    hdrTxt = LCase$(Teks(w.Cells(HDR_ROW, c.Column).Value))
    If InStr(hdrTxt, "doc") = 0 And InStr(hdrTxt, "dokumentasi") = 0 And InStr(hdrTxt, "foto") = 0 Then
        Err.Raise vbObjectError + 522, , "Pilih dulu sel di kolom Documentation / Dokumentasi / Foto pada baris yang dimaksud."
    End If
    If c.Row < FIRST_ROW Then Err.Raise vbObjectError + 523, , "Pilih sel pada baris data (mulai baris " & FIRST_ROW & ")."
    If ThisWorkbook.Path = "" Then Err.Raise vbObjectError + 524, , "Simpan workbook dulu (File > Save As, format .xlsm)."

    base = FolderKerja()
    If base = "" Then
        If MsgBox("Lokasi file Excel tidak terbaca sebagai folder di komputer (biasanya karena dibuka dari OneDrive/SharePoint)." & _
                  vbCrLf & vbCrLf & "Pilih folder untuk menyimpan foto dokumentasi sekarang?", vbQuestion + vbYesNo, "Lampirkan") = vbNo Then Exit Sub
        AturFolderDokumentasi
        base = FolderKerja()
        If base = "" Then Exit Sub
    End If
    relatif = (LCase$(Left$(ThisWorkbook.Path, 4)) <> "http") And (FolderSetting() = "")

    f = Application.GetOpenFilename("Foto / Dokumen (*.jpg;*.jpeg;*.png;*.pdf),*.jpg;*.jpeg;*.png;*.pdf,Semua File (*.*),*.*", _
                                    1, "Pilih file dokumentasi")
    If VarType(f) = vbBoolean Then Exit Sub
    pos = InStrRev(f, ".")
    If pos > 0 Then ext = Mid$(f, pos)
    nama = w.Name & "_R" & c.Row & "_" & Format$(Now, "yyyymmdd_hhnnss") & ext
    tujuan = base & "\Dokumentasi\" & w.Name & "\" & nama

    On Error Resume Next
    If Dir(base & "\Dokumentasi", vbDirectory) = "" Then MkDir base & "\Dokumentasi"
    If Dir(base & "\Dokumentasi\" & w.Name, vbDirectory) = "" Then MkDir base & "\Dokumentasi\" & w.Name
    Err.Clear
    FileCopy CStr(f), tujuan
    If Err.Number <> 0 Then errCopy = Err.Description
    Err.Clear
    On Error GoTo EH

    If errCopy = "" Then
        If relatif Then
            alamat = "Dokumentasi\" & w.Name & "\" & nama
        Else
            alamat = tujuan
        End If
    Else
        alamat = CStr(f)     ' gagal menyalin: tautkan langsung ke file aslinya
    End If
    c.Hyperlinks.Delete
    w.Hyperlinks.Add Anchor:=c, Address:=alamat, TextToDisplay:=Mid$(f, InStrRev(f, "\") + 1)

    If errCopy = "" Then
        MsgBox "File disalin ke:" & vbCrLf & base & "\Dokumentasi\" & w.Name & vbCrLf & "dan sudah ditautkan.", vbInformation, "Lampirkan"
    Else
        MsgBox "File tidak bisa disalin (" & errCopy & ")." & vbCrLf & _
               "Sel ditautkan langsung ke lokasi asli file:" & vbCrLf & CStr(f), vbExclamation, "Lampirkan"
    End If
    Exit Sub
EH:
    TampilError Err.Description, "Lampirkan Dokumentasi"
End Sub

'==================================================================
'  TEMA (warna seragam semua sheet & dashboard)
'==================================================================
Private Function C_BLUE() As Long
    C_BLUE = RGB(17, 82, 170)
End Function
Private Function C_BLUE_DK() As Long
    C_BLUE_DK = RGB(10, 47, 112)
End Function
Private Function C_BLUE_LT() As Long
    C_BLUE_LT = RGB(30, 104, 204)
End Function
Private Function C_RED() As Long
    C_RED = RGB(215, 25, 32)
End Function
Private Function C_ORANGE() As Long
    C_ORANGE = RGB(224, 123, 0)
End Function
Private Function C_PURPLE() As Long
    C_PURPLE = RGB(94, 53, 177)
End Function
Private Function C_GREEN() As Long
    C_GREEN = RGB(19, 138, 75)
End Function
Private Function C_BG() As Long
    C_BG = RGB(236, 241, 248)
End Function
Private Function C_TXT() As Long
    C_TXT = RGB(27, 42, 65)
End Function
Private Function C_MUTED() As Long
    C_MUTED = RGB(96, 106, 122)
End Function
Private Function C_LINE() As Long
    C_LINE = RGB(208, 216, 228)
End Function


Private Function Dot() As String
    Dot = "  " & ChrW(183) & "  "
End Function

Private Function Panah() As String
    Panah = " " & ChrW(8250)
End Function

Private Function Ikon(ByVal kode As Long) As String
    Ikon = ChrW(kode)
End Function

'==================================================================
'  HELPER SHAPE
'==================================================================
Private Function Kotak(ByVal w As Worksheet, ByVal nama As String, ByVal x As Double, ByVal y As Double, _
                       ByVal wd As Double, ByVal ht As Double, ByVal warna As Long, _
                       Optional ByVal radius As Double = 0) As Shape
    Dim s As Shape, m As Double
    If radius > 0 Then
        Set s = w.Shapes.AddShape(5, x, y, wd, ht)       ' 5 = rounded rectangle
        m = wd
        If ht < m Then m = ht
        If m > 0 Then s.Adjustments.Item(1) = radius / m
    Else
        Set s = w.Shapes.AddShape(1, x, y, wd, ht)       ' 1 = rectangle
    End If
    s.Name = nama
    s.Placement = xlFreeFloating
    s.Line.Visible = 0
    s.Fill.Solid
    s.Fill.ForeColor.RGB = warna
    s.Fill.Transparency = 0
    s.Shadow.Visible = 0
    With s.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = ""
    End With
    Set Kotak = s
End Function

Private Sub Gradasi(ByVal s As Shape, ByVal c1 As Long, ByVal c2 As Long, Optional ByVal gaya As Long = 2)
    On Error Resume Next
    s.Fill.TwoColorGradient gaya, 1
    s.Fill.ForeColor.RGB = c1
    s.Fill.BackColor.RGB = c2
End Sub

Private Sub Bayangan(ByVal s As Shape)
    On Error Resume Next
    With s.Shadow
        .Visible = -1
        .ForeColor.RGB = RGB(20, 40, 80)
        .Transparency = 0.86
        .OffsetX = 0
        .OffsetY = 2
        .Blur = 8
    End With
End Sub

Private Function Tulisan(ByVal w As Worksheet, ByVal nama As String, ByVal x As Double, ByVal y As Double, _
                         ByVal wd As Double, ByVal ht As Double, ByVal txt As String, ByVal ukuran As Double, _
                         ByVal tebal As Boolean, ByVal warna As Long, Optional ByVal rata As Long = 1, _
                         Optional ByVal fontNama As String = FONT_UI, Optional ByVal anchor As Long = 3) As Shape
    Dim s As Shape
    Set s = w.Shapes.AddTextbox(1, x, y, wd, ht)
    s.Name = nama
    s.Placement = xlFreeFloating
    s.Fill.Visible = 0
    s.Line.Visible = 0
    With s.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .WordWrap = -1
        .AutoSize = 0
        .VerticalAnchor = anchor           ' 1 atas, 3 tengah, 4 bawah
        With .TextRange
            .Text = txt
            .Font.Name = fontNama
            .Font.Size = ukuran
            .Font.Bold = IIf(tebal, -1, 0)
            .Font.Fill.ForeColor.RGB = warna
            .ParagraphFormat.Alignment = rata    ' 1 kiri, 2 tengah, 3 kanan
        End With
    End With
    Set Tulisan = s
End Function

Private Function AdaShape(ByVal w As Worksheet, ByVal nama As String) As Boolean
    Dim s As Shape
    On Error Resume Next
    Set s = w.Shapes(nama)
    AdaShape = Not (s Is Nothing)
End Function

Private Sub SetTeks(ByVal w As Worksheet, ByVal nama As String, ByVal txt As String)
    On Error Resume Next
    w.Shapes(nama).TextFrame2.TextRange.Text = txt
End Sub

Private Sub Klik(ByVal w As Worksheet, ByVal macroName As String, ParamArray nama() As Variant)
    Dim i As Long
    On Error Resume Next
    For i = LBound(nama) To UBound(nama)
        w.Shapes(CStr(nama(i))).OnAction = macroName
    Next i
End Sub

' Kartu putih dengan aksen warna di kiri
Private Sub KartuAksen(ByVal w As Worksheet, ByVal pfx As String, ByVal x As Double, ByVal y As Double, _
                       ByVal wd As Double, ByVal ht As Double, ByVal warna As Long)
    Dim s As Shape
    Set s = Kotak(w, pfx & "_acc", x, y, wd, ht, warna, 8)
    Bayangan s
    Kotak w, pfx & "_bg", x + 5, y, wd - 5, ht, vbWhite, 8
End Sub

Private Function MenuCell(ByVal nm As String, ByVal cadangan As String) As Range
    Dim r As Range
    On Error Resume Next
    Set r = ThisWorkbook.Names(nm).RefersToRange
    On Error GoTo 0
    If r Is Nothing Then Set r = Sh(SH_MENU).Range(cadangan)
    Set MenuCell = r
End Function

Private Function KolomDiX(ByVal w As Worksheet, ByVal x As Double) As Long
    Dim c As Long
    c = 1
    Do While w.Cells(1, c + 1).Left <= x
        c = c + 1
    Loop
    KolomDiX = c
End Function

Private Function BarisDiY(ByVal w As Worksheet, ByVal y As Double) As Long
    Dim r As Long
    r = 1
    Do While w.Cells(r + 1, 1).Top <= y
        r = r + 1
    Loop
    BarisDiY = r
End Function

Private Function SelInput(ByVal w As Worksheet, ByVal r As Long, ByVal c1 As Long, ByVal c2 As Long, _
                          ByVal nilai As Variant, ByVal nama As String) As Range
    Dim rg As Range
    Set rg = w.Range(w.Cells(r, c1), w.Cells(r, c2))
    rg.Merge
    rg.Interior.Color = vbWhite
    rg.HorizontalAlignment = xlCenter
    rg.VerticalAlignment = xlCenter
    rg.Font.Name = FONT_UI
    rg.Font.Size = 10
    rg.Font.Bold = True
    rg.Font.Color = C_BLUE()
    With rg.Borders
        .LineStyle = xlContinuous
        .Color = C_LINE()
    End With
    rg.Cells(1, 1).Value = nilai
    On Error Resume Next
    ThisWorkbook.Names(nama).Delete
    On Error GoTo 0
    ThisWorkbook.Names.Add Name:=nama, RefersTo:="='" & w.Name & "'!" & rg.Cells(1, 1).Address
    Set SelInput = rg
End Function

Private Sub SelLabel(ByVal w As Worksheet, ByVal r As Long, ByVal c1 As Long, ByVal c2 As Long, ByVal txt As String)
    With w.Range(w.Cells(r, c1), w.Cells(r, c2))
        .Merge
        .HorizontalAlignment = xlRight
        .VerticalAlignment = xlCenter
        .Font.Name = FONT_UI
        .Font.Size = 8.5
        .Font.Bold = True
        .Font.Color = C_MUTED()
        .Cells(1, 1).Value = txt
    End With
End Sub

'==================================================================
'  DASHBOARD (sheet MENU)
'==================================================================
Public Sub BuatDashboard()
    Dim w As Worksheet, vB As Variant, vT As Variant, vM As Variant, s As Shape
    Dim x As Double, y As Double, cw As Double, i As Long, gap As Double
    Dim kx As Variant, kLbl As Variant, kWarna As Variant
    Dim y1 As Double, H As Double, lw As Double, mx As Double, mw As Double, px As Double, pw As Double
    Dim th As Double, ty As Double, tJudul As Variant, tSub As Variant, tIkon As Variant, tWarna As Variant, tMacro As Variant
    Dim bx As Double, bw As Double, bNama As Variant, bMacro As Variant, bSub As Variant
    Dim yF As Double, rF As Long, c As Long, rg As Range
    On Error GoTo EH

    Set w = Sh(SH_MENU)
    vB = MenuCell("MenuBulan", "C6").Value
    vT = MenuCell("MenuTahun", "C7").Value
    vM = MenuCell("MenuTim", "C8").Value
    If BulanKeAngka(Teks(vB)) = 0 Then vB = NamaBulan(Month(Date))
    If Val(Teks(vT)) < 2000 Then vT = Year(Date)
    If Teks(vM) = "" Then vM = "Semua"

    w.Activate
    UkurLayar
    SpeedOn
    ' ---- reset sheet ----
    Do While w.Shapes.Count > 0
        w.Shapes(1).Delete
    Loop
    On Error Resume Next
    w.Cells.Validation.Delete
    w.Cells.Hyperlinks.Delete
    On Error GoTo EH
    w.Cells.UnMerge
    w.Cells.Clear
    w.Cells.Interior.Color = C_BG()
    w.Cells.Font.Name = FONT_UI
    w.Cells.ColumnWidth = 1.71
    w.Cells.RowHeight = 15

    ' ---- HEADER ----
    x = DB_X: y = DB_Y
    Set s = Kotak(w, "hdr_bg", x, y, mDbW, 72, C_BLUE(), 10)
    Gradasi s, C_BLUE_DK(), C_BLUE_LT(), 2
    Bayangan s
    Kotak w, "hdr_red", x + 6, y + 69, mDbW - 12, 3, C_RED()
    Tulisan w, "hdr_title", x + 24, y + 10, mDbW - 24 - 360, 30, "SISTEM LAPORAN GA CLEANING & GARDENING", IIf(mDbW < 1180, 17, 20), True, vbWhite
    Tulisan w, "hdr_sub", x + 24, y + 41, mDbW - 24 - 360, 18, _
        "General Affairs" & Dot() & "PT Frisian Flag Indonesia " & ChrW(8212) & " Plant Cikarang", 10, False, RGB(220, 232, 250)
    Tulisan w, "hdrTanggal", x + mDbW - 334, y + 14, 310, 20, "", 12, True, vbWhite, 3
    Tulisan w, "hdrPeriode", x + mDbW - 334, y + 36, 310, 18, "", 9.5, False, RGB(210, 225, 245), 3

    ' ---- KPI ----
    y = DB_Y + 86
    gap = 16
    cw = (mDbW - 4 * gap) / 5
    kLbl = Array("PLAN BULAN INI", "BELUM DIINPUT", "ACHIEVEMENT", "KEGIATAN BULAN INI", "TIDAK DIKERJAKAN")
    kWarna = Array(C_BLUE(), C_ORANGE(), C_PURPLE(), C_GREEN(), C_RED())
    For i = 0 To 4
        x = DB_X + i * (cw + gap)
        KartuAksen w, "kpi" & (i + 1), x, y, cw, 84, CLng(kWarna(i))
        Tulisan w, "kpiLbl" & (i + 1), x + 24, y + 12, cw - 34, 16, CStr(kLbl(i)), 9, True, RGB(55, 65, 82)
        Tulisan w, "kpiVal" & (i + 1), x + 24, y + 29, cw - 34, 32, "-", 22, True, CLng(kWarna(i))
        Tulisan w, "kpiSub" & (i + 1), x + 24, y + 62, cw - 34, 15, "", 8.5, False, C_MUTED()
    Next i

    ' ---- AREA UTAMA ----
    y1 = DB_Y + 86 + 84 + 20
    H = mDbH
    lw = Int(mDbW * 0.375)
    mx = DB_X + lw + 18
    mw = Int(mDbW * 0.322)
    px = mx + mw + 18
    pw = DB_X + mDbW - px

    ' kartu besar: Input Actual
    Set s = Kotak(w, "hero_bg", DB_X, y1, lw, H, C_BLUE(), 16)
    Gradasi s, C_BLUE_LT(), C_BLUE_DK(), 4
    Bayangan s
    Tulisan w, "hero_ico", DB_X + 40, y1 + 26, 80, 70, Ikon(&HE70F&), 48, False, vbWhite, 1, FONT_ICON
    Kotak w, "hero_red", DB_X + lw - 220, y1 + 30, 170, 4, C_RED()
    Set s = Tulisan(w, "hero_title", DB_X + 40, y1 + H - 188, lw - 70, 84, "INPUT ACTUAL" & vbCr & "MINGGUAN SPV", 27, True, vbWhite, 1, FONT_UI, 4)
    s.TextFrame2.TextRange.ParagraphFormat.SpaceWithin = 0.9
    Tulisan w, "hero_sub", DB_X + 40, y1 + H - 100, lw - 70, 20, "Isi realisasi pekerjaan Cleaning & Gardening", 11, False, RGB(225, 235, 250)
    Set s = Kotak(w, "hero_btn", DB_X + 40, y1 + H - 64, 220, 40, vbWhite, 20)
    Bayangan s
    With s.TextFrame2
        .VerticalAnchor = 3
        .TextRange.Text = "Buka form" & Panah()
        .TextRange.Font.Name = FONT_UI
        .TextRange.Font.Size = 12
        .TextRange.Font.Bold = -1
        .TextRange.Font.Fill.ForeColor.RGB = C_BLUE_DK()
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    Klik w, "BukaInputActual", "hero_bg", "hero_ico", "hero_red", "hero_title", "hero_sub", "hero_btn"

    ' 3 tile proses
    th = (H - 2 * 14) / 3
    tJudul = Array("GENERATE PLAN BULANAN", "LAPORAN PLAN VS ACTUAL", "LAPORAN BULANAN")
    tSub = Array("Buat jadwal plan dari master pekerjaan", "Matriks plan & actual per hari", "Laporan gabungan, siap cetak / PDF")
    tIkon = Array(&HE787&, &HE9D9&, &HE7C3&)
    tWarna = Array(C_GREEN(), C_BLUE(), C_PURPLE())
    tMacro = Array("GeneratePlan", "BuatLaporanPlanActual", "BuatLaporanBulanan")
    For i = 0 To 2
        ty = y1 + i * (th + 14)
        KartuAksen w, "tile" & i, mx, ty, mw, th, CLng(tWarna(i))
        Kotak w, "tile" & i & "_ib", mx + 32, ty + (th - 52) / 2, 52, 52, CLng(tWarna(i)), 12
        Tulisan w, "tile" & i & "_ic", mx + 32, ty + (th - 52) / 2, 52, 52, Ikon(CLng(tIkon(i))), 22, False, vbWhite, 2, FONT_ICON
        Tulisan w, "tile" & i & "_t", mx + 104, ty + th / 2 - 22, mw - 120, 22, CStr(tJudul(i)), IIf(mw < 380, 12.5, 14), True, C_TXT()
        Tulisan w, "tile" & i & "_s", mx + 104, ty + th / 2 + 2, mw - 120, 18, CStr(tSub(i)), 9.5, False, C_MUTED()
        Klik w, CStr(tMacro(i)), "tile" & i & "_acc", "tile" & i & "_bg", "tile" & i & "_ib", "tile" & i & "_ic", _
             "tile" & i & "_t", "tile" & i & "_s"
    Next i

    ' panel kanan: export & catat kegiatan
    Set s = Kotak(w, "pnl_bg", px, y1, pw, H, vbWhite, 16)
    Bayangan s
    Tulisan w, "pnl_ico", px + 22, y1 + 20, 30, 30, Ikon(&HE749&), 18, False, C_BLUE(), 2, FONT_ICON
    Tulisan w, "pnl_t", px + 62, y1 + 18, pw - 80, 18, "EXPORT LAPORAN", 12.5, True, C_TXT()
    Tulisan w, "pnl_s", px + 62, y1 + 36, pw - 80, 14, "Laporan Bulanan + Plan vs Actual (PDF)", 8.5, False, C_MUTED()

    Set s = Kotak(w, "pdf_bg", px + 22, y1 + 64, pw - 44, 62, C_BLUE(), 8)
    Gradasi s, C_BLUE_DK(), C_BLUE_LT(), 2
    Bayangan s
    Tulisan w, "pdf_ic", px + 36, y1 + 64, 40, 62, Ikon(&HE749&), 22, False, vbWhite, 2, FONT_ICON
    Tulisan w, "pdf_t", px + 88, y1 + 74, pw - 120, 22, "EXPORT PDF", 14, True, vbWhite
    Tulisan w, "pdf_s", px + 88, y1 + 97, pw - 120, 16, "Simpan laporan sebagai PDF", 8.5, False, RGB(225, 235, 250)
    Klik w, "ExportPDF", "pdf_bg", "pdf_ic", "pdf_t", "pdf_s"

    bw = (pw - 44 - 10) / 2
    Set s = Kotak(w, "ref_bg", px + 22, y1 + 138, bw, 44, RGB(232, 240, 252), 6)
    s.Line.Visible = -1
    s.Line.ForeColor.RGB = C_BLUE()
    s.Line.Weight = 1.25
    Tulisan w, "ref_ic", px + 30, y1 + 138, 30, 44, Ikon(&HE72C&), 15, False, C_BLUE(), 2, FONT_ICON
    Tulisan w, "ref_t", px + 62, y1 + 138, bw - 44, 44, "PERBARUI", 10.5, True, C_BLUE_DK()
    Klik w, "RefreshDashboard", "ref_bg", "ref_ic", "ref_t"
    Set s = Kotak(w, "syn_bg", px + 32 + bw, y1 + 138, bw, 44, C_GREEN(), 6)
    Bayangan s
    Tulisan w, "syn_ic", px + 40 + bw, y1 + 138, 30, 44, Ikon(&HE895&), 15, False, vbWhite, 2, FONT_ICON
    Tulisan w, "syn_t", px + 72 + bw, y1 + 138, bw - 44, 44, "SINKRON CIKOPS", 10.5, True, vbWhite
    Klik w, "KeSinkronCIKOPS", "syn_bg", "syn_ic", "syn_t"

    Tulisan w, "cat_lbl", px + 22, y1 + H - 106, pw - 44, 14, "CATAT KEGIATAN", 8.5, True, C_MUTED()
    bw = (pw - 44 - 3 * 8) / 4
    bNama = Array("btnEvent", "btnImp", "btnInv", "btnTGA")
    bSub = Array("Event", "Improvement", "Inventory", "TGA")
    bMacro = Array("KeEvent", "KeImprovement", "KeInventory", "KeTGA")
    For i = 0 To 3
        bx = px + 22 + i * (bw + 8)
        Set s = Kotak(w, CStr(bNama(i)), bx, y1 + H - 88, bw, 46, vbWhite, 6)
        s.Line.Visible = -1
        s.Line.ForeColor.RGB = C_LINE()
        s.Line.Weight = 1
        TombolDuaBaris s, CStr(bSub(i)), "catat" & Panah()
        s.OnAction = CStr(bMacro(i))
    Next i

    bw = (pw - 44) / 3
    Tulisan w, "lnk1", px + 22, y1 + H - 30, bw, 16, "Pekerjaan" & Panah(), 9.5, True, C_BLUE()
    Tulisan w, "lnk2", px + 22 + bw, y1 + H - 30, bw, 16, "Manpower" & Panah(), 9.5, True, C_BLUE(), 2
    Tulisan w, "lnk3", px + 22 + 2 * bw, y1 + H - 30, bw, 16, "Panduan" & Panah(), 9.5, True, C_BLUE(), 3
    Klik w, "KeDBPekerjaan", "lnk1"
    Klik w, "KeManpower", "lnk2"
    Klik w, "KePanduan", "lnk3"

    ' ---- FOOTER: pilihan periode (sel Excel) + utilitas ----
    yF = y1 + H + 14
    rF = BarisDiY(w, yF)
    If w.Cells(rF, 1).Top < yF - 1 Then rF = rF + 1
    w.Rows(rF).RowHeight = 22
    c = KolomDiX(w, DB_X)
    SelLabel w, rF, c, c + 8, "PERIODE"
    Set rg = SelInput(w, rF, c + 9, c + 17, vB, "MenuBulan")
    rg.Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=lstBulan"
    Set rg = SelInput(w, rF, c + 19, c + 23, vT, "MenuTahun")
    rg.Validation.Add Type:=xlValidateWholeNumber, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="2020", Formula2:="2100"
    SelLabel w, rF, c + 24, c + 28, "TIM"
    Set rg = SelInput(w, rF, c + 29, c + 40, vM, "MenuTim")
    rg.Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:="=lstTimFilter"
    x = w.Cells(rF, c + 41).Left + 10
    Tulisan w, "ft_apply", x, w.Cells(rF, 1).Top, 120, 22, ChrW(8635) & " Terapkan periode", 9, True, C_BLUE()
    Klik w, "RefreshDashboard", "ft_apply"

    Tulisan w, "ft_util1", DB_X + mDbW - 290, w.Cells(rF, 1).Top + 26, 110, 14, "Isi ID otomatis", 8, False, C_MUTED(), 3
    Tulisan w, "ft_util2", DB_X + mDbW - 170, w.Cells(rF, 1).Top + 26, 170, 14, "Hapus plan periode ini", 8, False, C_MUTED(), 3
    Klik w, "IsiIDOtomatis", "ft_util1"
    Klik w, "HapusPlanPeriode", "ft_util2"
    Tulisan w, "ft_fit", DB_X + mDbW - 280, w.Cells(rF, 1).Top, 145, 22, ChrW(8635) & " Sesuaikan ke layar", 9, True, C_BLUE(), 3
    Tulisan w, "ft_full", DB_X + mDbW - 130, w.Cells(rF, 1).Top, 130, 22, LabelLayar(), 9, True, C_BLUE(), 3
    Klik w, "SesuaikanLayar", "ft_fit"
    Klik w, "LayarPenuh", "ft_full"
    Tulisan w, "ft_note", DB_X, w.Cells(rF, 1).Top + 26, 380, 14, _
        "Sistem Laporan GA" & Dot() & "Cleaning, Gardening & TGA" & Dot() & "Plant Cikarang", 8, False, RGB(130, 140, 155)
    Tulisan w, "ga_sync_lbl", DB_X + 390, w.Cells(rF, 1).Top + 26, 320, 14, ChrW(8645) & "  CIKOPS", 8, True, C_GREEN()
    Klik w, "KeStatusCIKOPS", "ga_sync_lbl"

    IsiDashboard
    SpeedOff
    w.Activate
    With ActiveWindow
        .DisplayGridlines = False
        .DisplayHeadings = False
        .Zoom = 100
        .ScrollRow = 1
        .ScrollColumn = 1
    End With
    w.Range("A1").Select
    Exit Sub
EH:
    TampilError Err.Description, "Buat Dashboard"
End Sub

Private Sub TombolDuaBaris(ByVal s As Shape, ByVal baris1 As String, ByVal baris2 As String)
    With s.TextFrame2
        .VerticalAnchor = 3
        .TextRange.Text = baris1 & vbCr & baris2
        .TextRange.Font.Name = FONT_UI
        .TextRange.ParagraphFormat.Alignment = 2
        .TextRange.Paragraphs(1).Font.Size = IIf(s.Width < 90, 9, 10.5)
        .TextRange.Paragraphs(1).Font.Bold = -1
        .TextRange.Paragraphs(1).Font.Fill.ForeColor.RGB = C_TXT()
        .TextRange.Paragraphs(2).Font.Size = 8
        .TextRange.Paragraphs(2).Font.Bold = 0
        .TextRange.Paragraphs(2).Font.Fill.ForeColor.RGB = C_MUTED()
    End With
End Sub

Public Sub RefreshDashboard()
    On Error GoTo EH
    If Not AdaShape(Sh(SH_MENU), "kpiVal1") Then
        BuatDashboard
        Exit Sub
    End If
    PerbaruiSemua
    Exit Sub
EH:
    TampilError Err.Description, "Perbarui Dashboard"
End Sub

' Perbarui laporan Plan vs Actual, Laporan Bulanan & dashboard sesuai periode di MENU,
' lalu kembali ke sheet yang sedang dibuka.
Private Sub PerbaruiSemua()
    Dim aktif As Object, per As Date
    On Error Resume Next
    Set aktif = ActiveSheet
    per = GetPeriode()
    If Err.Number <> 0 Then
        Err.Clear
        Exit Sub
    End If
    SpeedOn
    Application.StatusBar = "Memperbarui laporan " & LabelPeriode(per) & " ..."
    BuatLapPA per, Teks(MenuCell("MenuTim", "C8").Value)
    Err.Clear
    BuatLapBul per
    Err.Clear
    If AdaShape(Sh(SH_MENU), "kpiVal1") Then IsiDashboard
    Err.Clear
    If Not aktif Is Nothing Then aktif.Activate
    SpeedOff
End Sub

Private Sub RefreshDiam()
    On Error Resume Next
    If AdaShape(Sh(SH_MENU), "kpiVal1") Then IsiDashboard
End Sub

Private Sub IsiDashboard()
    Dim w As Worksheet, wD As Worksheet, s As Worksheet, per As Date, kode As Long, arr As Variant
    Dim lr As Long, i As Long, t As Date, ok As Boolean, v As String
    Dim nPlan As Long, nCS As Long, nGD As Long, nDone As Long, nTidak As Long, nBelum As Long
    Dim nEv As Long, nImp As Long, nInv As Long, nTga As Long

    Set w = Sh(SH_MENU)
    Set wD = Sh(SH_DATA)
    per = GetPeriode()
    kode = KodePeriode(per)

    lr = LastRow(wD, D_KEY)
    If lr >= 2 Then
        arr = Baca(wD.Range(wD.Cells(2, 1), wD.Cells(lr, D_NCOL)))
        For i = 1 To UBound(arr, 1)
            If Teks(arr(i, D_PER)) = CStr(kode) Then
                nPlan = nPlan + 1
                If LCase$(Teks(arr(i, D_TIM))) = "gardener" Then nGD = nGD + 1 Else nCS = nCS + 1
                v = Teks(arr(i, D_ACT))
                If v = "1" Then
                    nDone = nDone + 1
                ElseIf v <> "" Then
                    nTidak = nTidak + 1
                Else
                    t = KeTanggal(arr(i, D_TGL), ok)
                    If ok Then
                        If t <= Date Then nBelum = nBelum + 1
                    End If
                End If
            End If
        Next i
    End If

    nEv = HitungBulan(SH_EVENT, 6, per)
    nImp = HitungBulan(SH_IMP, 8, per)
    If AdaSheetGA(SH_TGA) Then nTga = HitungBulan(SH_TGA, 4, per)

    Set s = Sh(SH_INV)
    lr = LastRowAny(s, 1, 8)
    If lr >= FIRST_ROW Then
        arr = Baca(s.Range(s.Cells(FIRST_ROW, 1), s.Cells(lr, 8)))
        For i = 1 To UBound(arr, 1)
            If Teks(arr(i, 2)) <> "" And LCase$(Teks(arr(i, 5))) <> "baik" Then nInv = nInv + 1
        Next i
    End If

    SetTeks w, "hdrTanggal", NamaHari(Date) & ", " & Day(Date) & " " & NamaBulan(Month(Date)) & " " & Year(Date)
    SetTeks w, "hdrPeriode", "Periode laporan: " & LabelPeriode(per) & Dot() & "diperbarui " & Format$(Now, "hh:nn")

    SetTeks w, "kpiVal1", Format$(nPlan, "#,##0")
    SetTeks w, "kpiSub1", "jadwal" & Dot() & "CS " & Format$(nCS, "#,##0") & Dot() & "GD " & Format$(nGD, "#,##0")
    SetTeks w, "kpiVal2", Format$(nBelum, "#,##0")
    SetTeks w, "kpiSub2", "jadwal lewat, actual kosong"
    If nPlan > 0 Then
        SetTeks w, "kpiVal3", Format$(nDone / nPlan, "0.0%")
    Else
        SetTeks w, "kpiVal3", "-"
    End If
    SetTeks w, "kpiSub3", Format$(nDone, "#,##0") & "/" & Format$(nPlan, "#,##0") & " dikerjakan" & Dot() & "target 100%"
    SetTeks w, "kpiVal4", Format$(nEv + nImp + nTga, "#,##0")
    SetTeks w, "kpiSub4", nEv & " event" & Dot() & nImp & " improvement" & Dot() & nTga & " TGA"
    SetTeks w, "kpiVal5", Format$(nTidak, "#,##0")
    SetTeks w, "kpiSub5", "pekerjaan dengan actual = 0"

    If nInv > 0 Then
        TombolDuaBaris w.Shapes("btnInv"), "Inventory", nInv & " alat perlu cek" & Panah()
        w.Shapes("btnInv").TextFrame2.TextRange.Paragraphs(2).Font.Fill.ForeColor.RGB = C_RED()
    Else
        TombolDuaBaris w.Shapes("btnInv"), "Inventory", "update" & Panah()
    End If
    If AdaShape(w, "btnTGA") Then TombolDuaBaris w.Shapes("btnTGA"), "TGA", IIf(nTga > 0, nTga & " bln ini", "catat") & Panah()
    On Error Resume Next
    Dim lbl As String
    lbl = Application.Run("GASync_Label")
    If Err.Number = 0 And lbl <> "" Then SetTeks w, "ga_sync_lbl", ChrW(8645) & "  " & lbl
    Err.Clear
End Sub

Private Function AdaSheetGA(ByVal nama As String) As Boolean
    Dim s As Object
    On Error Resume Next
    Set s = ThisWorkbook.Sheets(nama)
    AdaSheetGA = Not s Is Nothing
End Function

Private Function HitungBulan(ByVal namaSheet As String, ByVal nCol As Long, ByVal per As Date) As Long
    Dim s As Worksheet, lr As Long, arr As Variant, i As Long, t As Date, ok As Boolean
    Set s = Sh(namaSheet)
    lr = LastRowAny(s, 1, nCol)
    If lr < FIRST_ROW Then Exit Function
    arr = Baca(s.Range(s.Cells(FIRST_ROW, 1), s.Cells(lr, 1)))
    For i = 1 To UBound(arr, 1)
        t = KeTanggal(arr(i, 1), ok)
        If ok Then
            If Year(t) = Year(per) And Month(t) = Month(per) Then HitungBulan = HitungBulan + 1
        End If
    Next i
End Function

' Ukur area kerja jendela pada zoom 100% lalu tentukan ukuran dashboard
Private Sub UkurLayar()
    Dim uw As Double, uh As Double
    On Error Resume Next
    ActiveWindow.Zoom = 100
    DoEvents
    uw = ActiveWindow.UsableWidth
    uh = ActiveWindow.UsableHeight
    On Error GoTo 0
    If uw <= 0 Then uw = 1264
    If uh <= 0 Then uh = 560
    mLastW = uw
    mLastH = uh
    mDbW = uw - 2 * DB_X - 6
    If mDbW < 980 Then mDbW = 980
    If mDbW > 2400 Then mDbW = 2400
    mDbH = uh - (DB_Y + 86 + 84 + 20) - 14 - 46
    If mDbH < 300 Then mDbH = 300
    If mDbH > 560 Then mDbH = 560
End Sub

Private Function PerluBangunUlang() As Boolean
    Dim uw As Double, uh As Double
    On Error Resume Next
    If Not AdaShape(Sh(SH_MENU), "kpiVal1") Then
        PerluBangunUlang = True
        Exit Function
    End If
    ActiveWindow.Zoom = 100
    uw = ActiveWindow.UsableWidth
    uh = ActiveWindow.UsableHeight
    PerluBangunUlang = (Abs(uw - mLastW) > 6 Or Abs(uh - mLastH) > 6)
End Function

Private Function LabelLayar() As String
    If Application.DisplayFullScreen Then
        LabelLayar = "Keluar layar penuh " & ChrW(8601)
    Else
        LabelLayar = "Layar penuh " & ChrW(8599)
    End If
End Function

' Bangun ulang dashboard agar pas dengan ukuran jendela saat ini (zoom tetap 100%)
Public Sub SesuaikanLayar()
    BuatDashboard
End Sub

Public Sub MasukLayarPenuh()
    On Error Resume Next
    Sh(SH_MENU).Activate
    Application.DisplayFullScreen = True
    With ActiveWindow
        .DisplayHeadings = False
        .DisplayGridlines = False
        .DisplayHorizontalScrollBar = False
        .DisplayVerticalScrollBar = False
        .DisplayWorkbookTabs = False
        .Zoom = 100
        .ScrollRow = 1
        .ScrollColumn = 1
    End With
    DoEvents
    If PerluBangunUlang() Then
        BuatDashboard
    Else
        RefreshDiam
    End If
    SetTeks Sh(SH_MENU), "ft_full", LabelLayar()
    Sh(SH_MENU).Range("A1").Select
End Sub

Private Sub KeluarLayarPenuhDiam()
    On Error Resume Next
    If Application.DisplayFullScreen Then Application.DisplayFullScreen = False
    With ActiveWindow
        .DisplayHorizontalScrollBar = True
        .DisplayVerticalScrollBar = True
        .DisplayWorkbookTabs = True
    End With
    SetTeks Sh(SH_MENU), "ft_full", LabelLayar()
End Sub

Public Sub KeluarLayarPenuh()
    KeluarLayarPenuhDiam
    DoEvents
    If ActiveSheet.Name = SH_MENU Then BuatDashboard
End Sub

Public Sub LayarPenuh()
    If Application.DisplayFullScreen Then
        KeluarLayarPenuh
    Else
        MasukLayarPenuh
    End If
End Sub

' Otomatis saat file dibuka / ditutup
Public Sub Auto_Open()
    On Error Resume Next
    MasukLayarPenuh
    Application.Run "GASync_SaatBuka"
End Sub

Public Sub Auto_Close()
    On Error Resume Next
    Application.Run "GASync_Batal"
    KeluarLayarPenuhDiam
End Sub

'==================================================================
'  NAVIGASI
'==================================================================
Public Sub KeMenu()
    MasukLayarPenuh
End Sub

Private Sub BukaSheet(ByVal nama As String, Optional ByVal sel As String = "A1")
    KeluarLayarPenuhDiam
    Sh(nama).Activate
    Sh(nama).Range(sel).Select
End Sub

Public Sub BukaInputActual()
    Dim w As Worksheet
    Set w = Sh(SH_INPUT)
    KeluarLayarPenuhDiam
    If Not AdaShape(w, "fi_v1") Then BangunFormInput
    If Teks(w.Range("C7").Value) = "" Then w.Range("C7").Value = Date
    w.Activate
    If LastRow(w, 1) < IN_FIRST Then TampilJadwalInti True
    w.Range("C4").Select
End Sub

Public Sub KeEvent()
    BukaSheet SH_EVENT, "A5"
End Sub

Public Sub KeImprovement()
    BukaSheet SH_IMP, "A5"
End Sub

Public Sub KeInventory()
    BukaSheet SH_INV, "A5"
End Sub

Public Sub KeTGA()
    If Not AdaSheetGA(SH_TGA) Then SiapkanSheetTGA
    IsiDaftarNamaTGA
    BukaSheet SH_TGA, "A" & Application.Max(FIRST_ROW, LastRowAny(Sh(SH_TGA), 1, 4) + 1)
End Sub

Public Sub KeStatusCIKOPS()
    On Error GoTo EH
    Application.Run "StatusSinkronCIKOPS"
    Exit Sub
EH:
    MsgBox "Modul sinkron CIKOPS (modSyncGA) belum dipasang.", vbExclamation, "Sinkron CIKOPS"
End Sub

'------------------------------------------------------------------
'  SHEET TGA (Teknisi GA): Tanggal | Nama TGA | Activity | Request By
'------------------------------------------------------------------
Public Sub SiapkanSheetTGA()
    Dim w As Worksheet, src As Worksheet, lr As Long
    On Error GoTo EH
    If AdaSheetGA(SH_TGA) Then
        Set w = Sh(SH_TGA)
    Else
        Set src = Sh(SH_EVENT)
        src.Copy After:=Sh(SH_INV)
        Set w = ActiveSheet
        w.Name = SH_TGA
        HapusTombol w
        On Error Resume Next
        w.Cells.Hyperlinks.Delete
        w.Cells.Validation.Delete
        w.Cells.FormatConditions.Delete
        lr = w.Cells.SpecialCells(xlCellTypeLastCell).Row
        If lr >= FIRST_ROW Then w.Rows(FIRST_ROW & ":" & lr).Delete
        w.Range(w.Cells(HDR_ROW, 5), w.Cells(HDR_ROW + 200, 20)).Clear
        w.Range(w.Cells(1, 5), w.Cells(3, 20)).ClearContents
        On Error GoTo EH
    End If
    w.Range("A1").Value = "AKTIVITAS TGA (TEKNISI GA)"
    w.Range("A2").Value = "Satu baris per aktivitas / permintaan perbaikan (mesin, facility, dll). Nama TGA dipilih dari DB_MANPOWER (Tim = TGA)."
    w.Range("A4:D4").Value = Array("Tanggal", "Nama TGA", "Activity", "Request By")
    w.Columns("A").ColumnWidth = 14
    w.Columns("B").ColumnWidth = 24
    w.Columns("C").ColumnWidth = 70
    w.Columns("D").ColumnWidth = 30
    w.Range("A5:A2000").NumberFormat = "dd/mm/yyyy"
    w.Range("C5:C2000").WrapText = True
    On Error Resume Next
    With w.Range("A5:A2000").Validation
        .Delete
        .Add Type:=xlValidateDate, AlertStyle:=xlValidAlertStop, Operator:=xlGreater, Formula1:=CStr(CLng(DateSerial(2020, 1, 1)))
        .ErrorMessage = "Isi tanggal dengan format dd/mm/yyyy"
    End With
    On Error GoTo EH
    IsiDaftarNamaTGA
    HapusTombol w
    w.Columns("E").ColumnWidth = 22
    Tombol w, "E2:E3", "Kembali ke MENU", "KeMenu", False
    w.Activate
    ActiveWindow.DisplayGridlines = False
    w.Range("A5").Select
    Exit Sub
EH:
    TampilError Err.Description, "Siapkan Sheet TGA"
End Sub

' Daftar pilihan Nama TGA (DB_MANPOWER Tim = TGA, status bukan Nonaktif) -> DB_LIST kolom P, nama lstNamaTGA
Private Sub IsiDaftarNamaTGA()
    Dim mp As Worksheet, dl As Worksheet, lr As Long, arr As Variant, i As Long, n As Long, w As Worksheet
    On Error Resume Next
    Set mp = Sh(SH_MP)
    Set dl = Sh("DB_LIST")
    If mp Is Nothing Or dl Is Nothing Then Exit Sub
    dl.Range("P1:P500").ClearContents
    dl.Range("P1").Value = "Nama TGA"
    lr = LastRowAny(mp, 1, 7)
    If lr >= FIRST_ROW Then
        arr = Baca(mp.Range(mp.Cells(FIRST_ROW, 1), mp.Cells(lr, 7)))
        For i = 1 To UBound(arr, 1)
            If UCase$(Teks(arr(i, 3))) = "TGA" And Teks(arr(i, 2)) <> "" And LCase$(Teks(arr(i, 7))) <> "nonaktif" Then
                n = n + 1
                dl.Cells(n + 1, 16).Value = Teks(arr(i, 2))
            End If
        Next i
    End If
    If n = 0 Then
        n = 1
        dl.Cells(2, 16).Value = "(isi DB_MANPOWER tim TGA)"
    End If
    ThisWorkbook.Names.Add Name:="lstNamaTGA", RefersTo:="='DB_LIST'!$P$2:$P$" & (n + 1)
    If AdaSheetGA(SH_TGA) Then
        Set w = Sh(SH_TGA)
        With w.Range("B5:B2000").Validation
            .Delete
            .Add Type:=xlValidateList, AlertStyle:=xlValidAlertWarning, Operator:=xlBetween, Formula1:="=lstNamaTGA"
            .ErrorMessage = "Nama belum ada di DB_MANPOWER (Tim = TGA). Tetap simpan?"
        End With
    End If
End Sub

Public Sub KeDBPekerjaan()
    BukaSheet SH_JOB, "A5"
End Sub

Public Sub KeManpower()
    BukaSheet SH_MP, "B5"
End Sub

Public Sub KePanduan()
    BukaSheet "PANDUAN", "A1"
End Sub

'==================================================================
'  SETUP (jalankan sekali setelah import modul)
'==================================================================
Private Sub HapusTombol(ByVal w As Worksheet)
    Dim i As Long
    On Error Resume Next
    w.Buttons.Delete
    For i = w.Shapes.Count To 1 Step -1
        If Left$(w.Shapes(i).Name, 4) = "btn_" Then w.Shapes(i).Delete
    Next i
End Sub

Private Sub Tombol(ByVal w As Worksheet, ByVal addr As String, ByVal cap As String, ByVal mac As String, _
                   Optional ByVal utama As Boolean = True)
    Dim rg As Range, s As Shape
    Set rg = w.Range(addr)
    Set s = Kotak(w, "btn_" & mac & "_" & rg.Row & "_" & rg.Column, rg.Left + 3, rg.Top + 3, rg.Width - 6, rg.Height - 6, _
                  IIf(utama, C_BLUE(), vbWhite), 6)
    If Not utama Then
        s.Line.Visible = -1
        s.Line.ForeColor.RGB = C_BLUE()
        s.Line.Weight = 1.25
    End If
    Bayangan s
    With s.TextFrame2
        .VerticalAnchor = 3
        .WordWrap = -1
        .TextRange.Text = cap
        .TextRange.Font.Name = FONT_UI
        .TextRange.Font.Size = 9.5
        .TextRange.Font.Bold = -1
        .TextRange.Font.Fill.ForeColor.RGB = IIf(utama, vbWhite, C_BLUE_DK())
        .TextRange.ParagraphFormat.Alignment = 2
    End With
    s.OnAction = mac
End Sub

Public Sub Setup_Tombol()
    Dim w As Worksheet
    On Error GoTo EH

    BangunFormInput

    Set w = Sh(SH_EVENT)
    HapusTombol w
    Tombol w, "E2:E3", "Lampirkan Foto/Dokumen", "LampirkanDokumentasi"
    Tombol w, "F2:F3", "Kembali ke MENU", "KeMenu", False

    Set w = Sh(SH_IMP)
    HapusTombol w
    Tombol w, "G2:G3", "Lampirkan Foto/Dokumen", "LampirkanDokumentasi"
    Tombol w, "H2:H3", "Kembali ke MENU", "KeMenu", False

    Set w = Sh(SH_INV)
    HapusTombol w
    Tombol w, "F2:F3", "Lampirkan Foto", "LampirkanDokumentasi"
    Tombol w, "G2:H3", "Kembali ke MENU", "KeMenu", False

    SiapkanSheetTGA

    Set w = Sh(SH_JOB)
    HapusTombol w
    Tombol w, "K2:K3", "Isi ID Otomatis", "IsiIDOtomatis"
    Tombol w, "M2:M3", "Kembali ke MENU", "KeMenu", False

    Set w = Sh(SH_MP)
    HapusTombol w
    Tombol w, "F2:G3", "Kembali ke MENU", "KeMenu", False

    Set w = Sh("PANDUAN")
    HapusTombol w
    Tombol w, "D2:D3", "Kembali ke MENU", "KeMenu", False

    BuatDashboard
    MsgBox "Dashboard & tombol sudah dipasang. Sistem siap dipakai.", vbInformation, "Setup"
    Exit Sub
EH:
    TampilError Err.Description, "Setup"
End Sub
