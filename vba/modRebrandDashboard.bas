Attribute VB_Name = "modRebrandDashboard"
Option Explicit

' ============================================================
' modRebrandDashboard  (versi 2 - otomatis penuh satu layar)
'
' Mengganti TAMPILAN sheet dashboard ATK tanpa mengubah kode lain:
'   - semua macro lama (form permintaan, update stok, cetak bukti,
'     report, sinkron) TETAP dipakai - tombol baru memanggil macro
'     yang sama persis dengan tombol lama (dibaca otomatis).
'   - tombol & logo lama TIDAK dihapus, hanya disembunyikan.
'   - ukuran dashboard menyesuaikan lebar & tinggi jendela Excel pada
'     zoom 100% (tidak perlu zoom in / zoom out).
'   - bisa dikembalikan kapan saja: jalankan KembalikanDashboardLama.
'
' CARA PAKAI:
'   1. Simpan salinan file Excel dulu (jaga-jaga).
'   2. Alt+F11 -> hapus modRebrandDashboard lama (kalau ada) ->
'      File -> Import File -> pilih file ini.
'   3. Buka sheet Dashboard -> Alt+F8 -> RebrandDashboard -> Run.
'   4. Save.
'
' MACRO LAIN:
'   SesuaikanUkuran   - gambar ulang mengikuti ukuran jendela sekarang
'                       (misalnya setelah pindah monitor / laptop).
'   RB_LayarPenuh     - mode layar penuh (sembunyikan ribbon) on/off.
'   KembalikanDashboardLama - kembali ke tampilan lama.
'
' Tombol "SINKRON 2 ARAH" dan "TARIK DARI CIKOPS" memakai macro
' SyncToCikops / TarikDariCikops dari modSyncCikops VERSI 2.
' Batas stok menipis bisa diubah di sheet tersembunyi RB_Data!B10.
' ============================================================

Private Const PFX As String = "RB_"
Private Const TAG As String = "RB_HIDDEN|"
Private Const DATA_SHEET As String = "RB_Data"
Private Const CIKOPS_URL As String = "https://cikops-onefm.vercel.app/dashboard/atk"
Private Const ICON_FONT As String = "Segoe MDL2 Assets"

' ukuran desain (point) - nanti diskalakan ke ukuran jendela
Private Const CW As Single = 1000
Private Const CH As Single = 494
Private Const M As Single = 10

Private ox As Single, oy As Single      ' titik awal kanvas
Private fx As Single, fy As Single      ' skala horizontal / vertikal
Private fs As Single                    ' skala huruf


' ============================================================
' MACRO UTAMA
' ============================================================
Public Sub RebrandDashboard()
    If MsgBox("Ganti tampilan sheet """ & ActiveSheet.Name & """ dengan dashboard baru?" & vbCrLf & vbCrLf & _
              "Tombol lama hanya disembunyikan (tidak dihapus) dan semua macro tetap sama." & vbCrLf & _
              "Bisa dikembalikan dengan macro KembalikanDashboardLama.", _
              vbQuestion + vbYesNo, "Rebrand Dashboard ATK") <> vbYes Then Exit Sub
    BangunDashboard ActiveSheet, False
End Sub

' Gambar ulang mengikuti ukuran jendela saat ini
Public Sub SesuaikanUkuran()
    Dim ws As Worksheet
    Set ws = CariSheetDashboard()
    If ws Is Nothing Then
        MsgBox "Dashboard baru belum dipasang. Jalankan RebrandDashboard dulu.", vbExclamation, "Rebrand Dashboard ATK"
        Exit Sub
    End If
    BangunDashboard ws, True
End Sub

' Mode layar penuh on/off, lalu sesuaikan ukuran
Public Sub RB_LayarPenuh()
    Application.DisplayFullScreen = Not Application.DisplayFullScreen
    DoEvents
    SesuaikanUkuran
End Sub

' Kembalikan tampilan lama persis seperti semula
Public Sub KembalikanDashboardLama()
    Dim ws As Worksheet
    Set ws = CariSheetDashboard()
    If ws Is Nothing Then Set ws = ActiveSheet
    Application.ScreenUpdating = False
    If Application.DisplayFullScreen Then Application.DisplayFullScreen = False
    HapusShapeRB ws
    Dim shp As Shape
    For Each shp In ws.Shapes
        If Left(shp.AlternativeText, Len(TAG)) = TAG Then
            shp.AlternativeText = Mid(shp.AlternativeText, Len(TAG) + 1)
            shp.Visible = msoTrue
        End If
    Next shp
    Dim d As Worksheet
    Set d = AmbilSheet(DATA_SHEET)
    If Not d Is Nothing Then
        ws.Activate
        On Error Resume Next
        ActiveWindow.DisplayGridlines = CBool(d.Range("D1").Value)
        ActiveWindow.DisplayHeadings = CBool(d.Range("D2").Value)
        If Val(d.Range("D3").Value) > 0 Then ActiveWindow.Zoom = Val(d.Range("D3").Value)
        On Error GoTo 0
        Application.DisplayAlerts = False
        d.Visible = xlSheetVisible
        d.Delete
        Application.DisplayAlerts = True
    End If
    Application.ScreenUpdating = True
    MsgBox "Tampilan dashboard lama sudah dikembalikan.", vbInformation, "Rebrand Dashboard ATK"
End Sub

' Dipasang di area yang bukan tombol supaya tidak ikut tergeser saat diklik
Public Sub RB_Diam()
End Sub

Public Sub RB_BukaCikops()
    On Error Resume Next
    ThisWorkbook.FollowHyperlink CIKOPS_URL
End Sub


' ============================================================
' PROSES BANGUN
' ============================================================
Private Sub BangunDashboard(ws As Worksheet, diam As Boolean)
    Application.ScreenUpdating = False
    On Error GoTo Gagal

    ' 1) baca macro dari tombol lama
    Dim act As Object
    Set act = CreateObject("Scripting.Dictionary")
    KumpulkanMacro ws, act
    IsiCadangan act, "REQUEST", "BukaFormPermintaanATK"
    IsiCadangan act, "RESTOCK", "BukaFormUpdateBarang"
    IsiCadangan act, "BUKTI", "BukaFormCekTransaksi"
    IsiCadangan act, "SYNCREQ", "SyncPermintaanOnly"
    IsiCadangan act, "SYNCSTOCK", "SyncStokOnly"
    IsiCadangan act, "SYNCRST", "SyncRestockOnly"
    act("SYNCALL") = "SyncToCikops"
    act("PULL") = "TarikDariCikops"

    ' 2) bersihkan hasil sebelumnya, cari logo, sembunyikan shape lama
    HapusShapeRB ws
    Dim logoFC As Shape, logoFF As Shape
    CariLogo ws, logoFC, logoFF
    SembunyikanLama ws

    ' 3) sheet data KPI (sekaligus menyimpan pengaturan jendela lama)
    SiapkanData ws

    ' 4) jendela: zoom 100%, tanpa gridline/heading, lalu ukur area
    ws.Activate
    With ActiveWindow
        .Zoom = 100
        .DisplayGridlines = False
        .DisplayHeadings = False
        .ScrollRow = 1
        .ScrollColumn = 1
    End With
    DoEvents
    Dim availW As Single, availH As Single
    availW = ActiveWindow.UsableWidth - 2 * M - 4
    availH = ActiveWindow.UsableHeight - 2 * M - 4
    fx = Batas(availW / CW, 0.75, 3)
    fy = Batas(availH / CH, 0.75, 3)
    fs = IIf(fx < fy, fx, fy)
    ox = ws.Range("A1").Left + M
    oy = ws.Range("A1").Top + M

    ' 5) gambar
    GambarDashboard ws, act, logoFC, logoFF
    ws.Range("A1").Select

    Application.ScreenUpdating = True
    If Not diam Then
        Dim warn As String
        If act("REPORT") = "" Then warn = vbCrLf & vbCrLf & "Catatan: macro tombol REPORT lama tidak ditemukan - klik kanan tombol REPORT baru -> Assign Macro."
        MsgBox "Dashboard baru siap dan sudah menyesuaikan ukuran layar." & vbCrLf & _
               "Kalau ukuran jendela berubah, jalankan SesuaikanUkuran (atau klik ""Sesuaikan layar"" di bawah dashboard)." & warn, _
               vbInformation, "Rebrand Dashboard ATK"
    End If
    Exit Sub

Gagal:
    Application.ScreenUpdating = True
    MsgBox "Rebrand gagal: " & Err.Description & vbCrLf & "Jalankan KembalikanDashboardLama untuk memulihkan tampilan lama.", vbCritical, "Rebrand Dashboard ATK"
End Sub

Private Function Batas(v As Single, lo As Single, hi As Single) As Single
    If v < lo Then v = lo
    If v > hi Then v = hi
    Batas = v
End Function

Private Function CariSheetDashboard() As Worksheet
    Dim w As Worksheet, shp As Shape
    For Each w In ThisWorkbook.Worksheets
        For Each shp In w.Shapes
            If shp.Name = PFX & "header" Then
                Set CariSheetDashboard = w
                Exit Function
            End If
        Next shp
    Next w
End Function


' ============================================================
' GAMBAR  (semua koordinat dalam satuan desain 1000 x 494)
' ============================================================
Private Sub GambarDashboard(ws As Worksheet, act As Object, logoFC As Shape, logoFF As Shape)
    Dim s As Shape

    ' latar (tidak diskalakan, menutup seluruh area)
    Set s = ws.Shapes.AddShape(msoShapeRectangle, ws.Range("A1").Left, ws.Range("A1").Top, 4000, 2400)
    s.Name = PFX & "bg"
    s.Fill.Solid
    s.Fill.ForeColor.RGB = RGB(238, 243, 249)
    s.Line.Visible = msoFalse
    s.Shadow.Visible = msoFalse
    s.Placement = xlFreeFloating
    s.OnAction = "RB_Diam"
    s.ZOrder msoSendToBack

    ' ---------- HEADER ----------
    Set s = Kotak(ws, "header", 0, 0, CW, 66, RGB(10, 47, 107), 0.14, True)
    s.Fill.TwoColorGradient msoGradientVertical, 1
    s.Fill.ForeColor.RGB = RGB(10, 47, 107)
    s.Fill.BackColor.RGB = RGB(21, 92, 178)
    Kotak ws, "header_accent", 0, 62, CW, 4, RGB(215, 25, 42), 0, False

    Dim tx As Single
    tx = 18
    If Not logoFC Is Nothing Then
        Set s = Kotak(ws, "logo_fc_box", 12, 10, 10, 46, RGB(255, 255, 255), 0.18, False)
        Dim lw As Single
        lw = TaruhLogo(ws, logoFC, "logo_fc", 18, 14, 38)
        s.Width = (lw + 12) * fx
        tx = 12 + lw + 12 + 14
    End If
    Teks ws, "title", tx, 11, 520, 26, "INVENTORY ATK & SEMBAKO", 19, True, RGB(255, 255, 255)
    Teks ws, "subtitle", tx, 37, 560, 16, "General Affairs  " & ChrW(183) & "  PT Frisian Flag Indonesia " & ChrW(8212) & " Plant Cikarang", 10, False, RGB(205, 222, 246)

    Dim rx As Single
    rx = CW - 14
    If Not logoFF Is Nothing Then
        Dim fw As Single
        fw = TaruhLogo(ws, logoFF, "logo_ff", 0, 11, 44)
        ws.Shapes(PFX & "logo_ff").Left = ox + (rx - fw) * fx
        rx = rx - fw - 14
    End If
    Set s = Teks(ws, "date", rx - 260, 15, 260, 18, "", 11, True, RGB(255, 255, 255))
    s.DrawingObject.Formula = "=" & DATA_SHEET & "!$B$6"
    FormatTeks s, 11, True, RGB(255, 255, 255)
    s.TextFrame2.TextRange.ParagraphFormat.Alignment = msoAlignRight
    Set s = Teks(ws, "date_sub", rx - 260, 35, 260, 16, "Angka diperbarui otomatis", 9.5, False, RGB(205, 222, 246))
    s.TextFrame2.TextRange.ParagraphFormat.Alignment = msoAlignRight

    ' ---------- KPI ----------
    Dim kx As Single, kw As Single, i As Long
    kw = (CW - 4 * 12) / 5
    Dim lbl, cap, col, cel
    lbl = Array("JENIS BARANG", "STOK MENIPIS", "DIAMBIL BULAN INI", "RESTOCK BULAN INI", "BELUM SINKRON")
    cap = Array("terdaftar di MasterBarang", "stok " & ChrW(8804) & " batas minimum", "unit dari permintaan", "unit barang masuk", "baris menunggu dikirim")
    col = Array(RGB(21, 101, 192), RGB(224, 122, 0), RGB(91, 63, 191), RGB(15, 138, 95), RGB(215, 25, 42))
    cel = Array("$B$1", "$B$2", "$B$3", "$B$4", "$B$5")
    For i = 0 To 4
        kx = i * (kw + 12)
        Set s = Kotak(ws, "kpi" & i, kx, 80, kw, 74, RGB(255, 255, 255), 0.12, True)
        Garis s, RGB(213, 222, 234)
        Kotak ws, "kpi" & i & "_bar", kx, 80, 5, 74, CLng(col(i)), 0, False
        Teks ws, "kpi" & i & "_lbl", kx + 16, 89, kw - 24, 14, CStr(lbl(i)), 8.5, True, RGB(91, 107, 133)
        Set s = Teks(ws, "kpi" & i & "_val", kx + 16, 103, kw - 24, 30, "0", 22, True, CLng(col(i)))
        s.DrawingObject.Formula = "=" & DATA_SHEET & "!" & cel(i)
        FormatTeks s, 22, True, CLng(col(i))
        Teks ws, "kpi" & i & "_cap", kx + 16, 134, kw - 24, 14, CStr(cap(i)), 8.5, False, RGB(91, 107, 133)
    Next i

    ' ---------- TILE UTAMA: FORM REQUEST ----------
    Dim y0 As Single
    y0 = 168
    Set s = Tombol(ws, "t_request", 0, y0, 380, 300, act("REQUEST"), RGB(10, 47, 107), RGB(21, 101, 192), _
                   "FORM REQUEST" & vbCr & "ATK & SEMBAKO" & vbCr & "Catat pengambilan barang karyawan", RGB(255, 255, 255), 26, 11)
    s.Adjustments(1) = 0.06
    s.TextFrame2.MarginLeft = 26 * fx
    s.TextFrame2.MarginTop = 118 * fy
    s.TextFrame2.VerticalAnchor = msoAnchorTop
    Ikon ws, "t_request_ic", 24, y0 + 26, 70, ChrW(&HE8A5), RGB(255, 255, 255), act("REQUEST")
    Set s = Tombol(ws, "t_request_go", 26, y0 + 300 - 64, 170, 38, act("REQUEST"), RGB(255, 255, 255), RGB(255, 255, 255), _
                   "Buka form  " & ChrW(8250), RGB(10, 47, 107), 12, 0)
    s.TextFrame2.TextRange.ParagraphFormat.Alignment = msoAlignCenter
    s.TextFrame2.MarginLeft = 0
    s.Adjustments(1) = 0.5
    Set s = Kotak(ws, "t_request_accent", 380 - 120, y0 + 26, 94, 6, RGB(215, 25, 42), 0.5, False)
    s.OnAction = act("REQUEST")

    ' ---------- TILE TENGAH ----------
    Dim mx As Single, mw As Single, th As Single
    mx = 392: mw = 290: th = (300 - 20) / 3
    TileKecil ws, "t_restock", mx, y0, mw, th, act("RESTOCK"), "UPDATE STOK MASUK", "Catat barang masuk / restock", ChrW(&HE7B8), RGB(15, 138, 95)
    TileKecil ws, "t_bukti", mx, y0 + th + 10, mw, th, act("BUKTI"), "CETAK BUKTI", "Cetak bukti pengambilan barang", ChrW(&HE749), RGB(21, 101, 192)
    TileKecil ws, "t_report", mx, y0 + 2 * (th + 10), mw, th, act("REPORT"), "REPORT", "Rekap permintaan & stok", ChrW(&HE9D2), RGB(91, 63, 191)

    ' ---------- PANEL SINKRON ----------
    Dim px As Single, pw As Single
    px = 694: pw = CW - 694
    Set s = Kotak(ws, "sync_panel", px, y0, pw, 300, RGB(255, 255, 255), 0.06, True)
    Garis s, RGB(213, 222, 234)
    Ikon ws, "sync_ic", px + 16, y0 + 14, 22, ChrW(&HE895), RGB(21, 101, 192), ""
    Teks ws, "sync_title", px + 44, y0 + 14, pw - 60, 18, "SINKRON CIKOPS", 12, True, RGB(19, 35, 63)
    Teks ws, "sync_sub", px + 44, y0 + 32, pw - 60, 14, "Excel " & ChrW(8644) & " dashboard CIKOPS", 9, False, RGB(91, 107, 133)

    Set s = Tombol(ws, "s_all", px + 16, y0 + 56, pw - 32, 62, act("SYNCALL"), RGB(21, 101, 192), RGB(10, 47, 107), _
                   "SINKRON 2 ARAH" & vbCr & "Tarik dari CIKOPS, lalu kirim data Excel", RGB(255, 255, 255), 14, 9)
    s.TextFrame2.MarginLeft = 54 * fx
    Ikon ws, "s_all_ic", px + 30, y0 + 72, 30, ChrW(&HE895), RGB(255, 255, 255), act("SYNCALL")

    Set s = Tombol(ws, "s_pull", px + 16, y0 + 128, pw - 32, 44, act("PULL"), RGB(232, 240, 252), RGB(232, 240, 252), _
                   "TARIK DARI CIKOPS", RGB(10, 47, 107), 11.5, 0)
    Garis s, RGB(21, 101, 192), 1.25
    s.TextFrame2.MarginLeft = 54 * fx
    Ikon ws, "s_pull_ic", px + 32, y0 + 139, 22, ChrW(&HE896), RGB(21, 101, 192), act("PULL")

    Teks ws, "s_kirim_lbl", px + 16, y0 + 184, pw - 32, 14, "KIRIM SATUAN", 8.5, True, RGB(91, 107, 133)
    Dim bw As Single
    bw = (pw - 32 - 16) / 3
    TombolKecil ws, "s_req", px + 16, y0 + 200, bw, 44, act("SYNCREQ"), "Permintaan"
    TombolKecil ws, "s_stock", px + 16 + bw + 8, y0 + 200, bw, 44, act("SYNCSTOCK"), "Stok"
    TombolKecil ws, "s_rst", px + 16 + 2 * (bw + 8), y0 + 200, bw, 44, act("SYNCRST"), "Restock"

    Set s = Teks(ws, "s_link", px + 16, y0 + 264, pw - 32, 20, "Buka dashboard CIKOPS  " & ChrW(8250), 10.5, True, RGB(21, 101, 192))
    s.OnAction = "RB_BukaCikops"

    ' ---------- FOOTER ----------
    Teks ws, "footer", 0, y0 + 312, 560, 14, "Inventory ATK  " & ChrW(183) & "  Frisian Flag Cikarang  " & ChrW(183) & "  data tersinkron dengan CIKOPS", 8.5, False, RGB(122, 136, 160)
    Set s = Teks(ws, "f_fit", CW - 250, y0 + 312, 120, 14, ChrW(8635) & "  Sesuaikan layar", 8.5, True, RGB(21, 101, 192))
    s.TextFrame2.TextRange.ParagraphFormat.Alignment = msoAlignRight
    s.OnAction = "SesuaikanUkuran"
    Set s = Teks(ws, "f_full", CW - 120, y0 + 312, 120, 14, IIf(Application.DisplayFullScreen, "Keluar layar penuh", "Layar penuh") & "  " & ChrW(8599), 8.5, True, RGB(21, 101, 192))
    s.TextFrame2.TextRange.ParagraphFormat.Alignment = msoAlignRight
    s.OnAction = "RB_LayarPenuh"
End Sub

Private Sub TileKecil(ws As Worksheet, nm As String, x As Single, y As Single, w As Single, h As Single, _
                      macroName As String, judul As String, subj As String, ikonCh As String, warna As Long)
    Dim s As Shape
    Set s = Tombol(ws, nm, x, y, w, h, macroName, RGB(255, 255, 255), RGB(255, 255, 255), judul & vbCr & subj, RGB(19, 35, 63), 14, 9.5)
    Garis s, RGB(213, 222, 234)
    s.TextFrame2.MarginLeft = 78 * fx
    s.TextFrame2.TextRange.Paragraphs(2).Font.Fill.ForeColor.RGB = RGB(91, 107, 133)
    Dim b As Shape
    Set b = Kotak(ws, nm & "_bar", x, y, 5, h, warna, 0, False)
    b.OnAction = IIf(macroName = "", "RB_Diam", macroName)
    ' kotak ikon persegi (pakai skala huruf supaya tetap kotak)
    Set b = ws.Shapes.AddShape(msoShapeRoundedRectangle, ox + (x + 20) * fx, oy + (y + h / 2) * fy - 22 * fs, 44 * fs, 44 * fs)
    b.Name = PFX & nm & "_icbg"
    b.Adjustments(1) = 0.28
    b.Fill.Solid
    b.Fill.ForeColor.RGB = warna
    b.Line.Visible = msoFalse
    b.Shadow.Visible = msoFalse
    b.Placement = xlFreeFloating
    b.OnAction = IIf(macroName = "", "RB_Diam", macroName)
    With b.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .TextRange.Text = ikonCh
        .TextRange.ParagraphFormat.Alignment = msoAlignCenter
        .TextRange.Font.Name = ICON_FONT
        .TextRange.Font.Size = 20 * fs
        .TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
    End With
End Sub

Private Sub TombolKecil(ws As Worksheet, nm As String, x As Single, y As Single, w As Single, h As Single, macroName As String, judulBtn As String)
    Dim s As Shape
    Set s = Tombol(ws, nm, x, y, w, h, macroName, RGB(244, 247, 251), RGB(244, 247, 251), judulBtn & vbCr & "kirim " & ChrW(8593), RGB(19, 35, 63), 10.5, 8.5)
    Garis s, RGB(194, 207, 226)
    s.TextFrame2.MarginLeft = 2
    s.TextFrame2.MarginRight = 2
    s.TextFrame2.TextRange.ParagraphFormat.Alignment = msoAlignCenter
    s.TextFrame2.TextRange.Paragraphs(2).Font.Fill.ForeColor.RGB = RGB(91, 107, 133)
End Sub


' ============================================================
' PEMBUAT SHAPE (koordinat desain -> diskalakan)
' ============================================================
Private Function Kotak(ws As Worksheet, nm As String, x As Single, y As Single, w As Single, h As Single, _
                       warna As Long, rnd As Single, bayangan As Boolean) As Shape
    Dim s As Shape
    If rnd > 0 Then
        Set s = ws.Shapes.AddShape(msoShapeRoundedRectangle, ox + x * fx, oy + y * fy, w * fx, h * fy)
        s.Adjustments(1) = rnd
    Else
        Set s = ws.Shapes.AddShape(msoShapeRectangle, ox + x * fx, oy + y * fy, w * fx, h * fy)
    End If
    s.Name = PFX & nm
    s.Fill.Solid
    s.Fill.ForeColor.RGB = warna
    s.Line.Visible = msoFalse
    s.Placement = xlFreeFloating
    s.OnAction = "RB_Diam"
    If bayangan Then
        With s.Shadow
            .Visible = msoTrue
            .ForeColor.RGB = RGB(10, 30, 70)
            .Transparency = 0.86
            .Blur = 10
            .OffsetX = 0
            .OffsetY = 3
        End With
    Else
        s.Shadow.Visible = msoFalse
    End If
    Set Kotak = s
End Function

Private Sub Garis(s As Shape, warna As Long, Optional tebal As Single = 0.75)
    s.Line.Visible = msoTrue
    s.Line.ForeColor.RGB = warna
    s.Line.Weight = tebal
End Sub

Private Function Tombol(ws As Worksheet, nm As String, x As Single, y As Single, w As Single, h As Single, macroName As String, _
                        warna1 As Long, warna2 As Long, teksIsi As String, warnaTeks As Long, size1 As Single, size2 As Single) As Shape
    Dim s As Shape
    Set s = Kotak(ws, nm, x, y, w, h, warna1, 0.1, True)
    If warna1 <> warna2 Then
        s.Fill.TwoColorGradient msoGradientDiagonalUp, 1
        s.Fill.ForeColor.RGB = warna2
        s.Fill.BackColor.RGB = warna1
    End If
    s.OnAction = IIf(macroName = "", "RB_Diam", macroName)
    With s.TextFrame2
        .WordWrap = msoTrue
        .VerticalAnchor = msoAnchorMiddle
        .MarginLeft = 18 * fx: .MarginRight = 12 * fx: .MarginTop = 6 * fy: .MarginBottom = 6 * fy
        .TextRange.Text = teksIsi
        .TextRange.ParagraphFormat.Alignment = msoAlignLeft
        .TextRange.Font.Name = "Segoe UI"
        .TextRange.Font.Fill.ForeColor.RGB = warnaTeks
        .TextRange.Font.Size = size1 * fs
        .TextRange.Font.Bold = msoTrue
        Dim n As Long
        n = .TextRange.Paragraphs.Count
        If size2 > 0 And n > 1 Then
            With .TextRange.Paragraphs(n).Font
                .Size = size2 * fs
                .Bold = msoFalse
            End With
            .TextRange.Paragraphs(n).ParagraphFormat.SpaceBefore = 4 * fs
        End If
    End With
    Set Tombol = s
End Function

Private Function Teks(ws As Worksheet, nm As String, x As Single, y As Single, w As Single, h As Single, isi As String, _
                      size As Single, tebal As Boolean, warna As Long) As Shape
    Dim s As Shape
    Set s = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, ox + x * fx, oy + y * fy, w * fx, h * fy)
    s.Name = PFX & nm
    s.Fill.Visible = msoFalse
    s.Line.Visible = msoFalse
    s.Placement = xlFreeFloating
    s.OnAction = "RB_Diam"
    With s.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .WordWrap = msoTrue
        .AutoSize = msoAutoSizeNone
        .TextRange.Text = isi
    End With
    FormatTeks s, size, tebal, warna
    Set Teks = s
End Function

' size dalam satuan desain (otomatis diskalakan)
Private Sub FormatTeks(s As Shape, size As Single, tebal As Boolean, warna As Long)
    With s.TextFrame2.TextRange.Font
        .Name = "Segoe UI"
        .Size = size * fs
        .Bold = IIf(tebal, msoTrue, msoFalse)
        .Fill.ForeColor.RGB = warna
    End With
End Sub

Private Sub Ikon(ws As Worksheet, nm As String, x As Single, y As Single, size As Single, ch As String, warna As Long, macroName As String)
    Dim s As Shape
    Set s = ws.Shapes.AddTextbox(msoTextOrientationHorizontal, ox + x * fx, oy + y * fy, size * fs, size * fs)
    s.Name = PFX & nm
    s.Fill.Visible = msoFalse
    s.Line.Visible = msoFalse
    s.Placement = xlFreeFloating
    s.OnAction = IIf(macroName = "", "RB_Diam", macroName)
    With s.TextFrame2
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .WordWrap = msoFalse
        .TextRange.Text = ch
        .TextRange.ParagraphFormat.Alignment = msoAlignCenter
        .TextRange.Font.Name = ICON_FONT
        .TextRange.Font.Size = size * 0.8 * fs
        .TextRange.Font.Fill.ForeColor.RGB = warna
    End With
End Sub

' Salin logo lama ke posisi baru (tinggi h desain); kembalikan lebar dalam satuan desain
Private Function TaruhLogo(ws As Worksheet, src As Shape, nm As String, x As Single, y As Single, h As Single) As Single
    Dim s As Shape
    Set s = src.Duplicate
    s.Visible = msoTrue
    s.AlternativeText = ""
    s.Name = PFX & nm
    s.LockAspectRatio = msoTrue
    s.Height = h * fy
    s.Left = ox + x * fx
    s.Top = oy + y * fy
    s.Placement = xlFreeFloating
    s.OnAction = "RB_Diam"
    TaruhLogo = s.Width / fx
End Function


' ============================================================
' DATA KPI (sheet tersembunyi RB_Data)
' ============================================================
Private Sub SiapkanData(ws As Worksheet)
    Dim d As Worksheet
    Set d = AmbilSheet(DATA_SHEET)
    If d Is Nothing Then
        ws.Activate
        Dim g As Boolean, hd As Boolean, z As Variant
        g = ActiveWindow.DisplayGridlines
        hd = ActiveWindow.DisplayHeadings
        z = ActiveWindow.Zoom
        Set d = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        d.Name = DATA_SHEET
        d.Range("C1").Value = "gridlines": d.Range("D1").Value = g
        d.Range("C2").Value = "headings":  d.Range("D2").Value = hd
        d.Range("C3").Value = "zoom":      d.Range("D3").Value = z
        d.Range("A10").Value = "Batas stok menipis"
        d.Range("B10").Value = 5
    End If

    Dim ym As String
    ym = "(YEAR(TODAY())*100+MONTH(TODAY()))"
    d.Range("A1").Value = "Jenis barang"
    d.Range("A2").Value = "Stok menipis"
    d.Range("A3").Value = "Diambil bulan ini"
    d.Range("A4").Value = "Restock bulan ini"
    d.Range("A5").Value = "Belum sinkron"
    d.Range("A6").Value = "Tanggal"

    If AmbilSheet("MasterBarang") Is Nothing Then
        d.Range("B1").Value = 0: d.Range("B2").Value = 0
    Else
        d.Range("B1").Formula = "=COUNTA(MasterBarang!A2:A20000)"
        d.Range("B2").Formula = "=COUNTIFS(MasterBarang!A2:A20000,""<>"",MasterBarang!D2:D20000,""<=""&$B$10)"
    End If

    Dim fUnsynced As String
    If AmbilSheet("TransaksiPermintaan") Is Nothing Then
        d.Range("B3").Value = 0
        fUnsynced = "0"
    Else
        d.Range("B3").Formula = "=SUMIFS(TransaksiPermintaan!H:H,TransaksiPermintaan!A:A,""REQ-""&" & ym & "&""*"")"
        fUnsynced = "SUMPRODUCT((TransaksiPermintaan!A2:A20000<>"""")*((TransaksiPermintaan!K2:K20000=TRUE)+(TransaksiPermintaan!K2:K20000=""TRUE"")=0))"
    End If
    If AmbilSheet("TransaksiUpdateBarang") Is Nothing Then
        d.Range("B4").Value = 0
    Else
        d.Range("B4").Formula = "=SUMIFS(TransaksiUpdateBarang!F:F,TransaksiUpdateBarang!A:A,""UPD-""&" & ym & "&""*"",TransaksiUpdateBarang!C:C,""Restock"")"
        fUnsynced = fUnsynced & "+SUMPRODUCT((TransaksiUpdateBarang!A2:A20000<>"""")*(TransaksiUpdateBarang!C2:C20000=""Restock"")*((TransaksiUpdateBarang!K2:K20000=TRUE)+(TransaksiUpdateBarang!K2:K20000=""TRUE"")=0))"
    End If
    d.Range("B5").Formula = "=" & fUnsynced
    d.Range("B6").Formula = "=TODAY()"
    d.Range("B1:B5").NumberFormat = "#,##0"
    d.Range("B6").NumberFormat = "dddd, d mmmm yyyy"
    d.Visible = xlSheetHidden
End Sub


' ============================================================
' HELPER
' ============================================================
Private Function AmbilSheet(nm As String) As Worksheet
    On Error Resume Next
    Set AmbilSheet = ThisWorkbook.Worksheets(nm)
    On Error GoTo 0
End Function

Private Sub IsiCadangan(act As Object, k As String, macroName As String)
    If Not act.Exists(k) Then act(k) = macroName
    If act(k) = "" Then act(k) = macroName
End Sub

Private Sub HapusShapeRB(ws As Worksheet)
    Dim i As Long
    For i = ws.Shapes.Count To 1 Step -1
        If Left(ws.Shapes(i).Name, Len(PFX)) = PFX Then ws.Shapes(i).Delete
    Next i
End Sub

Private Sub SembunyikanLama(ws As Worksheet)
    Dim shp As Shape
    For Each shp In ws.Shapes
        If Left(shp.Name, Len(PFX)) <> PFX And shp.Type <> msoComment Then
            If shp.Visible = msoTrue Then
                On Error Resume Next
                If Left(shp.AlternativeText, Len(TAG)) <> TAG Then shp.AlternativeText = TAG & shp.AlternativeText
                On Error GoTo 0
                shp.Visible = msoFalse
            End If
        End If
    Next shp
End Sub

' Petakan teks tombol lama -> nama macro
Private Sub KumpulkanMacro(ws As Worksheet, act As Object)
    act("REPORT") = ""
    Dim shp As Shape, it As Shape
    For Each shp In ws.Shapes
        If Left(shp.Name, Len(PFX)) <> PFX Then
            If shp.Type = msoGroup Then
                Dim gt As String, ga As String
                gt = "": ga = AksiShape(shp)
                For Each it In shp.GroupItems
                    gt = gt & " " & TeksShape(it)
                    If ga = "" Then ga = AksiShape(it)
                Next it
                PetakanAksi act, gt, ga
                For Each it In shp.GroupItems
                    PetakanAksi act, TeksShape(it), AksiShape(it)
                Next it
            Else
                PetakanAksi act, TeksShape(shp), AksiShape(shp)
            End If
        End If
    Next shp
End Sub

Private Sub PetakanAksi(act As Object, ByVal t As String, ByVal a As String)
    If a = "" Or a = "RB_Diam" Or Trim(t) = "" Then Exit Sub
    t = UCase(Replace(Replace(t, vbCr, " "), vbLf, " "))
    Dim k As String
    If InStr(t, "SINC") > 0 Or InStr(t, "SYNC") > 0 Or InStr(t, "SINKRON") > 0 Then
        If InStr(t, "PERMINTAAN") > 0 Then
            k = "SYNCREQ"
        ElseIf InStr(t, "RESTOCK") > 0 Then
            k = "SYNCRST"
        ElseIf InStr(t, "STOCK") > 0 Or InStr(t, "STOK") > 0 Then
            k = "SYNCSTOCK"
        End If
    ElseIf InStr(t, "FORM REQUEST") > 0 Or InStr(t, "REQUEST ATK") > 0 Or InStr(t, "PERMINTAAN ATK") > 0 Then
        k = "REQUEST"
    ElseIf InStr(t, "CETAK") > 0 Or InStr(t, "BUKTI") > 0 Then
        k = "BUKTI"
    ElseIf InStr(t, "UPDATE STOK") > 0 Or InStr(t, "STOK MASUK") > 0 Or InStr(t, "UPDATE STOCK") > 0 Then
        k = "RESTOCK"
    ElseIf InStr(t, "REPORT") > 0 Or InStr(t, "LAPORAN") > 0 Then
        k = "REPORT"
    End If
    If k <> "" Then
        If Not act.Exists(k) Then
            act(k) = a
        ElseIf act(k) = "" Then
            act(k) = a
        End If
    End If
End Sub

Private Function AksiShape(shp As Shape) As String
    Dim a As String
    On Error Resume Next
    a = shp.OnAction
    On Error GoTo 0
    If InStr(a, "!") > 0 Then a = Mid(a, InStrRev(a, "!") + 1)
    a = Replace(a, "'", "")
    AksiShape = a
End Function

Private Function TeksShape(shp As Shape) As String
    Dim t As String
    On Error Resume Next
    t = shp.TextFrame2.TextRange.Text
    If t = "" Then t = shp.TextFrame.Characters.Text
    If t = "" Then t = shp.DrawingObject.Caption
    On Error GoTo 0
    TeksShape = t
End Function

' Logo: gambar melebar = FrieslandCampina, gambar kotak/bulat kecil = Frisian Flag
Private Sub CariLogo(ws As Worksheet, ByRef fc As Shape, ByRef ff As Shape)
    Dim shp As Shape, r As Single, area As Single, bestFF As Single, bestFC As Single
    bestFF = 1E+30
    For Each shp In ws.Shapes
        If Left(shp.Name, Len(PFX)) <> PFX And (shp.Type = msoPicture Or shp.Type = msoLinkedPicture) Then
            If shp.Height > 0 Then
                r = shp.Width / shp.Height
                area = shp.Width * shp.Height
                If r >= 1.8 Then
                    If area > bestFC Then Set fc = shp: bestFC = area
                ElseIf r > 0.75 And r < 1.33 And area < bestFF And shp.Height < 120 Then
                    Set ff = shp: bestFF = area
                End If
            End If
        End If
    Next shp
End Sub
