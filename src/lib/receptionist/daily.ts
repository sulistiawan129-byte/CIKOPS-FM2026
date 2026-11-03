/* RECEPTIONIST — ringkasan harian untuk dashboard (fungsi murni, tanpa jaringan).
   Dokumen/barang masuk & keluar, booking Induction Room, peminjaman wifi guest, dan tamu yang datang per tanggal. */

import { L } from "@/lib/i18n";
import { addDays, dayOf, fmtDuration, fmtTime, parseISO, toMin, visitMinutes, type Parcel, type RoomBooking, type Visitor, type WifiGrant } from "./model";

export interface DailyData { parcels: Parcel[]; grants: WifiGrant[]; bookings: RoomBooking[]; visitors: Visitor[] }

export interface DayStats {
  date: string;
  /** jumlah dokumen/barang (dijumlah per `qty`) dan jumlah catatannya */
  docsIn: number; docsInN: number; docsOut: number; docsOutN: number;
  /** dari barang yang DICATAT pada hari itu: berapa catatan sudah diserahkan / masih menunggu (status saat ini) */
  inTaken: number; inOpen: number; outTaken: number; outOpen: number;
  /** rincian jumlah per jenis (Paket, Dokumen / Surat, Makanan, …), terbanyak dulu */
  inTypes: [string, number][]; outTypes: [string, number][];
  /** barang yang dicatat di hari LAIN tetapi diserahkan pada hari ini (tidak ikut hitungan "dicatat") */
  handedFromOtherDays: number;
  /** jumlah CATATAN yang berjumlah lebih dari 1 (itulah yang membuat "barang" > "catatan") */
  inMulti: number; outMulti: number;
  bookings: number; bookedMin: number;
  wifi: number; wifiSlots: number; wifiReturned: number;
  /** tamu = jumlah ORANG (rombongan dijumlah); kunjungan = jumlah catatan */
  guests: number; visits: number; inside: number;
}

export function dayStats(date: string, d: DailyData): DayStats {
  let docsIn = 0, docsInN = 0, docsOut = 0, docsOutN = 0, inTaken = 0, inOpen = 0, outTaken = 0, outOpen = 0, handedFromOtherDays = 0, inMulti = 0, outMulti = 0;
  const tIn = new Map<string, number>(), tOut = new Map<string, number>();
  for (const p of d.parcels) {
    const made = dayOf(p.createdAt) === date;
    if (!made) { if (p.handedAt && dayOf(p.handedAt) === date) handedFromOtherDays++; continue; }
    const q = p.qty || 1;
    const bucket = p.direction === "in" ? tIn : tOut;
    bucket.set(p.itemType || "Paket", (bucket.get(p.itemType || "Paket") ?? 0) + q);
    if (q > 1) { if (p.direction === "in") inMulti++; else outMulti++; }
    if (p.direction === "in") { docsIn += q; docsInN++; if (p.status === "handed") inTaken++; else inOpen++; }
    else { docsOut += q; docsOutN++; if (p.status === "handed") outTaken++; else outOpen++; }
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const bk = d.bookings.filter((b) => b.date === date);
  const wf = d.grants.filter((g) => dayOf(g.createdAt) === date);
  const vs = d.visitors.filter((v) => v.visitDate === date);
  return {
    date, docsIn, docsInN, docsOut, docsOutN, inTaken, inOpen, outTaken, outOpen, inTypes: sorted(tIn), outTypes: sorted(tOut), handedFromOtherDays, inMulti, outMulti,
    bookings: bk.length, bookedMin: bk.reduce((s, b) => s + Math.max(0, toMin(b.end) - toMin(b.start)), 0),
    wifi: wf.length, wifiSlots: wf.reduce((s, g) => s + (g.slots || 1), 0), wifiReturned: wf.filter((g) => !!g.returnedAt).length,
    guests: vs.reduce((s, v) => s + (v.pax || 1), 0), visits: vs.length, inside: vs.filter((v) => !v.checkedOutAt).length,
  };
}

/** Deret `n` hari berakhir di `end` (urut lama → baru). */
export function daySeries(end: string, n: number, d: DailyData): DayStats[] {
  return Array.from({ length: n }, (_, i) => dayStats(addDays(end, i - (n - 1)), d));
}

export type FeedKind = "visitor-in" | "visitor-out" | "doc-in" | "doc-out" | "handover" | "wifi" | "booking";
export interface FeedItem { id: string; at: number; time: string; kind: FeedKind; title: string; sub: string }

/** Jejak aktivitas satu hari (terbaru di atas): tamu datang/pulang, barang masuk/keluar/diserahkan, wifi, booking. */
export function dayFeed(date: string, d: DailyData): FeedItem[] {
  const out: FeedItem[] = [];
  const push = (id: string, ts: string | number, kind: FeedKind, title: string, sub: string) => {
    const at = typeof ts === "number" ? ts : new Date(ts).getTime();
    out.push({ id, at, time: fmtTime(new Date(at).toISOString()), kind, title, sub });
  };
  for (const v of d.visitors) {
    if (v.visitDate !== date) continue;
    const who = `${v.name}${v.pax > 1 ? ` (+${v.pax - 1})` : ""}`;
    push(`vi-${v.id}`, v.checkedInAt, "visitor-in", L(`${who} datang`, `${who} arrived`), [v.company, v.host && L(`bertemu ${v.host}`, `meeting ${v.host}`)].filter(Boolean).join(" · "));
    if (v.checkedOutAt && dayOf(v.checkedOutAt) === date) push(`vo-${v.id}`, v.checkedOutAt, "visitor-out", L(`${v.name} pulang`, `${v.name} left`), L(`berkunjung ${fmtDuration(visitMinutes(v))}`, `stayed ${fmtDuration(visitMinutes(v))}`));
  }
  for (const p of d.parcels) {
    const who = p.direction === "in" ? p.recipient : p.sender;
    const q = p.qty > 1 ? ` ×${p.qty}` : "";
    if (dayOf(p.createdAt) === date) push(`pc-${p.id}`, p.createdAt, p.direction === "in" ? "doc-in" : "doc-out",
      p.direction === "in" ? L(`Masuk${q} untuk ${who || "–"}`, `Incoming${q} for ${who || "–"}`) : L(`Keluar${q} dari ${who || "–"}`, `Outgoing${q} from ${who || "–"}`), [p.itemType, p.receiptNo].filter(Boolean).join(" · "));
    if (p.handedAt && dayOf(p.handedAt) === date) push(`ph-${p.id}`, p.handedAt, "handover", L(`Diserahkan ke ${p.handedTo || "–"}`, `Handed to ${p.handedTo || "–"}`), `${p.receiptNo}${who ? ` · ${who}` : ""}`);
  }
  for (const g of d.grants) {
    if (dayOf(g.createdAt) !== date) continue;
    push(`wf-${g.id}`, g.createdAt, "wifi", L(`Wifi untuk ${g.guestName}`, `Wifi for ${g.guestName}`), [g.guestCompany, g.username].filter(Boolean).join(" · "));
  }
  for (const b of d.bookings) {
    if (b.date !== date) continue;
    push(`bk-${b.id}`, parseISO(date).getTime() + toMin(b.start) * 60000, "booking", `${b.start}–${b.end} ${b.title}`, [b.pic, b.department, b.attendees ? L(`${b.attendees} orang`, `${b.attendees} people`) : ""].filter(Boolean).join(" · "));
  }
  return out.sort((a, b) => b.at - a.at);
}
