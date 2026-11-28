"use client";

/* Form pembuat SURAT KUASA (perpanjangan STNK / KIR). Data kendaraan diambil dari Armada, semua isian bisa diubah.
   Output PDF A4 tanpa kop & tanpa tanda tangan — dicetak di kertas ber-kop perusahaan. */

import { useEffect, useMemo, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import styles from "./dashboard.module.css";
import { updateVehicle } from "@/lib/api";
import { toLocalISODate } from "@/lib/dateUtils";
import type { Vehicle } from "@/lib/types";
import { L } from "@/lib/i18n";
import { addSuratKuasaLog, getSuratKuasaLog, type SuratKuasaLog } from "@/lib/suratKuasaApi";
import { SURAT_KUASA_LABEL, tanggalIndonesia, downloadSuratKuasa, previewSuratKuasa, type SuratKuasaData, type SuratKuasaTipe } from "@/lib/suratKuasa";

const MEMO_KEY = "cikops.suratkuasa.v1";
type Memo = { kota: string; pemberiNama: string; pemberiJabatan: string; penerimaNama: string; penerimaAlamat: string; kopMm: number };
const MEMO_DEFAULT: Memo = { kota: "Jakarta", pemberiNama: "", pemberiJabatan: "", penerimaNama: "", penerimaAlamat: "", kopMm: 45 };

function readMemo(): Memo {
  try { return { ...MEMO_DEFAULT, ...(JSON.parse(localStorage.getItem(MEMO_KEY) || "{}") as Partial<Memo>) }; } catch { return MEMO_DEFAULT; }
}
function writeMemo(m: Memo) { try { localStorage.setItem(MEMO_KEY, JSON.stringify(m)); } catch { /* abaikan */ } }

const KOP_CHOICES = [0, 30, 40, 45, 50, 60, 70];

export function SuratKuasaModal({ vehicles, initialVehicleId, initialTipe = "stnk", onClose, onSaved }: {
  vehicles: Vehicle[];
  initialVehicleId?: string | null;
  initialTipe?: SuratKuasaTipe;
  onClose: () => void;
  /** dipanggil setelah data kendaraan disimpan ke Armada */
  onSaved?: () => void;
}) {
  const memo = useMemo(readMemo, []);
  const [tipe, setTipe] = useState<SuratKuasaTipe>(initialTipe);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? "");
  const [kota, setKota] = useState(memo.kota);
  const [tanggal, setTanggal] = useState(() => toLocalISODate(new Date()));
  const [pemberiNama, setPemberiNama] = useState(memo.pemberiNama);
  const [pemberiJabatan, setPemberiJabatan] = useState(memo.pemberiJabatan);
  const [penerimaNama, setPenerimaNama] = useState(memo.penerimaNama);
  const [penerimaAlamat, setPenerimaAlamat] = useState(memo.penerimaAlamat);
  const [kopMm, setKopMm] = useState(memo.kopMm);
  const [veh, setVeh] = useState(() => vehFields(vehicles.find((x) => x.id === initialVehicleId)));
  const [saveVeh, setSaveVeh] = useState(true);
  const [busy, setBusy] = useState<"" | "preview" | "pdf">("");
  const [err, setErr] = useState("");
  const [view, setView] = useState<"form" | "log">("form");
  const [log, setLog] = useState<SuratKuasaLog[]>([]);
  const [logErr, setLogErr] = useState("");
  const [logLoading, setLogLoading] = useState(true);
  const dirty = useRef(false);   // pengguna sudah mengetik sendiri → default dari riwayat tidak menimpa

  async function loadLog() {
    try { setLog(await getSuratKuasaLog(100)); setLogErr(""); }
    catch (e) { setLogErr(e instanceof Error ? e.message : String(e)); }
    finally { setLogLoading(false); }
  }
  // Default = surat terakhir yang berhasil dibuat (dibagi ke semua admin); hanya tanggal yang perlu diganti
  useEffect(() => {
    let alive = true;
    getSuratKuasaLog(100).then((rows) => {
      if (!alive) return;
      setLog(rows); setLogErr("");
      const last = rows.find((r) => r.data);
      if (last?.data && !dirty.current) {
        setKota(last.data.kota || "Jakarta");
        setPemberiNama(last.data.pemberi.nama); setPemberiJabatan(last.data.pemberi.jabatan);
        setPenerimaNama(last.data.penerima.nama); setPenerimaAlamat(last.data.penerima.alamat);
        setKopMm(last.data.kopMm ?? 45);
      }
    }).catch((e) => { if (alive) setLogErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setLogLoading(false); });
    return () => { alive = false; };
  }, []);

  /** Pakai ulang isi surat lama (tanggal diganti hari ini). */
  function reuse(r: SuratKuasaLog) {
    if (!r.data) return;
    dirty.current = true;
    const d = r.data;
    setTipe(d.tipe); setKota(d.kota); setTanggal(toLocalISODate(new Date())); setKopMm(d.kopMm ?? 45);
    setPemberiNama(d.pemberi.nama); setPemberiJabatan(d.pemberi.jabatan);
    setPenerimaNama(d.penerima.nama); setPenerimaAlamat(d.penerima.alamat);
    const cur = vehicles.find((x) => x.id === r.vehicleId);
    setVehicleId(cur?.id ?? "");
    setVeh({ merk: d.kendaraan.merk, nopol: d.kendaraan.nopol, jenis: d.kendaraan.jenis, tahun: d.kendaraan.tahun, warna: d.kendaraan.warna, rangka: d.kendaraan.rangka, mesin: d.kendaraan.mesin, noUji: d.kendaraan.noUji });
    setView("form");
  }

  const selected = vehicles.find((x) => x.id === vehicleId) ?? null;
  const sorted = useMemo(() => [...vehicles].sort((a, b) => a.nopol.localeCompare(b.nopol)), [vehicles]);

  function pick(id: string) {
    dirty.current = true;
    setVehicleId(id);
    setVeh(vehFields(vehicles.find((x) => x.id === id)));
  }
  const setV = (k: keyof typeof veh, val: string) => setVeh((p) => ({ ...p, [k]: val }));

  const ready = veh.nopol.trim() !== "" && veh.merk.trim() !== "";

  function build(): SuratKuasaData {
    return {
      tipe, kota, tanggal, kopMm,
      pemberi: { nama: pemberiNama, jabatan: pemberiJabatan },
      penerima: { nama: penerimaNama, alamat: penerimaAlamat },
      kendaraan: { merk: veh.merk, nopol: veh.nopol, jenis: veh.jenis, tahun: veh.tahun, warna: veh.warna, rangka: veh.rangka, mesin: veh.mesin, noUji: veh.noUji },
    };
  }

  async function run(kind: "preview" | "pdf") {
    setErr(""); setBusy(kind);
    try {
      writeMemo({ kota, pemberiNama, pemberiJabatan, penerimaNama, penerimaAlamat, kopMm });
      // simpan balik data dokumen ke Armada supaya surat berikutnya sudah terisi
      if (saveVeh && selected) {
        const next = {
          jenis_kendaraan: veh.jenis.trim(), no_rangka: veh.rangka.trim(), no_mesin: veh.mesin.trim(), no_uji: veh.noUji.trim(),
          color: veh.warna.trim(), year: Number(veh.tahun) || null,
        };
        const payload: Record<string, unknown> = {};
        (["jenis_kendaraan", "no_rangka", "no_mesin", "no_uji"] as const).forEach((k) => {
          if (next[k] !== (selected[k] ?? "")) payload[k] = next[k] || null;
        });
        if (next.color !== (selected.color ?? "")) payload.color = next.color || null;
        if (next.year && next.year !== selected.year) payload.year = next.year;
        if (Object.keys(payload).length) {
          try { await updateVehicle(selected.id, payload); onSaved?.(); }
          catch (e) { setErr((e instanceof Error ? e.message : String(e)) + " " + L("(surat tetap dibuat)", "(the letter is still generated)")); }
        }
      }
      const data = build();
      if (kind === "preview") await previewSuratKuasa(data); else await downloadSuratKuasa(data);
      // catat ke riwayat (sekaligus menjadi default surat berikutnya)
      try { await addSuratKuasaLog(data, selected?.id ?? null); await loadLog(); }
      catch (e) { setErr((e instanceof Error ? e.message : String(e)) + " " + L("(surat sudah dibuat, tetapi belum tercatat di riwayat)", "(the letter was generated but not recorded in history)")); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(""); }
  }

  const lbl: React.CSSProperties = { display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--t3)", marginBottom: 4, letterSpacing: ".03em" };
  const sec: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: "var(--t3)", textTransform: "uppercase", letterSpacing: ".07em", margin: "18px 0 8px" };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };
  const F = (label: string, value: string, set: (v: string) => void, ph = "") => (
    <div><label style={lbl}>{label}</label><input className={styles.formInput} value={value} onChange={(e) => { dirty.current = true; set(e.target.value); }} placeholder={ph} /></div>
  );

  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={640}>
      <div data-nocaps style={{ borderRadius: "var(--r2)", overflow: "hidden", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 24px", background: "linear-gradient(135deg, var(--brand), var(--brand2))", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📄</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{L("Buat Surat Kuasa", "Create Power of Attorney")}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.8)" }}>{L("PDF A4 tanpa kop & tanpa tanda tangan — cetak di kertas ber-kop", "A4 PDF without letterhead or signatures — print on letterhead paper")}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "10px 24px 0" }} role="tablist">
          {([["form", L("Buat surat", "Create")], ["log", `${L("Riwayat", "History")}${log.length ? ` (${log.length})` : ""}`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
              style={{ padding: "8px 14px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", border: "1px solid " + (view === k ? "var(--brand)" : "var(--border2)"), background: view === k ? "var(--bg2)" : "transparent", color: view === k ? "var(--brand)" : "var(--t3)" }}>{label}</button>
          ))}
        </div>

        {view === "log" ? (
          <div style={{ padding: 24, overflowY: "auto" }}>
            {logLoading ? <p style={{ color: "var(--t3)" }}>…</p>
              : logErr ? <div role="alert" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--red, #e5484d)", fontSize: 13 }}>{logErr}</div>
              : log.length === 0 ? <p style={{ color: "var(--t3)", fontSize: 13.5 }}>{L("Belum ada surat yang dibuat. Surat yang berhasil dibuat otomatis tercatat di sini dan isinya jadi default surat berikutnya.", "No letters yet. Generated letters are recorded here and become the defaults for the next one.")}</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {log.map((r) => (
                    <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "var(--t1)", fontSize: 13.5 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "var(--bg2)", color: "var(--brand)", marginRight: 8 }}>{r.tipe === "stnk" ? "STNK" : "KIR"}</span>
                          {r.nopol || "—"} <span style={{ fontWeight: 600, color: "var(--t3)" }}>· {r.merk}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2, overflowWrap: "anywhere" }}>
                          {L("Kuasa kepada", "To")}: {r.penerimaNama || "—"} · {L("tgl surat", "dated")} {tanggalIndonesia(r.tanggal)} · {L("dibuat", "created")} {r.createdAt.slice(0, 10)} {L("oleh", "by")} {r.createdBy || "—"}
                        </div>
                      </div>
                      <button type="button" disabled={!r.data} onClick={() => reuse(r)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--brand)", background: "transparent", color: "var(--brand)", fontWeight: 800, cursor: "pointer", fontSize: 12.5 }}>↻ {L("Pakai lagi", "Reuse")}</button>
                      <button type="button" disabled={!r.data} onClick={() => r.data && downloadSuratKuasa(r.data)} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer", fontSize: 12.5 }}>⬇ PDF</button>
                    </div>
                  ))}
                </div>
              )}
          </div>
        ) : (
        <div style={{ padding: 24, overflowY: "auto" }}>
          <label style={lbl}>{L("Jenis surat", "Letter type")}</label>
          <div style={{ display: "flex", gap: 8 }} role="group" aria-label={L("Jenis surat", "Letter type")}>
            {(["stnk", "kir"] as SuratKuasaTipe[]).map((t) => (
              <button key={t} type="button" aria-pressed={tipe === t} onClick={() => setTipe(t)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", border: tipe === t ? "1.5px solid var(--brand)" : "1px solid var(--border2)", background: tipe === t ? "var(--bg2)" : "transparent", color: tipe === t ? "var(--brand)" : "var(--t3)" }}>
                {SURAT_KUASA_LABEL[t]}
              </button>
            ))}
          </div>

          <div style={sec}>{L("Kendaraan", "Vehicle")}</div>
          <label style={lbl}>{L("Ambil dari Armada", "Pick from Fleet")}</label>
          <select className={styles.formSelect} value={vehicleId} onChange={(e) => pick(e.target.value)}>
            <option value="">{L("— ketik manual / pilih kendaraan —", "— type manually / pick a vehicle —")}</option>
            {sorted.map((v) => <option key={v.id} value={v.id}>{v.nopol} · {v.jenis || "—"}</option>)}
          </select>
          <div style={{ ...grid, marginTop: 12 }}>
            {F(L("Kendaraan (merk & tipe)", "Vehicle (make & model)"), veh.merk, (x) => setV("merk", x), "Mitsubishi Colt Diesel FE 71")}
            {F(L("No. Polisi", "Plate no."), veh.nopol, (x) => setV("nopol", x), "B 9065 TCF")}
            {F(L("Jenis", "Type"), veh.jenis, (x) => setV("jenis", x), "Mobil Barang")}
            {tipe === "stnk" ? (<>
              {F(L("Tahun", "Year"), veh.tahun, (x) => setV("tahun", x), "2013")}
              {F(L("Warna", "Colour"), veh.warna, (x) => setV("warna", x), "Kuning Silver")}
              {F(L("Nomor rangka", "Chassis no."), veh.rangka, (x) => setV("rangka", x.toUpperCase()), "MHMFE71P1DK042327")}
              {F(L("Nomor mesin", "Engine no."), veh.mesin, (x) => setV("mesin", x.toUpperCase()), "4D34TJ52041")}
            </>) : F(L("No. Uji (KIR)", "Test no. (KIR)"), veh.noUji, (x) => setV("noUji", x.toUpperCase()), "JKT761681")}
          </div>
          {selected && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: 12.5, color: "var(--t2)", cursor: "pointer" }}>
              <input type="checkbox" checked={saveVeh} onChange={(e) => setSaveVeh(e.target.checked)} />
              {L("Simpan perubahan data ini ke Armada (surat berikutnya langsung terisi)", "Save changes to Fleet (next letters are pre-filled)")}
            </label>
          )}

          <div style={sec}>{L("Pemberi kuasa", "Grantor")}</div>
          <div style={grid}>
            {F(L("Nama", "Name"), pemberiNama, setPemberiNama, "Nama lengkap")}
            {F(L("Jabatan", "Position"), pemberiJabatan, setPemberiJabatan, "General Affairs")}
          </div>

          <div style={sec}>{L("Penerima kuasa", "Grantee")}</div>
          <div style={grid}>
            {F(L("Nama", "Name"), penerimaNama, setPenerimaNama, "Nama lengkap")}
            <div style={{ gridColumn: "1 / -1" }}>{F(L("Alamat", "Address"), penerimaAlamat, setPenerimaAlamat, "Jl. …")}</div>
          </div>

          <div style={sec}>{L("Surat", "Letter")}</div>
          <div style={grid}>
            {F(L("Kota", "City"), kota, setKota, "Jakarta")}
            <div><label style={lbl}>{L("Tanggal surat", "Letter date")}</label><input className={styles.formInput} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} /></div>
            <div>
              <label style={lbl}>{L("Ruang kop di atas", "Letterhead space on top")}</label>
              <select className={styles.formSelect} value={kopMm} onChange={(e) => setKopMm(Number(e.target.value))}>
                {KOP_CHOICES.map((n) => <option key={n} value={n}>{n === 0 ? L("Tanpa ruang (kertas polos)", "None (plain paper)") : `${n} mm`}</option>)}
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--t3)", margin: "8px 0 0" }}>
            {L("Kolom yang dikosongkan tercetak sebagai garis titik-titik agar bisa ditulis tangan. Nama pada isian di atas dan di bawah tanda tangan otomatis sama.", "Empty fields print as dotted lines so they can be filled by hand. Names under the signatures follow the fields above.")}
          </p>

          {err && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--red, #e5484d)", fontSize: 13, color: "var(--t1)" }} role="alert">{err}</div>}
        </div>
        )}

        <div style={{ display: "flex", gap: 10, padding: "14px 24px", borderTop: "1px solid var(--border)", background: "var(--bg2)" }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{L("Tutup", "Close")}</button>
          {view === "form" && <button type="button" onClick={() => run("pdf")} disabled={!ready || busy !== ""} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid var(--brand)", background: "transparent", color: "var(--brand)", fontWeight: 800, cursor: "pointer", opacity: ready && !busy ? 1 : 0.5 }}>⬇ {busy === "pdf" ? "…" : "PDF"}</button>}
          {view === "form" && <button type="button" className="pillBtn" onClick={() => run("preview")} disabled={!ready || busy !== ""} style={{ flex: 2, justifyContent: "center", opacity: ready && !busy ? 1 : 0.5 }}>🖨 {busy === "preview" ? "…" : L("Lihat & cetak", "Preview & print")}</button>}
        </div>
      </div>
    </ModalPortal>
  );
}

function vehFields(v?: Vehicle | null) {
  return {
    merk: v?.jenis ?? "", nopol: v?.nopol ?? "", jenis: v?.jenis_kendaraan ?? "",
    tahun: v?.year ? String(v.year) : "", warna: v?.color ?? "",
    rangka: v?.no_rangka ?? "", mesin: v?.no_mesin ?? "", noUji: v?.no_uji ?? "",
  };
}
