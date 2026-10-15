Attribute VB_Name = "modLaporanATK"
Option Explicit

' ============================================================
' modLaporanATK - LAPORAN ATK COMPREHENSIVE
'
' Pengganti modul laporan pivot lama. Nama macro utama tetap
' "Generate_Laporan_Pivot" supaya tombol REPORT di dashboard tetap jalan.
'
' Isi laporan (sheet "LaporanATK"):
'   - Panel filter tanggal (Dari / Sampai) + tombol cepat:
'     Bulan ini, Bulan lalu, 3 bulan, Tahun ini, Semua
'   - 6 kartu ringkasan + perbandingan dengan periode sebelumnya
'   - Temuan utama (otomatis, kalimat singkat)
'   - Tren barang keluar vs masuk (harian / bulanan) + grafik
'   - Top 10 barang diminta + grafik
'   - Permintaan per departemen + grafik
'   - Top 10 pemohon
'   - Stok perlu restock (stok <= minimum) & perkiraan stok cukup berapa hari
'   - Restock (barang masuk) dalam periode
'   - Sheet "LaporanATK_Detail": semua transaksi periode (untuk audit, bisa difilter)
'
' Tombol Export PDF & Export PPT ada di baris filter laporan.
' File disimpan di folder yang sama dengan file Excel ini.
'
' CARA PASANG:
'   1. Alt+F11 -> hapus modul laporan pivot LAMA (yang berisi
'      Generate_Laporan_Pivot) -> klik kanan -> Remove.
'   2. File -> Import File -> pilih modLaporanATK.bas
'   3. Klik tombol REPORT di dashboard (atau Alt+F8 -> Generate_Laporan_Pivot).
' ============================================================

Private Const SH_REP As String = "LaporanATK"
Private Const SH_DET As String = "LaporanATK_Detail"
Private Const SH_REQ As String = "TransaksiPermintaan"
Private Const SH_UPD As String = "TransaksiUpdateBarang"
Private Const SH_MB As String = "MasterBarang"

Private Const C_NAVY As Long = 7024394      ' RGB(10,47,107)
Private Const C_BLUE As Long = 12608789     ' RGB(21,101,192)
Private Const C_RED As Long = 2759127       ' RGB(215,25,42)
Private Const C_GREEN As Long = 6261263     ' RGB(15,138,95)
Private Const C_ORANGE As Long = 31456      ' RGB(224,122,0)
Private Const C_PURPLE As Long = 12533595   ' RGB(91,63,191)
Private Const C_TEXT As Long = 4137747      ' RGB(19,35,63)
Private Const C_MUTED As Long = 8743771     ' RGB(91,107,133)
Private Const C_LINE As Long = 15392469     ' RGB(213,222,234)
Private Const C_SOFT As Long = 16513012     ' RGB(244,247,251)
Private Const C_SOFTBLUE As Long = 16510691 ' RGB(227,238,251)
Private Const FONT_UI As String = "Segoe UI"


' ============================================================
' TOMBOL / ENTRY POINT
' ============================================================
Public Sub Generate_Laporan_Pivot()
    Dim ws As Worksheet, dFrom As Date, dTo As Date
    Set ws = SiapkanSheet()
    If Not BacaFilter(ws, dFrom, dTo) Then
        dFrom = DateSerial(Year(Date), Month(Date), 1)
        dTo = Date
    End If
    BuatLaporan dFrom, dTo
End Sub

Public Sub Refresh_All_Pivots()
    LapATK_Terapkan
End Sub

Public Sub LapATK_Terapkan()
    Dim ws As Worksheet, dFrom As Date, dTo As Date
    Set ws = SiapkanSheet()
    If Not BacaFilter(ws, dFrom, dTo) Then
        MsgBox "Isi tanggal Dari dan Sampai dengan benar (format dd/mm/yyyy).", vbExclamation, "Filter Tanggal"
        Exit Sub
    End If
    If dFrom > dTo Then
        MsgBox "Tanggal Dari tidak boleh setelah tanggal Sampai.", vbExclamation, "Filter Tanggal"
        Exit Sub
    End If
    BuatLaporan dFrom, dTo
End Sub

Public Sub LapATK_BulanIni()
    BuatLaporan DateSerial(Year(Date), Month(Date), 1), Date
End Sub

Public Sub LapATK_BulanLalu()
    BuatLaporan DateSerial(Year(Date), Month(Date) - 1, 1), DateSerial(Year(Date), Month(Date), 0)
End Sub

Public Sub LapATK_3Bulan()
    BuatLaporan DateSerial(Year(Date), Month(Date) - 2, 1), Date
End Sub

Public Sub LapATK_TahunIni()
    BuatLaporan DateSerial(Year(Date), 1, 1), Date
End Sub

Public Sub LapATK_Semua()
    Dim mn As Date, mx As Date
    If Not RentangData(mn, mx) Then
        MsgBox "Belum ada data permintaan.", vbExclamation, "Laporan ATK"
        Exit Sub
    End If
    BuatLaporan mn, mx
End Sub

Public Sub LapATK_Diam()
End Sub


' ============================================================
' BANGUN LAPORAN
' ============================================================
Private Sub BuatLaporan(ByVal dFrom As Date, ByVal dTo As Date)
    Dim ws As Worksheet, wsReq As Worksheet, wsUpd As Worksheet, wsMB As Worksheet
    On Error GoTo Gagal
    Application.ScreenUpdating = False
    Application.EnableEvents = False

    Set wsReq = ThisWorkbook.Sheets(SH_REQ)
    Set wsMB = ThisWorkbook.Sheets(SH_MB)
    On Error Resume Next
    Set wsUpd = ThisWorkbook.Sheets(SH_UPD)
    On Error GoTo Gagal

    Dim nDays As Long, pFrom As Date, pTo As Date
    nDays = dTo - dFrom + 1
    pTo = dFrom - 1
    pFrom = pTo - nDays + 1

    Dim harian As Boolean
    harian = (nDays <= 62)

    ' ---------- kumpulkan data ----------
    Dim reqSeen As Object, people As Object, deptD As Object, itemD As Object, pers As Object
    Dim bOut As Object, bIn As Object, rstD As Object, wd As Object, seen As Object, prevReq As Object
    Set reqSeen = NewDict(): Set people = NewDict(): Set deptD = NewDict(): Set itemD = NewDict()
    Set pers = NewDict(): Set bOut = NewDict(): Set bIn = NewDict(): Set rstD = NewDict()
    Set wd = NewDict(): Set seen = NewDict(): Set prevReq = NewDict()

    Dim totOut As Double, prevOut As Double, totIn As Double, prevIn As Double
    Dim r As Long, lastR As Long, tgl As Date, ok As Boolean
    Dim reqId As String, nm As String, nik As String, dept As String, kode As String, brg As String, qty As Double, sat As String
    Dim k As String, a As Variant

    ' detail sheet
    Dim wsDet As Worksheet
    Set wsDet = SheetDetail()
    Dim detRow As Long
    detRow = 5

    lastR = wsReq.Cells(wsReq.Rows.Count, 1).End(xlUp).Row
    For r = 2 To lastR
        reqId = Trim(CStr(wsReq.Cells(r, 1).Value))
        If reqId <> "" Then
            ok = TanggalBaris(reqId, wsReq.Cells(r, 2).Value, tgl)
            If ok Then
                qty = Val(wsReq.Cells(r, 8).Value)
                If tgl >= dFrom And tgl <= dTo Then
                    nm = Trim(CStr(wsReq.Cells(r, 3).Value))
                    nik = Trim(CStr(wsReq.Cells(r, 4).Value))
                    dept = Trim(CStr(wsReq.Cells(r, 5).Value)): If dept = "" Then dept = "(tanpa departemen)"
                    kode = Trim(CStr(wsReq.Cells(r, 6).Value))
                    brg = Trim(CStr(wsReq.Cells(r, 7).Value))
                    sat = Trim(CStr(wsReq.Cells(r, 9).Value))
                    If kode = "" Then kode = brg

                    totOut = totOut + qty
                    reqSeen(reqId) = True
                    people(IIf(nik <> "", nik, LCase(nm))) = True

                    ' departemen: unit, transaksi, pemohon
                    If Not deptD.Exists(dept) Then deptD(dept) = Array(0#, 0&, 0&)
                    a = deptD(dept): a(0) = a(0) + qty
                    If Not seen.Exists("D|" & dept & "|" & reqId) Then seen("D|" & dept & "|" & reqId) = True: a(1) = a(1) + 1
                    If Not seen.Exists("DP|" & dept & "|" & nik & nm) Then seen("DP|" & dept & "|" & nik & nm) = True: a(2) = a(2) + 1
                    deptD(dept) = a

                    ' barang: unit, transaksi, nama, satuan
                    If Not itemD.Exists(kode) Then itemD(kode) = Array(0#, 0&, brg, sat)
                    a = itemD(kode): a(0) = a(0) + qty
                    If Not seen.Exists("I|" & kode & "|" & reqId) Then seen("I|" & kode & "|" & reqId) = True: a(1) = a(1) + 1
                    itemD(kode) = a

                    ' pemohon: unit, transaksi, departemen, nama
                    k = IIf(nik <> "", nik, LCase(nm))
                    If Not pers.Exists(k) Then pers(k) = Array(0#, 0&, dept, nm)
                    a = pers(k): a(0) = a(0) + qty
                    If Not seen.Exists("P|" & k & "|" & reqId) Then seen("P|" & k & "|" & reqId) = True: a(1) = a(1) + 1
                    pers(k) = a

                    ' tren & hari
                    k = KunciBucket(tgl, harian)
                    bOut(k) = Val(bOut(k)) + qty
                    If Not seen.Exists("W|" & reqId) Then
                        seen("W|" & reqId) = True
                        wd(Weekday(tgl, vbMonday)) = Val(wd(Weekday(tgl, vbMonday))) + 1
                    End If

                    ' detail
                    wsDet.Cells(detRow, 1).Value = tgl
                    wsDet.Cells(detRow, 2).Value = reqId
                    wsDet.Cells(detRow, 3).Value = nm
                    wsDet.Cells(detRow, 4).NumberFormat = "@"
                    wsDet.Cells(detRow, 4).Value = nik
                    wsDet.Cells(detRow, 5).Value = dept
                    wsDet.Cells(detRow, 6).Value = kode
                    wsDet.Cells(detRow, 7).Value = brg
                    wsDet.Cells(detRow, 8).Value = qty
                    wsDet.Cells(detRow, 9).Value = sat
                    wsDet.Cells(detRow, 10).Value = wsReq.Cells(r, 10).Value
                    detRow = detRow + 1
                ElseIf tgl >= pFrom And tgl <= pTo Then
                    prevOut = prevOut + qty
                    prevReq(reqId) = True
                End If
            End If
        End If
    Next r

    ' restock
    If Not wsUpd Is Nothing Then
        lastR = wsUpd.Cells(wsUpd.Rows.Count, 1).End(xlUp).Row
        For r = 2 To lastR
            reqId = Trim(CStr(wsUpd.Cells(r, 1).Value))
            If reqId <> "" And UCase(Trim(CStr(wsUpd.Cells(r, 3).Value))) = "RESTOCK" Then
                If TanggalBaris(reqId, wsUpd.Cells(r, 2).Value, tgl) Then
                    qty = Val(wsUpd.Cells(r, 6).Value)
                    If tgl >= dFrom And tgl <= dTo Then
                        totIn = totIn + qty
                        kode = Trim(CStr(wsUpd.Cells(r, 4).Value))
                        If Not rstD.Exists(kode) Then rstD(kode) = Array(0#, 0&, Trim(CStr(wsUpd.Cells(r, 5).Value)), Trim(CStr(wsUpd.Cells(r, 7).Value)))
                        a = rstD(kode): a(0) = a(0) + qty: a(1) = a(1) + 1
                        rstD(kode) = a
                        k = KunciBucket(tgl, harian)
                        bIn(k) = Val(bIn(k)) + qty
                    ElseIf tgl >= pFrom And tgl <= pTo Then
                        prevIn = prevIn + qty
                    End If
                End If
            End If
        Next r
    End If

    ' ---------- tulis laporan ----------
    Set ws = SiapkanSheet()
    BersihkanSheet ws
    TulisKerangka ws, dFrom, dTo, reqSeen.Count, totOut

    Dim row0 As Long
    ' KPI (baris 7-10)
    Dim kv(1 To 6) As String, kl(1 To 6) As String, ks(1 To 6) As String, kc(1 To 6) As Long
    kl(1) = "TRANSAKSI": kv(1) = Fmt(reqSeen.Count): ks(1) = Banding(reqSeen.Count, prevReq.Count, "periode lalu"): kc(1) = C_PURPLE
    kl(2) = "BARANG KELUAR": kv(2) = Fmt(totOut) & " unit": ks(2) = Banding(totOut, prevOut, "periode lalu"): kc(2) = C_BLUE
    kl(3) = "BARANG MASUK": kv(3) = Fmt(totIn) & " unit": ks(3) = Banding(totIn, prevIn, "periode lalu"): kc(3) = C_GREEN
    kl(4) = "PEMOHON": kv(4) = Fmt(people.Count) & " orang": ks(4) = deptD.Count & " departemen": kc(4) = C_NAVY
    kl(5) = "JENIS BARANG DIMINTA": kv(5) = Fmt(itemD.Count): ks(5) = "dari " & Fmt(JumlahBarang(wsMB)) & " barang terdaftar": kc(5) = C_ORANGE
    Dim nKritis As Long
    nKritis = HitungKritis(wsMB)
    kl(6) = "PERLU RESTOCK": kv(6) = Fmt(nKritis) & " barang": ks(6) = "stok " & ChrW(8804) & " minimum (" & BatasMin() & ")": kc(6) = C_RED
    TulisKPI ws, 7, kl, kv, ks, kc

    ' simpan nilai KPI untuk PPT
    Dim i As Long
    For i = 1 To 6
        ws.Cells(200 + i, 30).Value = kl(i): ws.Cells(200 + i, 31).Value = kv(i): ws.Cells(200 + i, 32).Value = ks(i): ws.Cells(200 + i, 33).Value = kc(i)
    Next i
    NamaRange "LapATK_KPI", ws.Range(ws.Cells(201, 30), ws.Cells(206, 33))

    ' temuan
    Dim temuan As Collection
    Set temuan = New Collection
    SusunTemuan temuan, itemD, deptD, pers, wd, totOut, prevOut, reqSeen.Count, nKritis, totIn, dFrom, dTo
    row0 = 12
    JudulSeksi ws, row0, "Temuan utama"
    For i = 1 To temuan.Count
        ws.Range(ws.Cells(row0 + i, 2), ws.Cells(row0 + i, 13)).Merge
        ws.Cells(row0 + i, 2).Value = ChrW(8226) & "  " & temuan(i)
        ws.Cells(row0 + i, 2).Font.Color = C_TEXT
        ws.Cells(row0 + i, 2).IndentLevel = 1
    Next i
    NamaRange "LapATK_Temuan", ws.Range(ws.Cells(row0 + 1, 2), ws.Cells(row0 + IIf(temuan.Count > 0, temuan.Count, 1), 2))
    row0 = row0 + temuan.Count + 2

    ' tren
    row0 = SeksiTren(ws, row0, bOut, bIn, dFrom, dTo, harian)
    ' top barang
    row0 = SeksiTop(ws, row0, "Top 10 barang paling banyak diminta", Array("#", "Barang", "Unit", "% total", "Transaksi"), _
                    UrutTop(itemD, 10), itemD, totOut, "item", "LapATK_Top", True)
    ' departemen
    row0 = SeksiTop(ws, row0, "Permintaan per departemen", Array("#", "Departemen", "Unit", "% total", "Transaksi"), _
                    UrutTop(deptD, 12), deptD, totOut, "dept", "LapATK_Dept", True)
    ' pemohon
    row0 = SeksiTop(ws, row0, "Top 10 pemohon", Array("#", "Nama", "Unit", "Departemen", "Transaksi"), _
                    UrutTop(pers, 10), pers, totOut, "pers", "LapATK_Pemohon", False)
    ' stok kritis
    row0 = SeksiStok(ws, row0, wsMB, itemD, nDays)
    ' restock
    row0 = SeksiRestock(ws, row0, rstD, totIn)

    ' footer
    ws.Range(ws.Cells(row0 + 1, 2), ws.Cells(row0 + 1, 13)).Merge
    ws.Cells(row0 + 1, 2).Value = "Dibuat " & Format(Now, "dd/mm/yyyy hh:nn") & "  " & ChrW(183) & "  Inventory ATK & Sembako  " & ChrW(183) & "  General Affairs Frisian Flag Cikarang"
    ws.Cells(row0 + 1, 2).Font.Size = 8
    ws.Cells(row0 + 1, 2).Font.Color = C_MUTED

    ' halaman cetak
    On Error Resume Next
    With ws.PageSetup
        .PrintArea = ws.Range(ws.Cells(1, 1), ws.Cells(row0 + 1, 14)).Address
        .Orientation = xlPortrait
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        .CenterHorizontally = True
        .TopMargin = Application.InchesToPoints(0.4)
        .BottomMargin = Application.InchesToPoints(0.5)
        .LeftMargin = Application.InchesToPoints(0.3)
        .RightMargin = Application.InchesToPoints(0.3)
        .CenterFooter = "Halaman &P dari &N"
    End With
    On Error GoTo Gagal

    FinalisasiDetail wsDet, detRow - 1, dFrom, dTo

    ws.Activate
    ActiveWindow.DisplayGridlines = False
    ws.Range("A1").Select
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Exit Sub

Gagal:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "Gagal membuat laporan: " & Err.Description, vbCritical, "Laporan ATK"
End Sub


' ============================================================
' SEKSI-SEKSI
' ============================================================
Private Function SeksiTren(ws As Worksheet, ByVal row0 As Long, bOut As Object, bIn As Object, _
                           ByVal dFrom As Date, ByVal dTo As Date, ByVal harian As Boolean) As Long
    JudulSeksi ws, row0, "Tren barang keluar vs masuk (" & IIf(harian, "harian", "bulanan") & ")"
    Dim hr As Long
    hr = row0 + 1
    TulisHeader ws, hr, Array("Periode", "Keluar", "Masuk")
    Dim d As Date, k As String, r As Long, lastK As String
    r = hr + 1
    d = dFrom
    Do While d <= dTo
        k = KunciBucket(d, harian)
        If k <> lastK Then
            ws.Cells(r, 2).Value = "'" & LabelBucket(k, harian)
            ws.Range(ws.Cells(r, 2), ws.Cells(r, 3)).Merge
            ws.Cells(r, 4).Value = Val(bOut(k))
            ws.Cells(r, 5).Value = Val(bIn(k))
            r = r + 1
            lastK = k
        End If
        d = d + 1
    Loop
    Dim lastRow As Long
    lastRow = r - 1
    GayaTabel ws, hr, lastRow, 5
    ws.Range(ws.Cells(hr + 1, 4), ws.Cells(lastRow, 5)).NumberFormat = "#,##0"

    ' grafik
    Dim co As ChartObject
    Set co = ws.ChartObjects.Add(ws.Cells(hr, 7).Left, ws.Cells(hr, 7).Top, ws.Cells(hr, 14).Left - ws.Cells(hr, 7).Left, 230)
    co.Name = "chTren"
    With co.Chart
        .ChartType = xlColumnClustered
        Do While .SeriesCollection.Count > 0: .SeriesCollection(1).Delete: Loop
        With .SeriesCollection.NewSeries
            .Name = "Keluar"
            .Values = ws.Range(ws.Cells(hr + 1, 4), ws.Cells(lastRow, 4))
            .XValues = ws.Range(ws.Cells(hr + 1, 2), ws.Cells(lastRow, 2))
            .Format.Fill.ForeColor.RGB = C_BLUE
        End With
        With .SeriesCollection.NewSeries
            .Name = "Masuk"
            .Values = ws.Range(ws.Cells(hr + 1, 5), ws.Cells(lastRow, 5))
            .XValues = ws.Range(ws.Cells(hr + 1, 2), ws.Cells(lastRow, 2))
            .Format.Fill.ForeColor.RGB = C_GREEN
        End With
        .ChartGroups(1).GapWidth = 60
        .HasLegend = True
        .Legend.Position = xlLegendPositionTop
    End With
    GayaChart co, "Barang keluar vs masuk"

    ' tabel tren bisa panjang (harian) - grafik minimal 16 baris
    Dim tinggi As Long
    tinggi = lastRow - hr + 1
    If tinggi < 17 Then tinggi = 17
    SeksiTren = hr + tinggi + 2
End Function

Private Function SeksiTop(ws As Worksheet, ByVal row0 As Long, ByVal judul As String, hdr As Variant, keys As Variant, _
                          d As Object, ByVal total As Double, ByVal jenis As String, ByVal namaRng As String, ByVal grafik As Boolean) As Long
    JudulSeksi ws, row0, judul
    Dim hr As Long, r As Long, i As Long, a As Variant
    hr = row0 + 1
    TulisHeader ws, hr, hdr
    r = hr + 1
    If IsArray(keys) Then
        For i = LBound(keys) To UBound(keys)
            a = d(keys(i))
            ws.Cells(r, 2).Value = i - LBound(keys) + 1
            Select Case jenis
                Case "item"
                    ws.Cells(r, 3).Value = a(2)
                    ws.Cells(r, 4).Value = a(0)
                    ws.Cells(r, 5).Value = IIf(total > 0, a(0) / total, 0)
                    ws.Cells(r, 6).Value = a(1)
                Case "dept"
                    ws.Cells(r, 3).Value = keys(i)
                    ws.Cells(r, 4).Value = a(0)
                    ws.Cells(r, 5).Value = IIf(total > 0, a(0) / total, 0)
                    ws.Cells(r, 6).Value = a(1)
                Case "pers"
                    ws.Cells(r, 3).Value = a(3)
                    ws.Cells(r, 4).Value = a(0)
                    ws.Cells(r, 5).Value = a(2)
                    ws.Cells(r, 6).Value = a(1)
            End Select
            r = r + 1
        Next i
    End If
    If r = hr + 1 Then
        ws.Cells(r, 3).Value = "Tidak ada data di periode ini"
        ws.Cells(r, 3).Font.Color = C_MUTED
        r = r + 1
    End If
    Dim lastRow As Long
    lastRow = r - 1
    GayaTabel ws, hr, lastRow, 6
    ws.Range(ws.Cells(hr + 1, 4), ws.Cells(lastRow, 4)).NumberFormat = "#,##0"
    If jenis <> "pers" Then ws.Range(ws.Cells(hr + 1, 5), ws.Cells(lastRow, 5)).NumberFormat = "0.0%"
    ws.Range(ws.Cells(hr + 1, 2), ws.Cells(lastRow, 2)).HorizontalAlignment = xlCenter
    NamaRange namaRng, ws.Range(ws.Cells(hr, 2), ws.Cells(lastRow, 6))

    Dim tinggi As Long
    tinggi = lastRow - hr + 1
    If grafik And IsArray(keys) Then
        Dim co As ChartObject
        Set co = ws.ChartObjects.Add(ws.Cells(hr, 8).Left, ws.Cells(hr, 8).Top, ws.Cells(hr, 14).Left - ws.Cells(hr, 8).Left, 230)
        co.Name = "ch_" & jenis
        With co.Chart
            Do While .SeriesCollection.Count > 0: .SeriesCollection(1).Delete: Loop
            With .SeriesCollection.NewSeries
                .Name = "Unit"
                .Values = ws.Range(ws.Cells(hr + 1, 4), ws.Cells(lastRow, 4))
                .XValues = ws.Range(ws.Cells(hr + 1, 3), ws.Cells(lastRow, 3))
            End With
            If jenis = "dept" Then
                .ChartType = xlDoughnut
                .HasLegend = True
                .Legend.Position = xlLegendPositionRight
                .SeriesCollection(1).HasDataLabels = True
                .SeriesCollection(1).DataLabels.ShowValue = False
                .SeriesCollection(1).DataLabels.ShowPercentage = True
                .SeriesCollection(1).DataLabels.Font.Size = 8
                WarnaiTitik .SeriesCollection(1)
            Else
                .ChartType = xlBarClustered
                .HasLegend = False
                .Axes(xlCategory).ReversePlotOrder = True
                .SeriesCollection(1).Format.Fill.ForeColor.RGB = C_BLUE
                .SeriesCollection(1).HasDataLabels = True
                .SeriesCollection(1).DataLabels.Font.Size = 8
                .ChartGroups(1).GapWidth = 50
            End If
        End With
        GayaChart co, judul
        If tinggi < 17 Then tinggi = 17
    End If
    SeksiTop = hr + tinggi + 2
End Function

Private Function SeksiStok(ws As Worksheet, ByVal row0 As Long, wsMB As Worksheet, itemD As Object, ByVal nDays As Long) As Long
    JudulSeksi ws, row0, "Stok perlu restock (stok " & ChrW(8804) & " " & BatasMin() & ")"
    Dim hr As Long, r As Long, i As Long, lastR As Long, stok As Double, pakai As Double, kode As String
    hr = row0 + 1
    TulisHeader ws, hr, Array("Kode", "Barang", "Stok", "Dipakai periode", "Cukup " & ChrW(177) & " hari")
    r = hr + 1
    lastR = wsMB.Cells(wsMB.Rows.Count, 1).End(xlUp).Row
    Dim mn As Double
    mn = BatasMin()
    For i = 2 To lastR
        kode = Trim(CStr(wsMB.Cells(i, 1).Value))
        If kode <> "" Then
            stok = Val(wsMB.Cells(i, 4).Value)
            If stok <= mn Then
                pakai = 0
                If itemD.Exists(kode) Then pakai = itemD(kode)(0)
                ws.Cells(r, 2).Value = kode
                ws.Cells(r, 3).Value = wsMB.Cells(i, 2).Value
                ws.Cells(r, 4).Value = stok
                ws.Cells(r, 5).Value = pakai
                If pakai > 0 Then
                    ws.Cells(r, 6).Value = Int(IIf(stok < 0, 0, stok) / (pakai / nDays))
                Else
                    ws.Cells(r, 6).Value = "-"
                End If
                If stok <= 0 Then
                    ws.Cells(r, 4).Font.Color = C_RED
                Else
                    ws.Cells(r, 4).Font.Color = C_ORANGE
                End If
                ws.Cells(r, 4).Font.Bold = True
                r = r + 1
            End If
        End If
    Next i
    If r = hr + 1 Then
        ws.Cells(r, 3).Value = ChrW(10003) & " Semua stok di atas batas minimum"
        ws.Cells(r, 3).Font.Color = C_GREEN
        ws.Cells(r, 3).Font.Bold = True
        r = r + 1
    End If
    GayaTabel ws, hr, r - 1, 6
    ws.Range(ws.Cells(hr + 1, 6), ws.Cells(r - 1, 6)).HorizontalAlignment = xlCenter
    NamaRange "LapATK_Stok", ws.Range(ws.Cells(hr, 2), ws.Cells(r - 1, 6))
    SeksiStok = r + 2
End Function

Private Function SeksiRestock(ws As Worksheet, ByVal row0 As Long, rstD As Object, ByVal totIn As Double) As Long
    JudulSeksi ws, row0, "Barang masuk (restock) dalam periode"
    Dim hr As Long, r As Long, i As Long, keys As Variant, a As Variant
    hr = row0 + 1
    TulisHeader ws, hr, Array("#", "Barang", "Unit masuk", "Satuan", "Kali restock")
    r = hr + 1
    keys = UrutTop(rstD, 30)
    If IsArray(keys) Then
        For i = LBound(keys) To UBound(keys)
            a = rstD(keys(i))
            ws.Cells(r, 2).Value = i - LBound(keys) + 1
            ws.Cells(r, 3).Value = a(2)
            ws.Cells(r, 4).Value = a(0)
            ws.Cells(r, 5).Value = a(3)
            ws.Cells(r, 6).Value = a(1)
            r = r + 1
        Next i
    Else
        ws.Cells(r, 3).Value = "Tidak ada restock di periode ini"
        ws.Cells(r, 3).Font.Color = C_MUTED
        r = r + 1
    End If
    GayaTabel ws, hr, r - 1, 6
    ws.Range(ws.Cells(hr + 1, 2), ws.Cells(r - 1, 2)).HorizontalAlignment = xlCenter
    ws.Range(ws.Cells(hr + 1, 4), ws.Cells(r - 1, 4)).NumberFormat = "#,##0"
    NamaRange "LapATK_Restock", ws.Range(ws.Cells(hr, 2), ws.Cells(r - 1, 6))
    SeksiRestock = r + 1
End Function

Private Sub SusunTemuan(t As Collection, itemD As Object, deptD As Object, pers As Object, wd As Object, _
                        ByVal totOut As Double, ByVal prevOut As Double, ByVal nTrx As Long, ByVal nKritis As Long, _
                        ByVal totIn As Double, ByVal dFrom As Date, ByVal dTo As Date)
    If nTrx = 0 Then
        t.Add "Tidak ada permintaan barang pada " & Format(dFrom, "dd/mm/yyyy") & " - " & Format(dTo, "dd/mm/yyyy") & "."
    Else
        t.Add Fmt(nTrx) & " transaksi permintaan dengan total " & Fmt(totOut) & " unit barang keluar" & _
              IIf(prevOut > 0, " (" & PersenBeda(totOut, prevOut) & " dibanding periode sebelumnya).", ".")
        Dim k As Variant, a As Variant
        k = UrutTop(itemD, 3)
        If IsArray(k) Then
            a = itemD(k(0))
            t.Add "Barang paling banyak diminta: " & a(2) & " (" & Fmt(a(0)) & " " & a(3) & ", " & Format(a(0) / totOut, "0%") & " dari total)" & _
                  IIf(UBound(k) >= 1, ", disusul " & itemD(k(1))(2) & IIf(UBound(k) >= 2, " dan " & itemD(k(2))(2), "") & ".", ".")
        End If
        k = UrutTop(deptD, 1)
        If IsArray(k) Then
            a = deptD(k(0))
            t.Add "Departemen dengan permintaan terbanyak: " & k(0) & " (" & Fmt(a(0)) & " unit, " & Format(a(0) / totOut, "0%") & " dari total, " & a(1) & " transaksi)."
        End If
        k = UrutTop(pers, 1)
        If IsArray(k) Then
            a = pers(k(0))
            t.Add "Pemohon paling aktif: " & a(3) & " - " & a(2) & " (" & a(1) & " transaksi, " & Fmt(a(0)) & " unit)."
        End If
        Dim i As Long, best As Long, bestV As Double
        For i = 1 To 7
            If Val(wd(i)) > bestV Then bestV = Val(wd(i)): best = i
        Next i
        If best > 0 Then t.Add "Hari paling sibuk: " & Array("Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")(best - 1) & " (" & Fmt(bestV) & " transaksi)."
    End If
    If totIn > 0 Then t.Add "Barang masuk (restock) " & Fmt(totIn) & " unit di periode ini."
    If nKritis > 0 Then
        t.Add nKritis & " barang stoknya di bawah / sama dengan batas minimum " & ChrW(8212) & " lihat tabel ""Stok perlu restock""."
    Else
        t.Add "Semua stok masih di atas batas minimum."
    End If
End Sub


' ============================================================
' KERANGKA & GAYA
' ============================================================
Private Function SiapkanSheet() As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(SH_REP)
    On Error GoTo 0
    If ws Is Nothing Then
        ' pakai sheet LaporanPivot lama bila ada (diganti nama), lalu hapus PivotData lama
        On Error Resume Next
        Set ws = ThisWorkbook.Sheets("LaporanPivot")
        On Error GoTo 0
        If Not ws Is Nothing Then
            ws.Name = SH_REP
        Else
            Set ws = ThisWorkbook.Sheets.Add(Before:=ThisWorkbook.Sheets(1))
            ws.Name = SH_REP
        End If
        Dim pd As Worksheet
        On Error Resume Next
        Set pd = ThisWorkbook.Sheets("PivotData")
        On Error GoTo 0
        If Not pd Is Nothing Then
            Application.DisplayAlerts = False
            pd.Visible = xlSheetVisible
            pd.Delete
            Application.DisplayAlerts = True
        End If
    End If
    Set SiapkanSheet = ws
End Function

Private Sub BersihkanSheet(ws As Worksheet)
    Dim pt As PivotTable, i As Long
    On Error Resume Next
    For Each pt In ws.PivotTables
        pt.TableRange2.Clear
    Next pt
    On Error GoTo 0
    For i = ws.ChartObjects.Count To 1 Step -1
        ws.ChartObjects(i).Delete
    Next i
    For i = ws.Shapes.Count To 1 Step -1
        ws.Shapes(i).Delete
    Next i
    ws.Cells.UnMerge
    ws.Cells.Clear
    ws.Cells.Font.Name = FONT_UI
    ws.Cells.Font.Size = 10
    ws.Cells.RowHeight = 17
End Sub

Private Sub TulisKerangka(ws As Worksheet, ByVal dFrom As Date, ByVal dTo As Date, ByVal nTrx As Long, ByVal totOut As Double)
    Dim i As Long
    ws.Columns("A").ColumnWidth = 2
    ws.Columns("B").ColumnWidth = 7
    ws.Columns("C").ColumnWidth = 32
    ws.Columns("D").ColumnWidth = 12
    ws.Columns("E").ColumnWidth = 14
    ws.Columns("F").ColumnWidth = 12
    For i = 7 To 13
        ws.Columns(i).ColumnWidth = 11.5
    Next i
    ws.Columns("N").ColumnWidth = 2

    ' judul
    ws.Range("B1:M1").Merge
    ws.Range("B1").Value = "LAPORAN INVENTORY ATK & SEMBAKO"
    With ws.Range("B1:M1")
        .Interior.Color = C_NAVY
        .Font.Color = RGB(255, 255, 255)
        .Font.Size = 18
        .Font.Bold = True
        .VerticalAlignment = xlCenter
        .IndentLevel = 1
    End With
    ws.Rows(1).RowHeight = 40
    ws.Range("B2:M2").Merge
    ws.Range("B2").Value = "Periode " & Format(dFrom, "dd mmmm yyyy") & " s/d " & Format(dTo, "dd mmmm yyyy") & _
                          "  " & ChrW(183) & "  " & (dTo - dFrom + 1) & " hari  " & ChrW(183) & "  General Affairs Frisian Flag Cikarang"
    With ws.Range("B2:M2")
        .Interior.Color = C_NAVY
        .Font.Color = RGB(205, 222, 246)
        .IndentLevel = 1
        .Borders(xlEdgeBottom).Color = C_RED
        .Borders(xlEdgeBottom).Weight = xlThick
    End With
    ws.Rows(2).RowHeight = 22
    ws.Rows(3).RowHeight = 8

    ' panel filter (baris 4)
    ws.Rows(4).RowHeight = 26
    ws.Range("B4").Value = "Dari"
    ws.Range("D4").Value = "Sampai"
    ws.Range("B4,D4").Font.Bold = True
    ws.Range("B4,D4").Font.Color = C_MUTED
    ws.Range("B4,D4").HorizontalAlignment = xlRight
    With ws.Range("C4")
        .Value = dFrom
        .NumberFormat = "dd/mm/yyyy"
    End With
    With ws.Range("E4")
        .Value = dTo
        .NumberFormat = "dd/mm/yyyy"
    End With
    With ws.Range("C4,E4")
        .Interior.Color = RGB(255, 255, 255)
        .Borders.Color = C_BLUE
        .Font.Bold = True
        .Font.Color = C_TEXT
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
        .Locked = False
    End With
    On Error Resume Next
    With ws.Range("C4,E4").Validation
        .Delete
        .Add Type:=xlValidateDate, AlertStyle:=xlValidAlertStop, Operator:=xlBetween, Formula1:=CStr(CLng(DateSerial(2000, 1, 1))), Formula2:=CStr(CLng(DateSerial(2100, 12, 31)))
        .ErrorMessage = "Isi tanggal dengan format dd/mm/yyyy"
    End With
    On Error GoTo 0

    Tombol ws, "btnTerapkan", ws.Range("F4"), "Terapkan", "LapATK_Terapkan", C_BLUE, True
    Tombol ws, "btnBulanIni", ws.Range("G4"), "Bulan ini", "LapATK_BulanIni", RGB(255, 255, 255), False
    Tombol ws, "btnBulanLalu", ws.Range("H4"), "Bulan lalu", "LapATK_BulanLalu", RGB(255, 255, 255), False
    Tombol ws, "btn3Bulan", ws.Range("I4"), "3 bulan", "LapATK_3Bulan", RGB(255, 255, 255), False
    Tombol ws, "btnTahunIni", ws.Range("J4"), "Tahun ini", "LapATK_TahunIni", RGB(255, 255, 255), False
    Tombol ws, "btnSemua", ws.Range("K4"), "Semua", "LapATK_Semua", RGB(255, 255, 255), False
    Tombol ws, "btnPDF", ws.Range("L4"), "Export PDF", "LapATK_ExportPDF", C_RED, True
    Tombol ws, "btnPPT", ws.Range("M4"), "Export PPT", "LapATK_ExportPPT", C_ORANGE, True
    ws.Range("B5:M5").Merge
    ws.Range("B5").Value = "Ubah tanggal Dari / Sampai lalu klik Terapkan, atau pilih tombol periode cepat."
    ws.Range("B5").Font.Size = 8.5
    ws.Range("B5").Font.Color = C_MUTED
    ws.Rows(6).RowHeight = 6
End Sub

Private Sub Tombol(ws As Worksheet, ByVal nm As String, cel As Range, ByVal teks As String, ByVal macroName As String, _
                   ByVal warna As Long, ByVal utama As Boolean)
    Dim s As Shape
    Set s = ws.Shapes.AddShape(msoShapeRoundedRectangle, cel.Left + 2, cel.Top + 3, cel.Width - 4, cel.Height - 6)
    s.Name = nm
    s.Adjustments(1) = 0.25
    s.Fill.Solid
    s.Fill.ForeColor.RGB = warna
    s.Line.Visible = msoTrue
    s.Line.ForeColor.RGB = IIf(utama, warna, C_LINE)
    s.Line.Weight = 0.75
    s.Shadow.Visible = msoFalse
    s.Placement = xlMove
    s.OnAction = macroName
    With s.TextFrame2
        .MarginLeft = 2: .MarginRight = 2: .MarginTop = 0: .MarginBottom = 0
        .VerticalAnchor = msoAnchorMiddle
        .WordWrap = msoFalse
        .TextRange.Text = teks
        .TextRange.ParagraphFormat.Alignment = msoAlignCenter
        .TextRange.Font.Name = FONT_UI
        .TextRange.Font.Size = 9
        .TextRange.Font.Bold = msoTrue
        .TextRange.Font.Fill.ForeColor.RGB = IIf(utama, RGB(255, 255, 255), C_TEXT)
    End With
End Sub

Private Sub TulisKPI(ws As Worksheet, ByVal row0 As Long, kl() As String, kv() As String, ks() As String, kc() As Long)
    Dim x0 As Single, x1 As Single, y0 As Single, h As Single, w As Single, gap As Single, i As Long
    ws.Rows(row0).Resize(4).RowHeight = 17
    x0 = ws.Cells(row0, 2).Left
    x1 = ws.Cells(row0, 14).Left
    y0 = ws.Cells(row0, 2).Top
    h = ws.Cells(row0 + 4, 2).Top - y0
    gap = 8
    w = (x1 - x0 - gap * 5) / 6
    For i = 1 To 6
        Dim s As Shape, b As Shape
        Set s = ws.Shapes.AddShape(msoShapeRoundedRectangle, x0 + (i - 1) * (w + gap), y0, w, h)
        s.Name = "kpi" & i
        s.Adjustments(1) = 0.1
        s.Fill.Solid
        s.Fill.ForeColor.RGB = RGB(255, 255, 255)
        s.Line.ForeColor.RGB = C_LINE
        s.Line.Weight = 0.75
        s.Shadow.Visible = msoFalse
        s.Placement = xlMove
        s.OnAction = "LapATK_Diam"
        With s.TextFrame2
            .MarginLeft = 12: .MarginRight = 6: .MarginTop = 6: .MarginBottom = 4
            .VerticalAnchor = msoAnchorTop
            .WordWrap = msoTrue
            .TextRange.Text = kl(i) & vbCr & kv(i) & vbCr & ks(i)
            .TextRange.Font.Name = FONT_UI
            .TextRange.Font.Fill.ForeColor.RGB = C_MUTED
            .TextRange.Paragraphs(1).Font.Size = 8
            .TextRange.Paragraphs(1).Font.Bold = msoTrue
            .TextRange.Paragraphs(2).Font.Size = 16
            .TextRange.Paragraphs(2).Font.Bold = msoTrue
            .TextRange.Paragraphs(2).Font.Fill.ForeColor.RGB = kc(i)
            .TextRange.Paragraphs(3).Font.Size = 8
        End With
        Set b = ws.Shapes.AddShape(msoShapeRectangle, x0 + (i - 1) * (w + gap), y0 + 4, 4, h - 8)
        b.Name = "kpibar" & i
        b.Fill.Solid
        b.Fill.ForeColor.RGB = kc(i)
        b.Line.Visible = msoFalse
        b.Placement = xlMove
        b.OnAction = "LapATK_Diam"
    Next i
End Sub

Private Sub JudulSeksi(ws As Worksheet, ByVal r As Long, ByVal t As String)
    ws.Range(ws.Cells(r, 2), ws.Cells(r, 13)).Merge
    ws.Cells(r, 2).Value = UCase(t)
    With ws.Range(ws.Cells(r, 2), ws.Cells(r, 13))
        .Font.Bold = True
        .Font.Size = 11
        .Font.Color = C_NAVY
        .Borders(xlEdgeBottom).Color = C_RED
        .Borders(xlEdgeBottom).Weight = xlMedium
        .VerticalAlignment = xlBottom
    End With
    ws.Rows(r).RowHeight = 24
End Sub

Private Sub TulisHeader(ws As Worksheet, ByVal r As Long, hdr As Variant)
    Dim i As Long, c As Long
    c = 2
    For i = LBound(hdr) To UBound(hdr)
        If UBound(hdr) - LBound(hdr) = 2 And i = LBound(hdr) Then
            ws.Cells(r, c).Value = hdr(i)
            ws.Range(ws.Cells(r, c), ws.Cells(r, c + 1)).Merge
            c = c + 2
        Else
            ws.Cells(r, c).Value = hdr(i)
            c = c + 1
        End If
    Next i
    With ws.Range(ws.Cells(r, 2), ws.Cells(r, c - 1))
        .Interior.Color = C_BLUE
        .Font.Color = RGB(255, 255, 255)
        .Font.Bold = True
        .Font.Size = 9
        .HorizontalAlignment = xlCenter
        .VerticalAlignment = xlCenter
    End With
    ws.Rows(r).RowHeight = 20
End Sub

Private Sub GayaTabel(ws As Worksheet, ByVal hr As Long, ByVal lastRow As Long, ByVal lastCol As Long)
    Dim r As Long
    For r = hr + 1 To lastRow
        If (r - hr) Mod 2 = 0 Then ws.Range(ws.Cells(r, 2), ws.Cells(r, lastCol)).Interior.Color = C_SOFT
    Next r
    With ws.Range(ws.Cells(hr, 2), ws.Cells(lastRow, lastCol))
        .Borders(xlInsideHorizontal).Color = C_LINE
        .Borders(xlEdgeBottom).Color = C_LINE
        .Borders(xlEdgeTop).Color = C_BLUE
        .VerticalAlignment = xlCenter
    End With
    If lastRow > hr Then
        ws.Range(ws.Cells(hr + 1, 4), ws.Cells(lastRow, lastCol)).HorizontalAlignment = xlCenter
        ws.Range(ws.Cells(hr + 1, 3), ws.Cells(lastRow, 3)).HorizontalAlignment = xlLeft
    End If
End Sub

Private Sub GayaChart(co As ChartObject, ByVal judul As String)
    On Error Resume Next
    With co.Chart
        .HasTitle = True
        .ChartTitle.Text = judul
        .ChartTitle.Font.Size = 11
        .ChartTitle.Font.Bold = True
        .ChartTitle.Font.Color = C_TEXT
        .ChartArea.Format.Line.ForeColor.RGB = C_LINE
        .ChartArea.Font.Name = FONT_UI
        .ChartArea.Font.Color = C_MUTED
        .ChartArea.RoundedCorners = True
        .Axes(xlValue).MajorGridlines.Format.Line.ForeColor.RGB = C_LINE
        .Axes(xlValue).Format.Line.Visible = msoFalse
        .Axes(xlCategory).TickLabels.Font.Size = 8
        .Axes(xlValue).TickLabels.Font.Size = 8
    End With
    co.Placement = xlMove
    On Error GoTo 0
End Sub

Private Sub WarnaiTitik(sr As Series)
    Dim pal, i As Long
    pal = Array(C_BLUE, C_GREEN, C_ORANGE, C_PURPLE, C_RED, C_NAVY, RGB(0, 150, 170), RGB(200, 160, 0), RGB(120, 120, 140), RGB(160, 90, 60), RGB(80, 160, 230), RGB(100, 190, 120))
    On Error Resume Next
    For i = 1 To sr.Points.Count
        sr.Points(i).Format.Fill.ForeColor.RGB = pal((i - 1) Mod (UBound(pal) + 1))
    Next i
    On Error GoTo 0
End Sub


' ============================================================
' SHEET DETAIL
' ============================================================
Private Function SheetDetail() As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(SH_DET)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        ws.Name = SH_DET
    End If
    If ws.AutoFilterMode Then ws.AutoFilterMode = False
    ws.Cells.UnMerge
    ws.Cells.Clear
    ws.Cells.Font.Name = FONT_UI
    ws.Cells.Font.Size = 10
    Set SheetDetail = ws
End Function

Private Sub FinalisasiDetail(ws As Worksheet, ByVal lastRow As Long, ByVal dFrom As Date, ByVal dTo As Date)
    ws.Range("A1:J1").Merge
    ws.Range("A1").Value = "DETAIL TRANSAKSI PERMINTAAN ATK"
    With ws.Range("A1:J1")
        .Interior.Color = C_NAVY
        .Font.Color = RGB(255, 255, 255)
        .Font.Bold = True
        .Font.Size = 14
        .IndentLevel = 1
    End With
    ws.Rows(1).RowHeight = 30
    ws.Range("A2:J2").Merge
    ws.Range("A2").Value = "Periode " & Format(dFrom, "dd/mm/yyyy") & " s/d " & Format(dTo, "dd/mm/yyyy") & "  " & ChrW(183) & "  " & IIf(lastRow >= 5, lastRow - 4, 0) & " baris"
    ws.Range("A2").Font.Color = C_MUTED
    ws.Range("A4:J4").Value = Array("Tanggal", "Request ID", "Nama", "NIK", "Departemen", "Kode", "Barang", "Jumlah", "Satuan", "Helper")
    With ws.Range("A4:J4")
        .Interior.Color = C_BLUE
        .Font.Color = RGB(255, 255, 255)
        .Font.Bold = True
    End With
    If lastRow < 5 Then lastRow = 5
    ws.Range("A5:A" & lastRow).NumberFormat = "dd/mm/yyyy"
    ws.Range("A4:J" & lastRow).Borders(xlInsideHorizontal).Color = C_LINE
    ws.Range("A4:J" & lastRow).AutoFilter
    ws.Columns("A:J").AutoFit
    ws.Columns("A").ColumnWidth = 12
    On Error Resume Next
    With ws.PageSetup
        .PrintTitleRows = "$4:$4"
        .Orientation = xlLandscape
        .Zoom = False
        .FitToPagesWide = 1
        .FitToPagesTall = False
        .CenterFooter = "Halaman &P dari &N"
    End With
    On Error GoTo 0
End Sub


' ============================================================
' EXPORT PDF & PPT
' ============================================================
Public Sub LapATK_ExportPDF()
    Dim ws As Worksheet, f As String, dFrom As Date, dTo As Date
    On Error GoTo Gagal
    Set ws = ThisWorkbook.Sheets(SH_REP)
    If Not BacaFilter(ws, dFrom, dTo) Then dFrom = Date: dTo = Date
    f = FolderSimpan() & "\Laporan_ATK_" & Format(dFrom, "yyyymmdd") & "-" & Format(dTo, "yyyymmdd") & ".pdf"

    Dim ikutDetail As VbMsgBoxResult
    ikutDetail = MsgBox("Sertakan lampiran DETAIL TRANSAKSI di PDF?" & vbCrLf & "(Yes = laporan + detail, No = laporan saja)", vbQuestion + vbYesNoCancel, "Export PDF")
    If ikutDetail = vbCancel Then Exit Sub

    If ikutDetail = vbYes Then
        ThisWorkbook.Sheets(Array(SH_REP, SH_DET)).Select
        ActiveSheet.ExportAsFixedFormat Type:=xlTypePDF, Filename:=f, Quality:=xlQualityStandard, _
            IncludeDocProperties:=True, IgnorePrintAreas:=False, OpenAfterPublish:=True
        ws.Select
    Else
        ws.ExportAsFixedFormat Type:=xlTypePDF, Filename:=f, Quality:=xlQualityStandard, _
            IncludeDocProperties:=True, IgnorePrintAreas:=False, OpenAfterPublish:=True
    End If
    Exit Sub
Gagal:
    MsgBox "Gagal export PDF: " & Err.Description & vbCrLf & "Pastikan laporan sudah dibuat dan file PDF lama tidak sedang dibuka.", vbCritical, "Export PDF"
End Sub

Public Sub LapATK_ExportPPT()
    Dim ws As Worksheet, dFrom As Date, dTo As Date
    Dim ppt As Object, pres As Object, sld As Object
    Dim f As String, tmp As String, per As String, n As Long

    On Error GoTo Gagal
    Set ws = ThisWorkbook.Sheets(SH_REP)
    If Not BacaFilter(ws, dFrom, dTo) Then dFrom = Date: dTo = Date
    per = Format(dFrom, "dd mmm yyyy") & " - " & Format(dTo, "dd mmm yyyy")
    f = FolderSimpan() & "\Laporan_ATK_" & Format(dFrom, "yyyymmdd") & "-" & Format(dTo, "yyyymmdd") & ".pptx"
    tmp = Environ("TEMP")

    Application.StatusBar = "Membuat PowerPoint..."
    On Error Resume Next
    Set ppt = CreateObject("PowerPoint.Application")
    On Error GoTo Gagal
    If ppt Is Nothing Then
        MsgBox "PowerPoint tidak ditemukan di komputer ini.", vbCritical, "Export PPT"
        Exit Sub
    End If
    Set pres = ppt.Presentations.Add(-1)
    pres.PageSetup.SlideWidth = 960
    pres.PageSetup.SlideHeight = 540

    ' 1) cover
    Set sld = pres.Slides.Add(1, 12)
    sld.FollowMasterBackground = 0
    sld.Background.Fill.Solid
    sld.Background.Fill.ForeColor.RGB = C_NAVY
    PKotak sld, 0, 400, 960, 6, C_RED
    PTeks sld, 60, 150, 840, 60, "Laporan Inventory ATK & Sembako", 36, True, RGB(255, 255, 255)
    PTeks sld, 60, 215, 840, 30, "Periode " & per, 18, False, RGB(205, 222, 246)
    PTeks sld, 60, 420, 840, 24, "General Affairs  " & ChrW(183) & "  PT Frisian Flag Indonesia " & ChrW(8212) & " Plant Cikarang", 13, False, RGB(205, 222, 246)
    PTeks sld, 60, 446, 840, 22, "Dibuat " & Format(Now, "dd mmmm yyyy"), 11, False, RGB(160, 180, 210)
    n = 1

    ' 2) ringkasan: KPI + temuan
    n = n + 1
    Set sld = SlideIsi(pres, n, "Ringkasan", per)
    Dim kpi As Range, i As Long, x As Single, w As Single
    Set kpi = ThisWorkbook.Names("LapATK_KPI").RefersToRange
    w = (880 - 5 * 12) / 6
    For i = 1 To 6
        x = 40 + (i - 1) * (w + 12)
        Dim c As Object
        Set c = sld.Shapes.AddShape(5, x, 92, w, 92)
        c.Fill.ForeColor.RGB = RGB(255, 255, 255)
        c.Line.ForeColor.RGB = C_LINE
        c.Adjustments(1) = 0.08
        PKotak sld, x, 98, 4, 80, CLng(kpi.Cells(i, 4).Value)
        PTeks sld, x + 12, 100, w - 16, 16, CStr(kpi.Cells(i, 1).Value), 9, True, C_MUTED
        PTeks sld, x + 12, 118, w - 16, 30, CStr(kpi.Cells(i, 2).Value), 20, True, CLng(kpi.Cells(i, 4).Value)
        PTeks sld, x + 12, 152, w - 16, 28, CStr(kpi.Cells(i, 3).Value), 9, False, C_MUTED
    Next i
    Dim tem As Range, s As String
    Set tem = ThisWorkbook.Names("LapATK_Temuan").RefersToRange
    s = ""
    For i = 1 To tem.Rows.Count
        If Trim(tem.Cells(i, 1).Value) <> "" Then s = s & IIf(s = "", "", vbCr) & Mid(tem.Cells(i, 1).Value, 4)
    Next i
    PTeks sld, 40, 204, 880, 20, "TEMUAN UTAMA", 11, True, C_NAVY
    Dim tb As Object
    Set tb = PTeks(sld, 40, 228, 880, 260, s, 13, False, C_TEXT)
    tb.TextFrame.TextRange.ParagraphFormat.Bullet.Visible = -1
    tb.TextFrame.TextRange.ParagraphFormat.SpaceAfter = 6

    ' 3) grafik tren
    n = n + 1
    Set sld = SlideIsi(pres, n, "Tren barang keluar vs masuk", per)
    PGrafik sld, ws, "chTren", tmp & "\lapatk_tren.png", 40, 86, 880, 400

    ' 4) top barang
    n = n + 1
    Set sld = SlideIsi(pres, n, "Top 10 barang paling banyak diminta", per)
    PGrafik sld, ws, "ch_item", tmp & "\lapatk_item.png", 40, 86, 470, 400
    PTabel sld, ThisWorkbook.Names("LapATK_Top").RefersToRange, 530, 86, 390, 11

    ' 5) departemen
    n = n + 1
    Set sld = SlideIsi(pres, n, "Permintaan per departemen", per)
    PGrafik sld, ws, "ch_dept", tmp & "\lapatk_dept.png", 40, 86, 470, 400
    PTabel sld, ThisWorkbook.Names("LapATK_Dept").RefersToRange, 530, 86, 390, 13

    ' 6) pemohon
    n = n + 1
    Set sld = SlideIsi(pres, n, "Top 10 pemohon", per)
    PTabel sld, ThisWorkbook.Names("LapATK_Pemohon").RefersToRange, 40, 86, 880, 11

    ' 7) stok
    n = n + 1
    Set sld = SlideIsi(pres, n, "Stok perlu restock", per)
    PTabel sld, ThisWorkbook.Names("LapATK_Stok").RefersToRange, 40, 86, 880, 14

    ' 8) restock
    n = n + 1
    Set sld = SlideIsi(pres, n, "Barang masuk (restock) dalam periode", per)
    PTabel sld, ThisWorkbook.Names("LapATK_Restock").RefersToRange, 40, 86, 880, 14

    pres.SaveAs f
    ppt.Visible = -1
    Application.StatusBar = False
    MsgBox "PowerPoint tersimpan:" & vbCrLf & f, vbInformation, "Export PPT"
    Exit Sub
Gagal:
    Application.StatusBar = False
    MsgBox "Gagal export PPT: " & Err.Description & vbCrLf & "Pastikan laporan sudah dibuat (klik REPORT / Terapkan dulu) dan file PPT lama tidak sedang dibuka.", vbCritical, "Export PPT"
End Sub

Private Function SlideIsi(pres As Object, ByVal idx As Long, ByVal judul As String, ByVal per As String) As Object
    Dim sld As Object
    Set sld = pres.Slides.Add(idx, 12)
    sld.FollowMasterBackground = 0
    sld.Background.Fill.Solid
    sld.Background.Fill.ForeColor.RGB = RGB(238, 243, 249)
    PKotak sld, 0, 0, 960, 64, C_NAVY
    PKotak sld, 0, 64, 960, 4, C_RED
    PTeks sld, 40, 16, 700, 34, judul, 22, True, RGB(255, 255, 255)
    PTeks sld, 600, 24, 320, 20, per, 11, False, RGB(205, 222, 246)
    sld.Shapes(sld.Shapes.Count).TextFrame.TextRange.ParagraphFormat.Alignment = 3
    PTeks sld, 40, 508, 700, 18, "Inventory ATK & Sembako  " & ChrW(183) & "  GA Frisian Flag Cikarang", 9, False, C_MUTED
    PTeks sld, 820, 508, 100, 18, CStr(idx), 9, True, C_MUTED
    sld.Shapes(sld.Shapes.Count).TextFrame.TextRange.ParagraphFormat.Alignment = 3
    Set SlideIsi = sld
End Function

Private Sub PKotak(sld As Object, ByVal x As Single, ByVal y As Single, ByVal w As Single, ByVal h As Single, ByVal warna As Long)
    Dim s As Object
    Set s = sld.Shapes.AddShape(1, x, y, w, h)
    s.Fill.ForeColor.RGB = warna
    s.Line.Visible = 0
End Sub

Private Function PTeks(sld As Object, ByVal x As Single, ByVal y As Single, ByVal w As Single, ByVal h As Single, _
                       ByVal t As String, ByVal size As Single, ByVal tebal As Boolean, ByVal warna As Long) As Object
    Dim s As Object
    Set s = sld.Shapes.AddTextbox(1, x, y, w, h)
    With s.TextFrame
        .WordWrap = -1
        .MarginLeft = 0: .MarginRight = 0: .MarginTop = 0: .MarginBottom = 0
        .TextRange.Text = t
        .TextRange.Font.Name = FONT_UI
        .TextRange.Font.Size = size
        .TextRange.Font.Bold = IIf(tebal, -1, 0)
        .TextRange.Font.Color.RGB = warna
    End With
    Set PTeks = s
End Function

Private Sub PGrafik(sld As Object, ws As Worksheet, ByVal chName As String, ByVal file As String, _
                    ByVal x As Single, ByVal y As Single, ByVal w As Single, ByVal h As Single)
    Dim co As ChartObject
    On Error Resume Next
    Set co = ws.ChartObjects(chName)
    On Error GoTo 0
    If co Is Nothing Then
        PTeks sld, x, y + 20, w, 30, "Tidak ada data grafik di periode ini.", 14, False, C_MUTED
        Exit Sub
    End If
    co.Chart.Export file, "PNG"
    Dim p As Object, sc As Single
    Set p = sld.Shapes.AddPicture(file, 0, -1, x, y)
    sc = w / p.Width
    If p.Height * sc > h Then sc = h / p.Height
    p.LockAspectRatio = -1
    p.Width = p.Width * sc
    On Error Resume Next
    Kill file
End Sub

Private Sub PTabel(sld As Object, rng As Range, ByVal x As Single, ByVal y As Single, ByVal w As Single, ByVal maxRows As Long)
    Dim nr As Long, nc As Long, r As Long, c As Long, shp As Object, tbl As Object, v As Variant
    nr = rng.Rows.Count
    If nr > maxRows Then nr = maxRows
    nc = rng.Columns.Count
    Set shp = sld.Shapes.AddTable(nr, nc, x, y, w, nr * 26)
    Set tbl = shp.Table
    For r = 1 To nr
        For c = 1 To nc
            v = rng.Cells(r, c).Text
            With tbl.Cell(r, c).Shape
                .TextFrame.TextRange.Text = CStr(v)
                .TextFrame.TextRange.Font.Name = FONT_UI
                .TextFrame.TextRange.Font.Size = IIf(r = 1, 10, 11)
                .TextFrame.TextRange.Font.Bold = IIf(r = 1, -1, 0)
                .TextFrame.TextRange.Font.Color.RGB = IIf(r = 1, RGB(255, 255, 255), C_TEXT)
                .TextFrame.MarginTop = 3: .TextFrame.MarginBottom = 3
                If r = 1 Then
                    .Fill.ForeColor.RGB = C_BLUE
                ElseIf r Mod 2 = 1 Then
                    .Fill.ForeColor.RGB = C_SOFT
                Else
                    .Fill.ForeColor.RGB = RGB(255, 255, 255)
                End If
                If c <> 2 Then .TextFrame.TextRange.ParagraphFormat.Alignment = 2
            End With
        Next c
    Next r
    ' kolom nama lebih lebar
    On Error Resume Next
    Dim sisa As Single
    tbl.Columns(1).Width = w * 0.08
    tbl.Columns(2).Width = w * 0.44
    sisa = (w - w * 0.52) / (nc - 2)
    For c = 3 To nc
        tbl.Columns(c).Width = sisa
    Next c
    On Error GoTo 0
End Sub


' ============================================================
' HELPER DATA
' ============================================================
Private Function NewDict() As Object
    Set NewDict = CreateObject("Scripting.Dictionary")
    NewDict.CompareMode = vbTextCompare
End Function

' Tanggal transaksi: dari ID (REQ-/UPD-yyyymmdd...) - paling akurat; kalau gagal dari kolom Tanggal
Private Function TanggalBaris(ByVal id As String, ByVal v As Variant, ByRef hasil As Date) As Boolean
    Dim p As Long, dg As String, s As String, parts() As String
    p = InStr(id, "-")
    If p > 0 Then
        dg = Mid(id, p + 1, 8)
        If Len(dg) = 8 And IsNumeric(dg) Then
            If Val(Mid(dg, 5, 2)) >= 1 And Val(Mid(dg, 5, 2)) <= 12 And Val(Mid(dg, 7, 2)) >= 1 And Val(Mid(dg, 7, 2)) <= 31 Then
                hasil = DateSerial(Val(Left(dg, 4)), Val(Mid(dg, 5, 2)), Val(Mid(dg, 7, 2)))
                TanggalBaris = True
                Exit Function
            End If
        End If
    End If
    If VarType(v) = vbDate Then hasil = DateValue(v): TanggalBaris = True: Exit Function
    s = Trim(CStr(v))
    If s Like "####-##-##" Then
        hasil = DateSerial(Val(Left(s, 4)), Val(Mid(s, 6, 2)), Val(Mid(s, 9, 2)))
        TanggalBaris = True
        Exit Function
    End If
    If s Like "*/*/*" Then
        parts = Split(s, "/")
        If UBound(parts) = 2 Then
            If IsNumeric(parts(0)) And IsNumeric(parts(1)) And IsNumeric(parts(2)) Then
                Dim y As Long
                y = Val(parts(2)): If y < 100 Then y = y + 2000
                hasil = DateSerial(y, Val(parts(1)), Val(parts(0)))
                TanggalBaris = True
            End If
        End If
    End If
End Function

Private Function RentangData(ByRef mn As Date, ByRef mx As Date) As Boolean
    Dim ws As Worksheet, r As Long, t As Date, first As Boolean
    Set ws = ThisWorkbook.Sheets(SH_REQ)
    first = True
    For r = 2 To ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        If Trim(CStr(ws.Cells(r, 1).Value)) <> "" Then
            If TanggalBaris(CStr(ws.Cells(r, 1).Value), ws.Cells(r, 2).Value, t) Then
                If first Then mn = t: mx = t: first = False
                If t < mn Then mn = t
                If t > mx Then mx = t
            End If
        End If
    Next r
    RentangData = Not first
End Function

Private Function BacaFilter(ws As Worksheet, ByRef dFrom As Date, ByRef dTo As Date) As Boolean
    Dim a As Variant, b As Variant
    a = ws.Range("C4").Value
    b = ws.Range("E4").Value
    If VarType(a) = vbDate And VarType(b) = vbDate Then
        dFrom = DateValue(a): dTo = DateValue(b)
        BacaFilter = True
    ElseIf IsDate(a) And IsDate(b) Then
        Dim ok1 As Boolean, ok2 As Boolean
        ok1 = TanggalBaris("", a, dFrom)
        ok2 = TanggalBaris("", b, dTo)
        BacaFilter = ok1 And ok2
    End If
End Function

Private Function KunciBucket(ByVal d As Date, ByVal harian As Boolean) As String
    If harian Then
        KunciBucket = Format(d, "yyyymmdd")
    Else
        KunciBucket = Format(d, "yyyymm")
    End If
End Function

Private Function LabelBucket(ByVal k As String, ByVal harian As Boolean) As String
    Dim bln
    bln = Array("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")
    If harian Then
        LabelBucket = Right(k, 2) & " " & bln(Val(Mid(k, 5, 2)) - 1)
    Else
        LabelBucket = bln(Val(Right(k, 2)) - 1) & " " & Left(k, 4)
    End If
End Function

' Urutkan key dictionary berdasarkan elemen (0) terbesar, ambil n teratas
Private Function UrutTop(d As Object, ByVal n As Long) As Variant
    If d.Count = 0 Then UrutTop = Empty: Exit Function
    Dim ks As Variant, i As Long, j As Long, tmp As Variant
    ks = d.Keys
    For i = 0 To UBound(ks) - 1
        For j = i + 1 To UBound(ks)
            If d(ks(j))(0) > d(ks(i))(0) Then tmp = ks(i): ks(i) = ks(j): ks(j) = tmp
        Next j
        If i >= n Then Exit For
    Next i
    If UBound(ks) + 1 > n Then ReDim Preserve ks(0 To n - 1)
    UrutTop = ks
End Function

Private Function JumlahBarang(wsMB As Worksheet) As Long
    JumlahBarang = Application.WorksheetFunction.CountA(wsMB.Range("A2:A20000"))
End Function

Private Function BatasMin() As Double
    BatasMin = 5
    On Error Resume Next
    Dim v As Variant
    v = ThisWorkbook.Sheets("RB_Data").Range("B10").Value
    If IsNumeric(v) And Not IsEmpty(v) Then BatasMin = CDbl(v)
End Function

Private Function HitungKritis(wsMB As Worksheet) As Long
    Dim r As Long, mn As Double
    mn = BatasMin()
    For r = 2 To wsMB.Cells(wsMB.Rows.Count, 1).End(xlUp).Row
        If Trim(CStr(wsMB.Cells(r, 1).Value)) <> "" Then
            If Val(wsMB.Cells(r, 4).Value) <= mn Then HitungKritis = HitungKritis + 1
        End If
    Next r
End Function

Private Function Fmt(ByVal v As Double) As String
    Fmt = Format(v, "#,##0")
End Function

Private Function PersenBeda(ByVal cur As Double, ByVal prev As Double) As String
    If prev = 0 Then PersenBeda = "baru": Exit Function
    Dim p As Double
    p = (cur - prev) / prev
    PersenBeda = IIf(p >= 0, "naik ", "turun ") & Format(Abs(p), "0%")
End Function

Private Function Banding(ByVal cur As Double, ByVal prev As Double, ByVal teks As String) As String
    If prev = 0 And cur = 0 Then
        Banding = "sama dgn " & teks
    ElseIf prev = 0 Then
        Banding = "periode lalu: 0"
    Else
        Banding = IIf(cur >= prev, ChrW(9650) & " ", ChrW(9660) & " ") & Format(Abs((cur - prev) / prev), "0%") & " vs " & teks
    End If
End Function

Private Sub NamaRange(ByVal nm As String, rng As Range)
    On Error Resume Next
    ThisWorkbook.Names(nm).Delete
    On Error GoTo 0
    ThisWorkbook.Names.Add Name:=nm, RefersTo:="='" & rng.Worksheet.Name & "'!" & rng.Address
End Sub

Private Function FolderSimpan() As String
    If ThisWorkbook.Path <> "" And LCase(Left(ThisWorkbook.Path, 4)) <> "http" Then
        FolderSimpan = ThisWorkbook.Path
    Else
        FolderSimpan = Environ("USERPROFILE") & "\Documents"
    End If
End Function
