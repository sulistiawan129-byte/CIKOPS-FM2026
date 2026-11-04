"use client";

/* Dashboard Receptionist — ringkasan HARIAN: dokumen masuk, dokumen keluar, booking Induction Room,
   peminjaman Wifi Guest, dan tamu yang datang; grafik 14 hari interaktif, jejak aktivitas, tamu yang masih
   di lokasi, jadwal ruangan, serta hal yang perlu perhatian. */

import { useMemo, useState } from "react";
import type { MyProfile } from "@/lib/api";
import { checkoutVisitor } from "@/lib/receptionist/api";
import { dayFeed, dayStats, daySeries, type DayStats, type FeedKind } from "@/lib/receptionist/daily";
import {
  addDays, addMonths, fmtDate, fmtDateTime, fmtDuration, fmtTime, grantActive, itemTypeLabel, monthLabel, wibDay, toMin, usageByDeptMonth, visitMinutes,
  type Parcel, type RcpSettings, type RoomBooking, type Visitor, type WifiAccount, type WifiGrant,
} from "@/lib/receptionist/model";
import { ExportButtons, col, type RcpView } from "./shared";
import { Avatar } from "./RcpVisitors";
import { useCountUp, useNow } from "./useNow";
import r from "./receptionist.module.css";
import d from "./rcpdash.module.css";

import { L } from "@/lib/i18n";

type MKey = "docsIn" | "docsOut" | "bookings" | "wifi" | "guests";
const KEYS: MKey[] = ["docsIn", "docsOut", "bookings", "wifi", "guests"];
const PAL: Record<MKey, [string, string]> = {
  docsIn: ["#2d5bff", "#58a0ff"], docsOut: ["#7a5af0", "#b08cff"], bookings: ["#0f9d74", "#27c9a8"], wifi: ["#e08a00", "#ffb62e"], guests: ["#e0407a", "#ff7eaa"],
};
const ICON: Record<MKey, string> = { docsIn: "📥", docsOut: "📤", bookings: "🚪", wifi: "📶", guests: "🙋" };
const FEED_ICON: Record<FeedKind, [string, string]> = {
  "visitor-in": ["🙋", PAL.guests[0]], "visitor-out": ["👋", "#8a94b8"], "doc-in": ["📥", PAL.docsIn[0]], "doc-out": ["📤", PAL.docsOut[0]], handover: ["✅", "#0f9d74"], wifi: ["📶", PAL.wifi[0]], booking: ["🚪", PAL.bookings[0]],
};
const FEED_TAB: Record<FeedKind, RcpView> = { "visitor-in": "visitors", "visitor-out": "visitors", "doc-in": "parcels", "doc-out": "parcels", handover: "parcels", wifi: "wifi", booking: "room" };

const label = (k: MKey, room: string) => ({
  docsIn: L("Dokumen / barang masuk", "Documents / items in"), docsOut: L("Dokumen / barang keluar", "Documents / items out"), bookings: `${L("Booking", "Bookings")} ${room}`,
  wifi: L("Peminjaman Wifi Guest", "Guest wifi loans"), guests: L("Tamu datang", "Visitors"),
}[k]);
// angka utama dokumen/barang = jumlah CATATAN (satu serah-terima = satu hitungan); jumlah barang (kolom Jumlah) hanya keterangan
const val = (s: DayStats, k: MKey) => (k === "docsIn" ? s.docsInN : k === "docsOut" ? s.docsOutN : s[k]);

function Spark({ values, color }: { values: number[]; color: string }) {
  const W = 96, H = 30, P = 3;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [P + (i * (W - 2 * P)) / Math.max(1, values.length - 1), H - P - (v / max) * (H - 2 * P)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className={d.spark} viewBox={`0 0 ${W} ${H}`} style={{ ["--c" as string]: color }} aria-hidden>
      <path className={d.sparkArea} d={`${line} L${last[0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`} />
      <path className={d.sparkLine} d={line} />
      <circle cx={last[0]} cy={last[1]} r="3.2" />
    </svg>
  );
}

function Num({ value }: { value: number }) { return <>{useCountUp(value)}</>; }

/** Waktu kantor = WIB (sama dengan database), apa pun zona waktu perangkat. */
const wibClock = (ms: number) => { const t = new Date(ms + 7 * 3600000); return { h: t.getUTCHours(), m: t.getUTCMinutes() }; };

function LiveClock() {
  const now = useNow(1000);
  const { h, m } = wibClock(now);
  const z = (n: number) => String(n).padStart(2, "0");
  return <span className={d.clock} aria-label={L("Jam sekarang (WIB)", "Current time (WIB)")}>{z(h)}<i>:</i>{z(m)}<small className={d.tz}>WIB</small></span>;
}

export default function RcpDashboard({ myProfile, settings, accounts, grants, parcels, bookings, visitors, day, setDay, go, onNewVisitor, reloadVisitors, notify }: {
  myProfile: MyProfile | null; settings: RcpSettings; accounts: WifiAccount[]; grants: WifiGrant[]; parcels: Parcel[]; bookings: RoomBooking[]; visitors: Visitor[];
  day: string; setDay: (d: string) => void; go: (v: RcpView, o?: { parcelDir?: "in" | "out" }) => void; onNewVisitor: () => void; reloadVisitors: () => Promise<void>; notify: (m: { ok: boolean; text: string }) => void;
}) {
  const now = useNow(30000);
  const today = wibDay(now);
  const isToday = day === today;
  const data = useMemo(() => ({ parcels, grants, bookings, visitors }), [parcels, grants, bookings, visitors]);
  const stats = useMemo(() => dayStats(day, data), [day, data]);
  const prev = useMemo(() => dayStats(addDays(day, -1), data), [day, data]);
  // jendela 14 hari: berakhir hari ini; bila tanggal yang dilihat lebih lama, jendela digeser supaya tanggal itu ikut
  const winEnd = day < addDays(today, -13) ? addDays(day, 13) : today;
  const series = useMemo(() => daySeries(winEnd, 14, data), [winEnd, data]);
  const [on, setOn] = useState<Record<MKey, boolean>>({ docsIn: true, docsOut: true, bookings: true, wifi: true, guests: true });
  const [feedAll, setFeedAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const feed = useMemo(() => dayFeed(day, data), [day, data]);
  const inside = useMemo(() => visitors.filter((v) => v.visitDate === day && !v.checkedOutAt).sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)), [visitors, day]);
  const bkDay = useMemo(() => bookings.filter((b) => b.date === day).sort((a, b) => a.start.localeCompare(b.start)), [bookings, day]);

  // kapasitas wifi guest SAAT INI (semua akun berlaku) — bukan angka harian
  const usable = accounts.filter((a) => a.active && a.validUntil >= today);
  const totalSlots = usable.reduce((a, x) => a + x.slots, 0);
  const freeSlots = usable.reduce((a, x) => a + x.free, 0);
  const usedSlots = Math.max(0, totalSlots - freeSlots);
  const acctInUse = usable.filter((x) => x.used > 0).length;
  const pctUsed = totalSlots ? Math.round((usedSlots / totalSlots) * 100) : 0;
  const capColor = pctUsed >= 85 ? "var(--red)" : pctUsed >= 60 ? "var(--orange)" : "var(--green)";
  const expiring = usable.filter((a) => a.validUntil <= addDays(today, 7)).sort((a, b) => a.validUntil.localeCompare(b.validUntil));
  const activeGuests = grants.filter((g) => grantActive(g));
  const waiting = parcels.filter((p) => p.status === "waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const staleVisitors = visitors.filter((v) => !v.checkedOutAt && v.visitDate < today).sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  const ageDays = (p: Parcel) => Math.floor((now - new Date(p.createdAt).getTime()) / 86400000);
  const usage = useMemo(() => { const u = usageByDeptMonth(grants); return { months: u.months.slice(-6), rows: u.rows.slice(0, 10) }; }, [grants]);
  const maxCell = Math.max(1, ...usage.rows.flatMap((x) => usage.months.map((m) => x.byMonth[m] ?? 0)));

  // jam layanan
  const { h: hr, m: mi } = wibClock(now);
  const nowMin = hr * 60 + mi;
  const openMin = toMin(settings.openTime), closeMin = Math.max(openMin + 60, toMin(settings.closeTime));
  const status = nowMin < openMin ? "before" : nowMin >= closeMin ? "after" : "open";
  const first = (myProfile?.fullName || "").trim().split(/\s+/)[0];
  const greet = hr < 11 ? L("Selamat pagi", "Good morning") : hr < 15 ? L("Selamat siang", "Good afternoon") : hr < 18 ? L("Selamat sore", "Good evening") : L("Selamat malam", "Good night");
  const nextBk = isToday ? bkDay.find((b) => toMin(b.end) > nowMin) : undefined;

  const delta = (k: MKey) => {
    const diff = val(stats, k) - val(prev, k);
    const vs = isToday ? L("kemarin", "yesterday") : L("hari sebelumnya", "prev. day");
    return diff === 0 ? { cls: "", text: `＝ ${L("sama dgn", "same as")} ${vs}` } : diff > 0 ? { cls: d.up, text: `▲ +${diff} ${L("vs", "vs")} ${vs}` } : { cls: d.down, text: `▼ ${diff} ${L("vs", "vs")} ${vs}` };
  };
  // Semua angka di kartu = HARI YANG DIPILIH saja (tidak ada total kumulatif); kapasitas wifi ditandai "saat ini"
  const sub: Record<MKey, string> = {
    docsIn: `${stats.inTaken} ${L("sudah diserahkan", "handed over")} · ${stats.inOpen} ${L("menunggu", "waiting")}${stats.docsIn !== stats.docsInN ? L(` · total ${stats.docsIn} barang (${stats.inMulti} catatan berjumlah >1)`, ` · ${stats.docsIn} items in total (${stats.inMulti} records with qty >1)`) : ""}`,
    docsOut: `${stats.outTaken} ${L("sudah diserahkan", "handed over")} · ${stats.outOpen} ${L("menunggu", "waiting")}${stats.docsOut !== stats.docsOutN ? L(` · total ${stats.docsOut} barang (${stats.outMulti} catatan berjumlah >1)`, ` · ${stats.docsOut} items in total (${stats.outMulti} records with qty >1)`) : ""}`,
    bookings: stats.bookings ? (nextBk ? L(`berikutnya ${nextBk.start} · ${nextBk.title}`, `next ${nextBk.start} · ${nextBk.title}`) : `${(stats.bookedMin / 60).toFixed(1).replace(/\.0$/, "")} ${L("jam terbooking", "hours booked")}`) : L("ruangan kosong", "room is free"),
    wifi: `${stats.wifiSlots} ${L("slot", "slots")} · ${stats.wifiReturned} ${L("sudah dikembalikan", "returned")}`,
    guests: `${stats.visits} ${L("kunjungan", "visits")} · ${stats.inside} ${L("di lokasi", "on site")}`,
  };
  const typeLine = (t: [string, number][]) => t.map(([k, n]) => `${itemTypeLabel(k)} ${n}`).join(" · ");
  const tab: Record<MKey, RcpView> = { docsIn: "parcels", docsOut: "parcels", bookings: "room", wifi: "wifi", guests: "visitors" };
  const open = (k: MKey) => go(tab[k], k === "docsIn" ? { parcelDir: "in" } : k === "docsOut" ? { parcelDir: "out" } : undefined);

  async function checkout(v: Visitor) {
    setBusy(v.id);
    try { await checkoutVisitor(v.id); await reloadVisitors(); notify({ ok: true, text: L(`✓ ${v.name} tercatat pulang`, `✓ ${v.name} checked out`) }); }
    catch (e) { notify({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(null); }
  }

  const maxTotal = Math.max(1, ...series.map((s) => KEYS.reduce((a, k) => a + (on[k] ? val(s, k) : 0), 0))) * 1.08;
  const anyOn = KEYS.some((k) => on[k]);
  const totalWin = series.reduce((a, s) => a + KEYS.reduce((b, k) => b + (on[k] ? val(s, k) : 0), 0), 0);
  const hours = Math.ceil((closeMin - openMin) / 60);
  const pctOf = (m: number) => Math.max(0, Math.min(100, ((m - openMin) / (closeMin - openMin)) * 100));
  const shownFeed = feedAll ? feed : feed.slice(0, 7);
  const dayName = fmtDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className={d.dashStack}>
      {/* ── Hero ── */}
      <section className={d.hero} aria-label={L("Ringkasan harian", "Daily overview")}>
        <div className={d.heroTop}>
          <div className={d.heroText}>
            <span className={d.heroKicker}>{L("Receptionist · ringkasan harian", "Receptionist · daily overview")}</span>
            <h2>{greet}{first ? `, ${first}` : ""} <span className={d.wave} aria-hidden>👋</span></h2>
            <p>
              {isToday
                ? (inside.length ? L(`${inside.length} kunjungan masih di lokasi · ${waiting.length} barang menunggu (semua hari) · ${stats.bookings ? `${stats.bookings} booking ${settings.roomName} hari ini.` : `${settings.roomName} kosong hari ini.`}`, `${inside.length} visits still on site · ${waiting.length} items waiting (all days) · ${stats.bookings ? `${stats.bookings} ${settings.roomName} bookings today.` : `${settings.roomName} is free today.`}`)
                  : L(`Lobby sedang tenang · ${waiting.length} barang menunggu (semua hari) · ${stats.bookings ? `${stats.bookings} booking ${settings.roomName} hari ini.` : `${settings.roomName} kosong hari ini.`}`, `The lobby is calm · ${waiting.length} items waiting (all days) · ${stats.bookings ? `${stats.bookings} ${settings.roomName} bookings today.` : `${settings.roomName} is free today.`}`))
                : L(`Melihat ${dayName} — ${stats.guests} tamu, ${stats.docsInN + stats.docsOutN} dokumen, ${stats.wifi} wifi, ${stats.bookings} booking.`, `Viewing ${dayName} — ${stats.guests} visitors, ${stats.docsInN + stats.docsOutN} documents, ${stats.wifi} wifi, ${stats.bookings} bookings.`)}
            </p>
          </div>
          <div className={d.clockBox}>
            <LiveClock />
            <span className={`${d.openChip} ${status === "open" ? "" : d.closed}`}>
              {status === "open" ? L(`Layanan buka · tutup ${settings.closeTime}`, `Open · closes ${settings.closeTime}`) : status === "before" ? L(`Belum buka · buka ${settings.openTime}`, `Not open yet · opens ${settings.openTime}`) : L("Layanan sudah tutup", "Closed for today")}
            </span>
          </div>
        </div>
        <div className={d.heroBar}>
          <div className={d.dayPick} role="group" aria-label={L("Pilih tanggal", "Pick a date")}>
            <button type="button" onClick={() => setDay(addDays(day, -1))} disabled={day <= addMonths(today, -6)} aria-label={L("Hari sebelumnya", "Previous day")}>‹</button>
            <input type="date" value={day} min={addMonths(today, -6)} max={addDays(today, 14)} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={L("Tanggal", "Date")} />
            <button type="button" onClick={() => setDay(addDays(day, 1))} disabled={day >= addDays(today, 14)} aria-label={L("Hari berikutnya", "Next day")}>›</button>
          </div>
          {!isToday && <button type="button" className={d.todayBtn} onClick={() => setDay(today)}>{L("Kembali ke hari ini", "Back to today")}</button>}
          <span style={{ flex: 1 }} />
          <div className={d.quick} aria-label={L("Aksi cepat", "Quick actions")}>
            <button type="button" className={d.quickPrimary} onClick={onNewVisitor}>🙋 {L("Tamu datang", "Visitor in")}</button>
            <button type="button" onClick={() => go("parcels", { parcelDir: "in" })}>📥 {L("Dokumen masuk", "Document in")}</button>
            <button type="button" onClick={() => go("parcels", { parcelDir: "out" })}>📤 {L("Dokumen keluar", "Document out")}</button>
            <button type="button" onClick={() => go("wifi")}>📶 {L("Wifi guest", "Guest wifi")}</button>
            <button type="button" onClick={() => go("room")}>🚪 {L("Booking ruang", "Book room")}</button>
          </div>
        </div>
      </section>

      {/* ── 5 angka harian ── */}
      <div className={d.kpis5}>
        {KEYS.map((k, i) => {
          const dl = delta(k);
          return (
            <button key={k} type="button" className={d.kpiCard} style={{ ["--c" as string]: PAL[k][0], ["--c2" as string]: PAL[k][1], ["--i" as string]: i }} onClick={() => open(k)} aria-label={`${label(k, settings.roomName)}: ${val(stats, k)}`}>
              <span className={d.kpiHead}><span className={d.kpiIcon} aria-hidden>{ICON[k]}</span><span className={d.kpiLabel}>{label(k, settings.roomName)}</span></span>
              <span className={d.kpiNum}><b><Num value={val(stats, k)} /></b><small>{k === "guests" ? L("orang", "people") : k === "bookings" ? L("agenda", "agenda") : k === "wifi" ? L("peminjaman baru", "new loans") : L("catatan", "records")}</small></span>
              <span className={d.kpiSub}>{sub[k]}</span>
              {k === "docsIn" && stats.inTypes.length > 0 && <span className={d.kpiTypes}>{typeLine(stats.inTypes)}</span>}
              {k === "docsOut" && stats.outTypes.length > 0 && <span className={d.kpiTypes}>{typeLine(stats.outTypes)}</span>}
              {k === "wifi" && (
                <span className={d.capLine} title={L("Kapasitas wifi guest saat ini (semua akun berlaku)", "Current guest wifi capacity (all valid accounts)")}>
                  <span className={d.meterBar}><i style={{ width: `${Math.min(100, pctUsed)}%`, background: capColor }} /></span>
                  <small>{L(`Slot terpakai ${usedSlots} dari ${totalSlots} · tersedia ${freeSlots} (saat ini)`, `Slots used ${usedSlots} of ${totalSlots} · ${freeSlots} free (now)`)}</small>
                </span>
              )}
              <span className={d.kpiFoot}><span className={`${d.delta} ${dl.cls}`}>{dl.text}</span><Spark values={series.map((s) => val(s, k))} color={PAL[k][0]} /></span>
            </button>
          );
        })}
      </div>

      {/* ── Grafik 14 hari + tamu di lokasi ── */}
      <div className={d.rowA}>
        <section className={d.panel}>
          <div className={d.panelHead}>
            <div><h3>{L("Aktivitas 14 hari", "14-day activity")}</h3><p>{L("Ketuk batang untuk melihat harinya · ketuk nama di bawah untuk menampilkan / menyembunyikan", "Tap a bar to open that day · tap a name below to show / hide it")}</p></div>
            <div className={d.legend}>
              {KEYS.map((k) => <button key={k} type="button" aria-pressed={on[k]} style={{ ["--c" as string]: PAL[k][0] }} onClick={() => setOn((x) => ({ ...x, [k]: !x[k] }))}><i />{label(k, settings.roomName)}</button>)}
            </div>
          </div>
          <div className={d.chart} role="group" aria-label={L("Aktivitas 14 hari terakhir", "Activity, last 14 days")}>
            {!anyOn && <span className={d.chartEmpty}>{L("Pilih minimal satu jenis aktivitas.", "Pick at least one activity type.")}</span>}
            {anyOn && totalWin === 0 && <span className={d.chartEmpty}>{L("Belum ada aktivitas pada 14 hari ini.", "No activity in these 14 days yet.")}</span>}
            {series.map((s) => {
              const dt = new Date(s.date + "T00:00:00");
              const weekend = dt.getDay() === 0 || dt.getDay() === 6;
              return (
                <button key={s.date} type="button" className={`${d.col} ${s.date === day ? d.sel : ""} ${s.date === today ? d.today : ""} ${weekend ? d.weekend : ""}`} onClick={() => setDay(s.date)}
                  aria-label={`${fmtDate(s.date)}: ${KEYS.map((k) => `${label(k, settings.roomName)} ${val(s, k)}`).join(", ")}`} aria-pressed={s.date === day}>
                  <span className={d.stackWrap}>
                    <span className={d.stack}>
                      {KEYS.filter((k) => on[k] && val(s, k) > 0).map((k) => <span key={k} style={{ ["--c" as string]: PAL[k][0], height: `${(val(s, k) / maxTotal) * 100}%`, background: `linear-gradient(180deg, ${PAL[k][1]}, ${PAL[k][0]})` }} />)}
                    </span>
                  </span>
                  <span className={d.colLabel}><b>{dt.getDate()}</b><span className={d.dow}>{dt.toLocaleDateString(L("id-ID", "en-GB"), { weekday: "short" })}</span></span>
                  <span className={d.tip} role="tooltip">
                    <b>{fmtDate(s.date, { weekday: "long", day: "numeric", month: "short" })}</b>
                    {KEYS.map((k) => <div key={k} style={{ ["--c" as string]: PAL[k][0], opacity: on[k] ? 1 : 0.45 }}><span><i />{label(k, settings.roomName)}</span><strong>{val(s, k)}</strong></div>)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={d.panel}>
          <div className={d.panelHead}>
            <div><h3>{isToday ? L("Sedang di lokasi", "On site now") : L("Belum check-out", "Not checked out")}</h3><p>{inside.length ? L(`${inside.length} kunjungan · ${inside.reduce((a, v) => a + v.pax, 0)} orang`, `${inside.length} visits · ${inside.reduce((a, v) => a + v.pax, 0)} people`) : fmtDate(day)}</p></div>
            <button type="button" className={r.link} onClick={() => go("visitors")}>{L("Buku tamu →", "Visitor log →")}</button>
          </div>
          {inside.length === 0 ? (
            <div className={d.emptyArt}><span aria-hidden>☕</span><b>{isToday ? L("Lobby sedang sepi", "The lobby is quiet") : L("Semua tamu sudah pulang", "Everyone has left")}</b><p>{isToday ? L("Tamu yang datang akan muncul di sini.", "Visitors who arrive will show up here.") : L("Tidak ada catatan tamu yang tertinggal.", "No visitor records left open.")}</p></div>
          ) : (
            <ul className={d.inList}>
              {inside.map((v) => {
                const m = visitMinutes(v, now);
                return (
                  <li key={v.id} className={d.inRow}>
                    <Avatar name={v.name} size={38} />
                    <span className={d.inMain}><b>{v.name}{v.pax > 1 ? ` ×${v.pax}` : ""}</b><small>{[v.company, v.host && L(`bertemu ${v.host}`, `meeting ${v.host}`)].filter(Boolean).join(" · ") || fmtTime(v.checkedInAt)}</small></span>
                    <span className={`${d.inTime} ${m >= 240 ? d.long : ""}`} title={`${L("Datang", "Arrived")} ${fmtTime(v.checkedInAt)}`}>{fmtDuration(m)}</span>
                    <button type="button" className={d.miniBtn} disabled={busy === v.id} onClick={() => checkout(v)}>{L("Pulang", "Out")}</button>
                  </li>
                );
              })}
            </ul>
          )}
          {isToday && staleVisitors.length > 0 && (
            <div className={d.notice} role="status">
              <span>⚠ {L(`${staleVisitors.length} tamu dari hari sebelumnya belum dicatat pulang (sejak ${fmtDate(staleVisitors[0].visitDate, { day: "numeric", month: "short" })}). Tidak dihitung di angka hari ini.`, `${staleVisitors.length} visitors from earlier days were never checked out (since ${fmtDate(staleVisitors[0].visitDate, { day: "numeric", month: "short" })}). They are not counted in today's figures.`)}</span>
              <button type="button" className={d.miniBtn} onClick={() => { setDay(staleVisitors[0].visitDate); go("visitors"); }}>{L("Rapikan", "Fix")}</button>
            </div>
          )}
        </section>
      </div>

      {/* ── Jejak hari ini + jadwal ruangan ── */}
      <div className={d.rowB}>
        <section className={d.panel}>
          <div className={d.panelHead}><div><h3>{isToday ? L("Jejak hari ini", "Today's activity") : L("Jejak aktivitas", "Activity trail")}</h3><p>{feed.length ? L(`${feed.length} kejadian · terbaru di atas`, `${feed.length} events · newest first`) : fmtDate(day)}</p></div></div>
          {feed.length === 0 ? (
            <div className={d.emptyArt}><span aria-hidden>🌤️</span><b>{L("Belum ada aktivitas", "No activity yet")}</b><p>{L("Tamu, dokumen, wifi, dan booking akan tercatat di sini.", "Visitors, documents, wifi and bookings will be logged here.")}</p></div>
          ) : (
            <>
              <ul className={d.feed}>
                {shownFeed.map((f, i) => (
                  <li key={f.id}>
                    <button type="button" className={d.feedRow} style={{ ["--c" as string]: FEED_ICON[f.kind][1], animationDelay: `${i * 35}ms` }} onClick={() => go(FEED_TAB[f.kind])}>
                      <span className={d.feedDot} aria-hidden>{FEED_ICON[f.kind][0]}</span>
                      <span className={d.feedBody}><b>{f.title}</b>{f.sub && <small>{f.sub}</small>}</span>
                      <span className={d.feedTime}>{f.time}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {feed.length > 7 && <button type="button" className={`${r.ghost} ${d.moreBtn}`} onClick={() => setFeedAll((x) => !x)}>{feedAll ? L("Ringkas", "Show less") : L(`Tampilkan semua (${feed.length})`, `Show all (${feed.length})`)}</button>}
            </>
          )}
        </section>

        <section className={d.panel}>
          <div className={d.panelHead}>
            <div><h3>{settings.roomName}</h3><p>{bkDay.length ? L(`${bkDay.length} agenda · ${(stats.bookedMin / 60).toFixed(1).replace(/\.0$/, "")} jam terbooking`, `${bkDay.length} bookings · ${(stats.bookedMin / 60).toFixed(1).replace(/\.0$/, "")} hours booked`) : `${settings.openTime}–${settings.closeTime}`}</p></div>
            <button type="button" className={r.link} onClick={() => go("room")}>{L("Buka jadwal →", "Open schedule →")}</button>
          </div>
          <div>
            <div className={d.track} style={{ ["--hours" as string]: hours }} role="img" aria-label={L(`Jadwal ${settings.roomName}`, `${settings.roomName} schedule`)}>
              {bkDay.map((b) => {
                const a = pctOf(toMin(b.start)), e = pctOf(toMin(b.end));
                const isNow = isToday && toMin(b.start) <= nowMin && nowMin < toMin(b.end);
                return <span key={b.id} className={`${d.block} ${isToday && toMin(b.end) <= nowMin ? d.past : ""} ${isNow ? d.now : ""}`} style={{ left: `${a}%`, width: `${Math.max(1.2, e - a)}%` }} title={`${b.start}–${b.end} · ${b.title}`}>{e - a > 9 ? b.title : ""}</span>;
              })}
              {isToday && status === "open" && <span className={d.nowLine} style={{ left: `${pctOf(nowMin)}%` }} aria-hidden />}
            </div>
            <div className={d.ticks} aria-hidden>{Array.from({ length: Math.floor(hours / 2) + 1 }, (_, i) => <span key={i}>{String(Math.floor((openMin + i * 120) / 60)).padStart(2, "0")}:00</span>)}</div>
          </div>
          {bkDay.length === 0 ? (
            <div className={d.emptyArt}><span aria-hidden>✨</span><b>{L("Ruangan kosong seharian", "Free all day")}</b><p>{L("Siap dipakai — booking dari tab Induction Room.", "Ready to use — book it from the room tab.")}</p></div>
          ) : (
            <ul className={d.bkList}>
              {bkDay.slice(0, 5).map((b) => (
                <li key={b.id} className={`${d.bkRow} ${isToday && toMin(b.start) <= nowMin && nowMin < toMin(b.end) ? d.now : ""}`}>
                  <b>{b.start}–{b.end}</b>
                  <span>{b.title}<em>{[b.pic, b.department, b.attendees ? L(`${b.attendees} orang`, `${b.attendees} people`) : ""].filter(Boolean).join(" · ")}</em></span>
                </li>
              ))}
              {bkDay.length > 5 && <li className={r.mute} style={{ fontSize: 12.5, textAlign: "center" }}>+{bkDay.length - 5} {L("lainnya", "more")}</li>}
            </ul>
          )}
        </section>
      </div>

      {/* ── Perlu perhatian ── */}
      <div className={d.rowB}>
        <section className={d.panel}>
          <div className={d.panelHead}><div><h3>{L("Barang menunggu diambil", "Items waiting to be collected")}</h3><p>{waiting.length} {L("catatan — semua hari, termasuk yang lama", "records — all days, including older ones")}{waiting.some((p) => ageDays(p) >= 2) ? ` · ${waiting.filter((p) => ageDays(p) >= 2).length} ${L("lebih dari 2 hari", "over 2 days")}` : ""}</p></div><button type="button" className={r.link} onClick={() => go("parcels")}>{L("Kelola →", "Manage →")}</button></div>
          {waiting.length === 0 ? <div className={d.emptyArt}><span aria-hidden>🎉</span><b>{L("Tidak ada yang menunggu", "Nothing waiting")}</b></div> : (
            <ul className={d.attn}>
              {waiting.slice(0, 6).map((p) => (
                <li key={p.id} className={d.attnRow}>
                  <span style={{ minWidth: 0 }}><b>{p.direction === "in" ? "⬇" : "⬆"} {(p.direction === "in" ? p.recipient : p.sender) || "–"}{p.qty > 1 ? ` ×${p.qty}` : ""}</b><small>{p.receiptNo} · {itemTypeLabel(p.itemType)} · {fmtDateTime(p.createdAt)}</small></span>
                  {ageDays(p) >= 2 ? <span className={`${r.pill} ${r.pOrange}`}>{ageDays(p)} {L("hari", "days")}</span> : <span className={`${r.pill} ${r.pBlue}`}>{L("baru", "new")}</span>}
                </li>
              ))}
              {waiting.length > 6 && <li className={r.mute} style={{ fontSize: 12.5, textAlign: "center" }}>+{waiting.length - 6} {L("lainnya", "more")}</li>}
            </ul>
          )}
        </section>
        <section className={d.panel}>
          <div className={d.panelHead}><div><h3>{L("Kapasitas Wifi Guest", "Guest wifi capacity")}</h3><p>{L("Kondisi saat ini — semua akun yang masih berlaku (bukan angka harian)", "Current status — all accounts still valid (not a daily figure)")}</p></div><button type="button" className={r.link} onClick={() => go("wifi")}>{L("Kelola →", "Manage →")}</button></div>
          <div className={d.cap}>
            <div className={d.ring} style={{ ["--p" as string]: Math.min(100, pctUsed), ["--c" as string]: capColor }} role="img" aria-label={L(`${usedSlots} dari ${totalSlots} slot terpakai`, `${usedSlots} of ${totalSlots} slots used`)}>
              <b><Num value={usedSlots} /></b><small>{L("dari", "of")} {totalSlots}</small><em>{pctUsed}%</em>
            </div>
            <ul className={d.capList}>
              <li><span>{L("Total slot", "Total slots")}</span><b>{totalSlots}</b></li>
              <li><span>{L("Terpakai", "Used")}</span><b style={{ color: capColor }}>{usedSlots}</b></li>
              <li><span>{L("Tersedia", "Free")}</span><b>{freeSlots}</b></li>
              <li><span>{L("Akun berlaku", "Valid accounts")}</span><b>{usable.length}</b></li>
              <li><span>{L("Akun terpakai", "Accounts in use")}</span><b>{acctInUse}</b></li>
              <li><span>{L("Tamu aktif", "Active guests")}</span><b>{activeGuests.length}</b></li>
            </ul>
          </div>
          <div className={d.subHead}>{L("Akan habis ≤ 7 hari", "Expiring within 7 days")} ({expiring.length})</div>
          {expiring.length === 0 ? <p className={r.hint}>{L("Tidak ada akun yang habis dalam 7 hari.", "No account expires within 7 days.")} 👍</p> : (
            <ul className={d.attn}>
              {expiring.slice(0, 4).map((a) => (
                <li key={a.id} className={d.attnRow}>
                  <span style={{ minWidth: 0 }}><b className={r.mono}>{a.username}</b><small>{L("sampai", "until")} {fmtDate(a.validUntil)} · {a.used}/{a.slots} {L("slot terpakai", "slots used")}</small></span>
                  <span className={`${r.pill} ${a.daysLeft <= 2 ? r.pRed : r.pOrange}`}>{a.daysLeft === 0 ? L("hari ini", "today") : L(`${a.daysLeft} hari`, `${a.daysLeft} days`)}</span>
                </li>
              ))}
              {expiring.length > 4 && <li className={r.mute} style={{ fontSize: 12.5, textAlign: "center" }}>+{expiring.length - 4} {L("lainnya", "more")}</li>}
            </ul>
          )}
        </section>
      </div>

      <section className={d.panel}>
        <div className={d.panelHead}>
          <div><h3>{L("Pemakaian wifi per departemen", "Wifi usage per department")}</h3><p>{L("Jumlah tanda terima wifi per bulan (6 bulan terakhir).", "Number of wifi receipts per month (last 6 months).")}</p></div>
          <ExportButtons rows={usage.rows} title={L("Pemakaian Wifi Tamu per Departemen", "Guest Wifi Usage per Department")} filename="Wifi_per_Departemen" columns={[
            col<(typeof usage.rows)[number]>("d", L("Departemen", "Department"), (x) => x.dept),
            ...usage.months.map((m) => col<(typeof usage.rows)[number]>(m, monthLabel(m), (x) => x.byMonth[m] ?? 0, "right")),
            col<(typeof usage.rows)[number]>("t", "Total", (x) => usage.months.reduce((s, m) => s + (x.byMonth[m] ?? 0), 0), "right")]} />
        </div>
        {usage.rows.length === 0 ? <p className={r.empty}>{L("Belum ada pemakaian.", "No usage yet.")}</p> : (
          <div className={r.tableBox}>
            <table className={r.table}>
              <thead><tr><th>{L("Departemen", "Department")}</th>{usage.months.map((m) => <th key={m} className={r.num}>{monthLabel(m)}</th>)}</tr></thead>
              <tbody>{usage.rows.map((x) => (
                <tr key={x.dept}><td>{x.dept}</td>{usage.months.map((m) => (
                  <td key={m} className={r.num}><span className={r.heat} style={{ ["--h" as string]: Math.round(((x.byMonth[m] ?? 0) / maxCell) * 45) }}>{x.byMonth[m] ?? 0}</span></td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
