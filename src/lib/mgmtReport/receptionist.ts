/* ════════════════════════════════════════════════════════════
   LAPORAN MANAJEMEN — modul Receptionist.
   Sumber: akses wifi tamu (rcp_wifi_grants), barang & surat (rcp_parcels), Induction Room (rcp_room_bookings),
   dan stok akun wifi dari IT. Ringkas & umum: volume layanan, serah terima, pemanfaatan ruangan, hal yang perlu perhatian.
════════════════════════════════════════════════════════════ */

import type { Parcel, RoomBooking, WifiAccount, WifiGrant } from "../receptionist/model";
import { dayOf, toMin } from "../receptionist/model";
import {
  PALETTE, buckets, daysBetween, deltaText, fmtNum, fmtPct, metaOf, parseISO, perWord, tr, trendChart, trendSentence,
  type ChartSpec, type Kpi, type ModuleReport, type MonthSlot,
} from "./model";

const inR = (d: string | null | undefined, a: string, b: string) => !!d && d.slice(0, 10) >= a && d.slice(0, 10) <= b;
const sum = (a: number[]) => a.reduce((s, n) => s + (Number(n) || 0), 0);
const top = (xs: string[], n: number) => {
  const m = new Map<string, number>();
  xs.forEach((x) => { const k = (x || "").trim() || "–"; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].filter(([k]) => k !== "–").sort((a, b) => b[1] - a[1]).slice(0, n);
};
/** Hari kerja (Sen–Jum) antara dua tanggal, inklusif. */
function workdays(from: string, to: string): number {
  if (to < from) return 0;
  let n = 0; const d = parseISO(from); const end = parseISO(to);
  for (; d <= end; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}
const bookHours = (b: RoomBooking) => Math.max(0, (toMin(b.end) - toMin(b.start)) / 60);

export function computeReceptionist(p: {
  from: string; to: string; prevFrom: string; prevTo: string; today: string; months: MonthSlot[];
  grants: WifiGrant[]; parcels: Parcel[]; bookings: RoomBooking[]; accounts: WifiAccount[];
  openHours: number; roomName: string;
}): ModuleReport {
  const meta = metaOf("receptionist");
  const gCur = p.grants.filter((g) => inR(g.startDate, p.from, p.to));
  const gPrev = p.grants.filter((g) => inR(g.startDate, p.prevFrom, p.prevTo));
  const pCur = p.parcels.filter((x) => inR(dayOf(x.createdAt), p.from, p.to));
  const pPrev = p.parcels.filter((x) => inR(dayOf(x.createdAt), p.prevFrom, p.prevTo));
  const bCur = p.bookings.filter((b) => inR(b.date, p.from, p.to));
  const bPrev = p.bookings.filter((b) => inR(b.date, p.prevFrom, p.prevTo));

  if (gCur.length + pCur.length + bCur.length === 0) {
    const msg = tr("Belum ada aktivitas Receptionist pada periode ini.", "No Receptionist activity for this period.");
    return { key: "receptionist", title: meta.title, accent: meta.accent, headline: msg, kpis: [], charts: [], insights: [msg], actions: [], attention: [], empty: true };
  }

  /* ── wifi tamu ── */
  const guests = new Set(gCur.map((g) => `${g.guestName}|${g.guestCompany}`.toLowerCase()));
  const gDays = gCur.map((g) => Math.max(1, daysBetween(g.startDate, g.endDate) + 1));
  const avgDays = gDays.length ? sum(gDays) / gDays.length : 0;
  const longStays = gCur.filter((g) => daysBetween(g.startDate, g.endDate) + 1 > 7).length;
  const dg = deltaText(gCur.length, gPrev.length);
  const usable = p.accounts.filter((a) => a.active && a.status !== "expired" && a.status !== "inactive");
  const capacity = sum(usable.map((a) => a.slots)), usedSlots = sum(usable.map((a) => a.used));
  const accUtil = capacity ? (usedSlots / capacity) * 100 : 0;
  const expiring = usable.filter((a) => a.daysLeft >= 0 && a.daysLeft <= 7);
  const freeSlots = sum(usable.map((a) => a.free));

  /* ── barang & surat (jumlah = total unit, transaksi = nomor tanda terima) ── */
  const pIn = pCur.filter((x) => x.direction === "in"), pOut = pCur.filter((x) => x.direction === "out");
  const units = sum(pCur.map((x) => x.qty || 1));
  const prevUnits = sum(pPrev.map((x) => x.qty || 1));
  const du = deltaText(units, prevUnits);
  const handed = pCur.filter((x) => x.status === "handed");
  const handRate = pCur.length ? (handed.length / pCur.length) * 100 : 0;
  const waitingAll = p.parcels.filter((x) => x.status === "waiting");
  const stale = waitingAll.filter((x) => daysBetween(dayOf(x.createdAt), p.today) >= 2);
  const handMins = handed.filter((x) => x.handedAt).map((x) => (new Date(x.handedAt as string).getTime() - new Date(x.createdAt).getTime()) / 60000).filter((m) => m >= 0 && m < 14 * 24 * 60);
  const avgHandH = handMins.length ? sum(handMins) / handMins.length / 60 : 0;
  const byType = top(pCur.map((x) => x.itemType), 6);

  /* ── Induction Room ── */
  const hoursBooked = sum(bCur.map(bookHours));
  const until = p.today < p.to ? p.today : p.to;
  const availHours = workdays(p.from, until) * p.openHours;
  const roomUtil = availHours ? Math.min(100, (hoursBooked / availHours) * 100) : 0;
  const bPrevHours = sum(bPrev.map(bookHours));
  const db = deltaText(bCur.length, bPrev.length);
  const attendees = sum(bCur.map((b) => b.attendees ?? 0));
  const byTitle = top(bCur.map((b) => b.title), 4);

  /* ── lintas layanan ── */
  const depts = top([...gCur.map((g) => g.department), ...pCur.map((x) => x.department), ...bCur.map((b) => b.department)], 6);
  const bs = buckets(p.from, p.to);
  const bucketOf = (iso: string) => bs.findIndex((b) => iso >= b.from && iso <= b.to);
  const series = (get: (b: { from: string; to: string }) => number) => bs.map((b) => get(b));
  const wifiBy = series((b) => gCur.filter((g) => g.startDate >= b.from && g.startDate <= b.to).length);
  const parcelBy = series((b) => pCur.filter((x) => { const d = dayOf(x.createdAt); return d >= b.from && d <= b.to; }).length);
  const roomBy = series((b) => bCur.filter((x) => x.date >= b.from && x.date <= b.to).length);
  void bucketOf;
  const mWifi = p.months.map((m) => p.grants.filter((g) => inR(g.startDate, m.from, m.to)).length);
  const mParcel = p.months.map((m) => p.parcels.filter((x) => inR(dayOf(x.createdAt), m.from, m.to)).length);
  const mRoom = p.months.map((m) => p.bookings.filter((b) => inR(b.date, m.from, m.to)).length);
  const mTotal = p.months.map((_, i) => mWifi[i] + mParcel[i] + mRoom[i]);

  const kpis: Kpi[] = [
    { label: tr("Akses wifi tamu", "Guest wifi access"), value: fmtNum(gCur.length), sub: `${dg.text}${gPrev.length ? ` ${tr("vs periode lalu", "vs prior period")}` : ""} · ${tr(`${guests.size} tamu`, `${guests.size} guests`)}`, tone: "neutral" },
    { label: tr("Barang & surat", "Items & mail"), value: fmtNum(units), sub: `${tr("masuk", "in")} ${fmtNum(sum(pIn.map((x) => x.qty || 1)))} · ${tr("keluar", "out")} ${fmtNum(sum(pOut.map((x) => x.qty || 1)))} · ${du.text}`, tone: "neutral" },
    { label: tr("Serah terima barang", "Items handed over"), value: pCur.length ? fmtPct(handRate, 0) : "–", sub: stale.length ? tr(`${stale.length} menunggu ≥ 2 hari`, `${stale.length} waiting ≥ 2 days`) : tr("tidak ada yang tertahan", "none held up"), tone: !pCur.length ? "neutral" : stale.length ? "bad" : handRate >= 90 ? "good" : "neutral" },
    { label: tr(`Pemakaian ${p.roomName}`, `${p.roomName} usage`), value: fmtNum(bCur.length), sub: availHours ? tr(`${fmtNum(hoursBooked, 1)} jam · ${fmtPct(roomUtil, 0)} dari jam kerja`, `${fmtNum(hoursBooked, 1)} hrs · ${fmtPct(roomUtil, 0)} of working hours`) : `${db.text}`, tone: "neutral" },
  ];

  const charts: ChartSpec[] = [
    trendChart({ id: "rcp-trend13", title: tr("Layanan Receptionist per bulan — 13 bulan", "Receptionist services per month — 13 months"), months: p.months, unit: "num", goodUp: null,
      series: [{ name: tr("Wifi tamu", "Guest wifi"), values: mWifi, color: PALETTE.brand }, { name: tr("Barang & surat", "Items & mail"), values: mParcel, color: PALETTE.amber }, { name: p.roomName, values: mRoom, color: PALETTE.green }] }),
    { id: "rcp-mix", title: tr("Komposisi layanan", "Service mix"), type: "donut",
      labels: [tr("Wifi tamu", "Guest wifi"), tr("Barang masuk", "Incoming items"), tr("Barang keluar", "Outgoing items"), p.roomName],
      series: [{ name: tr("Layanan", "Services"), color: PALETTE.brand, values: [gCur.length, pIn.length, pOut.length, bCur.length] }], unit: "num",
      colors: [PALETTE.brand, PALETTE.amber, PALETTE.purple, PALETTE.green] },
    { id: "rcp-period", title: `${tr("Aktivitas", "Activity")} ${perWord(p.from, p.to)}`, type: "stacked", labels: bs.map((b) => b.label),
      series: [{ name: tr("Wifi tamu", "Guest wifi"), color: PALETTE.brand, values: wifiBy }, { name: tr("Barang & surat", "Items & mail"), color: PALETTE.amber, values: parcelBy }, { name: p.roomName, color: PALETTE.green, values: roomBy }], unit: "num" },
    ...(byType.length ? [{ id: "rcp-types", title: tr("Jenis barang & surat", "Item & mail types"), type: "hbar" as const, labels: byType.map((x) => x[0]),
      series: [{ name: tr("Transaksi", "Transactions"), color: PALETTE.amber, values: byType.map((x) => x[1]) }], unit: "num" as const }] : []),
    ...(depts.length ? [{ id: "rcp-depts", title: tr("Departemen pengguna layanan", "Departments using the services"), type: "hbar" as const, labels: depts.map((x) => x[0]),
      series: [{ name: tr("Layanan", "Services"), color: PALETTE.purple, values: depts.map((x) => x[1]) }], unit: "num" as const }] : []),
  ];

  const insights = [
    tr(`${fmtNum(gCur.length + pCur.length + bCur.length)} layanan tercatat: ${gCur.length} akses wifi tamu, ${pCur.length} transaksi barang & surat (${fmtNum(units)} unit), ${bCur.length} pemakaian ${p.roomName}.`,
       `${fmtNum(gCur.length + pCur.length + bCur.length)} services logged: ${gCur.length} guest wifi accesses, ${pCur.length} item & mail transactions (${fmtNum(units)} units), ${bCur.length} ${p.roomName} bookings.`),
    trendSentence(tr("layanan Receptionist", "Receptionist services"), mTotal, p.months, (n) => fmtNum(n)),
    gCur.length ? tr(`Wifi tamu: ${guests.size} tamu, rata-rata ${fmtNum(avgDays, 1)} hari per akses${longStays ? `; ${longStays} akses lebih dari 7 hari` : ""}.`,
                     `Guest wifi: ${guests.size} guests, averaging ${fmtNum(avgDays, 1)} days per access${longStays ? `; ${longStays} accesses longer than 7 days` : ""}.`) : "",
    capacity ? tr(`Kapasitas akun wifi saat ini terpakai ${fmtPct(accUtil, 0)} (${usedSlots} dari ${capacity} slot); ${freeSlots} slot masih kosong.`,
                  `Wifi account capacity is ${fmtPct(accUtil, 0)} used (${usedSlots} of ${capacity} slots); ${freeSlots} slots are free.`) : "",
    pCur.length ? tr(`Barang & surat: ${fmtPct(handRate, 0)} sudah diserahterimakan${avgHandH ? `, rata-rata ${fmtNum(avgHandH, 1)} jam sejak tercatat` : ""}${byType[0] ? `; jenis terbanyak ${byType[0][0]}` : ""}.`,
                       `Items & mail: ${fmtPct(handRate, 0)} handed over${avgHandH ? `, averaging ${fmtNum(avgHandH, 1)} hours after logging` : ""}${byType[0] ? `; most common type ${byType[0][0]}` : ""}.`) : "",
    bCur.length ? tr(`${p.roomName}: ${bCur.length} pemakaian, total ${fmtNum(hoursBooked, 1)} jam${attendees ? `, ${fmtNum(attendees)} peserta` : ""}${bPrev.length ? ` (periode lalu ${bPrev.length} pemakaian, ${fmtNum(bPrevHours, 1)} jam)` : ""}${byTitle[0] ? `; keperluan terbanyak ${byTitle[0][0]}` : ""}.`,
                     `${p.roomName}: ${bCur.length} bookings, ${fmtNum(hoursBooked, 1)} hours in total${attendees ? `, ${fmtNum(attendees)} attendees` : ""}${bPrev.length ? ` (prior period ${bPrev.length} bookings, ${fmtNum(bPrevHours, 1)} hours)` : ""}${byTitle[0] ? `; most common purpose ${byTitle[0][0]}` : ""}.`) : "",
    depts[0] ? tr(`Pengguna layanan terbanyak: ${depts[0][0]} (${depts[0][1]})${depts[1] ? `, lalu ${depts[1][0]} (${depts[1][1]})` : ""}.`, `Heaviest users: ${depts[0][0]} (${depts[0][1]})${depts[1] ? `, then ${depts[1][0]} (${depts[1][1]})` : ""}.`) : "",
  ].filter(Boolean);

  const actions: string[] = [];
  const attention: string[] = [];
  if (stale.length) {
    actions.push(tr(`Hubungi penerima ${stale.length} barang/surat yang menunggu ≥ 2 hari agar segera diambil.`, `Contact the recipients of the ${stale.length} items/mail waiting ≥ 2 days so they are collected.`));
    attention.push(tr(`Receptionist: ${stale.length} barang/surat belum diambil ≥ 2 hari.`, `Receptionist: ${stale.length} items/mail uncollected for ≥ 2 days.`));
  }
  if (expiring.length) {
    actions.push(tr(`Minta IT memperbarui ${expiring.length} akun wifi yang habis ≤ 7 hari (${expiring.slice(0, 3).map((a) => a.username).join(", ")}${expiring.length > 3 ? ", …" : ""}).`,
                    `Ask IT to renew the ${expiring.length} wifi accounts expiring within 7 days (${expiring.slice(0, 3).map((a) => a.username).join(", ")}${expiring.length > 3 ? ", …" : ""}).`));
    attention.push(tr(`Receptionist: ${expiring.length} akun wifi habis ≤ 7 hari.`, `Receptionist: ${expiring.length} wifi accounts expire within 7 days.`));
  }
  if (capacity && freeSlots <= Math.max(2, Math.round(capacity * 0.1))) {
    actions.push(tr(`Slot wifi tamu hampir habis (${freeSlots} kosong) — siapkan akun baru dari IT.`, `Guest wifi slots are nearly exhausted (${freeSlots} free) — arrange new accounts from IT.`));
    attention.push(tr(`Receptionist: slot wifi tamu tersisa ${freeSlots}.`, `Receptionist: only ${freeSlots} guest wifi slots left.`));
  }
  if (availHours && roomUtil >= 80) actions.push(tr(`${p.roomName} terpakai ${fmtPct(roomUtil, 0)} dari jam kerja — pertimbangkan ruang cadangan.`, `${p.roomName} is used ${fmtPct(roomUtil, 0)} of working hours — consider a backup room.`));
  if (actions.length === 0) actions.push(tr("Layanan Receptionist berjalan baik — pertahankan.", "Receptionist services are running well — keep it up."));

  return {
    key: "receptionist", title: meta.title, accent: meta.accent,
    headline: tr(`${gCur.length} akses wifi tamu, ${fmtNum(units)} barang & surat${pCur.length ? ` (${fmtPct(handRate, 0)} diserahkan)` : ""}, ${bCur.length} pemakaian ${p.roomName}.`,
                 `${gCur.length} guest wifi accesses, ${fmtNum(units)} items & mail${pCur.length ? ` (${fmtPct(handRate, 0)} handed over)` : ""}, ${bCur.length} ${p.roomName} bookings.`),
    kpis, charts, insights, actions, attention,
    table: {
      title: tr("Rekap layanan Receptionist", "Receptionist service summary"),
      headers: [tr("Layanan", "Service"), tr("Periode ini", "This period"), tr("Periode lalu", "Prior period"), tr("Catatan", "Note")],
      rows: [
        [tr("Akses wifi tamu", "Guest wifi access"), gCur.length, gPrev.length, tr(`${guests.size} tamu · rata-rata ${fmtNum(avgDays, 1)} hari`, `${guests.size} guests · avg ${fmtNum(avgDays, 1)} days`)],
        [tr("Barang & surat masuk", "Incoming items & mail"), pIn.length, pPrev.filter((x) => x.direction === "in").length, tr(`${fmtNum(sum(pIn.map((x) => x.qty || 1)))} unit`, `${fmtNum(sum(pIn.map((x) => x.qty || 1)))} units`)],
        [tr("Barang & surat keluar", "Outgoing items & mail"), pOut.length, pPrev.filter((x) => x.direction === "out").length, tr(`${fmtNum(sum(pOut.map((x) => x.qty || 1)))} unit`, `${fmtNum(sum(pOut.map((x) => x.qty || 1)))} units`)],
        [tr("Barang sudah diserahkan", "Items handed over"), handed.length, pPrev.filter((x) => x.status === "handed").length, pCur.length ? fmtPct(handRate, 0) : "–"],
        [p.roomName, bCur.length, bPrev.length, tr(`${fmtNum(hoursBooked, 1)} jam`, `${fmtNum(hoursBooked, 1)} hrs`)],
      ],
    },
    empty: false,
  };
}
