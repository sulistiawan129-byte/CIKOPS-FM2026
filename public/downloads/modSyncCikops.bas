Attribute VB_Name = "modSyncCikops"
Option Explicit

' ============================================================
' modSyncCikops  (versi 2 - SINKRON DUA ARAH)
'
' Excel ATK  <->  CIKOPS (Supabase)
'
'   KIRIM  (Excel -> CIKOPS): stok MasterBarang, TransaksiPermintaan,
'          dan Restock di TransaksiUpdateBarang - sama seperti dulu.
'   TARIK  (CIKOPS -> Excel): permintaan, restock, dan barang baru yang
'          diinput lewat CIKOPS dimasukkan ke sheet Excel, stok di
'          MasterBarang ikut disesuaikan. Baris yang sudah ada tidak
'          dimasukkan dua kali (dicek dari ID + kode barang).
'
' TOMBOL (Insert -> Shape -> klik kanan -> Assign Macro):
'   SyncToCikops        -> TARIK lalu KIRIM semuanya (disarankan)
'   TarikDariCikops     -> hanya TARIK transaksi dari CIKOPS
'   SyncStokOnly / SyncPermintaanOnly / SyncRestockOnly -> seperti dulu
'
' CARA PASANG / UPDATE:
'   1. Alt+F11 -> hapus modul modSyncCikops yang lama
'      (klik kanan -> Remove), lalu File -> Import File -> pilih file ini.
'   2. Isi 3 konstanta di bagian KONFIGURASI:
'      - SUPABASE_URL dan SUPABASE_ANON_KEY (sama seperti dulu)
'      - CIKOPS_SYNC_KEY: salin dari CIKOPS -> menu ATK -> tab
'        "Sinkron Excel" (hanya admin yang bisa melihat), atau dari
'        hasil SQL 026_atk_dua_arah.sql.
'   3. Buat tombol "Tarik dari CIKOPS" (opsional) - SyncToCikops sudah
'      otomatis menarik dulu sebelum mengirim.
'
' Struktur sheet yang dipakai (sama dengan modSystem):
'   MasterBarang          : A Kode | B Nama | C Satuan | D Stok
'   TransaksiPermintaan   : A RequestID | B Tanggal | C Nama | D NIK |
'                           E Departemen | F Kode | G Nama Barang |
'                           H Jumlah | I Satuan | J Helper | K Synced
'   TransaksiUpdateBarang : A UpdateID | B Tanggal | C JenisTransaksi |
'                           D Kode | E Nama Barang | F Jumlah | G Satuan |
'                           H Nama | I NIK | J Departemen | K Synced
'
' KEAMANAN: anon key hanya bisa menulis lewat fungsi khusus. Menarik
' data dari CIKOPS butuh CIKOPS_SYNC_KEY - jangan bagikan file ini ke
' orang lain. Kalau kunci bocor, admin bisa membuat kunci baru di
' CIKOPS (tab Sinkron Excel -> Ganti kunci) lalu isi ulang di sini.
' ============================================================

' -- KONFIGURASI --
Private Const SUPABASE_URL As String = "https://xxxxxxxxxxxx.supabase.co"
Private Const SUPABASE_ANON_KEY As String = "isi-anon-key-di-sini"
Private Const CIKOPS_SYNC_KEY As String = "isi-kunci-sinkron-dari-cikops"

Private Const SH_MASTER As String = "MasterBarang"
Private Const SH_PERMINTAAN As String = "TransaksiPermintaan"
Private Const SH_UPDATE As String = "TransaksiUpdateBarang"
Private Const SYNCED_COL As Long = 11 ' kolom K


' ============================================================
' TOMBOL
' ============================================================
Public Sub SyncToCikops()
    On Error GoTo ErrHandler
    Application.ScreenUpdating = False

    Dim tarik As String
    Application.StatusBar = "CIKOPS: menarik transaksi dari CIKOPS..."
    tarik = TarikTransaksi()

    Dim nStok As Long, nReq As Long, nRestock As Long
    Application.StatusBar = "CIKOPS: mengirim stok..."
    nStok = SyncStokBarang()
    Application.StatusBar = "CIKOPS: mengirim permintaan..."
    nReq = SyncPermintaan()
    Application.StatusBar = "CIKOPS: mengirim restock..."
    nRestock = SyncRestock()

    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Sinkronisasi dua arah selesai." & vbCrLf & vbCrLf & _
           "TARIK dari CIKOPS" & vbCrLf & tarik & vbCrLf & vbCrLf & _
           "KIRIM ke CIKOPS" & vbCrLf & _
           "  Stok barang diperbarui : " & nStok & " item" & vbCrLf & _
           "  Permintaan terkirim    : " & nReq & " baris" & vbCrLf & _
           "  Restock terkirim       : " & nRestock & " baris", _
           vbInformation, "Sinkron CIKOPS"
    Exit Sub
ErrHandler:
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Gagal sinkron: " & Err.Description, vbCritical, "Sinkron CIKOPS - Error"
End Sub

Public Sub TarikDariCikops()
    On Error GoTo ErrHandler
    Application.ScreenUpdating = False
    Application.StatusBar = "CIKOPS: menarik transaksi dari CIKOPS..."
    Dim hasil As String
    hasil = TarikTransaksi()
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Tarik dari CIKOPS selesai." & vbCrLf & vbCrLf & hasil & vbCrLf & vbCrLf & _
           "Jangan lupa Save workbook ini.", vbInformation, "Tarik dari CIKOPS"
    Exit Sub
ErrHandler:
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Gagal menarik data: " & Err.Description, vbCritical, "Tarik dari CIKOPS - Error"
End Sub

Public Sub SyncStokOnly()
    On Error GoTo ErrHandler
    Application.ScreenUpdating = False
    Application.StatusBar = "Menyinkronkan Stok ATK..."
    Dim nStok As Long
    nStok = SyncStokBarang()
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Sinkron Stok selesai." & vbCrLf & vbCrLf & _
           "Stok barang diperbarui: " & nStok & " item", vbInformation, "Sinkron Stok ATK"
    Exit Sub
ErrHandler:
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Gagal sinkron stok: " & Err.Description, vbCritical, "Sinkron Stok - Error"
End Sub

Public Sub SyncPermintaanOnly()
    On Error GoTo ErrHandler
    Application.ScreenUpdating = False
    Application.StatusBar = "Menyinkronkan Permintaan ATK..."
    Dim nReq As Long
    nReq = SyncPermintaan()
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Sinkron Permintaan selesai." & vbCrLf & vbCrLf & _
           "Permintaan terkirim: " & nReq & " baris", vbInformation, "Sinkron Permintaan ATK"
    Exit Sub
ErrHandler:
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Gagal sinkron permintaan: " & Err.Description, vbCritical, "Sinkron Permintaan - Error"
End Sub

Public Sub SyncRestockOnly()
    On Error GoTo ErrHandler
    Application.ScreenUpdating = False
    Application.StatusBar = "Menyinkronkan Restock ATK..."
    Dim nRestock As Long
    nRestock = SyncRestock()
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Sinkron Restock selesai." & vbCrLf & vbCrLf & _
           "Restock terkirim: " & nRestock & " baris", vbInformation, "Sinkron Restock ATK"
    Exit Sub
ErrHandler:
    Application.StatusBar = False
    Application.ScreenUpdating = True
    MsgBox "Gagal sinkron restock: " & Err.Description, vbCritical, "Sinkron Restock - Error"
End Sub


' ============================================================
' TARIK: CIKOPS -> Excel
' Format baris dari server (dipisah "|"):
'   I|id|kode|nama|satuan
'   S|id|update_id|tanggal|nama|nik|departemen|kode|nama_barang|jumlah|satuan
'   Q|id|request_id|tanggal|nama|nik|departemen|kode|nama_barang|jumlah|satuan|helper
' Return: ringkasan teks untuk MsgBox.
' ============================================================
Private Function TarikTransaksi() As String
    If InStr(CIKOPS_SYNC_KEY, "isi-kunci") > 0 Or Trim(CIKOPS_SYNC_KEY) = "" Then
        TarikTransaksi = "  (dilewati - CIKOPS_SYNC_KEY belum diisi di modul VBA)"
        Exit Function
    End If

    Dim body As String, status As Long, resp As String
    body = "{""p_key"":" & JQ(CIKOPS_SYNC_KEY) & "}"
    resp = HttpPost(SUPABASE_URL & "/rest/v1/rpc/atk_pull_for_excel", body, "text/plain", status)
    If status = 406 Or status = 415 Then
        resp = HttpPost(SUPABASE_URL & "/rest/v1/rpc/atk_pull_for_excel", body, "application/json", status)
    End If
    If status < 200 Or status > 299 Then
        Err.Raise vbObjectError + 10, "TarikTransaksi", "HTTP " & status & ": " & resp
    End If
    If Left(resp, 1) = """" Then resp = JsonUnquote(resp)
    If resp = "null" Then resp = ""

    Dim wsM As Worksheet, wsP As Worksheet, wsU As Worksheet
    Set wsM = ThisWorkbook.Sheets(SH_MASTER)
    Set wsP = ThisWorkbook.Sheets(SH_PERMINTAAN)
    Set wsU = ThisWorkbook.Sheets(SH_UPDATE)
    If Trim(wsP.Cells(1, SYNCED_COL).Value) = "" Then wsP.Cells(1, SYNCED_COL).Value = "Synced"
    If Trim(wsU.Cells(1, SYNCED_COL).Value) = "" Then wsU.Cells(1, SYNCED_COL).Value = "Synced"

    ' Indeks baris yang sudah ada: "ID|KODE" dan kode barang -> baris
    Dim seenP As Object, seenU As Object, barisKode As Object
    Set seenP = BuildKeys(wsP, 1, 6)
    Set seenU = BuildKeys(wsU, 1, 4)
    Set barisKode = CreateObject("Scripting.Dictionary")
    barisKode.CompareMode = vbTextCompare
    Dim r As Long, lastM As Long
    lastM = wsM.Cells(wsM.Rows.Count, 1).End(xlUp).Row
    For r = 2 To lastM
        If Trim(CStr(wsM.Cells(r, 1).Value)) <> "" Then barisKode(Trim(CStr(wsM.Cells(r, 1).Value))) = r
    Next r

    Dim lines() As String, f() As String, i As Long
    Dim ids As String, nItem As Long, nReq As Long, nRst As Long, nSkip As Long
    Dim warn As String, key As String, nextRow As Long, kode As String, qty As Double
    If Len(resp) = 0 Then
        TarikTransaksi = "  Tidak ada transaksi baru dari CIKOPS."
        Exit Function
    End If
    lines = Split(Replace(resp, vbCr, ""), vbLf)

    For i = LBound(lines) To UBound(lines)
        If Len(Trim(lines(i))) > 0 Then
            f = Split(lines(i), "|")
            Select Case f(0)
                Case "I" ' barang baru
                    If UBound(f) >= 4 Then
                        kode = Trim(f(2))
                        If Not barisKode.Exists(kode) Then
                            nextRow = wsM.Cells(wsM.Rows.Count, 1).End(xlUp).Row + 1
                            wsM.Cells(nextRow, 1).Value = kode
                            wsM.Cells(nextRow, 2).Value = f(3)
                            wsM.Cells(nextRow, 3).Value = f(4)
                            wsM.Cells(nextRow, 4).Value = 0
                            barisKode(kode) = nextRow
                            nItem = nItem + 1
                        Else
                            nSkip = nSkip + 1
                        End If
                        ids = ids & IIf(ids = "", "", ",") & f(1)
                    End If

                Case "S" ' restock
                    If UBound(f) >= 10 Then
                        kode = Trim(f(7)): qty = Val(f(9))
                        key = UCase(Trim(f(2))) & "|" & UCase(kode)
                        If Not seenU.Exists(key) Then
                            nextRow = wsU.Cells(wsU.Rows.Count, 1).End(xlUp).Row + 1
                            wsU.Cells(nextRow, 1).Value = f(2)
                            wsU.Cells(nextRow, 2).NumberFormat = "@"
                            wsU.Cells(nextRow, 2).Value = f(3)
                            wsU.Cells(nextRow, 3).Value = "Restock"
                            wsU.Cells(nextRow, 4).Value = kode
                            wsU.Cells(nextRow, 5).Value = f(8)
                            wsU.Cells(nextRow, 6).Value = qty
                            wsU.Cells(nextRow, 7).Value = f(10)
                            wsU.Cells(nextRow, 8).Value = f(4)
                            wsU.Cells(nextRow, 9).NumberFormat = "@"
                            wsU.Cells(nextRow, 9).Value = f(5)
                            wsU.Cells(nextRow, 10).Value = f(6)
                            wsU.Cells(nextRow, SYNCED_COL).Value = "TRUE" ' sudah ada di CIKOPS, jangan dikirim balik
                            seenU(key) = True
                            If barisKode.Exists(kode) Then
                                wsM.Cells(barisKode(kode), 4).Value = Val(wsM.Cells(barisKode(kode), 4).Value) + qty
                            Else
                                warn = warn & vbCrLf & "  - Kode " & kode & " tidak ada di MasterBarang (stok tidak diubah)"
                            End If
                            nRst = nRst + 1
                        Else
                            nSkip = nSkip + 1
                        End If
                        ids = ids & IIf(ids = "", "", ",") & f(1)
                    End If

                Case "Q" ' permintaan
                    If UBound(f) >= 11 Then
                        kode = Trim(f(7)): qty = Val(f(9))
                        key = UCase(Trim(f(2))) & "|" & UCase(kode)
                        If Not seenP.Exists(key) Then
                            nextRow = wsP.Cells(wsP.Rows.Count, 1).End(xlUp).Row + 1
                            wsP.Cells(nextRow, 1).Value = f(2)
                            wsP.Cells(nextRow, 2).NumberFormat = "@"
                            wsP.Cells(nextRow, 2).Value = f(3)
                            wsP.Cells(nextRow, 3).Value = f(4)
                            wsP.Cells(nextRow, 4).NumberFormat = "@"
                            wsP.Cells(nextRow, 4).Value = f(5)
                            wsP.Cells(nextRow, 5).Value = f(6)
                            wsP.Cells(nextRow, 6).Value = kode
                            wsP.Cells(nextRow, 7).Value = f(8)
                            wsP.Cells(nextRow, 8).Value = qty
                            wsP.Cells(nextRow, 9).Value = f(10)
                            wsP.Cells(nextRow, 10).Value = f(11)
                            wsP.Cells(nextRow, SYNCED_COL).Value = "TRUE"
                            seenP(key) = True
                            If barisKode.Exists(kode) Then
                                wsM.Cells(barisKode(kode), 4).Value = Val(wsM.Cells(barisKode(kode), 4).Value) - qty
                            Else
                                warn = warn & vbCrLf & "  - Kode " & kode & " tidak ada di MasterBarang (stok tidak diubah)"
                            End If
                            nReq = nReq + 1
                        Else
                            nSkip = nSkip + 1
                        End If
                        ids = ids & IIf(ids = "", "", ",") & f(1)
                    End If
            End Select
        End If
    Next i

    ' Tandai sudah ditarik (dikirim per 200 id supaya request tidak terlalu besar)
    If ids <> "" Then
        Dim parts() As String, chunk As String, j As Long, errDetail As String
        parts = Split(ids, ",")
        For j = 0 To UBound(parts)
            chunk = chunk & IIf(chunk = "", "", ",") & parts(j)
            If (j + 1) Mod 200 = 0 Or j = UBound(parts) Then
                errDetail = ""
                If Not PostJson(SUPABASE_URL & "/rest/v1/rpc/atk_mark_pulled", _
                        "{""p_key"":" & JQ(CIKOPS_SYNC_KEY) & ",""p_ids"":" & JQ(chunk) & "}", "return=minimal", errDetail) Then
                    warn = warn & vbCrLf & "  - Gagal menandai sudah ditarik (aman, akan dicek ulang): " & errDetail
                End If
                chunk = ""
            End If
        Next j
    End If

    TarikTransaksi = "  Barang baru       : " & nItem & vbCrLf & _
                     "  Permintaan masuk  : " & nReq & " baris" & vbCrLf & _
                     "  Restock masuk     : " & nRst & " baris" & _
                     IIf(nSkip > 0, vbCrLf & "  Sudah ada (dilewati): " & nSkip, "") & _
                     IIf(warn <> "", vbCrLf & "Perhatian:" & warn, "")
End Function

' Kumpulan kunci "ID|KODE" dari sebuah sheet (untuk cek duplikat)
Private Function BuildKeys(ws As Worksheet, colId As Long, colKode As Long) As Object
    Dim d As Object, r As Long, lastRow As Long
    Set d = CreateObject("Scripting.Dictionary")
    lastRow = ws.Cells(ws.Rows.Count, colId).End(xlUp).Row
    For r = 2 To lastRow
        If Trim(CStr(ws.Cells(r, colId).Value)) <> "" Then
            d(UCase(Trim(CStr(ws.Cells(r, colId).Value))) & "|" & UCase(Trim(CStr(ws.Cells(r, colKode).Value)))) = True
        End If
    Next r
    Set BuildKeys = d
End Function


' ============================================================
' KIRIM 1) STOK BARANG - semua baris MasterBarang lewat RPC.
'    Server otomatis mengoreksi dengan transaksi CIKOPS yang belum
'    ditarik, jadi stok tidak saling menimpa.
' ============================================================
Private Function SyncStokBarang() As Long
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(SH_MASTER)
    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    Dim i As Long, count As Long, firstError As String
    For i = 2 To lastRow
        Dim kode As String, nama As String, satuan As String, stok As Double
        kode = Trim(CStr(ws.Cells(i, 1).Value))
        nama = CStr(ws.Cells(i, 2).Value)
        satuan = CStr(ws.Cells(i, 3).Value)
        stok = Val(ws.Cells(i, 4).Value)
        If kode <> "" Then
            Dim json As String, errDetail As String
            json = "{""p_kode_barang"":" & JQ(kode) & _
                   ",""p_nama_barang"":" & JQ(nama) & _
                   ",""p_satuan"":" & JQ(satuan) & _
                   ",""p_stok"":" & NumStr(stok) & "}"
            errDetail = ""
            If PostJson(SUPABASE_URL & "/rest/v1/rpc/atk_upsert_item", json, "return=minimal", errDetail) Then
                count = count + 1
            ElseIf firstError = "" Then
                firstError = "Baris " & i & " (" & kode & "): " & errDetail
            End If
        End If
    Next i
    If firstError <> "" Then
        MsgBox "Sinkron Stok Barang ada yang gagal." & vbCrLf & vbCrLf & _
               "Contoh error pertama:" & vbCrLf & firstError, vbExclamation, "Sinkron Stok - Sebagian Gagal"
    End If
    SyncStokBarang = count
End Function


' ============================================================
' KIRIM 2) PERMINTAAN - baris TransaksiPermintaan yang Synced <> TRUE
' ============================================================
Private Function SyncPermintaan() As Long
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Sheets(SH_PERMINTAAN)
    If Trim(ws.Cells(1, SYNCED_COL).Value) = "" Then ws.Cells(1, SYNCED_COL).Value = "Synced"

    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim i As Long, count As Long, firstError As String
    For i = 2 To lastRow
        If UCase(Trim(ws.Cells(i, SYNCED_COL).Value)) <> "TRUE" And Trim(ws.Cells(i, 1).Value) <> "" Then
            Dim json As String, tglFinal As String, errDetail As String
            tglFinal = TanggalDariId(CStr(ws.Cells(i, 1).Value))
            If tglFinal = "" Then tglFinal = ExcelDateToIso(ws.Cells(i, 2).Value)
            json = "{""request_id"":" & JQ(ws.Cells(i, 1).Value) & _
                   ",""tanggal"":" & JQ(tglFinal) & _
                   ",""nama"":" & JQ(ws.Cells(i, 3).Value) & _
                   ",""nik"":" & JQ(ws.Cells(i, 4).Value) & _
                   ",""departemen"":" & JQ(ws.Cells(i, 5).Value) & _
                   ",""kode_barang"":" & JQ(ws.Cells(i, 6).Value) & _
                   ",""nama_barang"":" & JQ(ws.Cells(i, 7).Value) & _
                   ",""jumlah"":" & NumStr(Val(ws.Cells(i, 8).Value)) & _
                   ",""satuan"":" & JQ(ws.Cells(i, 9).Value) & _
                   ",""helper"":" & JQ(ws.Cells(i, 10).Value) & "}"
            errDetail = ""
            If PostJson(SUPABASE_URL & "/rest/v1/atk_requests", json, "return=minimal", errDetail) Then
                ws.Cells(i, SYNCED_COL).Value = "TRUE"
                count = count + 1
            ElseIf firstError = "" Then
                firstError = "Baris " & i & ": " & errDetail
            End If
        End If
    Next i
    If firstError <> "" Then
        MsgBox "Sinkron Permintaan ada yang gagal." & vbCrLf & vbCrLf & "Contoh error pertama:" & vbCrLf & firstError, vbExclamation, "Sinkron Permintaan - Sebagian Gagal"
    End If
    SyncPermintaan = count
End Function


' ============================================================
' KIRIM 3) RESTOCK - baris TransaksiUpdateBarang jenis "Restock"
'    yang Synced <> TRUE
' ============================================================
Private Function SyncRestock() As Long
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Sheets(SH_UPDATE)
    On Error GoTo 0
    If ws Is Nothing Then
        SyncRestock = 0
        Exit Function
    End If
    If Trim(ws.Cells(1, SYNCED_COL).Value) = "" Then ws.Cells(1, SYNCED_COL).Value = "Synced"

    Dim lastRow As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    Dim i As Long, count As Long, firstError As String
    For i = 2 To lastRow
        Dim jenis As String
        jenis = UCase(Trim(ws.Cells(i, 3).Value))
        If jenis = "RESTOCK" And UCase(Trim(ws.Cells(i, SYNCED_COL).Value)) <> "TRUE" And Trim(ws.Cells(i, 1).Value) <> "" Then
            Dim json As String, tgl As String, errDetail As String
            tgl = TanggalDariId(CStr(ws.Cells(i, 1).Value))
            If tgl = "" Then tgl = ExcelDateToIso(ws.Cells(i, 2).Value)
            json = "{""update_id"":" & JQ(ws.Cells(i, 1).Value) & _
                   ",""tanggal"":" & JQ(tgl) & _
                   ",""kode_barang"":" & JQ(ws.Cells(i, 4).Value) & _
                   ",""nama_barang"":" & JQ(ws.Cells(i, 5).Value) & _
                   ",""jumlah"":" & NumStr(Val(ws.Cells(i, 6).Value)) & _
                   ",""satuan"":" & JQ(ws.Cells(i, 7).Value) & _
                   ",""nama"":" & JQ(ws.Cells(i, 8).Value) & _
                   ",""nik"":" & JQ(ws.Cells(i, 9).Value) & _
                   ",""departemen"":" & JQ(ws.Cells(i, 10).Value) & "}"
            errDetail = ""
            If PostJson(SUPABASE_URL & "/rest/v1/atk_restocks", json, "return=minimal", errDetail) Then
                ws.Cells(i, SYNCED_COL).Value = "TRUE"
                count = count + 1
            ElseIf firstError = "" Then
                firstError = "Baris " & i & ": " & errDetail
            End If
        End If
    Next i
    If firstError <> "" Then
        MsgBox "Sinkron Restock ada yang gagal." & vbCrLf & vbCrLf & "Contoh error pertama:" & vbCrLf & firstError, vbExclamation, "Sinkron Restock - Sebagian Gagal"
    End If
    SyncRestock = count
End Function


' ============================================================
' HELPER HTTP
' ============================================================
Private Function PostJson(ByVal url As String, ByVal jsonBody As String, ByVal preferHeader As String, Optional ByRef errDetail As String) As Boolean
    On Error GoTo ErrHandler
    Dim http As Object
    Set http = CreateHttpObject()
    http.Open "POST", url, False
    http.setRequestHeader "apikey", SUPABASE_ANON_KEY
    http.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "Prefer", preferHeader
    http.send jsonBody
    If http.Status >= 200 And http.Status <= 299 Then
        PostJson = True
    Else
        errDetail = "HTTP " & http.Status & ": " & http.responseText
        Debug.Print "Sync gagal (" & http.Status & "): " & http.responseText
        PostJson = False
    End If
    Set http = Nothing
    Exit Function
ErrHandler:
    errDetail = "VBA Error: " & Err.Description
    PostJson = False
    Set http = Nothing
End Function

' POST dan kembalikan isi respons (status lewat parameter)
Private Function HttpPost(ByVal url As String, ByVal jsonBody As String, ByVal accept As String, ByRef status As Long) As String
    Dim http As Object
    Set http = CreateHttpObject()
    http.Open "POST", url, False
    http.setRequestHeader "apikey", SUPABASE_ANON_KEY
    http.setRequestHeader "Authorization", "Bearer " & SUPABASE_ANON_KEY
    http.setRequestHeader "Content-Type", "application/json"
    http.setRequestHeader "Accept", accept
    http.send jsonBody
    status = http.Status
    HttpPost = http.responseText
    Set http = Nothing
End Function

Private Function CreateHttpObject() As Object
    Dim h As Object
    On Error Resume Next
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If h Is Nothing Then Set h = CreateObject("MSXML2.ServerXMLHTTP")
    If h Is Nothing Then Set h = CreateObject("WinHttp.WinHttpRequest.5.1")
    If h Is Nothing Then Set h = CreateObject("MSXML2.XMLHTTP")
    On Error GoTo 0
    If h Is Nothing Then
        Err.Raise vbObjectError + 1, "CreateHttpObject", "Tidak ada komponen HTTP yang tersedia di komputer ini."
    End If
    On Error Resume Next
    h.setTimeouts 10000, 10000, 10000, 30000
    On Error GoTo 0
    Set CreateHttpObject = h
End Function


' ============================================================
' HELPER TEKS / ANGKA / TANGGAL
' ============================================================
Private Function JQ(ByVal s As Variant) As String
    Dim t As String
    t = CStr(s)
    t = Replace(t, "\", "\\")
    t = Replace(t, """", "\""")
    t = Replace(t, vbCrLf, "\n")
    t = Replace(t, vbCr, "\n")
    t = Replace(t, vbLf, "\n")
    t = Replace(t, vbTab, "\t")
    JQ = """" & t & """"
End Function

' Angka dengan titik desimal (tidak tergantung Regional Settings)
Private Function NumStr(ByVal v As Double) As String
    NumStr = Replace(CStr(v), Application.International(xlDecimalSeparator), ".")
    If InStr(NumStr, ",") > 0 Then NumStr = Replace(NumStr, ",", ".")
End Function

' Ubah string JSON "..." jadi teks biasa
Private Function JsonUnquote(ByVal s As String) As String
    Dim out As String, i As Long, c As String
    s = Mid(s, 2, Len(s) - 2)
    i = 1
    Do While i <= Len(s)
        c = Mid(s, i, 1)
        If c = "\" And i < Len(s) Then
            i = i + 1
            c = Mid(s, i, 1)
            Select Case c
                Case "n": out = out & vbLf
                Case "r": out = out & vbCr
                Case "t": out = out & vbTab
                Case "u"
                    out = out & ChrW(CLng("&H" & Mid(s, i + 1, 4)))
                    i = i + 4
                Case Else: out = out & c ' \" \\ \/
            End Select
        Else
            out = out & c
        End If
        i = i + 1
    Loop
    JsonUnquote = out
End Function

' Tanggal dari ID REQ-yyyymmddHHMMSS / UPD-yyyymmddHHMMSS (juga format web: ...-W12)
Private Function TanggalDariId(ByVal idText As String) As String
    On Error GoTo Fallback
    Dim digits As String, dashPos As Long
    dashPos = InStr(idText, "-")
    If dashPos = 0 Then GoTo Fallback
    digits = Mid(idText, dashPos + 1)
    If Len(digits) < 8 Then GoTo Fallback
    Dim yyyy As String, mm As String, dd As String
    yyyy = Mid(digits, 1, 4): mm = Mid(digits, 5, 2): dd = Mid(digits, 7, 2)
    If Not IsNumeric(yyyy) Or Not IsNumeric(mm) Or Not IsNumeric(dd) Then GoTo Fallback
    If CInt(mm) < 1 Or CInt(mm) > 12 Or CInt(dd) < 1 Or CInt(dd) > 31 Then GoTo Fallback
    TanggalDariId = yyyy & "-" & mm & "-" & dd
    Exit Function
Fallback:
    TanggalDariId = ""
End Function

Private Function ExcelDateToIso(ByVal v As Variant) As String
    If VarType(v) = vbDate Then
        ExcelDateToIso = Format(CDate(v), "yyyy-mm-dd")
        Exit Function
    End If
    Dim s As String
    s = Trim(CStr(v))
    If s Like "####-##-##" Then
        ExcelDateToIso = s
        Exit Function
    End If
    If s Like "*/*/*" Then
        Dim parts() As String
        parts = Split(s, "/")
        If UBound(parts) = 2 Then
            If IsNumeric(parts(0)) And IsNumeric(parts(1)) And IsNumeric(parts(2)) Then
                Dim dd As Integer, mm As Integer, yyyy As Integer
                dd = CInt(parts(0)): mm = CInt(parts(1)): yyyy = CInt(parts(2))
                If yyyy < 100 Then yyyy = yyyy + 2000
                If mm >= 1 And mm <= 12 And dd >= 1 And dd <= 31 Then
                    ExcelDateToIso = Format(yyyy, "0000") & "-" & Format(mm, "00") & "-" & Format(dd, "00")
                    Exit Function
                End If
            End If
        End If
    End If
    If IsDate(s) Then
        ExcelDateToIso = Format(CDate(s), "yyyy-mm-dd")
    Else
        ExcelDateToIso = Format(Date, "yyyy-mm-dd")
    End If
End Function
