"use client";

/* ════════════════════════════════════════════════════════════
   RECEPTIONIST — pilar Fasilitas.
   Dashboard harian (dokumen masuk/keluar, booking, wifi, tamu) · Tamu · Wifi Guest ·
   Barang & Surat · Induction Room · Data Master · Pengaturan.
   Database: supabase/01_dasar.sql (bagian 031) & 04_aplikasi_lapangan.sql (052, 055) · Email: send-receptionist-email.
════════════════════════════════════════════════════════════ */

import { SettingsGroup, SettingsPage } from "@/components/settings/Settings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MyProfile } from "@/lib/api";
import { getBookings, getContacts, getRcpEmployees, getParcels, getRcpSettings, getVisitors, getWifiAccounts, getWifiGrants, saveRcpSettings } from "@/lib/receptionist/api";
import {
  DEFAULT_SETTINGS, addDays, addMonths, toMin, todayISO, wibDay,
  type Contact, type Parcel, type RcpEmployee, type RcpSettings, type RoomBooking, type Visitor, type WifiAccount, type WifiGrant } from "@/lib/receptionist/model";
import RcpWifi from "./RcpWifi";
import RcpParcels from "./RcpParcels";
import RcpRoom from "./RcpRoom";
import RcpData from "./RcpData";
import RcpDashboard from "./RcpDashboard";
import RcpVisitors, { VisitorModal } from "./RcpVisitors";
import { useNow } from "./useNow";
import type { Directory, RcpView } from "./shared";
import r from "./receptionist.module.css";
import d from "./rcpdash.module.css";

import { L } from "@/lib/i18n";
type View = RcpView;

export default function ReceptionistTab({ myProfile }: { myProfile: MyProfile | null }) {
  const [view, setView] = useState<View>("dashboard");
  const [settings, setSettings] = useState<RcpSettings>(DEFAULT_SETTINGS);
  const [accounts, setAccounts] = useState<WifiAccount[]>([]);
  const [grants, setGrants] = useState<WifiGrant[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [visError, setVisError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<RcpEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // hari yang dilihat: null = "ikut hari ini" (otomatis berganti saat lewat tengah malam WIB), selain itu tanggal pilihan pengguna
  const [picked, setPicked] = useState<string | null>(null);
  const nowMs = useNow(30000);
  const today = wibDay(nowMs);
  const day = picked ?? today;
  const [parcelDir, setParcelDir] = useState<"all" | "in" | "out">("all");
  const [vm, setVm] = useState<{ edit: Visitor | null } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  // rentang tanggal yang sudah dimuat untuk tamu & booking (digeser bila pengguna membuka tanggal yang jauh)
  const range = useRef({ from: addDays(todayISO(), -29), to: addDays(todayISO(), 14) });

  const notify = useCallback((m: { ok: boolean; text: string }) => { setToast(m); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.ok ? 3600 : 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const loadWifi = useCallback(async () => {
    const since = addMonths(todayISO(), -12);
    const [a, g] = await Promise.all([getWifiAccounts(), getWifiGrants(new Date(since + "T00:00:00").toISOString())]);
    setAccounts(a); setGrants(g);
  }, []);
  const loadParcels = useCallback(async () => {
    setParcels(await getParcels(new Date(addMonths(todayISO(), -6) + "T00:00:00").toISOString()));
  }, []);
  /** Booking + tamu pada rentang aktif. Gagalnya tamu (mis. SQL 055 belum dijalankan) tidak mengganggu bagian lain. */
  const loadRange = useCallback(async () => {
    const { from, to } = range.current;
    const [b, v] = await Promise.all([
      getBookings(from, to),
      getVisitors(from, to).then((x) => { setVisError(""); return x; }).catch((e) => { setVisError(e instanceof Error ? e.message : String(e)); return [] as Visitor[]; }),
    ]);
    setBookings(b); setVisitors(v);
  }, []);
  const loadContacts = useCallback(async () => { setContacts(await getContacts()); }, []);

  const loadAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [s] = await Promise.all([getRcpSettings(), loadWifi(), loadParcels(), loadRange(), loadContacts()]);
      setSettings(s);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
    getRcpEmployees().then(setEmployees).catch(() => {});
  }, [loadWifi, loadParcels, loadRange, loadContacts]);
  useEffect(() => { loadAll(); }, [loadAll]);

  /** Ganti tanggal yang dilihat; bila di luar rentang yang sudah dimuat, rentang diperluas lalu data dimuat ulang. */
  const setDay = useCallback((next: string) => {
    setPicked(next === todayISO() ? null : next);
    const cur = range.current;
    if (next < cur.from || next > cur.to) {
      range.current = { from: next < cur.from ? addDays(next, -14) : cur.from, to: next > cur.to ? addDays(next, 14) : cur.to };
      loadRange().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [loadRange]);

  // data tetap segar: muat ulang diam-diam tiap menit (tab terlihat) dan saat tab dibuka kembali — menghindari angka basi dari perangkat / pengguna lain
  const refreshQuiet = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try { await Promise.all([loadWifi(), loadParcels(), loadRange()]); } catch { /* data lama tetap tampil */ }
  }, [loadWifi, loadParcels, loadRange]);
  useEffect(() => {
    const id = window.setInterval(() => { void refreshQuiet(); }, 60000);
    const onVis = () => { if (document.visibilityState === "visible") void refreshQuiet(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [refreshQuiet]);
  // lewat tengah malam: perluas rentang tamu/booking ke depan supaya hari baru langsung terisi
  useEffect(() => {
    const need = addDays(today, 14);
    if (range.current.to < need) { range.current = { ...range.current, to: need }; loadRange().catch(() => {}); }
  }, [today, loadRange]);

  const goTo = useCallback((v: View, o?: { parcelDir?: "in" | "out" }) => { if (o?.parcelDir) setParcelDir(o.parcelDir); setView(v); }, []);

  const dir: Directory = useMemo(() => ({ contacts, employees }), [contacts, employees]);
  const reloadWifi = useCallback(async () => { await Promise.all([loadWifi(), loadContacts()]); }, [loadWifi, loadContacts]);
  const reloadParcels = useCallback(async () => { await Promise.all([loadParcels(), loadContacts()]); }, [loadParcels, loadContacts]);

  const waiting = parcels.filter((p) => p.status === "waiting").length;
  const insideNow = visitors.filter((v) => v.visitDate === today && !v.checkedOutAt).length;
  const reloadEmployees = useCallback(async () => { setEmployees(await getRcpEmployees()); }, []);
  const TABS: [View, string, number?][] = [["dashboard", "Dashboard"], ["visitors", L("Tamu", "Visitors"), insideNow], ["wifi", "Wifi Guest"], ["parcels", L("Barang & Surat", "Items & Mail"), waiting], ["room", settings.roomName], ["data", L("Data Master", "Master Data")], ["settings", L("Pengaturan", "Settings")]];

  return (
    <div className={r.wrap}>
      <header className={r.head}>
        <div className={r.headText}>
          <span className={r.kicker}>Fasilitas · Receptionist</span>
          <h1>Receptionist</h1>
          <p>{L("Tamu yang datang, akses wifi tamu, barang & surat, dan booking", "Visitors, guest wifi access, items & mail, and booking of")} {settings.roomName} {L("dalam satu tempat.", "in one place.")}</p>
        </div>
        <button type="button" className={r.ghost} onClick={loadAll} disabled={loading}>{loading ? L("Memuat…", "Loading…") : L("↻ Muat ulang", "↻ Reload")}</button>
      </header>
      <nav className={r.tabs} aria-label="Receptionist">
        {TABS.map(([k, l, n]) => (
          <button key={k} type="button" className={`${r.tab} ${view === k ? r.tabOn : ""}`} onClick={() => setView(k)} aria-current={view === k ? "page" : undefined}>
            {l}{n ? <span className={r.badge}>{n}</span> : null}
          </button>
        ))}
      </nav>
      {error && <div className={r.err}>{error}</div>}
      {visError && (view === "dashboard" || view === "visitors") && <div className={r.warn}>{visError}</div>}

      {view === "dashboard" && (
        <RcpDashboard myProfile={myProfile} settings={settings} accounts={accounts} grants={grants} parcels={parcels} bookings={bookings} visitors={visitors}
          day={day} setDay={setDay} go={goTo} onNewVisitor={() => setVm({ edit: null })} reloadVisitors={loadRange} notify={notify} />
      )}
      {view === "visitors" && <RcpVisitors visitors={visitors} day={day} setDay={setDay} reload={loadRange} onNew={() => setVm({ edit: null })} onEdit={(v) => setVm({ edit: v })} notify={notify} />}
      {view === "wifi" && <RcpWifi settings={settings} accounts={accounts} grants={grants} dir={dir} reload={reloadWifi} />}
      {view === "parcels" && <RcpParcels parcels={parcels} dir={dir} reload={reloadParcels} day={day} setDay={setDay} dirFilter={parcelDir} setDirFilter={setParcelDir} />}
      {view === "room" && <RcpRoom settings={settings} dir={dir} onChanged={() => loadRange().catch(() => {})} />}
      {view === "data" && <RcpData employees={employees} accounts={accounts} reloadEmployees={reloadEmployees} reloadWifi={reloadWifi} />}
      {view === "settings" && <Settings settings={settings} onSaved={(s) => setSettings(s)} />}

      {vm && (
        <VisitorModal edit={vm.edit} dir={dir} history={visitors} onClose={() => setVm(null)}
          onSaved={async (msg) => { setVm(null); try { await loadRange(); } catch { /* data lama tetap tampil */ } notify({ ok: true, text: msg }); }} />
      )}
      {toast && <div className={`${d.toast} ${toast.ok ? "" : d.bad}`} role="status" aria-live="polite" onClick={() => setToast(null)}>{toast.text}</div>}
    </div>
  );
}

/* ── Pengaturan ── */
function Settings({ settings, onSaved }: { settings: RcpSettings; onSaved: (s: RcpSettings) => void }) {
  // Model CRUD standar: setiap nilai diubah lewat formulir sendiri dan langsung tersimpan.
  async function save(patch: Partial<RcpSettings>) {
    const next = { ...settings, ...patch, slotMinutes: Number(patch.slotMinutes ?? settings.slotMinutes) };
    if (toMin(next.closeTime) <= toMin(next.openTime)) throw new Error(L("Jam tutup harus setelah jam buka.", "Closing time must be after opening time."));
    await saveRcpSettings(next);
    onSaved(next);
  }
  const values = settings as unknown as RcpSettings & Record<string, unknown>;
  type V = typeof values;
  return (
    <SettingsPage>
      <SettingsGroup<V>
        icon="🚪" title={L("Ruangan", "Room")} values={values} onSave={save}
        desc={L("Booking boleh lebih dari satu slot (mis. 08:00–11:30). Panjang slot hanya mengatur ketelitian pilihan jam.", "A booking may span more than one slot (e.g. 08:00–11:30). The slot length only sets the granularity of the time picker.")}
        items={[
          { key: "roomName", label: L("Nama ruangan", "Room name"), required: true },
          { key: "openTime", label: L("Jam buka", "Opening time"), type: "time", required: true },
          { key: "closeTime", label: L("Jam tutup", "Closing time"), type: "time", required: true },
          { key: "slotMinutes", label: "Panjang slot", type: "chips", required: true,
            options: [15, 30, 60].map((m) => ({ value: String(m), label: `${m} menit` })), display: (v) => `${v} menit` },
        ]}
      />
      <SettingsGroup<V>
        icon="📶" title="Wifi Guest" values={values} onSave={save}
        desc={L("Dicantumkan di email akses wifi untuk tamu.", "Included in the guest wifi access email.")}
        items={[
          { key: "wifiSsid", label: L("Nama wifi (SSID)", "Wifi name (SSID)"), placeholder: "mis. FFI-Guest" },
          { key: "wifiTerms", label: "Ketentuan", type: "textarea", hint: "Satu baris satu poin" },
        ]}
      />
    </SettingsPage>
  );
}
