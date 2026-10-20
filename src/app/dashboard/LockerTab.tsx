"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useLang } from "@/lib/providers";
import { ModalPortal } from "@/components/ModalPortal";
import {
  getLockerStatusGrid,
  getAllLockers,
  addLocker,
  updateLocker,
  deleteLocker,
  searchLockerUser,
  getLockerReport,
  getLockerDetailAdmin,
  adminReleaseLocker,
  getConfirmationRecipientCount,
  startBulkConfirmation,
  sendLockerEmail,
  getConfirmBaseUrl,
  type LockerRow,
  type LockerInput,
  type LockerStatus,
  type LockerStatusEntry,
} from "@/lib/lockerApi";
import { ModuleHeader, ModulePage, ModuleTabs } from "./ModuleShell";
import lk from "./locker.module.css";

/* ════════════════════════════════════════════════════════════
   LOCKER TAB — self-contained styles, shares ModalPortal with the
   rest of the dashboard (see src/components/ModalPortal.tsx) so every
   dialog in the app stays visually and behaviorally consistent.
════════════════════════════════════════════════════════════ */

const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid var(--border2)",
  background: "var(--bg2)",
  color: "var(--t1)",
  fontSize: 13,
  fontFamily: "var(--font)",
};
const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--t2)",
  marginBottom: 5,
  display: "block",
};

const BLANK_FORM: LockerInput = {
  number: "",
  pin: "",
  status: "Available",
  nama: "",
  noHp: "",
  email: "",
  periode: "",
  extra: "",
  endDate: "",
};

export default function LockerTab() {
  const { lang } = useLang();
  const L = (id: string, en: string) => (lang === "en" ? en : id);
  const [sub, setSub] = useState<"overview" | "manage">("overview");

  return (
    <ModulePage>
      <ModuleHeader
        kicker={L("Fasilitas · Locker", "Facility · Lockers")}
        title="Locker"
        desc={L("Status locker karyawan & peserta magang secara langsung — klik locker untuk melihat penghuni, PIN, dan mengakhiri pemakaian.",
          "Live status of employee & intern lockers — click a locker to see its occupant and PIN, or end the usage.")}
        actions={<a className={lk.headLink} href="/locker" target="_blank" rel="noopener noreferrer">🔑 {L("Halaman pendaftaran ↗", "Registration page ↗")}</a>}
      />
      <ModuleTabs
        tabs={[
          { id: "overview", label: L("Ringkasan", "Overview"), icon: "🔐" },
          { id: "manage", label: L("Kelola Locker", "Manage Lockers"), icon: "🗄️" },
        ]}
        value={sub}
        onChange={setSub}
      />
      {sub === "overview" && <LockerOverviewPanel />}
      {sub === "manage" && <LockerManagePanel />}
    </ModulePage>
  );
}

/* ════════════════════════════════════════════════════════════
   OVERVIEW — grid + stats + search + report, mirrors admin.html's
   "Overview" tab.
════════════════════════════════════════════════════════════ */

function LockerOverviewPanel() {
  const { lang, t } = useLang();
  const [entries, setEntries] = useState<LockerStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<LockerRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [gridFilter, setGridFilter] = useState<"all" | LockerStatus>("all");

  const [reportOpen, setReportOpen] = useState(false);
  const [reportRows, setReportRows] = useState<LockerRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [detail, setDetail] = useState<LockerRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [releaseResult, setReleaseResult] = useState<{ number: string; pin: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await getLockerStatusGrid());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data locker");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Ringan: refresh tiap 8 detik selama tidak ada modal terbuka —
  // mirip auto-refresh admin.html tapi tidak mengganggu saat sedang
  // melihat detail/release.
  useEffect(() => {
    const anyOpen = !!detail || reportOpen;
    if (anyOpen) return;
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load, detail, reportOpen]);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        setSearchResults(await searchLockerUser(search));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  async function openReport() {
    setReportOpen(true);
    setReportLoading(true);
    try {
      setReportRows(await getLockerReport());
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal memuat report");
    } finally {
      setReportLoading(false);
    }
  }

  async function openDetail(number: string) {
    setDetailLoading(true);
    try {
      const row = await getLockerDetailAdmin(number);
      setDetail(row);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal memuat detail locker");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRelease() {
    if (!detail) return;
    setReleasing(true);
    try {
      const res = await adminReleaseLocker(detail.number);
      if (res.email) {
        sendLockerEmail({
          kind: "release",
          toEmail: res.email,
          lockerNumber: res.lockerNumber,
          nama: res.nama,
          extra: res.extra,
          periode: res.periode,
          source: "admin",
        }).catch(() => {});
      }
      setReleaseConfirm(false);
      setDetail(null);
      setReleaseResult({ number: res.lockerNumber, pin: res.pin });
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setReleasing(false);
    }
  }

  const used = entries.filter((e) => e.status === "Terisi").length;
  const available = entries.length - used;
  const pct = entries.length ? Math.round((used / entries.length) * 100) : 0;
  const shown = entries.filter((e) => gridFilter === "all" || e.status === gridFilter);
  const L = (id: string, en: string) => (lang === "en" ? en : id);

  return (
    <div className={lk.wrap}>
      <div className={lk.kpis}>
        <div className={lk.occupancy}>
          <div className={lk.ring} style={{ ["--p" as string]: pct }}><div><b>{pct}%</b><small>{L("terisi", "used")}</small></div></div>
          <div className={lk.occText}>
            <small>{L("Tingkat keterisian", "Occupancy")}</small>
            <b>{used} / {entries.length} locker</b>
            <span className={lk.occBar}><span style={{ width: `${pct}%` }} /></span>
            <em>{available > 0 ? L(`${available} locker siap dipakai`, `${available} lockers ready`) : L("Semua locker terisi", "All lockers in use")}</em>
          </div>
        </div>
        {([
          { id: "all", label: L("Total locker", "Total lockers"), value: entries.length, tone: "brand", icon: "🗄️" },
          { id: "Terisi", label: L("Terisi", "In use"), value: used, tone: "red", icon: "🔒" },
          { id: "Available", label: L("Tersedia", "Available"), value: available, tone: "green", icon: "🔓" },
        ] as const).map((k) => (
          <button key={k.id} type="button" className={`${lk.kpi} ${lk["k_" + k.tone]} ${gridFilter === k.id ? lk.kpiOn : ""}`} onClick={() => setGridFilter(k.id)} aria-pressed={gridFilter === k.id}>
            <span className={lk.kpiIcon}>{k.icon}</span>
            <span><small>{k.label}</small><b>{loading ? "…" : k.value}</b></span>
          </button>
        ))}
      </div>

      <div className={lk.toolbar}>
        <div className={lk.searchWrap}>
          <div className={lk.search}>
            <span>⌕</span>
            <input
              placeholder={L("Cari nama penghuni atau nomor locker…", "Search occupant name or locker number…")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button type="button" onClick={() => setSearch("")} aria-label={L("Hapus", "Clear")}>✕</button>}
          </div>
          {searchResults !== null && (
            <div className={lk.results}>
              {searching ? (
                <div className={lk.resEmpty}>{t.actionLoading}</div>
              ) : searchResults.length === 0 ? (
                <div className={lk.resEmpty}>{L("Tidak ada hasil ditemukan.", "No results found.")}</div>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={lk.resItem}
                    onClick={() => {
                      openDetail(r.number);
                      setSearch("");
                      setSearchResults(null);
                    }}
                  >
                    <span className={lk.resNo}>{r.number}</span>
                    <span><b>{r.nama || "-"}</b><small>PIN {r.pin} · {r.extra || "-"} · {r.periode || "-"}</small></span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className={lk.legend}>
          <span><i className={lk.dotFree} />{L("Tersedia", "Available")}</span>
          <span><i className={lk.dotUsed} />{L("Terisi", "In use")}</span>
        </div>
        <button type="button" className={lk.btnDark} onClick={openReport}>📋 {L("Daftar penghuni", "Occupant report")}</button>
      </div>

      {error && <div className={lk.err}>{error}</div>}

      {loading ? (
        <div className={lk.grid}>{Array.from({ length: 16 }, (_, i) => <div key={i} className={lk.skel} />)}</div>
      ) : entries.length === 0 ? (
        <div className={lk.empty}><span>🗄️</span><b>{L("Belum ada locker", "No lockers yet")}</b><small>{L("Tambahkan locker di tab Kelola Locker.", "Add lockers in the Manage tab.")}</small></div>
      ) : (
        <div className={lk.grid}>
          {shown.map((e, i) => {
            const isUsed = e.status === "Terisi";
            return (
              <button
                key={e.number}
                type="button"
                onClick={() => openDetail(e.number)}
                className={`${lk.door} ${isUsed ? lk.doorUsed : lk.doorFree}`}
                style={{ animationDelay: `${Math.min(i, 40) * 0.012}s` }}
                title={isUsed ? L(`Locker ${e.number} — terisi`, `Locker ${e.number} — in use`) : L(`Locker ${e.number} — tersedia`, `Locker ${e.number} — available`)}
              >
                <span className={lk.vent} />
                <span className={lk.doorNo}>{e.number}</span>
                <span className={lk.handle} />
                <span className={lk.doorState}><i />{isUsed ? L("Terisi", "In use") : L("Kosong", "Free")}</span>
              </button>
            );
          })}
        </div>
      )}

      {(detail || detailLoading) && (
        <ModalPortal onOverlayClick={() => !releasing && setDetail(null)} maxWidth={400}>
          <div className="heroGlow" style={{ borderRadius: "var(--r2)", boxShadow: "var(--shadow-lg)", padding: 26 }}>
            {detailLoading || !detail ? (
              <div style={{ textAlign: "center", padding: 30, color: "var(--t3)" }}>{t.actionLoading}</div>
            ) : (
              <>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--t1)", marginBottom: 14 }}>
                  🔐 Locker {detail.number}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  <DetailRow label="Status" value={detail.status} accent={detail.status === "Terisi" ? "var(--red)" : "var(--green)"} />
                  <DetailRow label="PIN Saat Ini" value={detail.pin} />
                  {detail.prevPin && <DetailRow label="PIN Sebelumnya" value={detail.prevPin} muted />}
                  {detail.status === "Terisi" && (
                    <>
                      <DetailRow label="Nama" value={detail.nama || "-"} />
                      <DetailRow label={detail.periode === "Employee" ? "Department" : "University"} value={detail.extra || "-"} />
                      {detail.periode !== "Employee" && <DetailRow label="Periode" value={detail.periode || "-"} />}
                      {detail.endDate && <DetailRow label="Selesai Pada" value={detail.endDate} />}
                    </>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detail.status === "Terisi" && (
                    <button
                      onClick={() => setReleaseConfirm(true)}
                      style={{ padding: 12, borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
                    >
                      {detail.periode === "Employee" ? "Exit Locker (Karyawan)" : "Selesai Kontrak / Magang"}
                    </button>
                  )}
                  <button
                    onClick={() => setDetail(null)}
                    style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}
                  >
                    {lang === "en" ? "Back" : "Kembali"}
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalPortal>
      )}

      {releaseConfirm && detail && (
        <ModalPortal onOverlayClick={() => !releasing && setReleaseConfirm(false)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>
              {lang === "en" ? `Deactivate locker ${detail.number}?` : `Nonaktifkan locker ${detail.number}?`}
            </div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              {lang === "en"
                ? "The PIN will be shuffled and a confirmation email will be sent."
                : "PIN akan diacak ulang dan email konfirmasi akan dikirim."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setReleaseConfirm(false)} disabled={releasing} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                {t.actionCancel}
              </button>
              <button onClick={handleRelease} disabled={releasing} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                {releasing ? t.actionSaving : (lang === "en" ? "Yes, Deactivate" : "Ya, Nonaktifkan")}
              </button>
            </div>
          </div>
        </ModalPortal>
      )}

      {reportOpen && (
        <ModalPortal onOverlayClick={() => setReportOpen(false)} maxWidth={480}>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>{lang === "en" ? "Locker Report" : "Locker Report"}</div>
              <button onClick={() => setReportOpen(false)} style={{ border: "none", background: "var(--bg2)", borderRadius: 8, width: 28, height: 28, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {reportLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: "var(--t3)" }}>{t.actionLoading}</div>
              ) : reportRows.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: "var(--t3)" }}>{lang === "en" ? "No lockers in use yet." : "Belum ada locker yang terisi."}</div>
              ) : (
                reportRows.map((r) => (
                  <div key={r.id} className="rowHover" style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, color: "var(--t1)" }}>
                      <span>{r.nama || "-"}</span>
                      <span>Locker {r.number}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t3)" }}>PIN {r.pin} · {r.extra || "-"} · {r.periode || "-"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      {releaseResult && (
        <ModalPortal onOverlayClick={() => setReleaseResult(null)} maxWidth={380}>
          <div className="heroGlow" style={{ borderRadius: "var(--r2)", boxShadow: "var(--shadow-lg)", padding: 26, textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)", marginBottom: 4 }}>
              Locker {releaseResult.number} berhasil dinonaktifkan
            </div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", marginBottom: 18 }}>
              Penghuni sebelumnya sudah diberi tahu (email) bahwa PIN mereka tidak berlaku lagi.
            </div>
            <div style={{ background: "var(--green-soft)", border: "1px solid var(--green)", borderRadius: 14, padding: "16px 14px", marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", marginBottom: 6 }}>
                ✓ Tidak Perlu Reset Kunci Fisik
              </div>
              <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.5 }}>
                PIN locker ini tetap sama seperti sebelumnya — <strong style={{ fontFamily: "var(--mono)", color: "var(--t1)" }}>{releaseResult.pin}</strong> — siap langsung dipakai peserta berikutnya.
              </div>
            </div>
            <button
              onClick={() => setReleaseResult(null)}
              className="pillBtn"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Selesai
            </button>
          </div>
        </ModalPortal>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--navy)", color: "#fff", padding: "12px 22px", borderRadius: 10, fontSize: 13.5, zIndex: 4000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, accent, muted }: { label: string; value: string; accent?: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--t3)" }}>{label}</span>
      <strong style={{ color: accent || (muted ? "var(--t3)" : "var(--t1)") }}>{value}</strong>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MANAGE — CRUD table + bulk email confirmation, mirrors admin.html's
   "Kelola Locker" tab.
════════════════════════════════════════════════════════════ */

function LockerManagePanel() {
  const { lang, t } = useLang();
  const [rows, setRows] = useState<LockerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | LockerStatus>("all");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LockerRow | null>(null);
  const [form, setForm] = useState<LockerInput>(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LockerRow | null>(null);

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState(0);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  function showToast(msg: string, isError = false) {
    setToast({ msg, error: isError });
    setTimeout(() => setToast(null), 3000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getAllLockers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data locker");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filterStatus !== "all") list = list.filter((r) => r.status === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.number.toLowerCase().includes(q) || r.nama.toLowerCase().includes(q));
    }
    return list;
  }, [rows, filterStatus, search]);

  function openAdd() {
    setEditing(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  }

  function openEdit(r: LockerRow) {
    setEditing(r);
    setForm({
      number: r.number,
      pin: r.pin,
      status: r.status,
      nama: r.nama,
      noHp: r.noHp,
      email: r.email,
      periode: r.periode,
      extra: r.extra,
      endDate: r.endDate,
    });
    setShowForm(true);
  }

  const canSave = form.number.trim() !== "";

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editing) await updateLocker(editing.id, form);
      else await addLocker(form);
      setShowForm(false);
      await load();
      showToast(editing ? "Locker berhasil diperbarui." : "Locker baru berhasil ditambahkan.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menyimpan data.", true);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteLocker(confirmDelete.id);
      showToast(`Locker ${confirmDelete.number} berhasil dihapus.`);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menghapus data.", true);
    }
  }

  async function openBulkConfirm() {
    setBulkLoading(true);
    setBulkConfirmOpen(true);
    try {
      setBulkCount(await getConfirmationRecipientCount());
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal memeriksa jumlah penerima.", true);
      setBulkConfirmOpen(false);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleSendBulk() {
    setBulkSending(true);
    try {
      const recipients = await startBulkConfirmation();
      const baseUrl = getConfirmBaseUrl();
      const results = await Promise.all(
        recipients.map((r) =>
          sendLockerEmail({
            kind: "confirm-request",
            toEmail: r.email,
            lockerNumber: r.lockerNumber,
            nama: r.nama,
            token: r.token,
            baseUrl,
          })
        )
      );
      const failed = results.filter((r) => !r.ok).length;
      setBulkConfirmOpen(false);
      showToast(
        failed > 0
          ? `Terkirim ke ${recipients.length - failed} orang, ${failed} gagal.`
          : `Email konfirmasi terkirim ke ${recipients.length} orang.`
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal mengirim email.", true);
    } finally {
      setBulkSending(false);
    }
  }

  return (
    <div className={lk.wrap}>
      <div className={lk.toolbar}>
        <div className={lk.search}>
          <span>⌕</span>
          <input placeholder={lang === "en" ? "Search number / name..." : "Cari nomor / nama..."} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className={lk.seg}>
          {(["all", "Terisi", "Available"] as const).map((st) => (
            <button key={st} type="button" className={filterStatus === st ? lk.segOn : ""} onClick={() => setFilterStatus(st)}>
              {st === "all" ? (lang === "en" ? "All" : "Semua") : st === "Terisi" ? (lang === "en" ? "In use" : "Terisi") : (lang === "en" ? "Available" : "Tersedia")}
            </button>
          ))}
        </div>
        <button type="button" className={lk.btn} onClick={openBulkConfirm}>📧 {lang === "en" ? "Send confirmation email" : "Kirim email konfirmasi"}</button>
        <button type="button" className={lk.btnPrimary} onClick={openAdd}>+ {lang === "en" ? "Add locker" : "Tambah locker"}</button>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div className={lk.tableCard}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionLoading}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className={lk.table}>
              <thead>
                <tr style={{ background: "var(--bg2)" }}>
                  {["No. Locker", "PIN", "Status", "Nama", "Email", "Periode", "Selesai", "Aksi"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--t2)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="rowHover" style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--t1)" }}>{r.number}</td>
                    <td style={{ padding: "10px 12px", color: "var(--t2)" }}>{r.pin}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--pill)", background: r.status === "Terisi" ? "var(--red-soft)" : "var(--green-soft)", color: r.status === "Terisi" ? "var(--red)" : "var(--green)" }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--t1)" }}>{r.nama || "-"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--t2)" }}>{r.email || "-"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--t2)" }}>{r.periode || "-"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--t2)" }}>{r.endDate || "-"}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(r)} style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>✏️</button>
                        <button onClick={() => setConfirmDelete(r)} style={{ border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={460}>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, var(--brand), var(--brand2))" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {editing ? (lang === "en" ? "Edit Locker" : "Edit Locker") : (lang === "en" ? "Add Locker" : "Tambah Locker")}
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>{lang === "en" ? "Locker Number" : "Nomor Locker"} *</label>
                  <input className="premiumInput" style={inputStyle} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="12" />
                </div>
                <div>
                  <label style={labelStyle}>PIN</label>
                  <input className="premiumInput" style={inputStyle} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder={lang === "en" ? "Blank = auto" : "Kosong = acak otomatis"} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Status</label>
                <select className="premiumInput" style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LockerStatus })}>
                  <option value="Available">Available</option>
                  <option value="Terisi">Terisi</option>
                </select>
              </div>

              {form.status === "Terisi" && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Nama</label>
                    <input className="premiumInput" style={inputStyle} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>No. HP</label>
                      <input className="premiumInput" style={inputStyle} value={form.noHp} onChange={(e) => setForm({ ...form, noHp: e.target.value })} placeholder="08xxxxxxxxxx" />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input className="premiumInput" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div>
                      <label style={labelStyle}>Periode</label>
                      <input className="premiumInput" style={inputStyle} value={form.periode} onChange={(e) => setForm({ ...form, periode: e.target.value })} placeholder="Employee / Jul-Des 2026" />
                    </div>
                    <div>
                      <label style={labelStyle}>Dept / Universitas</label>
                      <input className="premiumInput" style={inputStyle} value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={labelStyle}>{lang === "en" ? "End Date (interns only)" : "Tanggal Selesai (khusus intern)"}</label>
                    <input className="premiumInput" style={inputStyle} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
                <button className="pillBtn" onClick={handleSave} disabled={!canSave || saving} style={{ flex: 2, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}>
                  {saving ? t.actionSaving : t.actionSave}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>
              {lang === "en" ? `Delete locker ${confirmDelete.number}?` : `Hapus locker ${confirmDelete.number}?`}
            </div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}>
              {lang === "en" ? "This cannot be undone." : "Tindakan ini tidak bisa dibatalkan."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}

      {bulkConfirmOpen && (
        <ModalPortal onOverlayClick={() => !bulkSending && setBulkConfirmOpen(false)} maxWidth={400}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📧</div>
            {bulkLoading ? (
              <div style={{ color: "var(--t3)", padding: "10px 0" }}>{t.actionLoading}</div>
            ) : bulkCount === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--t3)" }}>
                {lang === "en" ? "No occupied lockers with an email on file." : "Tidak ada locker terisi dengan email terdaftar."}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>
                  {lang === "en" ? "Send confirmation email?" : "Kirim email konfirmasi?"}
                </div>
                <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 18, lineHeight: 1.6 }}>
                  {lang === "en"
                    ? `Will be sent to ${bulkCount} people. Anyone who answers "No" will have their locker automatically deactivated.`
                    : `Akan dikirim ke ${bulkCount} orang. Locker yang dijawab "Tidak" akan otomatis dinonaktifkan.`}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setBulkConfirmOpen(false)} disabled={bulkSending} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>
                    {t.actionCancel}
                  </button>
                  <button className="pillBtn" onClick={handleSendBulk} disabled={bulkSending} style={{ flex: 1, justifyContent: "center" }}>
                    {bulkSending ? (lang === "en" ? "Sending..." : "Mengirim...") : (lang === "en" ? "Send" : "Kirim")}
                  </button>
                </div>
              </>
            )}
          </div>
        </ModalPortal>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.error ? "var(--red)" : "var(--navy)", color: "#fff", padding: "12px 22px", borderRadius: 10, fontSize: 13.5, zIndex: 4000 }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
