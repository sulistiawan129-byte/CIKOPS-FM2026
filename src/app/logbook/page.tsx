"use client";

/* LOGBOOK GATE MDC ⇄ FFI — form publik (tanpa login). Karyawan & tamu cukup mengisi sekali: tidak ada check-in / check-out.
   Tanggal & jam dicatat otomatis oleh database (WIB). Saran nama hanya dari perangkat ini (localStorage), bukan dari data bersama. */

import { useEffect, useMemo, useState } from "react";
import s from "./logbook.module.css";
import { useLang } from "@/lib/providers";
import { L } from "@/lib/i18n";
import { ARAH_LABEL, KEPERLUAN_GUEST, KEPERLUAN_KARYAWAN, submitLogbook, type LogbookArah, type LogbookReceipt, type LogbookTipe } from "@/lib/logbookApi";

const MEMO = "cikops.logbook.v1";
const OTHER = "__lainnya";
type Memo = { arah: LogbookArah; tipe: LogbookTipe; people: { nama: string; asal: string; tipe: LogbookTipe }[] };

function readMemo(): Memo {
  try {
    const m = JSON.parse(localStorage.getItem(MEMO) || "{}") as Partial<Memo>;
    return { arah: m.arah === "ffi_mdc" ? "ffi_mdc" : "mdc_ffi", tipe: m.tipe === "guest" ? "guest" : "karyawan", people: Array.isArray(m.people) ? m.people.slice(0, 40) : [] };
  } catch { return { arah: "mdc_ffi", tipe: "karyawan", people: [] }; }
}
function writeMemo(m: Memo) { try { localStorage.setItem(MEMO, JSON.stringify(m)); } catch { /* privat / penuh */ } }

/** "27 / 11 / 2026  ·  10:42 WIB" (waktu Jakarta, tidak tergantung zona perangkat) */
function wibLabel(ms: number) {
  const d = new Date(ms + 7 * 3600_000).toISOString();
  return `${d.slice(8, 10)} / ${d.slice(5, 7)} / ${d.slice(0, 4)}  ·  ${d.slice(11, 16)} WIB`;
}

const Chevron = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7785" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
const Calendar = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7785" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;

export default function LogbookPublicPage() {
  const { lang } = useLang();
  void lang; // render ulang saat bahasa berganti (teks lewat L())
  const [arah, setArah] = useState<LogbookArah>("mdc_ffi");
  const [tipe, setTipe] = useState<LogbookTipe>("karyawan");
  const [nama, setNama] = useState("");
  const [asal, setAsal] = useState("");
  const [kep, setKep] = useState("");
  const [kepText, setKepText] = useState("");
  const [people, setPeople] = useState<Memo["people"]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ r: LogbookReceipt; tipe: LogbookTipe; nama: string; asal: string; keperluan: string } | null>(null);

  useEffect(() => {
    const m = readMemo();
    setArah(m.arah); setTipe(m.tipe); setPeople(m.people);
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  const presets = tipe === "guest" ? KEPERLUAN_GUEST : KEPERLUAN_KARYAWAN;
  const custom = kep === OTHER;
  const keperluan = (custom ? kepText : kep).trim();
  const suggestions = useMemo(() => people.filter((p) => p.tipe === tipe), [people, tipe]);
  const ready = nama.trim().length >= 2 && asal.trim().length >= 1 && keperluan.length >= 2;

  function changeTipe(t: LogbookTipe) { setTipe(t); setKep(""); setKepText(""); setAsal(""); }
  function onNama(v: string) {
    setNama(v);
    const hit = suggestions.find((p) => p.nama.toLowerCase() === v.trim().toLowerCase());   // nama pernah diisi di perangkat ini → departemen terisi sendiri
    if (hit && !asal.trim()) setAsal(hit.asal);
  }

  async function submit() {
    if (!ready || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await submitLogbook({ arah, tipe, nama, asal, keperluan });
      const rest = people.filter((p) => !(p.nama.toLowerCase() === nama.trim().toLowerCase() && p.tipe === tipe));
      const next = [{ nama: nama.trim(), asal: asal.trim(), tipe }, ...rest].slice(0, 40);
      setPeople(next); writeMemo({ arah, tipe, people: next });
      setDone({ r, tipe, nama: nama.trim(), asal: asal.trim(), keperluan });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }
  function again() { setDone(null); setNama(""); setAsal(""); setKep(""); setKepText(""); setErr(""); }

  const asalLabel = tipe === "guest" ? L("Perusahaan / Instansi", "Company / Organisation") : L("Departemen", "Department");

  return (
    <main className={s.page}>
      <div className={s.card}>
        <div className={s.bar}>
          <span className={s.logo} aria-hidden="true" />
          <span className={s.barTitle}>Logbook MDC ⇄ FFI</span>
          <span className={s.chip}>Cikops-FM</span>
        </div>
        <div className={s.hero} role="img" aria-label={L("Area pabrik PT Frisian Flag Indonesia", "PT Frisian Flag Indonesia plant area")} />
        <div className={s.title}>
          {done ? (<><h1>{L("Tercatat", "Recorded")}</h1><p>{L("Terima kasih. Catatan Anda sudah masuk logbook.", "Thank you. Your entry has been logged.")}</p></>)
            : <h1>Logbook Gate MDC - PT. Frisian Flag Indonesia</h1>}
        </div>

        {done ? (
          <div className={s.body}>
            <div><div className={s.lbl}>{L("Nomor logbook", "Logbook no.")}</div><div className={s.rcpt}><b>{done.r.no}</b><em>{ARAH_LABEL[done.r.arah]}</em></div></div>
            <div><div className={s.lbl}>{L("Tanggal / jam", "Date / time")}</div><div className={s.rcpt}><span>{`${done.r.tanggal.slice(8, 10)} / ${done.r.tanggal.slice(5, 7)} / ${done.r.tanggal.slice(0, 4)}  ·  ${done.r.jam} WIB`}</span></div></div>
            <div><div className={s.lbl}>{L("Karyawan / Guest", "Employee / Guest")}</div><div className={s.rcpt}><span>{done.tipe === "guest" ? "Guest" : L("Karyawan", "Employee")}</span></div></div>
            <div><div className={s.lbl}>{L("Nama Lengkap", "Full name")}</div><div className={s.rcpt}><span className={s.rcptV}>{done.nama}</span></div></div>
            <div><div className={s.lbl}>{done.tipe === "guest" ? L("Perusahaan / Instansi", "Company / Organisation") : L("Departemen", "Department")}</div><div className={s.rcpt}><span className={s.rcptV}>{done.asal}</span></div></div>
            <div><div className={s.lbl}>{L("Tujuan / Keperluan", "Purpose")}</div><div className={s.rcpt}><span className={s.rcptV}>{done.keperluan}</span></div></div>
            <button type="button" className={s.btn} onClick={again}>{L("Catat lagi", "Log another")} <Arrow /></button>
            <div className={s.note}>{L("Halaman ini boleh ditutup.", "You may close this page.")}</div>
          </div>
        ) : (
          <form className={s.body} onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <div className={s.field}>
              <label htmlFor="arah">{L("Arah", "Direction")}</label>
              <div className={s.wrap}>
                <select id="arah" className={s.ctl} value={arah} onChange={(e) => setArah(e.target.value as LogbookArah)}>
                  <option value="mdc_ffi">{ARAH_LABEL.mdc_ffi}</option>
                  <option value="ffi_mdc">{ARAH_LABEL.ffi_mdc}</option>
                </select><Chevron />
              </div>
            </div>

            <div className={s.field}>
              <label htmlFor="tgl">{L("Tanggal", "Date")} <span>({L("otomatis", "automatic")})</span></label>
              <div className={s.wrap}><input id="tgl" className={`${s.ctl} ${s.ro}`} type="text" readOnly value={wibLabel(now)} /><Calendar /></div>
            </div>

            <div className={s.field}>
              <span className={s.lbl}>{L("Karyawan / Guest", "Employee / Guest")}</span>
              <div className={s.seg} role="group" aria-label={L("Karyawan atau Guest", "Employee or Guest")}>
                <button type="button" aria-pressed={tipe === "karyawan"} onClick={() => changeTipe("karyawan")}>{L("Karyawan", "Employee")}</button>
                <button type="button" aria-pressed={tipe === "guest"} onClick={() => changeTipe("guest")}>Guest</button>
              </div>
            </div>

            <div className={s.field}>
              <label htmlFor="nama">{L("Nama Lengkap", "Full name")}</label>
              <input id="nama" className={s.ctl} type="text" autoComplete="off" list="lb-nama" maxLength={80} value={nama} onChange={(e) => onNama(e.target.value)} />
              <datalist id="lb-nama">{suggestions.map((p) => <option key={p.nama} value={p.nama} />)}</datalist>
            </div>

            <div className={s.field}>
              <label htmlFor="asal">{asalLabel}</label>
              <input id="asal" className={s.ctl} type="text" autoComplete="off" maxLength={80} value={asal} onChange={(e) => setAsal(e.target.value)} />
            </div>

            <div className={s.field}>
              <label htmlFor="kep">{L("Tujuan / Keperluan", "Purpose")}</label>
              <div className={s.wrap}>
                <select id="kep" className={s.ctl} value={kep} onChange={(e) => setKep(e.target.value)}>
                  <option value="" disabled>{L("Pilih…", "Select…")}</option>
                  {presets.map((p) => <option key={p} value={p}>{p}</option>)}
                  <option value={OTHER}>{L("Lainnya (ketik sendiri)", "Other (type it)")}</option>
                </select><Chevron />
              </div>
            </div>

            {custom && (
              <div className={s.field}>
                <label htmlFor="kep2">{L("Ketik tujuan / keperluan", "Type the purpose")}</label>
                <input id="kep2" className={`${s.ctl} ${s.on}`} type="text" autoComplete="off" maxLength={120} autoFocus value={kepText} onChange={(e) => setKepText(e.target.value)} />
              </div>
            )}

            {err && <div className={s.err} role="alert">{err}</div>}

            <button type="submit" className={s.btn} disabled={!ready || busy}>{busy ? L("Mencatat…", "Saving…") : L("Catat", "Submit")} {!busy && <Arrow />}</button>
            <div className={s.note}>{L("Tanpa NIK. Tanggal dan jam dicatat otomatis.", "No ID number needed. Date and time are recorded automatically.")}</div>
          </form>
        )}
      </div>
    </main>
  );
}
