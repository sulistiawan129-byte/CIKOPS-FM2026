Attribute VB_Name = "modLokerLabel"
Option Explicit

' ============================================================
' modLokerLabel  -  Cetak label loker ke PDF (24 label / A4)
'
' Isi tiap label (diambil dari sheet Master):
'   - strip atas  : BLOK xx  /  SLOT xx
'   - angka besar : NOMOR LOKER         = kolom NO.URUT PINTU
'   - baris bawah : NO. KUNCI : xx
'
' Layout A4: 3 kolom x 8 baris = 24 label, dengan jarak potong
' 4 mm antar label (kanan-kiri dan atas-bawah) dan garis tepi
' tipis sebagai panduan gunting. Dicetak pada skala ZOOM_CETAK %
' dan diletakkan di tengah kertas, supaya 3 kolom selalu muat di
' 1 halaman di printer mana pun. Ukuran bisa diubah lewat
' konstanta di bawah.
'
' CARA PAKAI:
'   1. Import modul ini (Alt+F11 -> File -> Import File).
'   2. Tambahkan fungsi LK_BarisHasil ke modLokerSearch (lihat
'      vba/loker/README.md), lalu Debug -> Compile.
'   3. Jalankan LK_CetakLabel (Alt+F8, atau tombol LABEL di dashboard),
'      pilih YES = label kecil per loker, NO = label induk blok.
'   4. Pilih: hasil pencarian saat ini, atau pilih BLOK
'      (satu / beberapa blok dipisah koma, atau SEMUA),
'      pilih posisi awal label, lalu simpan PDF.
'   LK_CetakLabelBlok = label kecil, langsung ke pilihan blok.
'   LK_CetakLabelIndukBlok = label induk BLOK besar, 4 per A4.
'   Label diurutkan per blok (sesuai urutan yang diketik),
'   lalu Slot > Pintu > No. kunci.
'
' Sheet LK_Label (tersembunyi) menyimpan layout terakhir; boleh
' ditampilkan (Unhide) dan dicetak langsung ke printer.
' ============================================================

Private Const LBL_SHEET As String = "LK_Label"

Private Const N_KOL As Long = 3            ' label per baris
Private Const N_BRS As Long = 8            ' baris label per halaman
Private Const PER_HAL As Long = 24         ' = N_KOL * N_BRS
Private Const R_PER As Long = 4            ' baris sel per label
Private Const R_BLK As Long = 5            ' = R_PER + 1 baris jarak potong

Private Const LBL_W As Double = 62         ' lebar label (mm, sebelum skala)
Private Const LBL_H As Double = 32         ' tinggi label (mm, sebelum skala)
Private Const GAP_X As Double = 4          ' jarak potong antar kolom (mm)
Private Const GAP_Y As Double = 4          ' jarak potong antar baris (mm)
Private Const MRG As Double = 5            ' margin kertas (mm)
Private Const ZOOM_CETAK As Long = 90      ' skala cetak (%) - cadangan supaya pasti muat
Private Const GARIS_POTONG As Boolean = True   ' garis tipis di tepi label

Private Const UI_FONT As String = "Segoe UI"


' tinggi 4 baris di dalam label (mm), jumlahnya harus = LBL_H
Private Function TinggiBaris() As Variant
    TinggiBaris = Array(7, 4, 13.5, 7.5)
End Function

Private Function Mm(v As Double) As Double
    Mm = v * 72# / 25.4
End Function


' ============================================================
' MACRO UTAMA
' ============================================================
' Tombol LABEL: pilih jenis label
Public Sub LK_CetakLabel()
    Select Case MsgBox("Jenis label yang mau dicetak:" & vbCrLf & vbCrLf & _
                       "YA / YES" & vbTab & "= label kecil per loker (24 per A4)" & vbCrLf & _
                       "TIDAK / NO" & vbTab & "= label induk BLOK (4 per A4)" & vbCrLf & _
                       "BATAL / CANCEL" & vbTab & "= batal", _
                       vbQuestion + vbYesNoCancel, "Cetak Label")
        Case vbYes: LK_CetakLabelLoker
        Case vbNo: LK_CetakLabelIndukBlok
    End Select
End Sub

' Label kecil per loker (24 per A4)
Public Sub LK_CetakLabelLoker()
    Dim hasil As Variant, nHasil As Long, jawab As VbMsgBoxResult

    hasil = LK_BarisHasil()
    If IsArray(hasil) Then nHasil = UBound(hasil) - LBound(hasil) + 1

    If nHasil > 0 Then
        jawab = MsgBox("Buat label loker untuk:" & vbCrLf & vbCrLf & _
                       "YA / YES" & vbTab & "= hasil pencarian saat ini (" & nHasil & " loker)" & vbCrLf & _
                       "TIDAK / NO" & vbTab & "= pilih BLOK (bisa beberapa blok / semua)" & vbCrLf & _
                       "BATAL / CANCEL" & vbTab & "= batal", _
                       vbQuestion + vbYesNoCancel, "Cetak Label Loker")
        If jawab = vbCancel Then Exit Sub
        If jawab = vbYes Then
            LanjutCetak hasil
            Exit Sub
        End If
    End If
    LK_CetakLabelBlok
End Sub

' Cetak label per BLOK: pilih satu / beberapa blok, urut Blok > Slot > Pintu
Public Sub LK_CetakLabelBlok()
    Dim baris As Variant, batal As Boolean
    baris = PilihBlok(batal)
    If batal Then Exit Sub
    LanjutCetak baris
End Sub

Private Sub LanjutCetak(baris As Variant)
    Dim n As Long, v As Variant, posAwal As Long, fname As Variant, dflt As String

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

' Pilih blok yang mau dicetak. Hasil: nomor baris Master,
' urut sesuai urutan blok yang diketik, lalu Slot > Pintu > Kunci.
' kembalikanBlok = True -> hasilnya daftar kode blok (bukan nomor baris)
Private Function PilihBlok(batal As Boolean, Optional kembalikanBlok As Boolean = False) As Variant
    Dim wm As Worksheet, cB As Long, cS As Long, cP As Long, cK As Long, cN As Long
    Dim r As Long, lastRow As Long, i As Long, j As Long, n As Long, b As String
    Dim dic As Object, pakai As Object, kunci As Variant, col As Collection
    Dim daftar As String, s As String, tok As Variant, salah As String
    Dim pilih() As String, nPilih As Long, a() As Long, nA As Long
    Dim rr() As Long, ky() As String, tmpR As Long, tmpK As String

    batal = True
    Set wm = AmbilSheet(MASTER_SHEET)
    If wm Is Nothing Then
        MsgBox "Sheet """ & MASTER_SHEET & """ tidak ditemukan.", vbExclamation, "Cetak Label Loker"
        Exit Function
    End If
    If Not KolomMaster(wm, cB, cS, cP, cK, cN) Then
        MsgBox "Judul kolom di sheet Master tidak lengkap (minimal BLOK dan NO.KUNCI).", vbExclamation, "Cetak Label Loker"
        Exit Function
    End If
    lastRow = wm.UsedRange.Row + wm.UsedRange.Rows.Count - 1

    ' kelompokkan baris per blok
    Set dic = CreateObject("Scripting.Dictionary")
    dic.CompareMode = 1
    For r = 2 To lastRow
        If Nilai(wm, r, cB) <> "" Or Nilai(wm, r, cN) <> "" Or Nilai(wm, r, cK) <> "" Then
            b = UCase$(Nilai(wm, r, cB))
            If b = "" Then b = "-"
            If Not dic.Exists(b) Then dic.Add b, New Collection
            dic(b).Add r
        End If
    Next r
    If dic.Count = 0 Then
        MsgBox "Tidak ada data loker di sheet Master.", vbInformation, "Cetak Label Loker"
        Exit Function
    End If

    ' daftar blok (urut) untuk ditampilkan
    kunci = dic.Keys
    For i = 1 To UBound(kunci)
        tmpK = kunci(i)
        j = i - 1
        Do While j >= 0
            If Banding(CStr(kunci(j)), tmpK) <= 0 Then Exit Do
            kunci(j + 1) = kunci(j)
            j = j - 1
        Loop
        kunci(j + 1) = tmpK
    Next i
    For i = 0 To UBound(kunci)
        If Len(daftar) > 650 Then
            daftar = daftar & ", ..."
            Exit For
        End If
        If i > 0 Then daftar = daftar & IIf(i Mod 6 = 0, "," & vbCrLf, ",  ")
        daftar = daftar & kunci(i) & " (" & dic(kunci(i)).Count & ")"
    Next i

    s = VBA.InputBox("Blok yang tersedia (jumlah loker):" & vbCrLf & daftar & vbCrLf & vbCrLf & _
                     "Ketik blok yang mau dicetak, pisahkan dengan koma." & vbCrLf & _
                     "Contoh:  BS, BT, C" & vbCrLf & _
                     "Ketik SEMUA untuk semua blok.", "Cetak Label per Blok", "SEMUA")
    If StrPtr(s) = 0 Then Exit Function          ' tombol Cancel
    s = UCase$(Trim$(Replace(s, ";", ",")))

    ReDim pilih(0 To dic.Count - 1)
    If s = "" Or s = "SEMUA" Or s = "*" Then
        For i = 0 To UBound(kunci)
            pilih(i) = kunci(i)
        Next i
        nPilih = dic.Count
    Else
        Set pakai = CreateObject("Scripting.Dictionary")
        pakai.CompareMode = 1
        For Each tok In Split(s, ",")
            tok = Trim$(CStr(tok))
            If tok <> "" Then
                If dic.Exists(tok) Then
                    If Not pakai.Exists(tok) Then
                        pakai.Add tok, 1
                        pilih(nPilih) = tok
                        nPilih = nPilih + 1
                    End If
                Else
                    If salah <> "" Then salah = salah & ", "
                    salah = salah & tok
                End If
            End If
        Next tok
        If nPilih = 0 Then
            MsgBox "Blok tidak ditemukan: " & salah, vbExclamation, "Cetak Label per Blok"
            Exit Function
        End If
        If salah <> "" Then
            If MsgBox("Blok ini tidak ada di Master dan dilewati: " & salah & vbCrLf & vbCrLf & _
                      "Lanjut cetak blok lainnya?", vbQuestion + vbOKCancel, "Cetak Label per Blok") <> vbOK Then Exit Function
        End If
    End If

    If kembalikanBlok Then
        ReDim Preserve pilih(0 To nPilih - 1)
        batal = False
        PilihBlok = pilih
        Exit Function
    End If

    ' gabungkan baris tiap blok, urut Slot > Pintu > Kunci
    For i = 0 To nPilih - 1
        n = n + dic(pilih(i)).Count
    Next i
    ReDim a(1 To n)
    For i = 0 To nPilih - 1
        Set col = dic(pilih(i))
        ReDim rr(1 To col.Count)
        ReDim ky(1 To col.Count)
        For j = 1 To col.Count
            rr(j) = col(j)
            ky(j) = KunciUrut(wm, rr(j), cS, cP, cK)
        Next j
        For j = 2 To col.Count
            tmpR = rr(j): tmpK = ky(j)
            r = j - 1
            Do While r >= 1
                If StrComp(ky(r), tmpK, vbBinaryCompare) <= 0 Then Exit Do
                rr(r + 1) = rr(r): ky(r + 1) = ky(r)
                r = r - 1
            Loop
            rr(r + 1) = tmpR: ky(r + 1) = tmpK
        Next j
        For j = 1 To col.Count
            nA = nA + 1
            a(nA) = rr(j)
        Next j
    Next i
    batal = False
    PilihBlok = a
End Function

' kunci urut gabungan Slot|Pintu|Kunci; angka di-pad supaya 2 < 10
Private Function KunciUrut(wm As Worksheet, r As Long, cS As Long, cP As Long, cK As Long) As String
    KunciUrut = Pad(Nilai(wm, r, cS)) & "|" & Pad(Nilai(wm, r, cP)) & "|" & Pad(Nilai(wm, r, cK))
End Function

Private Function Pad(t As String) As String
    If t = "" Then
        Pad = "~"                                ' kosong di urutan akhir
    ElseIf IsNumeric(t) Then
        Pad = "0" & Format$(CDbl(t), "000000000000.000")
    Else
        Pad = "1" & UCase$(t)
    End If
End Function

Private Function Banding(x As String, y As String) As Long
    Banding = StrComp(Pad(x), Pad(y), vbBinaryCompare)
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
        r = (pos \ PER_HAL) * (N_BRS * R_BLK) + ((pos Mod PER_HAL) \ N_KOL) * R_BLK + 1
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
           "Cetak PDF dengan ukuran ""Actual size / 100%""," & vbCrLf & _
           "lalu gunting di jarak antar label (ikuti garis tepi).", vbInformation, "Cetak Label Loker"
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

' tinggi baris per halaman (4 baris label + 1 baris jarak potong),
' dikompensasi kumulatif supaya pembulatan tidak menumpuk
Private Sub AturBaris(ws As Worksheet, pages As Long)
    Dim tb As Variant, acc(0 To R_PER) As Double, i As Long, p As Long, lr As Long
    Dim baseRow As Long, top0 As Double, akhir As Double, h As Double, sb As Long
    tb = TinggiBaris()
    For i = 1 To R_PER
        acc(i) = acc(i - 1) + tb(i - 1)
    Next i
    For p = 0 To pages - 1
        baseRow = p * N_BRS * R_BLK
        top0 = ws.Rows(baseRow + 1).Top
        For lr = 0 To N_BRS * R_BLK - 1
            sb = lr Mod R_BLK
            akhir = (lr \ R_BLK) * (LBL_H + GAP_Y)
            If sb < R_PER Then
                akhir = akhir + acc(sb + 1)
            Else
                akhir = akhir + LBL_H + GAP_Y
            End If
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
        .Value = "NOMOR LOKER"
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
    tinggi = pages * N_BRS * R_BLK
    SetPrintComm False
    With ws.PageSetup
        .PaperSize = xlPaperA4
        .Orientation = xlPortrait
        .Zoom = ZOOM_CETAK
        .LeftMargin = Mm(MRG)
        .TopMargin = Mm(MRG)
        .RightMargin = Mm(MRG)
        .BottomMargin = Mm(MRG)
        .HeaderMargin = 0
        .FooterMargin = 0
        .CenterHeader = ""
        .CenterFooter = ""
        .CenterHorizontally = True
        .CenterVertically = True
        .PrintGridlines = False
        .PrintHeadings = False
        .BlackAndWhite = False
        .PrintArea = ws.Range(ws.Cells(1, 1), ws.Cells(tinggi, 2 * N_KOL - 1)).Address
    End With
    SetPrintComm True
    For p = 1 To pages - 1
        ws.HPageBreaks.Add Before:=ws.Rows(p * N_BRS * R_BLK + 1)
    Next p
End Sub

' PrintCommunication mempercepat PageSetup (Excel 2010+); diabaikan jika tidak ada
Private Sub SetPrintComm(nyala As Boolean)
    On Error Resume Next
    Application.PrintCommunication = nyala
    On Error GoTo 0
End Sub


' ============================================================
' LABEL INDUK BLOK  (A4 dibagi 4, desain "Opsi B")
'
'   LOKER KARYAWAN              PLANT CIKARANG
'                    B L O K
'                     AA          <- kode blok, huruf sangat besar
'   ------------------------------------------
'      24 loker  *  Slot 101-112  *  Hook 1-24
'   - - - - - - - - - - - - - - - - - - - - - -
'   Jika kunci loker hilang atau rusak, silakan hubungi
'           Facility Management Department.
'       FM DEPT.  -  PT FRISIAN FLAG INDONESIA
'
' Tiap halaman dibuat di sheet sementara (1 sheet = 1 halaman,
' "fit to 1 page") supaya selalu pas 1 lembar A4 di printer mana pun.
' ============================================================

Private Const LB_JUDUL As String = "LOKER KARYAWAN"
Private Const LB_SUBJUDUL As String = "PLANT CIKARANG"     ' isi "" untuk menghilangkan
Private Const LB_TULIS_BLOK As Boolean = True               ' tulisan kecil "BLOK" di atas kode
Private Const LB_RINGKASAN As Boolean = True                ' baris "24 loker - Slot - Hook"
Private Const LB_FONT_BESAR As String = "Segoe UI Black"
Private Const LB_PFX As String = "LK_LB_"                   ' nama sheet sementara

Private Const LB_MRG As Double = 5        ' margin kertas (mm)
Private Const LB_GAP As Double = 3        ' jarak dari garis potong ke bingkai (mm)

Public Sub LK_CetakLabelIndukBlok()
    Dim wm As Worksheet, cB As Long, cS As Long, cP As Long, cK As Long, cN As Long
    Dim blok As Variant, batal As Boolean, n As Long, pages As Long, fname As Variant, dflt As String
    Dim p As Long, i As Long, k As Long, ws As Worksheet, nama() As Variant, aktif As Worksheet

    Set wm = AmbilSheet(MASTER_SHEET)
    If wm Is Nothing Then
        MsgBox "Sheet """ & MASTER_SHEET & """ tidak ditemukan.", vbExclamation, "Label Induk Blok"
        Exit Sub
    End If
    If Not KolomMaster(wm, cB, cS, cP, cK, cN) Then
        MsgBox "Judul kolom di sheet Master tidak lengkap (minimal BLOK dan NO.KUNCI).", vbExclamation, "Label Induk Blok"
        Exit Sub
    End If

    blok = PilihBlok(batal, True)
    If batal Then Exit Sub
    n = UBound(blok) - LBound(blok) + 1
    pages = (n + 3) \ 4

    If ThisWorkbook.Path <> "" Then dflt = ThisWorkbook.Path & Application.PathSeparator
    dflt = dflt & "Label Blok " & Format$(Now, "yyyy-mm-dd hhnn") & ".pdf"
    fname = Application.GetSaveAsFilename(InitialFileName:=dflt, _
                                          FileFilter:="PDF (*.pdf), *.pdf", _
                                          Title:="Simpan label induk blok (PDF)")
    If VarType(fname) = vbBoolean Then Exit Sub

    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    On Error GoTo Gagal
    HapusSheetLB
    Set aktif = ActiveSheet

    ReDim nama(1 To pages)
    For p = 1 To pages
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = LB_PFX & p
        nama(p) = ws.Name
        SiapkanHalamanLB ws
        For i = 0 To 3
            k = (p - 1) * 4 + i
            If k < n Then
                GambarLabelBlok ws, i, CStr(blok(LBound(blok) + k)), _
                                RingkasanBlok(wm, CStr(blok(LBound(blok) + k)), cB, cS, cP, cK, cN)
            End If
        Next i
    Next p

    ThisWorkbook.Worksheets(nama).Select
    ThisWorkbook.Worksheets(nama(1)).Activate
    ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=CStr(fname), Quality:=xlQualityStandard, _
                                    IncludeDocProperties:=False, IgnorePrintAreas:=False, OpenAfterPublish:=True
    ThisWorkbook.Worksheets(nama(1)).Select
    HapusSheetLB
    aktif.Activate
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    LK_FokusCari
    MsgBox n & " label blok (" & pages & " halaman A4) disimpan ke:" & vbCrLf & CStr(fname) & vbCrLf & vbCrLf & _
           "Cetak dengan ukuran ""Actual size / 100%"", lalu gunting di garis putus-putus.", _
           vbInformation, "Label Induk Blok"
    Exit Sub

Gagal:
    SetPrintComm True
    Dim pesan As String
    pesan = Err.Description
    On Error Resume Next
    HapusSheetLB
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    MsgBox "Gagal membuat label blok: " & pesan, vbCritical, "Label Induk Blok"
End Sub

Private Sub HapusSheetLB()
    Dim i As Long, ev As Boolean
    ev = Application.DisplayAlerts
    Application.DisplayAlerts = False
    For i = ThisWorkbook.Worksheets.Count To 1 Step -1
        If Left$(ThisWorkbook.Worksheets(i).Name, Len(LB_PFX)) = LB_PFX Then ThisWorkbook.Worksheets(i).Delete
    Next i
    Application.DisplayAlerts = ev
End Sub

' 1 sheet = 1 halaman A4: kolom A/B = kiri/kanan, baris 1/2 = atas/bawah
Private Sub SiapkanHalamanLB(ws As Worksheet)
    Dim qw As Double, qh As Double, s As Shape, x As Double, y As Double, w As Double, h As Double
    qw = Mm((210 - 2 * LB_MRG) / 2)
    qh = Mm((297 - 2 * LB_MRG) / 2)
    If qh > 409 Then qh = 409
    ws.Cells.Interior.Color = RGB(255, 255, 255)
    LebarPt ws, 1, qw
    LebarPt ws, 2, qw
    ws.Rows(1).RowHeight = qh
    ws.Rows(2).RowHeight = qh
    ActiveWindow.DisplayGridlines = False

    SetPrintComm False
    With ws.PageSetup
        .PaperSize = xlPaperA4
        .Orientation = xlPortrait
        .LeftMargin = Mm(LB_MRG)
        .RightMargin = Mm(LB_MRG)
        .TopMargin = Mm(LB_MRG)
        .BottomMargin = Mm(LB_MRG)
        .HeaderMargin = 0
        .FooterMargin = 0
        .CenterHorizontally = True
        .CenterVertically = True
        .PrintGridlines = False
        .PrintHeadings = False
        .BlackAndWhite = False
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = 1
        .PrintArea = "$A$1:$B$2"
    End With
    SetPrintComm True

    ' garis potong (putus-putus abu-abu)
    x = ws.Columns(2).Left: y = ws.Rows(2).Top
    w = ws.Columns(3).Left: h = ws.Rows(3).Top
    Set s = ws.Shapes.AddLine(x, 0, x, h)
    GarisLB s, RGB(183, 193, 209), 0.75, True
    Set s = ws.Shapes.AddLine(0, y, w, y)
    GarisLB s, RGB(183, 193, 209), 0.75, True
End Sub

Private Sub GarisLB(s As Shape, warna As Long, tebal As Single, putus As Boolean)
    With s.Line
        .Visible = msoTrue
        .ForeColor.RGB = warna
        .Weight = tebal
        If putus Then .DashStyle = msoLineDash
    End With
    s.Placement = xlFreeFloating
End Sub

Private Function TeksLB(ws As Worksheet, x As Double, y As Double, w As Double, h As Double, isi As String, _
                       sz As Single, tebal As Boolean, warna As Long, rata As Long, _
                       Optional fontName As String = "Segoe UI", Optional spasi As Single = 0) As Shape
    Dim s As Shape
    Set s = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, x, y, w, h)
    s.Fill.Visible = msoFalse
    s.Line.Visible = msoFalse
    s.Placement = xlFreeFloating
    With s.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .WordWrap = msoTrue
        .AutoSize = msoAutoSizeNone
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = isi
        .TextRange.ParagraphFormat.Alignment = rata
        With .TextRange.Font
            .Name = fontName
            .Size = sz
            .Bold = IIf(tebal, msoTrue, msoFalse)
            .Fill.ForeColor.RGB = warna
            If spasi <> 0 Then .Spacing = spasi
        End With
    End With
    Set TeksLB = s
End Function

' posisi: 0 = kiri atas, 1 = kanan atas, 2 = kiri bawah, 3 = kanan bawah
Private Sub GambarLabelBlok(ws As Worksheet, posisi As Long, kode As String, ringkas As String)
    Const NAVY As Long = 7024394       ' RGB(10, 47, 107)
    Const MERAH As Long = 2759127      ' RGB(215, 25, 42)
    Const ABU As Long = 8743771        ' RGB(91, 107, 133)
    Const GELAP As Long = 4137747      ' RGB(19, 35, 63)
    Dim x0 As Double, y0 As Double, w As Double, h As Double, g As Double, pad As Double
    Dim s As Shape, fs As Single, lebar As Double, yy As Double, tinggiTengah As Double
    Dim hBlok As Double, hKode As Double, hRing As Double, yTengah0 As Double, yTengah1 As Double
    Dim t As String, a As Long, bw As Double

    g = Mm(LB_GAP)
    x0 = ws.Columns(1 + (posisi Mod 2)).Left + g
    y0 = ws.Rows(1 + (posisi \ 2)).Top + g
    w = ws.Columns(1 + (posisi Mod 2)).Width - 2 * g
    h = ws.Rows(1 + (posisi \ 2)).Height - 2 * g
    pad = 16
    lebar = w - 2 * pad

    ' bingkai navy tebal
    Set s = ws.Shapes.AddShape(msoShapeRoundedRectangle, x0, y0, w, h)
    s.Adjustments(1) = 0.035
    s.Fill.Visible = msoFalse
    s.Shadow.Visible = msoFalse
    s.Placement = xlFreeFloating
    With s.Line
        .Visible = msoTrue
        .ForeColor.RGB = NAVY
        .Weight = 4.5
    End With

    ' judul atas
    TeksLB ws, x0 + pad, y0 + 14, lebar, 14, LB_JUDUL, 9, True, NAVY, msoAlignLeft, , 1.2
    If LB_SUBJUDUL <> "" Then TeksLB ws, x0 + pad, y0 + 14, lebar, 14, LB_SUBJUDUL, 9, True, MERAH, msoAlignRight, , 1.2

    ' footer (dari bawah ke atas)
    TeksLB ws, x0 + pad, y0 + h - 24, lebar, 12, "FM DEPT.  " & ChrW(183) & "  PT FRISIAN FLAG INDONESIA", 7.5, True, NAVY, msoAlignCenter, , 1.2
    t = "Jika kunci loker hilang atau rusak, silakan hubungi" & vbCr & "Facility Management Department."
    Set s = TeksLB(ws, x0 + 8, y0 + h - 54, w - 16, 26, t, 8, False, GELAP, msoAlignCenter)
    With s.TextFrame2.TextRange
        a = InStr(1, t, "kunci loker hilang atau rusak")
        .Characters(a, Len("kunci loker hilang atau rusak")).Font.Bold = msoTrue
        a = InStr(1, t, "Facility Management Department")
        .Characters(a, Len("Facility Management Department")).Font.Bold = msoTrue
    End With
    Set s = ws.Shapes.AddLine(x0 + 2.25, y0 + h - 62, x0 + w - 2.25, y0 + h - 62)
    GarisLB s, NAVY, 1, True

    ' bagian tengah: BLOK / kode besar / garis / ringkasan
    yTengah0 = y0 + 36
    yTengah1 = y0 + h - 70
    tinggiTengah = yTengah1 - yTengah0

    fs = 150
    Set s = TeksLB(ws, x0 + pad, yTengah0, lebar, 10, kode, fs, False, NAVY, msoAlignCenter, LB_FONT_BESAR)
    s.TextFrame2.WordWrap = msoFalse
    On Error Resume Next
    Do
        bw = 0
        bw = s.TextFrame2.TextRange.BoundWidth
        If bw <= 0 Or bw <= lebar Or fs <= 14 Then Exit Do
        fs = fs - 4
        s.TextFrame2.TextRange.Font.Size = fs
    Loop
    If bw <= 0 Then                       ' BoundWidth tidak tersedia: perkiraan
        fs = lebar / (Len(kode) * 0.78)
        If fs > 150 Then fs = 150
        s.TextFrame2.TextRange.Font.Size = fs
    End If
    hKode = 0
    hKode = s.TextFrame2.TextRange.BoundHeight
    On Error GoTo 0
    If hKode <= 0 Then hKode = fs * 1.3
    If hKode > tinggiTengah - 70 Then hKode = tinggiTengah - 70
    s.Height = hKode

    hBlok = IIf(LB_TULIS_BLOK, 16, 0)
    hRing = IIf(LB_RINGKASAN, 34, 0)
    yy = yTengah0 + (tinggiTengah - (hBlok + hKode + hRing)) / 2
    If LB_TULIS_BLOK Then TeksLB ws, x0 + pad, yy, lebar, 14, "BLOK", 10, True, ABU, msoAlignCenter, , 4
    s.Top = yy + hBlok
    yy = yy + hBlok + hKode

    If LB_RINGKASAN Then
        Set s = ws.Shapes.AddLine(x0 + pad, yy + 8, x0 + w - pad, yy + 8)
        GarisLB s, NAVY, 1.25, False
        Set s = TeksLB(ws, x0 + pad, yy + 16, lebar, 16, ringkas, 9.5, True, GELAP, msoAlignCenter)
        a = InStr(1, ringkas, ChrW(8226))
        Do While a > 0
            s.TextFrame2.TextRange.Characters(a, 1).Font.Fill.ForeColor.RGB = MERAH
            a = InStr(a + 1, ringkas, ChrW(8226))
        Loop
    End If
End Sub

' "24 loker  *  Slot 101-112  *  Hook 1-24"
Private Function RingkasanBlok(wm As Worksheet, kode As String, cB As Long, cS As Long, cP As Long, cK As Long, cN As Long) As String
    Dim r As Long, lastRow As Long, b As String, n As Long, t As String, sep As String
    Dim sMin As Double, sMax As Double, pMin As Double, pMax As Double, adaS As Boolean, adaP As Boolean, v As String
    lastRow = wm.UsedRange.Row + wm.UsedRange.Rows.Count - 1
    For r = 2 To lastRow
        If Nilai(wm, r, cB) <> "" Or Nilai(wm, r, cN) <> "" Or Nilai(wm, r, cK) <> "" Then
            b = UCase$(Nilai(wm, r, cB))
            If b = "" Then b = "-"
            If StrComp(b, kode, vbTextCompare) = 0 Then
                n = n + 1
                v = Nilai(wm, r, cS)
                If IsNumeric(v) And v <> "" Then
                    If Not adaS Then sMin = CDbl(v): sMax = CDbl(v): adaS = True
                    If CDbl(v) < sMin Then sMin = CDbl(v)
                    If CDbl(v) > sMax Then sMax = CDbl(v)
                End If
                v = Nilai(wm, r, cP)
                If IsNumeric(v) And v <> "" Then
                    If Not adaP Then pMin = CDbl(v): pMax = CDbl(v): adaP = True
                    If CDbl(v) < pMin Then pMin = CDbl(v)
                    If CDbl(v) > pMax Then pMax = CDbl(v)
                End If
            End If
        End If
    Next r
    sep = "  " & ChrW(8226) & "  "
    t = n & " loker"
    If adaS Then t = t & sep & "Slot " & Rentang(sMin, sMax)
    If adaP Then t = t & sep & "Hook " & Rentang(pMin, pMax)
    RingkasanBlok = t
End Function

Private Function Rentang(a As Double, b As Double) As String
    If a = b Then
        Rentang = CStr(a)
    Else
        Rentang = CStr(a) & ChrW(8211) & CStr(b)
    End If
End Function
