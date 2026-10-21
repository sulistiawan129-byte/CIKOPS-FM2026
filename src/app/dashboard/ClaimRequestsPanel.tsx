"use client";

/* Pengajuan Self-Claim dari aplikasi driver — admin Finance memeriksa, mengoreksi bila perlu,
   lalu Verifikasi (klaim resmi dibuat) atau Tolak dengan alasan. */

import { useState } from "react";
import cs from "./claims.module.css";
import r from "./claimRequests.module.css";
import { CLAIM_REQUEST_STATUS, claimType, type ClaimRequest, type ClaimRequestStatus } from "@/lib/claims/driverClaims";
import { fmtRp } from "./dashboardShared";

export function ClaimRequestsPanel({ lang, requests, error, onReview, onReject, canReview }: {
  lang: string; requests: ClaimRequest[]; error: string | null; canReview: boolean;
  onReview: (x: ClaimRequest) => void; onReject: (x: ClaimRequest) => void;
}) {
  const en = lang === "en";
  const [filter, setFilter] = useState<ClaimRequestStatus | "all">("menunggu");
  const list = filter === "all" ? requests : requests.filter((x) => x.status === filter);
  const fmtDate = (iso: string) => new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(en ? "en-GB" : "id-ID", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className={r.wrap}>
      <div className={r.bar}>
        <p>{en
          ? "Drivers file their own claims from the driver app. Check them against the receipts, fix anything that doesn't match, then verify — the claim is created automatically."
          : "Driver mengajukan klaim sendiri dari aplikasi driver. Cocokkan dengan nota, koreksi yang tidak sesuai, lalu verifikasi — klaim resmi dibuat otomatis."}</p>
        <select className={cs.select} value={filter} onChange={(e) => setFilter(e.target.value as ClaimRequestStatus | "all")} aria-label="Status">
          {(["menunggu", "disetujui", "ditolak", "dibatalkan"] as const).map((k) => (
            <option key={k} value={k}>{en ? CLAIM_REQUEST_STATUS[k].en : CLAIM_REQUEST_STATUS[k].label} ({requests.filter((x) => x.status === k).length})</option>
          ))}
          <option value="all">{en ? "All" : "Semua"} ({requests.length})</option>
        </select>
      </div>

      {error && <div className={`${cs.notice} ${cs.noticeErr}`} role="alert">{error}</div>}
      {!error && list.length === 0 && (
        <div className={r.empty}>
          <b>{filter === "menunggu" ? (en ? "Nothing to review 🎉" : "Tidak ada yang perlu diverifikasi 🎉") : (en ? "No requests" : "Tidak ada pengajuan")}</b>
          {en ? "New driver requests appear here in real time." : "Pengajuan baru dari driver muncul di sini secara langsung."}
        </div>
      )}

      <div className={r.grid}>
        {list.map((x) => {
          const st = CLAIM_REQUEST_STATUS[x.status];
          return (
            <article key={x.id} className={`${r.card} ${x.status === "menunggu" ? r.pending : ""}`}>
              <div className={r.head}>
                <span className={r.avatar}>{claimType(x.items[0]?.type ?? "Other").icon}</span>
                <div className={r.who}>
                  <b>{x.driverName || "—"}</b>
                  <small>{en ? "Expense" : "Pengeluaran"} {fmtDate(x.periodDate)}{x.driverPlant ? ` · ${x.driverPlant}` : ""}</small>
                </div>
                <div className={r.total}>
                  <b>Rp {fmtRp(x.total)}</b>
                  <span className={`${r.pill} ${r["p_" + st.tone]}`}>{en ? st.en : st.label}</span>
                </div>
              </div>
              <div className={r.items}>
                {x.items.map((it, i) => {
                  const t = claimType(it.type);
                  return <div key={i}><span>{t.icon} {en ? t.en : t.label}{/[+\-*/]/.test(it.expr) ? ` (${it.expr})` : ""}</span><b>Rp {fmtRp(it.total)}</b></div>;
                })}
              </div>
              <div className={r.meta}>
                <span>{x.nota === "ada" ? (en ? "📎 Receipts ready" : "📎 Nota sudah ada") : (en ? "📎 Receipts to follow" : "📎 Nota menyusul")}</span>
                <span>{en ? "Sent" : "Dikirim"} {new Date(x.createdAt).toLocaleString(en ? "en-GB" : "id-ID", { dateStyle: "short", timeStyle: "short" })}</span>
                {x.reviewedBy && <span>{en ? "By" : "Oleh"} {x.reviewedBy}</span>}
              </div>
              {x.note && <p className={r.note}>📝 {x.note}</p>}
              {x.status === "ditolak" && x.adminNote && <p className={r.reason}>{en ? "Rejected" : "Ditolak"}: {x.adminNote}</p>}
              {x.status === "disetujui" && x.adminNote && <p className={r.note}>✓ {x.adminNote}</p>}
              {x.status === "menunggu" && canReview && (
                <div className={r.actions}>
                  <button className={cs.primary} style={{ height: 42 }} onClick={() => onReview(x)}>{en ? "Review & verify" : "Periksa & verifikasi"}</button>
                  <button className={cs.btn} style={{ height: 42, color: "var(--red)" }} onClick={() => onReject(x)}>{en ? "Reject" : "Tolak"}</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
