Attribute VB_Name = "modLokerLabel"
Option Explicit

' ============================================================
' modLokerLabel  -  Cetak label loker ke PDF (24 label / A4)
'
' Isi tiap label (diambil dari sheet Master):
'   - strip atas  : BLOK xx  /  SLOT xx
'   - angka besar : NOMOR LOKER (HOOK)  = kolom NO.URUT PINTU
'   - baris bawah : NO. KUNCI : xx
'
' Ukuran mengikuti kertas stiker 3 x 8 (mis. Avery L7159 / sejenis):
'   label 63,5 x 33,9 mm, jarak antar kolom 2,5 mm,
'   margin kiri 6,4 mm, margin atas 13,1 mm.
'   Kalau kertas stiker Anda berbeda, ubah konstanta di bawah.
'
' CARA PAKAI:
'   1. Import modul ini (Alt+F11 -> File -> Import File).
'   2. Tambahkan fungsi LK_BarisHasil ke modLokerSearch (lihat
'      vba/loker/README.md), lalu Debug -> Compile.
'   3. Jalankan LK_CetakLabel (Alt+F8, atau tombol LABEL di dashboard).
'   4. Pilih: hasil pencarian saat ini / semua data Master,
'      pilih posisi awal label, lalu simpan PDF.
'
' Sheet LK_Label (tersembunyi) menyimpan layout terakhir; boleh
' ditampilkan (Unhide) dan dicetak langsung ke printer.
' ============================================================

Private Const LBL_SHEET As String = "LK_Label"

Private Const N_KOL As Long = 3            ' label per baris
Private Const N_BRS As Long = 8            ' baris label per halaman
Private Const PER_HAL As Long = 24         ' = N_KOL * N_BRS
Private Const R_PER As Long = 4            ' baris sel per label

Private Const LBL_W As Double = 63.5       ' lebar label (mm)
Private Const LBL_H As Double = 33.9       ' tinggi label (mm)
Private Const GAP_X As Double = 2.5        ' jarak antar kolom label (mm)
Private Const MRG_L As Double = 6.4        ' margin kiri kertas (mm)
Private Const MRG_T As Double = 13.1       ' margin atas kertas (mm)
Private Const GARIS_POTONG As Boolean = True   ' garis tipis di tepi label

Private Const UI_FONT As String = "Segoe UI"


' tinggi 4 baris di dalam label (mm), jumlahnya harus = LBL_H
Private Function TinggiBaris() As Variant
    TinggiBaris = Array(7.5, 4.5, 14, 7.9)
End Function

Private Function Mm(v As Double) As Double
    Mm = v * 72# / 25.4
End Function


' ============================================================
' MACRO UTAMA
' ============================================================
Public Sub LK_CetakLabel()
    Dim hasil As Variant, baris As Variant, nHasil As Long, n As Long
    Dim jawab As VbMsgBoxResult, v As Variant, posAwal As Long, fname As Variant, dflt As String

    hasil = LK_BarisHasil()
    If IsArray(hasil) Then nHasil = UBound(hasil) - LBound(hasil) + 1

    If nHasil > 0 Then
        jawab = MsgBox("Buat label loker untuk:" & vbCrLf & vbCrLf & _
                       "YA / YES" & vbTab & "= hasil pencarian saat ini (" & nHasil & " loker)" & vbCrLf & _
                       "TIDAK / NO" & vbTab & "= semua loker di sheet Master" & vbCrLf & _
                       "BATAL / CANCEL" & vbTab & "= batal", _
                       vbQuestion + vbYesNoCancel, "Cetak Label Loker")
        If jawab = vbCancel Then Exit Sub
    Else
        jawab = vbNo
    End If

    If jawab = vbYes Then
        baris = hasil
    Else
        baris = SemuaBaris()
    End If
    If Not IsArray(baris) Then
        MsgBox "Tidak ada data loker untuk dibuat label.", vbInformation, "Cetak Label Loker"
        Exit Sub
    End If
    n = UBound(baris) - LBound(baris) + 1

    v = Application.InputBox("Jumlah label: " & n & " (" & Halaman(n, 0) & " halaman A4)." & vbCrLf & vbCrLf & _
                             "Mulai dari posisi label ke- (1 - " & PER_HAL & ")" & vbCrLf & _
                             "Urutan: kiri ke kanan, atas ke bawah." & vbCrLf & _
                             "Isi lebih dari 1 kalau kertas stiker sudah terpakai sebagian.", _
                             "Cetak Label Loker", 1, , , , , 1)
    If VarType(v) = vbBoolean Then Exit Sub
    posAwal = CLng(v)
    If posAwal < 1 Or posAwal > PER_HAL Then posAwal = 1

    If ThisWorkbook.Path <> "" Then dflt = ThisWorkbook.Path & Application.PathSeparator
    dflt = dflt & "Label Loker " & Format$(Now, "yyyy-mm-dd hhnn") & ".pdf"
    fname = Application.GetSaveAsFilename(InitialFileName:=dflt, _
                                          FileFilter:="PDF (*.pdf), *.pdf", _
                                          Title:="Simpan label loker (PDF)")
    If VarType(fname) = vbBoolean Then Exit Sub

    BuatPdf baris, posAwal - 1, CStr(fname)
End Sub

Private Function Halaman(n As Long, offset As Long) As Long
    Halaman = (n + offset + PER_HAL - 1) \ PER_HAL
End Function


' ============================================================
' DATA MASTER
' ============================================================
Private Function LblNorm(v As Variant) As String
    Dim s As String
    If IsError(v) Or IsEmpty(v) Then Exit Function
    s = LCase$(CStr(v))
    s = Replace(s, ".", "")
    s = Replace(s, " ", "")
    s = Replace(s, "_", "")
    s = Replace(s, vbLf, "")
    s = Replace(s, vbCr, "")
    LblNorm = s
End Function

' cari nomor kolom dari judul di baris 1 (urutan kolom bebas)
Private Function KolomMaster(wm As Worksheet, cB As Long, cS As Long, cP As Long, cK As Long, cN As Long) As Boolean
    Dim c As Long, lastCol As Long
    cB = 0: cS = 0: cP = 0: cK = 0: cN = 0
    lastCol = wm.Cells(1, wm.Columns.Count).End(xlToLeft).Column
    For c = 1 To lastCol
        Select Case LblNorm(wm.Cells(1, c).Value)
            Case "blok": If cB = 0 Then cB = c
            Case "noslotkunci", "slot": If cS = 0 Then cS = c
            Case "nourutpintu", "pintu": If cP = 0 Then cP = c
            Case "nokunci", "kunci": If cK = 0 Then cK = c
            Case "namakaryawan", "nama": If cN = 0 Then cN = c
        End Select
    Next c
    KolomMaster = (cB > 0 And cK > 0)
End Function

Private Function Nilai(wm As Worksheet, r As Long, c As Long) As String
    Dim v As Variant
    If c = 0 Then Exit Function
    v = wm.Cells(r, c).Value
    If IsError(v) Or IsEmpty(v) Then Exit Function
    Nilai = Trim$(CStr(v))
End Function

' semua baris Master yang berisi data (nomor baris sheet)
Private Function SemuaBaris() As Variant
    Dim wm As Worksheet, cB As Long, cS As Long, cP As Long, cK As Long, cN As Long
    Dim r As Long, lastRow As Long, n As Long, a() As Long
    Set wm = AmbilSheet(MASTER_SHEET)
    If wm Is Nothing Then Exit Function
    If Not KolomMaster(wm, cB, cS, cP, cK, cN) Then Exit Function
    lastRow = wm.UsedRange.Row + wm.UsedRange.Rows.Count - 1
    If lastRow < 2 Then Exit Function
    ReDim a(1 To lastRow)
    For r = 2 To lastRow
        If Nilai(wm, r, cB) <> "" Or Nilai(wm, r, cN) <> "" Or Nilai(wm, r, cK) <> "" Then
            n = n + 1
            a(n) = r
        End If
    Next r
    If n = 0 Then Exit Function
    ReDim Preserve a(1 To n)
    SemuaBaris = a
End Function


' ============================================================
' BANGUN LAYOUT + EXPORT PDF
' ============================================================
Private Sub BuatPdf(baris As Variant, offset As Long, fname As String)
    Dim wm As Worksheet, ws As Worksheet, cB As Long, cS As Long, cP As Long, cK As Long, cN As Long
    Dim n As Long, pages As Long, k As Long, pos As Long, r As Long, c As Long, rw As Long
    Dim blok As String, slot As String, pintu As String, kunci As String, t As String

    Set wm = AmbilSheet(MASTER_SHEET)
    If wm Is Nothing Then
        MsgBox "Sheet """ & MASTER_SHEET & """ tidak ditemukan.", vbExclamation, "Cetak Label Loker"
        Exit Sub
    End If
    If Not KolomMaster(wm, cB, cS, cP, cK, cN) Then
        MsgBox "Judul kolom di sheet Master tidak lengkap (minimal BLOK dan NO.KUNCI).", vbExclamation, "Cetak Label Loker"
        Exit Sub
    End If

    Application.ScreenUpdating = False
    On Error GoTo Gagal

    Set ws = AmbilSheet(LBL_SHEET)
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = LBL_SHEET
    End If
    ws.Visible = xlSheetVisible
    ws.Cells.Clear
    ws.ResetAllPageBreaks
    ws.Cells.Font.Name = UI_FONT

    n = UBound(baris) - LBound(baris) + 1
    pages = Halaman(n, offset)

    AturKolom ws
    AturBaris ws, pages

    For k = 0 To n - 1
        rw = baris(LBound(baris) + k)
        pos = k + offset
        r = (pos \ PER_HAL) * (N_BRS * R_PER) + ((pos Mod PER_HAL) \ N_KOL) * R_PER + 1
        c = (pos Mod N_KOL) * 2 + 1

        blok = Nilai(wm, rw, cB)
        slot = Nilai(wm, rw, cS)
        pintu = Nilai(wm, rw, cP)
        kunci = Nilai(wm, rw, cK)

        t = "BLOK " & IIf(blok = "", "-", blok)
        If slot <> "" Then t = t & "  /  SLOT " & slot
        IsiLabel ws, r, c, t, IIf(pintu = "", "-", pintu), "NO. KUNCI : " & IIf(kunci = "", "-", kunci)
    Next k

    AturHalaman ws, pages

    ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=fname, Quality:=xlQualityStandard, _
                           IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=True
    ws.Visible = xlSheetHidden
    Application.ScreenUpdating = True
    LK_FokusCari
    MsgBox n & " label (" & pages & " halaman A4) disimpan ke:" & vbCrLf & fname & vbCrLf & vbCrLf & _
           "Saat mencetak PDF, pilih ukuran ""Actual size / 100%"" (jangan ""Fit"")" & vbCrLf & _
           "supaya pas dengan kertas stiker.", vbInformation, "Cetak Label Loker"
    Exit Sub

Gagal:
    SetPrintComm True
    Application.ScreenUpdating = True
    MsgBox "Gagal membuat label: " & Err.Description, vbCritical, "Cetak Label Loker"
End Sub

' kolom 1,3,5 = label ; kolom 2,4 = jarak. Lebar dikompensasi kumulatif
' supaya pembulatan lebar kolom Excel tidak menumpuk.
Private Sub AturKolom(ws As Worksheet)
    Dim c As Long, akhir As Double
    For c = 1 To 2 * N_KOL - 1
        If c Mod 2 = 1 Then
            akhir = ((c + 1) \ 2) * LBL_W + ((c - 1) \ 2) * GAP_X
        Else
            akhir = (c \ 2) * (LBL_W + GAP_X)
        End If
        LebarPt ws, c, Mm(akhir) - (ws.Columns(c).Left - ws.Columns(1).Left)
    Next c
End Sub

Private Sub LebarPt(ws As Worksheet, c As Long, pts As Double)
    Dim i As Long, w As Double
    If pts < 2 Then pts = 2
    w = (pts / 0.75 - 5) / 7
    If w < 0.5 Then w = 0.5
    ws.Columns(c).ColumnWidth = w
    For i = 1 To 3
        If ws.Columns(c).Width > 0 Then
            ws.Columns(c).ColumnWidth = ws.Columns(c).ColumnWidth * pts / ws.Columns(c).Width
        End If
    Next i
End Sub

' tinggi baris per halaman, juga dikompensasi kumulatif
Private Sub AturBaris(ws As Worksheet, pages As Long)
    Dim tb As Variant, acc(0 To R_PER) As Double, i As Long, p As Long, lr As Long
    Dim baseRow As Long, top0 As Double, akhir As Double, h As Double
    tb = TinggiBaris()
    For i = 1 To R_PER
        acc(i) = acc(i - 1) + tb(i - 1)
    Next i
    For p = 0 To pages - 1
        baseRow = p * N_BRS * R_PER
        top0 = ws.Rows(baseRow + 1).Top
        For lr = 0 To N_BRS * R_PER - 1
            akhir = (lr \ R_PER) * LBL_H + acc((lr Mod R_PER) + 1)
            h = Mm(akhir) - (ws.Rows(baseRow + lr + 1).Top - top0)
            If h < 1 Then h = 1
            If h > 409 Then h = 409
            ws.Rows(baseRow + lr + 1).RowHeight = h
        Next lr
    Next p
End Sub

Private Sub IsiLabel(ws As Worksheet, r As Long, c As Long, teksAtas As String, pintu As String, teksKunci As String)
    Dim rg As Range
    Set rg = ws.Range(ws.Cells(r, c), ws.Cells(r + R_PER - 1, c))
    With rg
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .ShrinkToFit = True
        .WrapText = False
        .Font.Name = UI_FONT
    End With

    ' strip atas: blok / slot
    With ws.Cells(r, c)
        .Value = teksAtas
        .Interior.Color = RGB(10, 47, 107)
        .Font.Color = RGB(255, 255, 255)
        .Font.Bold = True
        .Font.Size = 10
    End With

    ' keterangan kecil
    With ws.Cells(r + 1, c)
        .Value = "NOMOR LOKER (HOOK)"
        .Font.Size = 6.5
        .Font.Bold = True
        .Font.Color = RGB(91, 107, 133)
        .VerticalAlignment = xlBottom
    End With

    ' nomor loker besar (teks, supaya nol di depan tidak hilang)
    With ws.Cells(r + 2, c)
        .NumberFormat = "@"
        .Value = pintu
        .Font.Size = 26
        .Font.Bold = True
        .Font.Color = RGB(10, 47, 107)
    End With

    ' nomor kunci
    With ws.Cells(r + 3, c)
        .NumberFormat = "@"
        .Value = teksKunci
        .Font.Size = 11
        .Font.Bold = True
        .Font.Color = RGB(19, 35, 63)
        .Borders(xlEdgeTop).LineStyle = xlDot
        .Borders(xlEdgeTop).Color = RGB(170, 180, 198)
    End With

    If GARIS_POTONG Then rg.BorderAround LineStyle:=xlContinuous, Weight:=xlThin, Color:=RGB(170, 180, 198)
End Sub

Private Sub AturHalaman(ws As Worksheet, pages As Long)
    Dim p As Long, tinggi As Long
    tinggi = pages * N_BRS * R_PER
    SetPrintComm False
    With ws.PageSetup
        .PaperSize = xlPaperA4
        .Orientation = xlPortrait
        .Zoom = 100
        .LeftMargin = Mm(MRG_L)
        .TopMargin = Mm(MRG_T)
        .RightMargin = Mm(3)
        .BottomMargin = Mm(3)
        .HeaderMargin = 0
        .FooterMargin = 0
        .CenterHeader = ""
        .CenterFooter = ""
        .CenterHorizontally = False
        .CenterVertically = False
        .PrintGridlines = False
        .PrintHeadings = False
        .BlackAndWhite = False
        .PrintArea = ws.Range(ws.Cells(1, 1), ws.Cells(tinggi, 2 * N_KOL - 1)).Address
    End With
    SetPrintComm True
    For p = 1 To pages - 1
        ws.HPageBreaks.Add Before:=ws.Rows(p * N_BRS * R_PER + 1)
    Next p
End Sub

' PrintCommunication mempercepat PageSetup (Excel 2010+); diabaikan jika tidak ada
Private Sub SetPrintComm(nyala As Boolean)
    On Error Resume Next
    Application.PrintCommunication = nyala
    On Error GoTo 0
End Sub
