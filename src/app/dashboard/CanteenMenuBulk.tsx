"use client";

/* Isi massal Menu TV Kantin.
   Tab 1 — Tempel / unggah: banyak hidangan sekaligus (bisa lintas minggu) dari Excel/CSV, dengan pembeda kolom yang bisa dipilih.
   Tab 2 — Ulangi minggu ini: salin isian yang tampil ke N minggu berikutnya. */

import { useEffect, useMemo, useRef, useState } from "react";
import m from "./canteenMenu.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { L, loc } from "@/lib/i18n";
import { addDaysIso, type WeeklyMenu } from "@/lib/canteenMenu";
import { AI_PROMPT, applyBulk, KIND_LABEL, parseBulk, toBulkText, touchedWeeks, type Delim } from "@/lib/canteenMenuBulk";
import { getMenuWeek, saveMenuWeek } from "@/lib/canteenMenuApi";

const fmtWeek = (ws: string) => {
  const a = new Date(`${ws}T00:00:00Z`), b = new Date(`${addDaysIso(ws, 6)}T00:00:00Z`);
  const o = { timeZone: "UTC" } as const;
  return `${a.toLocaleDateString(loc(), { ...o, day: "numeric", month: "short" })} – ${b.toLocaleDateString(loc(), { ...o, day: "numeric", month: "short", year: "numeric" })}`;
};
const DAY_ID = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export default function CanteenMenuBulk({ weekStart, menu, dirty, onClose, onApplied }: {
  weekStart: string; menu: WeeklyMenu; dirty: boolean; onClose: () => void; onApplied: (msg: string) => void;
}) {
  const [tab, setTab] = useState<"paste" | "repeat">("paste");
  const [text, setText] = useState("");
  const [delim, setDelim] = useState<Delim>("auto");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseBulk(text, delim), [text, delim]);
  const okRows = parsed.rows.filter((r) => !r.error);
  const badRows = parsed.rows.filter((r) => r.error);
  const weeks = useMemo(() => touchedWeeks(parsed.rows, weekStart), [parsed.rows, weekStart]);
  const delimName = { tab: L("Tab (salinan Excel)", "Tab (Excel paste)"), ";": L("Titik koma ( ; )", "Semicolon ( ; )"), ",": L("Koma ( , )", "Comma ( , )"), "|": L("Garis tegak ( | )", "Pipe ( | )") }[parsed.delim];

  async function readFile(file: File) {
    setErr(null);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        const lines: string[] = [];
        ws.eachRow((row) => {
          const vals = (row.values as unknown[]).slice(1).map((v) => {
            if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
            if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text);
            if (v && typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result);
            return v == null ? "" : String(v);
          });
          lines.push(vals.join("\t"));
        });
        setDelim("tab"); setText(lines.join("\n"));
      } else { setText((await file.text()).replace(/^﻿/, "")); setDelim("auto"); }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  async function copyPrompt() {
    try { await navigator.clipboard.writeText(AI_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setText(AI_PROMPT); setErr(L("Browser tidak mengizinkan menyalin otomatis — prompt ditaruh di kotak teks, salin dari sana.", "The browser blocked automatic copying — the prompt was placed in the text box, copy it from there.")); }
  }

  function download() {
    const csv = "﻿" + toBulkText(menu, ";");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `menu-kantin-${weekStart}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function applyPaste() {
    if (!okRows.length) return;
    if (dirty && weeks.includes(weekStart) && !confirm(L("Ada perubahan di editor yang belum disimpan dan akan tertimpa. Lanjutkan?", "There are unsaved editor changes that will be overwritten. Continue?"))) return;
    if (mode === "replace" && !confirm(L("Mode GANTI mengosongkan minggu yang tersentuh sebelum diisi. Lanjutkan?", "REPLACE mode clears the affected weeks before filling. Continue?"))) return;
    setBusy(true); setErr(null);
    try {
      const existing = new Map<string, WeeklyMenu | null>();
      if (mode === "merge") await Promise.all(weeks.map(async (w) => { existing.set(w, await getMenuWeek(w)); }));
      const result = applyBulk(parsed.rows, weekStart, existing, mode);
      for (const w of result.values()) await saveMenuWeek(w);
      onApplied(L(`${okRows.length} baris diterapkan dan disimpan ke ${result.size} minggu${badRows.length ? ` · ${badRows.length} baris error dilewati` : ""}.`, `${okRows.length} rows applied and saved to ${result.size} week(s)${badRows.length ? ` · ${badRows.length} error rows skipped` : ""}.`));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  /* ── tab 2: ulangi ── */
  const [count, setCount] = useState(3);
  const [overwrite, setOverwrite] = useState(false);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const targets = useMemo(() => Array.from({ length: count }, (_, i) => addDaysIso(weekStart, 7 * (i + 1))), [count, weekStart]);
  useEffect(() => {
    if (tab !== "repeat") return;
    let alive = true;
    Promise.all(targets.map(async (w) => [w, !!(await getMenuWeek(w).catch(() => null))] as const))
      .then((x) => { if (alive) setStatus(Object.fromEntries(x)); });
    return () => { alive = false; };
  }, [tab, targets]);
  const toWrite = targets.filter((w) => overwrite || !status[w]);

  async function applyRepeat() {
    if (!toWrite.length) return;
    setBusy(true); setErr(null);
    try {
      for (const w of toWrite) await saveMenuWeek({ ...JSON.parse(JSON.stringify(menu)) as WeeklyMenu, weekStart: w });
      onApplied(L(`Menu diulang ke ${toWrite.length} minggu berikutnya${targets.length - toWrite.length ? ` (${targets.length - toWrite.length} minggu yang sudah terisi dilewati)` : ""}.`, `Menu repeated to the next ${toWrite.length} week(s)${targets.length - toWrite.length ? ` (${targets.length - toWrite.length} already-filled weeks skipped)` : ""}.`));
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const dayLabel = (d: number | "all" | null) => (d === "all" ? L("Semua", "All") : typeof d === "number" ? DAY_ID[d] : "—");

  return (
    <ModalPortal onOverlayClick={busy ? undefined : onClose} maxWidth={980}>
      <div className={m.bulk} onClick={(e) => e.stopPropagation()}>
        <header className={m.bulkHead}>
          <div><h2>{L("Isi massal menu", "Bulk menu entry")}</h2><p>{L("Masukkan banyak menu sekaligus, atau ulangi menu ke beberapa minggu.", "Enter many dishes at once, or repeat the menu across several weeks.")}</p></div>
          <button type="button" className={m.x} onClick={onClose} disabled={busy} aria-label={L("Tutup", "Close")}>✕</button>
        </header>
        <div className={m.bulkTabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "paste"} className={tab === "paste" ? m.bulkTabOn : ""} onClick={() => setTab("paste")}>{L("Tempel / unggah data", "Paste / upload data")}</button>
          <button type="button" role="tab" aria-selected={tab === "repeat"} className={tab === "repeat" ? m.bulkTabOn : ""} onClick={() => setTab("repeat")}>{L("Ulangi ke minggu lain", "Repeat to other weeks")}</button>
        </div>

        {err && <div className={m.err} role="alert">{err}</div>}

        {tab === "paste" && (
          <div className={m.bulkBody}>
            <p className={m.help}>
              {L("Satu baris = satu hidangan, kolom: ", "One line = one dish, columns: ")}<b>Hari · Jenis · Menu · Kkal · Gram</b>.{" "}
              {L("Hari: Senin–Minggu, tanggal (2026-11-03 atau 03/11/2026 — otomatis ke minggunya), atau Semua. Jenis: Snack, Daging, Ayam, Telur, Special, Pendamping, Buah, Tetap (nasi/sambal/kerupuk, Hari diisi -). Menu '-' = kosongkan. Snack boleh banyak baris per hari (komponen). Tabel dari AI (| … |) dan tanggal seperti 02-Nov-26 juga dikenali.",
                 "Day: Monday–Sunday, a date (2026-11-03 or 03/11/2026 — goes to that week), or All. Type: Snack, Daging (beef), Ayam (chicken), Telur (egg), Special, Pendamping (side), Buah (fruit), Tetap (fixed: rice/sambal/crackers, Day = -). Dish '-' clears it. Snack can have many rows per day (parts). AI tables (| … |) and dates like 02-Nov-26 are also recognised.")}
            </p>
            <div className={m.bulkBar}>
              <label className={m.fld}><span>{L("Pembeda kolom", "Column separator")}</span>
                <select className={m.date} value={delim} onChange={(e) => setDelim(e.target.value as Delim)}>
                  <option value="auto">{L("Otomatis", "Automatic")}</option>
                  <option value="tab">{L("Tab (salin dari Excel)", "Tab (copied from Excel)")}</option>
                  <option value=";">{L("Titik koma ( ; )", "Semicolon ( ; )")}</option>
                  <option value=",">{L("Koma ( , )", "Comma ( , )")}</option>
                  <option value="|">{L("Garis tegak ( | )", "Pipe ( | )")}</option>
                </select>
              </label>
              <label className={m.fld}><span>{L("Cara menerapkan", "How to apply")}</span>
                <select className={m.date} value={mode} onChange={(e) => setMode(e.target.value as "merge" | "replace")}>
                  <option value="merge">{L("Gabung — hanya timpa yang ada di data", "Merge — only overwrite what's in the data")}</option>
                  <option value="replace">{L("Ganti — kosongkan minggu yang tersentuh dulu", "Replace — clear the affected weeks first")}</option>
                </select>
              </label>
              <div className={m.grow} />
              <button type="button" className={m.ghost} onClick={copyPrompt} title={L("Tempel prompt ini bersama gambar menu vendor ke ChatGPT / Claude / Gemini, lalu tempel hasilnya di bawah", "Paste this prompt with the vendor's menu image into ChatGPT / Claude / Gemini, then paste the result below")}>{copied ? L("✓ Prompt tersalin", "✓ Prompt copied") : L("Salin prompt AI (gambar → teks)", "Copy AI prompt (image → text)")}</button>
              <button type="button" className={m.ghost} onClick={() => setText(toBulkText(menu, "tab"))}>{L("Muat format minggu ini", "Load this week's format")}</button>
              <button type="button" className={m.ghost} onClick={download}>{L("Unduh CSV", "Download CSV")}</button>
              <button type="button" className={m.ghost} onClick={() => fileRef.current?.click()}>{L("Unggah file…", "Upload file…")}</button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }} />
            </div>
            <textarea data-nocaps className={m.area} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
              placeholder={"Hari;Jenis;Menu;Kkal;Gram\nSenin;Snack;Bubur Kacang Hijau;180;150\nSenin;Daging;Rendang Sapi;285;70\nSenin;Buah;Pisang;90;100\nSemua;Pendamping;Tempe Orek;120;40\n2026-11-12;Snack;Pisang Goreng;210;100\n-;Tetap;Nasi Putih;260;200"} />

            {parsed.rows.length > 0 && (
              <>
                <div className={m.sum}>
                  <span className={`${m.pill} ${m.pillOk}`}>{okRows.length} {L("baris valid", "valid rows")}</span>
                  {badRows.length > 0 && <span className={`${m.pill} ${m.pillWarn}`}>{badRows.length} {L("error (dilewati)", "errors (skipped)")}</span>}
                  <span className={m.pill}>{L("Pembeda terdeteksi", "Separator")}: {delimName}</span>
                  <span className={m.pill}>{weeks.length} {L("minggu terpengaruh", "week(s) affected")}{weeks.length > 0 && weeks.length <= 3 ? `: ${weeks.map(fmtWeek).join("; ")}` : ""}</span>
                </div>
                <div className={m.pvWrap}>
                  <table className={m.pv}>
                    <thead><tr><th>#</th><th>{L("Hari", "Day")}</th><th>{L("Jenis", "Type")}</th><th>{L("Menu", "Dish")}</th><th>kkal</th><th>gram</th><th>{L("Status", "Status")}</th></tr></thead>
                    <tbody>
                      {parsed.rows.slice(0, 300).map((r) => (
                        <tr key={r.line} className={r.error ? m.pvBad : ""}>
                          <td>{r.line}</td>
                          <td>{r.weekStart && typeof r.day === "number" ? `${dayLabel(r.day)} · ${new Date(`${addDaysIso(r.weekStart, r.day)}T00:00:00Z`).toLocaleDateString(loc(), { timeZone: "UTC", day: "numeric", month: "short" })}` : r.weekStart ? `${dayLabel(r.day)} · ${fmtWeek(r.weekStart).split(" – ")[0]}` : dayLabel(r.day)}</td>
                          <td>{r.kind ? KIND_LABEL[r.kind] : "—"}</td>
                          <td>{r.clear ? <i>{L("(dikosongkan)", "(cleared)")}</i> : r.item?.name ?? "—"}</td>
                          <td>{r.item?.kcal || ""}</td><td>{r.item?.gram || ""}</td>
                          <td>{r.error ? r.error : "✓"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > 300 && <p className={m.help}>{L(`Menampilkan 300 dari ${parsed.rows.length} baris (semua tetap diproses).`, `Showing 300 of ${parsed.rows.length} rows (all are processed).`)}</p>}
                </div>
              </>
            )}
            <footer className={m.bulkFoot}>
              <span className={m.help}>{L("Data langsung disimpan ke semua minggu yang terpengaruh.", "Data is saved straight away to every affected week.")}</span>
              <div className={m.grow} />
              <button type="button" className={m.ghost} onClick={onClose} disabled={busy}>{L("Batal", "Cancel")}</button>
              <button type="button" className={m.save} onClick={applyPaste} disabled={busy || !okRows.length}>{busy ? L("Menyimpan…", "Saving…") : L(`Terapkan & simpan (${okRows.length} baris)`, `Apply & save (${okRows.length} rows)`)}</button>
            </footer>
          </div>
        )}

        {tab === "repeat" && (
          <div className={m.bulkBody}>
            <p className={m.help}>{L(`Menyalin isian yang tampil di editor (minggu ${fmtWeek(weekStart)}) ke beberapa minggu berikutnya — cocok untuk menu siklus. Setelah itu tinggal ubah yang berbeda (mis. buah) per minggu.`,
              `Copies what the editor currently shows (week ${fmtWeek(weekStart)}) to the following weeks — handy for rotating menus. Afterwards just adjust what differs (e.g. fruit).`)}</p>
            <div className={m.bulkBar}>
              <label className={m.fld}><span>{L("Ulangi ke berapa minggu", "Repeat for how many weeks")}</span>
                <input className={m.date} type="number" min={1} max={12} value={count} onChange={(e) => setCount(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
              </label>
              <label className={m.chk}><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />{L("Timpa minggu yang sudah terisi", "Overwrite weeks that are already filled")}</label>
            </div>
            <ul className={m.wk}>
              {targets.map((w) => (
                <li key={w}><b>{fmtWeek(w)}</b>
                  <span className={`${m.pill} ${status[w] ? (overwrite ? m.pillWarn : "") : m.pillOk}`}>{status[w] ? (overwrite ? L("sudah terisi → akan ditimpa", "filled → will be overwritten") : L("sudah terisi → dilewati", "filled → skipped")) : L("kosong → akan diisi", "empty → will be filled")}</span>
                </li>
              ))}
            </ul>
            <footer className={m.bulkFoot}>
              <div className={m.grow} />
              <button type="button" className={m.ghost} onClick={onClose} disabled={busy}>{L("Batal", "Cancel")}</button>
              <button type="button" className={m.save} onClick={applyRepeat} disabled={busy || !toWrite.length}>{busy ? L("Menyimpan…", "Saving…") : L(`Ulangi ke ${toWrite.length} minggu`, `Repeat to ${toWrite.length} week(s)`)}</button>
            </footer>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
