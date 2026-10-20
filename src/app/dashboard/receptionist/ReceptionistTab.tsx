"use client";

/* ════════════════════════════════════════════════════════════
   RECEPTIONIST — pilar Fasilitas.
   Dashboard (wifi, barang menunggu, booking hari ini) · Wifi Guest ·
   Barang & Surat · Induction Room · Pengaturan.
   Database: supabase/031_receptionist.sql · Email: send-receptionist-email.
════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MyProfile } from "@/lib/api";
import { getBookings, getContacts, getRcpEmployees, getParcels, getRcpSettings, getWifiAccounts, getWifiGrants, saveRcpSettings } from "@/lib/receptionist/api";
import {
  DEFAULT_SETTINGS, addDays, addMonths, fmtDate, fmtDateTime, grantActive, monthLabel, toMin, todayISO, usageByDeptMonth,
  type Contact, type Parcel, type RcpEmployee, type RcpSettings, type RoomBooking, type WifiAccount, type WifiGrant,
} from "@/lib/receptionist/model";
import RcpWifi from "./RcpWifi";
import RcpParcels from "./RcpParcels";
import RcpRoom from "./RcpRoom";
import RcpData from "./RcpData";
import { ExportButtons, col, type Directory } from "./shared";
import r from "./receptionist.module.css";

type View = "dashboard" | "wifi" | "parcels" | "room" | "data" | "settings";

export default function ReceptionistTab({ myProfile }: { myProfile: MyProfile | null }) {
  void myProfile;
  const [view, setView] = useState<View>("dashboard");
  const [settings, setSettings] = useState<RcpSettings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<WifiAccount[]>([]);
  const [grants, setGrants] = useState<WifiGrant[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [today, setToday] = useState<RoomBooking[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<RcpEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWifi = useCallback(async () => {
    const since = addMonths(todayISO(), -12);
    const [a, g] = await Promise.all([getWifiAccounts(), getWifiGrants(new Date(since + "T00:00:00").toISOString())]);
    setAccounts(a); setGrants(g);
  }, []);
  const loadParcels = useCallback(async () => {
    setParcels(await getParcels(new Date(addMonths(todayISO(), -6) + "T00:00:00").toISOString()));
  }, []);
  const loadToday = useCallback(async () => { const t = todayISO(); setToday(await getBookings(t, t)); }, []);
  const loadContacts = useCallback(async () => { setContacts(await getContacts()); }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s] = await Promise.all([getRcpSettings(), loadWifi(), loadParcels(), loadToday(), loadContacts()]);
      setSettings(s);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
    getRcpEmployees().then(setEmployees).catch(() => {});
  }, [loadWifi, loadParcels, loadToday, loadContacts]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const dir: Directory = useMemo(() => ({ contacts, employees }), [contacts, employees]);
  const reloadWifi = useCallback(async () => { await Promise.all([loadWifi(), loadContacts()]); }, [loadWifi, loadContacts]);
  const reloadParcels = useCallback(async () => { await Promise.all([loadParcels(), loadContacts()]); }, [loadParcels, loadContacts]);

  const waiting = parcels.filter((p) => p.status === "waiting").length;
  const reloadEmployees = useCallback(async () => { setEmployees(await getRcpEmployees()); }, []);
  const TABS: [View, string, number?][] = [["dashboard", "Dashboard"], ["wifi", "Wifi Guest"], ["parcels", "Barang & Surat", waiting], ["room", settings.roomName], ["data", "Data Master"], ["settings", "Pengaturan"]];

  return (
    <div className={r.wrap}>
      <header className={r.head}>
        <div className={r.headText}>
          <span className={r.kicker}>Fasilitas · Receptionist</span>
          <h1>Receptionist</h1>
          <p>Akses wifi tamu, barang &amp; surat, dan booking {settings.roomName} dalam satu tempat.</p>
        </div>
        <button type="button" className={r.ghost} onClick={loadAll} disabled={loading}>{loading ? "Memuat…" : "↻ Muat ulang"}</button>
      </header>
      <nav className={r.tabs} aria-label="Receptionist">
        {TABS.map(([k, l, n]) => (
          <button key={k} type="button" className={`${r.tab} ${view === k ? r.tabOn : ""}`} onClick={() => setView(k)} aria-current={view === k ? "page" : undefined}>
            {l}{n ? <span className={r.badge}>{n}</span> : null}
          </button>
        ))}
      </nav>
      {error && <div className={r.err}>{error}</div>}

      {view === "dashboard" && <Dashboard accounts={accounts} grants={grants} parcels={parcels} today={today} settings={settings} go={setView} />}
      {view === "wifi" && <RcpWifi settings={settings} accounts={accounts} grants={grants} dir={dir} reload={reloadWifi} />}
      {view === "parcels" && <RcpParcels parcels={parcels} dir={dir} reload={reloadParcels} />}
      {view === "room" && <RcpRoom settings={settings} dir={dir} onChanged={() => loadToday().catch(() => {})} />}
      {view === "data" && <RcpData employees={employees} accounts={accounts} reloadEmployees={reloadEmployees} reloadWifi={reloadWifi} />}
      {view === "settings" && <Settings settings={settings} onSaved={(s) => setSettings(s)} />}
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard({ accounts, grants, parcels, today, settings, go }: {
  accounts: WifiAccount[]; grants: WifiGrant[]; parcels: Parcel[]; today: RoomBooking[]; settings: RcpSettings; go: (v: View) => void;
}) {
  const t = todayISO();
  const usable = accounts.filter((a) => a.active && a.validUntil >= t);
  const totalSlots = usable.reduce((s, a) => s + a.slots, 0);
  const freeSlots = usable.reduce((s, a) => s + a.free, 0);
  const expiring = usable.filter((a) => a.validUntil <= addDays(t, 7)).sort((a, b) => a.validUntil.localeCompare(b.validUntil));
  const activeGuests = grants.filter((g) => grantActive(g));
  const waiting = parcels.filter((p) => p.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waitIn = waiting.filter((p) => p.direction === "in").length;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nextBk = today.find((b) => toMin(b.end) > nowMin);
  const pctFree = totalSlots ? (freeSlots / totalSlots) * 100 : 0;
  const usage = useMemo(() => {
    const u = usageByDeptMonth(grants);
    return { months: u.months.slice(-6), rows: u.rows.slice(0, 10) };
  }, [grants]);
  const maxCell = Math.max(1, ...usage.rows.flatMap((x) => usage.months.map((m) => x.byMonth[m] ?? 0)));
  const ageDays = (p: Parcel) => Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86400000);

  return (
    <>
      <div className={r.kpis}>
        <button type="button" className={r.kpi} style={{ ["--c" as string]: pctFree < 15 ? "var(--red)" : pctFree < 35 ? "var(--orange)" : "var(--green)" }} onClick={() => go("wifi")}>
          <small>Slot wifi tersedia</small>
          <b>{freeSlots} <em>dari {totalSlots}</em></b>
          <span className={r.meter}><i style={{ width: `${pctFree}%` }} /></span>
          <span>{activeGuests.length} tamu aktif · {usable.length} akun berlaku</span>
        </button>
        <button type="button" className={r.kpi} style={{ ["--c" as string]: expiring.length ? "var(--orange)" : "var(--green)" }} onClick={() => go("wifi")}>
          <small>Akun habis ≤ 7 hari</small><b>{expiring.length}</b>
          <span>{expiring[0] ? `terdekat ${expiring[0].username} · ${fmtDate(expiring[0].validUntil)}` : "tidak ada"}</span>
        </button>
        <button type="button" className={r.kpi} style={{ ["--c" as string]: waiting.some((p) => ageDays(p) >= 2) ? "var(--orange)" : "var(--brand)" }} onClick={() => go("parcels")}>
          <small>Barang menunggu</small><b>{waiting.length}</b>
          <span>{waitIn} masuk · {waiting.length - waitIn} keluar{waiting.some((p) => ageDays(p) >= 2) ? ` · ${waiting.filter((p) => ageDays(p) >= 2).length} > 2 hari` : ""}</span>
        </button>
        <button type="button" className={r.kpi} style={{ ["--c" as string]: "var(--green)" }} onClick={() => go("room")}>
          <small>Booking {settings.roomName} hari ini</small><b>{today.length}</b>
          <span>{nextBk ? `berikutnya ${nextBk.start} · ${nextBk.title}` : today.length ? "semua sudah selesai" : "ruangan kosong"}</span>
        </button>
      </div>

      <div className={r.grid3}>
        <section className={r.card}>
          <div className={r.cardHead}><h2>Barang menunggu diambil</h2><button type="button" className={r.link} onClick={() => go("parcels")}>Kelola →</button></div>
          {waiting.length === 0 ? <p className={r.empty}>Tidak ada barang yang menunggu.</p> : (
            <div className={r.list}>
              {waiting.slice(0, 6).map((p) => (
                <div key={p.id} className={r.item}>
                  <div><b className={p.direction === "in" ? r.dirIn : r.dirOut}>{p.direction === "in" ? "⬇" : "⬆"} {p.direction === "in" ? p.recipient : p.sender}</b>
                    <div className={r.meta}><span className={r.mono}>{p.receiptNo}</span><span>{p.itemType}</span><span>{fmtDateTime(p.createdAt)}</span></div></div>
                  {ageDays(p) >= 2 ? <span className={`${r.pill} ${r.pOrange}`}>{ageDays(p)} hari</span> : <span className={`${r.pill} ${r.pBlue}`}>baru</span>}
                </div>
              ))}
              {waiting.length > 6 && <span className={r.mute}>+{waiting.length - 6} lainnya</span>}
            </div>
          )}
        </section>

        <section className={r.card}>
          <div className={r.cardHead}><h2>{settings.roomName} hari ini</h2><button type="button" className={r.link} onClick={() => go("room")}>Buka jadwal →</button></div>
          {today.length === 0 ? <p className={r.empty}>Tidak ada booking hari ini.</p> : (
            <div className={r.timeline}>
              {today.map((b) => (
                <div key={b.id} className={`${r.tl} ${toMin(b.start) <= nowMin && nowMin < toMin(b.end) ? r.tlNow : ""}`} style={toMin(b.end) <= nowMin ? { opacity: 0.55 } : undefined}>
                  <b>{b.start}–{b.end}</b>
                  <span><b style={{ fontFamily: "inherit" }}>{b.title}</b><div className={r.mute}>{[b.pic, b.department, b.attendees ? `${b.attendees} orang` : ""].filter(Boolean).join(" · ")}</div></span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={r.card}>
          <div className={r.cardHead}><h2>Akun wifi yang akan habis</h2><small>≤ 7 hari</small></div>
          {expiring.length === 0 ? <p className={r.empty}>Tidak ada akun yang habis dalam 7 hari.</p> : (
            <div className={r.tableBox}>
              <table className={r.table}>
                <thead><tr><th>Akun</th><th>Berlaku sampai</th><th>Sisa</th><th>Slot terpakai</th></tr></thead>
                <tbody>{expiring.map((a) => (
                  <tr key={a.id}><td className={r.mono}><b>{a.username}</b></td><td>{fmtDate(a.validUntil)}</td>
                    <td><span className={`${r.pill} ${a.daysLeft <= 2 ? r.pRed : r.pOrange}`}>{a.daysLeft === 0 ? "hari ini" : `${a.daysLeft} hari`}</span></td><td>{a.used}/{a.slots}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className={r.card} style={{ gridColumn: "1 / -1" }}>
          <div className={r.cardHead}>
            <h2>Pemakaian wifi per departemen</h2>
            <ExportButtons rows={usage.rows} title="Pemakaian Wifi Tamu per Departemen" filename="Wifi_per_Departemen" columns={[
              col<(typeof usage.rows)[number]>("d", "Departemen", (x) => x.dept),
              ...usage.months.map((m) => col<(typeof usage.rows)[number]>(m, monthLabel(m), (x) => x.byMonth[m] ?? 0, "right")),
              col<(typeof usage.rows)[number]>("t", "Total", (x) => usage.months.reduce((s, m) => s + (x.byMonth[m] ?? 0), 0), "right")]} />
          </div>
          {usage.rows.length === 0 ? <p className={r.empty}>Belum ada pemakaian.</p> : (
            <div className={r.tableBox}>
              <table className={r.table}>
                <thead><tr><th>Departemen</th>{usage.months.map((m) => <th key={m} className={r.num}>{monthLabel(m)}</th>)}</tr></thead>
                <tbody>{usage.rows.map((x) => (
                  <tr key={x.dept}><td>{x.dept}</td>{usage.months.map((m) => (
                    <td key={m} className={r.num}><span className={r.heat} style={{ ["--h" as string]: Math.round(((x.byMonth[m] ?? 0) / maxCell) * 45) }}>{x.byMonth[m] ?? 0}</span></td>
                  ))}</tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className={r.hint}>Jumlah tanda terima wifi per bulan (6 bulan terakhir).</p>
        </section>
      </div>
    </>
  );
}

/* ── Pengaturan ── */
function Settings({ settings, onSaved }: { settings: RcpSettings; onSaved: (s: RcpSettings) => void }) {
  const [s, setS] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setS(settings), [settings]);
  const set = <K extends keyof RcpSettings>(k: K, v: RcpSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const valid = toMin(s.closeTime) > toMin(s.openTime);
  async function save() {
    setBusy(true); setMsg(null);
    try { await saveRcpSettings(s); onSaved(s); setMsg({ ok: true, text: "✓ Pengaturan disimpan." }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  }
  return (
    <div className={r.grid2}>
      <section className={r.card}>
        <div className={r.cardHead}><h2>Ruangan</h2></div>
        <div className={r.form}>
          <label className={`${r.field} ${r.full}`}><span>Nama ruangan</span><input className={r.input} value={s.roomName} onChange={(e) => set("roomName", e.target.value)} /></label>
          <label className={r.field}><span>Jam buka</span><input className={r.input} type="time" step={900} value={s.openTime} onChange={(e) => set("openTime", e.target.value)} /></label>
          <label className={r.field}><span>Jam tutup</span><input className={r.input} type="time" step={900} value={s.closeTime} onChange={(e) => set("closeTime", e.target.value)} /></label>
          <div className={`${r.field} ${r.full}`}><span>Panjang slot grid</span>
            <div className={r.chips}>{[15, 30, 60].map((m) => <button key={m} type="button" className={r.chip} aria-pressed={s.slotMinutes === m} onClick={() => set("slotMinutes", m)}>{m} menit</button>)}</div>
          </div>
        </div>
        <p className={r.hint}>Booking boleh lebih dari 1 slot (mis. 08:00–11:30). Panjang slot hanya mengatur ketelitian pilihan jam.</p>
      </section>
      <section className={r.card}>
        <div className={r.cardHead}><h2>Wifi Guest</h2></div>
        <div className={r.form}>
          <label className={`${r.field} ${r.full}`}><span>Nama wifi (SSID) <em>— dicantumkan di email</em></span><input className={r.input} value={s.wifiSsid} onChange={(e) => set("wifiSsid", e.target.value)} placeholder="mis. FFI-Guest" /></label>
          <label className={`${r.field} ${r.full}`}><span>Ketentuan <em>— satu baris satu poin</em></span><textarea className={r.input} style={{ minHeight: 140 }} value={s.wifiTerms} onChange={(e) => set("wifiTerms", e.target.value)} /></label>
        </div>
      </section>
      <div className={`${r.card} ${r.full}`} style={{ gridColumn: "1 / -1", flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        {!valid && <div className={r.err}>Jam tutup harus setelah jam buka.</div>}
        {msg && <div className={msg.ok ? r.ok : r.err}>{msg.text}</div>}
        <span className={r.grow} />
        <button type="button" className={r.btn} disabled={busy || !valid} onClick={save}>{busy ? "Menyimpan…" : "Simpan pengaturan"}</button>
      </div>
    </div>
  );
}
