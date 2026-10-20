"use client";

/* Wifi Guest — beri akses (saran akun otomatis), tamu aktif, akun dari IT (impor), riwayat. */

import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import {
  deleteWifiAccount, emailWifiReceipt, grantWifi, importWifiAccounts, returnWifi, setWifiAccountActive, suggestWifi,
} from "@/lib/receptionist/api";
import {
  WIFI_DURATIONS, WIFI_STATUS_LABEL, daysBetween, monthOf, durationEnd, fmtDate, fmtDateTime, grantActive, parseAccountsText, todayISO,
  type ImportRow, type RcpSettings, type WifiAccount, type WifiDuration, type WifiGrant, type WifiGrantResult, type WifiStatus, type WifiSuggestion,
} from "@/lib/receptionist/model";
import { ExportButtons, NameInput, col, type Directory } from "./shared";
import r from "./receptionist.module.css";

type Sub = "grant" | "active" | "accounts" | "history";
const STATUS_PILL: Record<WifiStatus, string> = { available: r.pGreen, partial: r.pBlue, full: r.pOrange, expired: r.pRed, inactive: r.pGray };

export default function RcpWifi({ settings, accounts, grants, dir, reload }: {
  settings: RcpSettings; accounts: WifiAccount[]; grants: WifiGrant[]; dir: Directory; reload: () => Promise<void>;
}) {
  const [sub, setSub] = useState<Sub>("grant");
  const active = useMemo(() => grants.filter((g) => grantActive(g)), [grants]);
  return (
    <div className={r.wrap} style={{ padding: 0 }}>
      <div className={r.seg} role="group" aria-label="Wifi">
        {([["grant", "Beri akses"], ["active", `Tamu aktif (${active.length})`], ["accounts", `Akun dari IT (${accounts.length})`], ["history", "Riwayat"]] as [Sub, string][]).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={sub === k} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === "grant" && <GrantForm settings={settings} accounts={accounts} dir={dir} reload={reload} />}
      {sub === "active" && <ActiveList grants={active} reload={reload} />}
      {sub === "accounts" && <Accounts accounts={accounts} reload={reload} />}
      {sub === "history" && <History grants={grants} />}
    </div>
  );
}

/* ── Beri akses ── */
function GrantForm({ settings, accounts, dir, reload }: { settings: RcpSettings; accounts: WifiAccount[]; dir: Directory; reload: () => Promise<void> }) {
  const today = todayISO();
  const blank = { requestorName: "", requestorEmail: "", department: "", lineManager: "", guestName: "", guestCompany: "", purpose: "" };
  const [f, setF] = useState(blank);
  const [slots, setSlots] = useState(1);
  const [start, setStart] = useState(today);
  const [dur, setDur] = useState<WifiDuration>("today");
  const [customEnd, setCustomEnd] = useState(today);
  const end = durationEnd(start, dur, customEnd);
  const [sugs, setSugs] = useState<WifiSuggestion[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ res: WifiGrantResult; email: string; emailErr: string; guest: string; slots: number } | null>(null);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    let off = false;
    setSugs(null);
    if (end < start) return;
    suggestWifi(end, slots).then((s) => { if (!off) { setSugs(s); setPick(s[0]?.id ?? ""); } }).catch((e) => { if (!off) { setSugs([]); setErr(e instanceof Error ? e.message : String(e)); } });
    return () => { off = true; };
  }, [end, start, slots, accounts]);

  const days = daysBetween(start, end) + 1;
  const canSave = !!pick && f.guestName.trim() && f.requestorName.trim() && end >= start && end >= today && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      const res = await grantWifi({ accountId: pick, slots, guestName: f.guestName, guestCompany: f.guestCompany, requestorName: f.requestorName, requestorEmail: f.requestorEmail, department: f.department, lineManager: f.lineManager, purpose: f.purpose, startDate: start, endDate: end });
      let emailErr = "";
      if (f.requestorEmail.trim()) {
        try { await emailWifiReceipt({ id: res.id, receiptNo: res.receiptNo, toEmail: f.requestorEmail.trim(), requestorName: f.requestorName, guestName: f.guestName, guestCompany: f.guestCompany, username: res.username, password: res.password, slots, startDate: res.startDate, endDate: res.endDate }, settings); }
        catch (e) { emailErr = e instanceof Error ? e.message : String(e); }
      }
      setDone({ res, email: f.requestorEmail.trim(), emailErr, guest: f.guestName, slots });
      setF(blank); setSlots(1); setDur("today"); setStart(today);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  const usable = accounts.filter((a) => a.status === "available" || a.status === "partial");
  return (
    <div className={r.split}>
      <section className={r.card}>
        <div className={r.cardHead}><h2>Beri akses wifi</h2><small>{usable.reduce((s, a) => s + a.free, 0)} slot tersedia</small></div>
        <div className={r.form}>
          <label className={r.field}><span>Nama requestor *</span>
            <NameInput dir={dir} value={f.requestorName} onChange={(v) => set("requestorName", v)} onPick={(p) => setF((x) => ({ ...x, requestorEmail: p.email || x.requestorEmail, department: p.department || x.department }))} placeholder="Karyawan yang meminta" />
          </label>
          <label className={r.field}><span>Email requestor <em>(tanda terima dikirim ke sini)</em></span>
            <input className={r.input} type="email" value={f.requestorEmail} onChange={(e) => set("requestorEmail", e.target.value)} placeholder="nama@perusahaan.com" />
          </label>
          <label className={r.field}><span>Departemen</span><input className={r.input} value={f.department} onChange={(e) => set("department", e.target.value)} /></label>
          <label className={r.field}><span>Line manager <em>(hanya dicatat)</em></span><input className={r.input} value={f.lineManager} onChange={(e) => set("lineManager", e.target.value)} /></label>
          <label className={r.field}><span>Nama tamu *</span><input className={r.input} value={f.guestName} onChange={(e) => set("guestName", e.target.value)} /></label>
          <label className={r.field}><span>Perusahaan / instansi tamu</span><input className={r.input} value={f.guestCompany} onChange={(e) => set("guestCompany", e.target.value)} /></label>
          <div className={`${r.field} ${r.full}`}><span>Slot yang dipakai</span>
            <div className={r.chips}>
              <button type="button" className={r.chip} aria-pressed={slots === 1} onClick={() => setSlots(1)}>1 slot · 1 orang / 1 perangkat</button>
              <button type="button" className={r.chip} aria-pressed={slots === 2} onClick={() => setSlots(2)}>2 slot · 2 orang, atau 1 orang 2 perangkat</button>
            </div>
          </div>
          <label className={r.field}><span>Mulai</span><input className={r.input} type="date" value={start} min={today} onChange={(e) => setStart(e.target.value || today)} /></label>
          <div className={r.field}><span>Berlaku sampai</span>
            {dur === "custom"
              ? <input className={r.input} type="date" value={customEnd} min={start} onChange={(e) => setCustomEnd(e.target.value)} />
              : <div className={r.input} style={{ display: "flex", alignItems: "center" }}><b>{fmtDate(end, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</b>&nbsp;<span className={r.mute}>· {days} hari</span></div>}
          </div>
          <div className={`${r.field} ${r.full}`}><span>Durasi pemakaian</span>
            <div className={r.chips}>{WIFI_DURATIONS.map((d) => <button key={d.key} type="button" className={r.chip} aria-pressed={dur === d.key} onClick={() => { setDur(d.key); if (d.key === "custom") setCustomEnd(end); }}>{d.label}</button>)}</div>
          </div>
          <label className={`${r.field} ${r.full}`}><span>Keperluan <em>(opsional)</em></span><input className={r.input} value={f.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="mis. audit, vendor, training" /></label>
        </div>
      </section>

      <section className={r.card}>
        <div className={r.cardHead}><h2>Akun yang disarankan</h2><small>berlaku ≥ {fmtDate(end)} · butuh {slots} slot</small></div>
        <p className={r.hint}>Hanya akun yang masa berlakunya cukup sampai tanggal selesai. Urutan teratas = paling pas (paling cepat habis), jadi tamu harian memakai akun 30 hari dan pemakaian panjang otomatis ke akun berdurasi panjang.</p>
        {sugs === null ? <p className={r.empty}>Mencari akun…</p> : sugs.length === 0 ? (
          <div className={r.warn}>Tidak ada akun yang cukup sampai {fmtDate(end)} dengan {slots} slot kosong. Impor akun baru dari IT (tab “Akun dari IT”) atau kurangi durasi.</div>
        ) : (
          <div className={r.sugs}>
            {sugs.map((s) => (
              <button key={s.id} type="button" className={r.sug} aria-pressed={pick === s.id} onClick={() => setPick(s.id)}>
                <span className={r.radio} />
                <span><b>{s.username}</b><small>akun {s.durationDays + 1} hari · berlaku s/d {fmtDate(s.validUntil)} ({s.daysLeft} hari lagi)</small></span>
                <span className={r.slotDots} title={`${s.free} slot kosong`}>{Array.from({ length: Math.max(s.free, 0) }, (_, i) => <i key={i} />)}</span>
              </button>
            ))}
          </div>
        )}
        {err && <div className={r.err}>{err}</div>}
        <button type="button" className={r.btn} disabled={!canSave} onClick={submit}>{busy ? "Menyimpan…" : "Beri akses & kirim tanda terima"}</button>
        {done && <Receipt done={done} onClose={() => setDone(null)} />}
      </section>
    </div>
  );
}

function Receipt({ done, onClose }: { done: { res: WifiGrantResult; email: string; emailErr: string; guest: string; slots: number }; onClose: () => void }) {
  const t = `No. ${done.res.receiptNo}\nUser: ${done.res.username}\nPassword: ${done.res.password}\nBerlaku sampai: ${fmtDate(done.res.endDate)}`;
  return (
    <div className={r.receipt} role="status">
      <div className={r.row}><span className={r.kicker}>Tanda terima</span><b>{done.res.receiptNo}</b><span className={r.grow} /><button type="button" className={r.link} style={{ color: "#fff" }} onClick={onClose}>Tutup</button></div>
      <div className={r.cred}><div><small>User</small><b>{done.res.username}</b></div><div><small>Password</small><b>{done.res.password}</b></div></div>
      <div>{done.guest} · {done.slots} slot · berlaku sampai <b>{fmtDate(done.res.endDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b></div>
      <div style={{ fontSize: 12.5, opacity: 0.85 }}>{done.email ? (done.emailErr ? `⚠ ${done.emailErr}` : `✓ Tanda terima dikirim ke ${done.email}`) : "Email requestor kosong — tanda terima tidak dikirim."}</div>
      <div className={r.row}><button type="button" className={r.ghost} onClick={() => navigator.clipboard?.writeText(t)}>Salin</button></div>
    </div>
  );
}

/* ── Tamu aktif ── */
function ActiveList({ grants, reload }: { grants: WifiGrant[]; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const today = todayISO();
  const list = grants.filter((g) => !q || [g.guestName, g.guestCompany, g.requestorName, g.username, g.receiptNo, g.department].join(" ").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  async function back(g: WifiGrant) {
    setBusy(g.id);
    try { await returnWifi(g.id); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  return (
    <section className={r.card}>
      <div className={r.cardHead}><h2>Tamu aktif</h2><input className={r.input} style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tamu, akun, nomor…" /></div>
      <p className={r.hint}>Slot kembali otomatis di akhir tanggal “berlaku sampai”. Klik <b>Kembalikan</b> bila tamu pulang lebih awal.</p>
      {list.length === 0 ? <p className={r.empty}>Tidak ada tamu yang sedang memakai wifi.</p> : (
        <div className={r.list}>
          {list.map((g) => (
            <div key={g.id} className={r.item}>
              <div>
                <b>{g.guestName}</b>{g.guestCompany && <span className={r.mute}> · {g.guestCompany}</span>}
                <div className={r.meta}>
                  <span className={r.mono}>{g.username}</span><span>{g.slots} slot</span>
                  <span>s/d {fmtDate(g.endDate)}{g.endDate === today ? " (hari ini)" : ""}</span>
                  <span>{g.requestorName}{g.department ? ` · ${g.department}` : ""}</span><span className={r.mute}>{g.receiptNo}</span>
                </div>
              </div>
              <div className={r.itemSide}><button type="button" className={r.ghost} disabled={busy === g.id} onClick={() => back(g)}>{busy === g.id ? "…" : "Kembalikan"}</button></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Akun dari IT ── */
function Accounts({ accounts, reload }: { accounts: WifiAccount[]; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<"all" | WifiStatus>("all");
  const [show, setShow] = useState(false);
  const [imp, setImp] = useState(false);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    accounts.forEach((a) => { c[a.status] = (c[a.status] ?? 0) + 1; });
    return c;
  }, [accounts]);
  const list = accounts.filter((a) => filter === "all" || a.status === filter);
  async function toggle(a: WifiAccount) { try { await setWifiAccountActive(a.id, !a.active); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }
  async function del(a: WifiAccount) {
    if (!confirm(`Hapus akun ${a.username}?`)) return;
    try { await deleteWifiAccount(a.id); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <h2>Akun wifi dari IT</h2>
        <span className={r.row}>
          <button type="button" className={r.ghost} onClick={() => setShow((x) => !x)}>{show ? "Sembunyikan password" : "Tampilkan password"}</button>
          <ExportButtons rows={list} title="Akun Wifi Tamu" filename="Akun_Wifi" columns={[
            col<WifiAccount>("u", "Username", (a) => a.username), col<WifiAccount>("from", "Berlaku mulai", (a) => fmtDate(a.validFrom)),
            col<WifiAccount>("until", "Berlaku sampai", (a) => fmtDate(a.validUntil)), col<WifiAccount>("slot", "Slot terpakai", (a) => `${a.used}/${a.slots}`),
            col<WifiAccount>("st", "Status", (a) => WIFI_STATUS_LABEL[a.status]), col<WifiAccount>("b", "Batch", (a) => a.batch)]} />
          <button type="button" className={r.btn} onClick={() => setImp(true)}>Impor akun</button>
        </span>
      </div>
      <div className={r.chips}>
        {(["all", "available", "partial", "full", "expired", "inactive"] as const).map((k) => (
          <button key={k} type="button" className={r.chip} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === "all" ? "Semua" : WIFI_STATUS_LABEL[k]} {k === "all" ? accounts.length : counts[k] ?? 0}
          </button>
        ))}
      </div>
      {list.length === 0 ? <p className={r.empty}>{accounts.length ? "Tidak ada akun dengan status ini." : "Belum ada akun. Klik “Impor akun” untuk menempel daftar akun dari IT."}</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>Username</th><th>Password</th><th>Masa berlaku</th><th>Sisa</th><th>Slot</th><th>Status</th><th>Batch</th><th /></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className={r.mono}><b>{a.username}</b></td>
                  <td className={r.mono}>{show ? a.password : "••••••"}</td>
                  <td className={r.nowrap}>{fmtDate(a.validFrom)} – {fmtDate(a.validUntil)} <span className={r.mute}>({a.durationDays + 1} hr)</span></td>
                  <td className={r.nowrap}>{a.daysLeft < 0 ? "–" : `${a.daysLeft} hari`}</td>
                  <td><span className={r.slotDots}>{Array.from({ length: a.slots }, (_, i) => <i key={i} className={i < a.used ? r.used : ""} />)}</span> <span className={r.mute}>{a.used}/{a.slots}</span></td>
                  <td><span className={`${r.pill} ${STATUS_PILL[a.status]}`}>{WIFI_STATUS_LABEL[a.status]}</span></td>
                  <td>{a.batch || "–"}</td>
                  <td className={r.num}><span className={r.row} style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button type="button" className={r.link} onClick={() => toggle(a)}>{a.active ? "Nonaktifkan" : "Aktifkan"}</button>
                    <button type="button" className={`${r.link} ${r.danger}`} onClick={() => del(a)}>Hapus</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {imp && <ImportModal onClose={() => setImp(false)} reload={reload} />}
    </section>
  );
}

function ImportModal({ onClose, reload }: { onClose: () => void; reload: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState(todayISO());
  const [days, setDays] = useState(30);
  const [slots, setSlots] = useState(2);
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const rows: ImportRow[] = useMemo(() => parseAccountsText(text, { validFrom: from, durationDays: days, slots, batch }), [text, from, days, slots, batch]);
  const ok = rows.filter((x) => !x.error);

  async function readFile(file: File) {
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
      setText(lines.join("\n"));
    } else setText(await file.text());
  }
  async function go() {
    setBusy(true); setMsg("");
    try { const res = await importWifiAccounts(ok); await reload(); setMsg(`✓ ${res.created} akun baru, ${res.updated} akun diperbarui.`); setText(""); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={760}>
      <div className={r.modal}>
        <h3>Impor akun wifi dari IT</h3>
        <p className={r.hint}>Tempel dari Excel (salin kolom) atau unggah file .xlsx / .csv. Kolom yang dikenali: <b>Username</b>, <b>Password</b>, <b>Berlaku sampai</b> (atau <b>Durasi/Hari</b>), opsional <b>Berlaku mulai</b>, <b>Slot</b>, <b>Batch</b>. Tanpa baris judul, urutannya: username, password, berlaku sampai. Username yang sudah ada akan diperbarui.</p>
        <div className={r.form}>
          <label className={r.field}><span>Berlaku mulai <em>(jika tidak ada di data)</em></span><input className={r.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <div className={r.field}><span>Masa berlaku <em>(jika tidak ada di data)</em></span>
            <div className={r.chips}>{[30, 60, 90].map((d) => <button key={d} type="button" className={r.chip} aria-pressed={days === d} onClick={() => setDays(d)}>{d} hari</button>)}
              <input className={r.input} style={{ width: 90 }} type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))} aria-label="Hari" /></div>
          </div>
          <label className={r.field}><span>Slot per akun</span><input className={r.input} type="number" min={1} max={10} value={slots} onChange={(e) => setSlots(Math.min(10, Math.max(1, Number(e.target.value) || 2)))} /></label>
          <label className={r.field}><span>Batch / keterangan</span><input className={r.input} value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="mis. Okt 2026 · 30 hari" /></label>
          <label className={`${r.field} ${r.full}`}><span>Data akun</span>
            <textarea className={r.input} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Username\tPassword\tBerlaku sampai\nguest001\tAbc123\t31/10/2026"} />
          </label>
          <label className={`${r.field} ${r.full}`}><span>…atau unggah file</span><input type="file" accept=".xlsx,.csv,.txt" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} /></label>
        </div>
        {rows.length > 0 && (
          <div className={r.previewBox}>
            <table className={r.table}>
              <thead><tr><th>Username</th><th>Password</th><th>Mulai</th><th>Sampai</th><th>Slot</th><th>Batch</th><th /></tr></thead>
              <tbody>{rows.slice(0, 200).map((x, i) => (
                <tr key={i}><td className={r.mono}>{x.username || "–"}</td><td className={r.mono}>{x.password}</td><td>{fmtDate(x.validFrom)}</td><td>{fmtDate(x.validUntil)}</td><td>{x.slots}</td><td>{x.batch}</td>
                  <td>{x.error ? <span className={`${r.pill} ${r.pRed}`}>{x.error}</span> : <span className={`${r.pill} ${r.pGreen}`}>OK</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {msg && <div className={msg.startsWith("✓") ? r.ok : r.err}>{msg}</div>}
        <div className={r.modalActions}>
          <button type="button" className={r.ghost} onClick={onClose}>Tutup</button>
          <button type="button" className={r.btn} disabled={!ok.length || busy} onClick={go}>{busy ? "Mengimpor…" : `Impor ${ok.length} akun`}</button>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ── Riwayat ── */
function History({ grants }: { grants: WifiGrant[] }) {
  const [q, setQ] = useState("");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const list = grants.filter((g) => (!month || monthOf(g.createdAt) === month) && (!q || [g.guestName, g.guestCompany, g.requestorName, g.username, g.receiptNo, g.department, g.lineManager].join(" ").toLowerCase().includes(q.toLowerCase())));
  const today = todayISO();
  const status = (g: WifiGrant) => (g.returnedAt ? "Dikembalikan" : g.endDate < today ? "Selesai" : "Aktif");
  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <h2>Riwayat akses wifi</h2>
        <span className={r.row}>
          <input className={r.input} style={{ width: 160 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Bulan" />
          <input className={r.input} style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" />
          <ExportButtons rows={list} title="Riwayat Wifi Tamu" filename="Wifi_Tamu" period={month} columns={[
            col<WifiGrant>("no", "No. Tanda Terima", (g) => g.receiptNo), col<WifiGrant>("tgl", "Dibuat", (g) => fmtDateTime(g.createdAt)),
            col<WifiGrant>("tamu", "Tamu", (g) => g.guestName + (g.guestCompany ? ` (${g.guestCompany})` : "")), col<WifiGrant>("req", "Requestor", (g) => g.requestorName),
            col<WifiGrant>("dept", "Departemen", (g) => g.department), col<WifiGrant>("lm", "Line Manager", (g) => g.lineManager),
            col<WifiGrant>("akun", "Akun", (g) => g.username), col<WifiGrant>("slot", "Slot", (g) => g.slots, "right"),
            col<WifiGrant>("per", "Periode", (g) => `${fmtDate(g.startDate)} – ${fmtDate(g.endDate)}`), col<WifiGrant>("st", "Status", status)]} />
        </span>
      </div>
      {list.length === 0 ? <p className={r.empty}>Tidak ada data.</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>No.</th><th>Tamu</th><th>Requestor</th><th>Akun</th><th>Periode</th><th>Status</th><th>Email</th></tr></thead>
            <tbody>{list.map((g) => (
              <tr key={g.id}>
                <td className={`${r.mono} ${r.nowrap}`}>{g.receiptNo}</td>
                <td><b>{g.guestName}</b>{g.guestCompany && <div className={r.mute}>{g.guestCompany}</div>}</td>
                <td>{g.requestorName}<div className={r.mute}>{[g.department, g.lineManager && `LM: ${g.lineManager}`].filter(Boolean).join(" · ")}</div></td>
                <td className={r.mono}>{g.username} <span className={r.mute}>· {g.slots} slot</span></td>
                <td className={r.nowrap}>{fmtDate(g.startDate)} – {fmtDate(g.endDate)}</td>
                <td><span className={`${r.pill} ${g.returnedAt ? r.pGray : g.endDate < today ? r.pGray : r.pGreen}`}>{status(g)}</span></td>
                <td>{g.emailSentAt ? <span className={`${r.pill} ${r.pBlue}`}>Terkirim</span> : <span className={r.mute}>–</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
