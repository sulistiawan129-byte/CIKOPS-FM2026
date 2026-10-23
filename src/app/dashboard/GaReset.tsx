"use client";

/* Cleaning & Gardening → Master & jadwal → "Reset periode".
   • Reset actual        : kosongkan input actual (jadwal tetap) → SPV input ulang
   • Generate ulang      : hapus jadwal + actual, buat ulang dari master pekerjaan terbaru
   Cakupan 1 bulan penuh atau rentang tanggal, semua tim / satu tim. Setiap reset
   disalin dulu di server sehingga bisa dibatalkan (04_aplikasi_lapangan.sql bagian 047). */

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import {
  getGaResetHistory, previewGaReset, runGaReset, undoGaReset,
  type GaResetLog, type GaResetMode, type GaResetPreview, type GaResetResult,
} from "@/lib/ga/api";
import { monthRange, shiftPeriode } from "@/lib/ga/model";
import a from "./atk.module.css";
import m from "./gamanage.module.css";

type Lang = "id" | "en";
const BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const perLabel = (p: number) => `${BLN[(p % 100) - 1]} ${Math.floor(p / 100)}`;
const fmtD = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
const fmtDT = (d: string) => new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function GaResetModal({ lang, periode: initPeriode, teams: teamsIn, onClose, onChanged }: {
  lang: Lang; periode: number; teams: string[]; onClose: () => void; onChanged: () => void;
}) {
  const teams = Array.from(new Set(["Semua", "Cleaning Service", "Gardener", ...teamsIn]));
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [periode, setPeriode] = useState(initPeriode);
  const [mode, setMode] = useState<GaResetMode>("actual");
  const [scope, setScope] = useState<"month" | "range">("month");
  const range = monthRange(periode);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [tim, setTim] = useState("Semua");
  const [preview, setPreview] = useState<GaResetPreview | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<GaResetResult | null>(null);
  const [history, setHistory] = useState<GaResetLog[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // Ganti bulan → rentang ikut bulan baru
  useEffect(() => { const r = monthRange(periode); setFrom(r.from); setTo(r.to); }, [periode]);

  const f = scope === "month" ? null : from;
  const t = scope === "month" ? null : to;
  useEffect(() => {
    let alive = true;
    setPreview(null);
    const id = setTimeout(() => {
      previewGaReset(periode, mode, f, t, tim).then((p) => { if (alive) { setPreview(p); setErr(null); } }).catch((e) => alive && setErr(errMsg(e)));
    }, 250);
    return () => { alive = false; clearTimeout(id); };
  }, [periode, mode, f, t, tim]);

  const loadHistory = useCallback(() => { getGaResetHistory(periode).then(setHistory).catch(() => setHistory([])); }, [periode]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const needWord = mode === "plan" || (preview?.actual ?? 0) > 0;
  const canRun = !!preview && preview.rows + (mode === "plan" ? preview.jobs : 0) > 0 && (mode === "plan" || preview.actual > 0) && (!needWord || confirmText.trim().toUpperCase() === "RESET");

  async function run() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await runGaReset(periode, mode, f, t, tim);
      setDone(r); setConfirmText(""); onChanged(); loadHistory();
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  }
  async function undo(id: number) {
    if (!confirm(L("Batalkan reset ini dan kembalikan data sebelumnya?", "Undo this reset and restore the previous data?"))) return;
    setBusy(true); setErr(null);
    try {
      const r = await undoGaReset(id);
      setMsg(L(`Reset dibatalkan — ${r.restored} jadwal dikembalikan.`, `Reset undone — ${r.restored} entries restored.`));
      setDone(null); onChanged(); loadHistory();
    } catch (e) { setErr(errMsg(e)); }
    finally { setBusy(false); }
  }

  const timLabel = tim === "Semua" ? L("semua tim", "all teams") : tim;
  const rangeLabel = preview ? `${fmtD(preview.from)} – ${fmtD(preview.to)}` : "";

  return createPortal(
    <div className={a.overlay} onClick={busy ? undefined : onClose}>
      <div className={a.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ga-reset-title" style={{ width: "min(640px, 100%)" }}>
        <div className={a.modalHead}>
          <h2 id="ga-reset-title">⟲ {L("Reset periode", "Reset period")}</h2>
          <button type="button" className={a.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")} disabled={busy}>✕</button>
        </div>

        <div className={m.rsMonth}>
          <button type="button" onClick={() => { setPeriode((p) => shiftPeriode(p, -1)); setDone(null); }} aria-label={L("Bulan sebelumnya", "Previous month")}>‹</button>
          <b>{perLabel(periode)}</b>
          <button type="button" onClick={() => { setPeriode((p) => shiftPeriode(p, 1)); setDone(null); }} aria-label={L("Bulan berikutnya", "Next month")}>›</button>
        </div>

        {done ? (
          <div className={m.rsDone}>
            <span>✓</span>
            <b>{done.mode === "actual"
              ? L(`${done.actual} input actual dikosongkan`, `${done.actual} actual entries cleared`)
              : L(`Jadwal dibuat ulang: ${done.rows} lama dihapus, ${done.added} baru`, `Schedule rebuilt: ${done.rows} removed, ${done.added} new`)}</b>
            <small>{perLabel(periode)} · {fmtD(done.from)} – {fmtD(done.to)} · {timLabel}. {done.mode === "actual" ? L("Checklist harian siap diisi ulang.", "Daily checklist is ready to be filled again.") : L("Checklist harian memakai jadwal baru.", "The daily checklist now uses the new schedule.")}</small>
            <div className={a.modalFoot} style={{ justifyContent: "center" }}>
              <button type="button" className={a.ghostBtn} onClick={() => undo(done.id)} disabled={busy}>↶ {L("Batalkan reset ini", "Undo this reset")}</button>
              <button type="button" className={a.primary} onClick={onClose}>{L("Selesai", "Done")}</button>
            </div>
          </div>
        ) : (
          <>
            <div className={a.field}>
              <span>{L("Apa yang direset?", "What to reset?")}</span>
              <div className={m.rsModes}>
                <button type="button" className={mode === "actual" ? m.rsOn : ""} onClick={() => setMode("actual")} aria-pressed={mode === "actual"}>
                  <i>⟲</i><b>{L("Reset actual", "Reset actuals")}</b>
                  <small>{L("Kosongkan input ✓ / ✕. Jadwal tetap — SPV bisa input ulang dari awal.", "Clear ✓ / ✕ inputs. Schedule stays — SPV can re-enter.")}</small>
                </button>
                <button type="button" className={mode === "plan" ? m.rsOn : ""} onClick={() => setMode("plan")} aria-pressed={mode === "plan"}>
                  <i>♻️</i><b>{L("Generate ulang jadwal", "Rebuild schedule")}</b>
                  <small>{L("Hapus jadwal + actual, lalu buat ulang dari Master pekerjaan terbaru.", "Delete schedule + actuals, rebuild from the latest job master.")}</small>
                </button>
              </div>
            </div>

            <div className={a.fields2}>
              <div className={a.field}>
                <span>{L("Cakupan tanggal", "Date range")}</span>
                <span className={a.seg}>
                  <button type="button" className={scope === "month" ? a.segOn : ""} onClick={() => setScope("month")}>{L("1 bulan penuh", "Whole month")}</button>
                  <button type="button" className={scope === "range" ? a.segOn : ""} onClick={() => setScope("range")}>{L("Rentang tanggal", "Date range")}</button>
                </span>
              </div>
              <div className={a.field}>
                <span>Tim</span>
                <span className={a.seg}>
                  {teams.map((x) => <button key={x} type="button" className={tim === x ? a.segOn : ""} onClick={() => setTim(x)}>{x === "Semua" ? L("Semua", "All") : x}</button>)}
                </span>
              </div>
            </div>
            {scope === "range" && (
              <div className={a.fields2}>
                <label className={a.field}><span>{L("Dari", "From")}</span><input type="date" className={a.input} value={from} min={range.from} max={range.to} onChange={(e) => setFrom(e.target.value || range.from)} /></label>
                <label className={a.field}><span>{L("Sampai", "To")}</span><input type="date" className={a.input} value={to} min={range.from} max={range.to} onChange={(e) => setTo(e.target.value || range.to)} /></label>
              </div>
            )}

            <div className={`${m.rsPreview} ${mode === "plan" ? m.rsWarn : ""}`} aria-live="polite">
              {!preview ? <span className={a.mute}>{err ? "—" : L("Menghitung…", "Counting…")}</span> : mode === "actual" ? (
                preview.actual === 0
                  ? <span>{L(`Tidak ada input actual di ${rangeLabel} (${timLabel}). Tidak ada yang perlu direset.`, `No actuals in ${rangeLabel} (${timLabel}).`)}</span>
                  : <span>{L("Akan dikosongkan:", "Will clear:")} <b>{preview.actual}</b> {L("input actual", "actual entries")} {L("dari", "of")} {preview.rows} {L("jadwal", "entries")} · {rangeLabel} · {timLabel}</span>
              ) : (
                <span>{L("Akan dihapus:", "Will delete:")} <b>{preview.rows}</b> {L("jadwal", "entries")}{preview.actual ? <> ({L("termasuk", "incl.")} <b>{preview.actual}</b> {L("yang sudah diisi", "filled")})</> : null} · {L("dibuat ulang dari", "rebuilt from")} <b>{preview.jobs}</b> {L("pekerjaan aktif", "active jobs")} · {rangeLabel} · {timLabel}</span>
              )}
            </div>

            {needWord && preview && (
              <label className={a.field}>
                <span>{L("Ketik RESET untuk konfirmasi", "Type RESET to confirm")}</span>
                <input className={a.input} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" autoComplete="off" style={{ letterSpacing: ".2em", textTransform: "uppercase" }} />
              </label>
            )}
            <small className={a.mute}>{L("Data sebelum reset disimpan otomatis — bisa dibatalkan dari Riwayat reset di bawah.", "Data before the reset is saved — you can undo it from the reset history below.")}</small>

            {err && <div className={a.msgErr}>{err}</div>}
            {msg && <div className={a.msgOk}>{msg}</div>}
            <div className={a.modalFoot}>
              <button type="button" className={a.ghostBtn} onClick={onClose} disabled={busy}>{L("Tutup", "Close")}</button>
              <button type="button" className={a.dangerBtn} onClick={run} disabled={busy || !canRun}>{busy ? L("Memproses…", "Working…") : mode === "actual" ? L("⟲ Reset actual", "⟲ Reset actuals") : L("♻️ Generate ulang", "♻️ Rebuild")}</button>
            </div>
          </>
        )}

        {history.length > 0 && (
          <div className={m.rsHist}>
            <b>{L("Riwayat reset", "Reset history")} · {perLabel(periode)}</b>
            <ul>
              {history.map((h) => (
                <li key={h.id} className={h.undone_at ? m.rsUndone : ""}>
                  <span>
                    <span><em>{h.mode === "actual" ? L("Reset actual", "Reset actuals") : L("Generate ulang", "Rebuild")}</em> · {fmtD(h.from)}–{fmtD(h.to)} · {h.tim || L("semua tim", "all teams")}</span>
                    <small>{fmtDT(h.at)} · {h.by} · {h.mode === "actual" ? `${h.actual} actual` : `${h.rows} → ${h.added} ${L("jadwal", "entries")}`}{h.undone_at ? ` · ${L("dibatalkan", "undone")} ${fmtDT(h.undone_at)}` : ""}</small>
                  </span>
                  {!h.undone_at && <button type="button" className={a.smallBtn} onClick={() => undo(h.id)} disabled={busy}>↶ {L("Batalkan", "Undo")}</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
