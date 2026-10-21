"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./dashboard.module.css";
import { TaskForm, TaskSuccess } from "./TasksUI";
import type { TaskFormValues } from "./TasksUI";
import { ModalPortal } from "@/components/ModalPortal";
import { ReportExportButtons, LanguagePickerModal, useExportLanguagePicker, ReportRangePicker, defaultReportRange } from "@/components/ReportControls";
import { exportSummaryCsv, exportSummaryExcel, exportSummaryPdf } from "@/lib/reportEngine";
import type { ReportColumn, ReportRangeState } from "@/lib/reportEngine";
import { reportRangeToDates, reportRangeLabel } from "@/lib/reportEngine";
import type { DriverReportSummary } from "@/lib/analytics";
import { createTask, createTaskBatch, sendTaskBatchEmail, sendPushToDriver, type MyProfile, getTasksByRange } from "@/lib/api";
import { computeReportAnalytics, formatMinutes } from "@/lib/analytics";
import type { Driver, Employee, JobType, TaskDetail, Vehicle } from "@/lib/types";
import of from "./opfund.module.css";
import { formatDateLabel } from "./dashboardShared";

/** Shimmering placeholder rows shown while a table/list is loading —
 *  replaces plain "Loading..." text everywhere in the dashboard so the
 *  screen doesn't feel frozen while data comes in. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ padding: "16px 4px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px" }}>
          <div className={styles.skeletonBar} style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <div className={styles.skeletonBar} style={{ height: 12, width: `${58 - i * 6}%` }} />
            <div className={styles.skeletonBar} style={{ height: 10, width: `${34 - i * 3}%` }} />
          </div>
          <div className={styles.skeletonBar} style={{ height: 22, width: 64, borderRadius: "var(--pill)", flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════
   REPORT MODAL — pilih rentang tanggal, unduh CSV/PDF
════════════════════════════════════════════════ */

export function ReportModal({
  drivers,
  myProfile,
  onClose,
  onError,
  onSuccess,
}: {
  drivers: Driver[];
  myProfile: MyProfile | null;
  onClose: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}) {
  const [range, setRange] = useState<ReportRangeState>(defaultReportRange());
  const { from: dateFrom, to: dateTo } = reportRangeToDates(range);
  const [reportTasks, setReportTasks] = useState<TaskDetail[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoadingPreview(true);
    try {
      const data = await getTasksByRange(dateFrom, dateTo, myProfile?.plantScope ?? null);
      setReportTasks(data); // ⚠️ sebelumnya data hasil fetch tidak pernah disimpan ke state — makanya preview & export selalu kosong
    } catch (e) {
      onError(e instanceof Error ? e.message : "Gagal memuat data laporan");
    } finally {
      setLoadingPreview(false);
    }
  }, [dateFrom, dateTo, onError, myProfile?.plantScope]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const analytics = useMemo(
    () => computeReportAnalytics(reportTasks, drivers),
    [reportTasks, drivers]
  );

  const driverNameMap = useMemo(() => new Map(drivers.map((d) => [d.id, d.nama])), [drivers]);

  const driverSummaryColumns: ReportColumn<DriverReportSummary>[] = [
    { key: "driver", labelId: "Driver", labelEn: "Driver", get: (d) => d.driverNama },
    { key: "total", labelId: "Total Tugas", labelEn: "Total Tasks", get: (d) => d.totalTask, align: "right" },
    { key: "selesai", labelId: "Selesai", labelEn: "Completed", get: (d) => d.selesai, align: "right" },
    { key: "dibatalkan", labelId: "Dibatalkan", labelEn: "Cancelled", get: (d) => d.dibatalkan, align: "right" },
    { key: "aktif", labelId: "Aktif", labelEn: "Active", get: (d) => d.aktif, align: "right" },
    { key: "rate", labelId: "Completion Rate", labelEn: "Completion Rate", get: (d) => `${d.completionRate.toFixed(0)}%`, align: "right" },
    { key: "avgDur", labelId: "Rata-rata Durasi", labelEn: "Avg Duration", get: (d) => (d.avgDurationMinutes != null ? formatMinutes(d.avgDurationMinutes) : "-") },
  ];

  const exportPicker = useExportLanguagePicker((format, exportLang) => {
    const periodLabel = reportRangeLabel(range, exportLang);
    const opts = {
      lang: exportLang,
      titleId: "Laporan Tugas Driver", titleEn: "Driver Task Report",
      periodLabel, filename: "Laporan_Tugas_Driver",
      kpis: [
        { labelId: "Total Tugas", labelEn: "Total Tasks", value: analytics.totalTask },
        { labelId: "Selesai", labelEn: "Completed", value: analytics.done },
        { labelId: "Dibatalkan", labelEn: "Cancelled", value: analytics.cancelled },
        { labelId: "Sedang Berjalan", labelEn: "Ongoing", value: analytics.assigned + analytics.ongoing },
        { labelId: "Completion Rate", labelEn: "Completion Rate", value: `${analytics.completionRate.toFixed(0)}%` },
        { labelId: "Driver Aktif", labelEn: "Active Drivers", value: analytics.driverAktif },
      ],
      breakdowns: [
        {
          titleId: "Top Driver (Jumlah Tugas)", titleEn: "Top Driver (Task Count)",
          valueLabelId: "Jumlah Tugas", valueLabelEn: "Task Count",
          items: analytics.topDriverByTask.map((e) => ({ label: e.label, value: e.value })),
        },
        {
          titleId: "Top Departemen Requestor", titleEn: "Top Requesting Department",
          valueLabelId: "Jumlah Tugas", valueLabelEn: "Task Count",
          items: analytics.topDepartementRequestor.map((e) => ({ label: e.label, value: e.value })),
        },
        {
          titleId: "Top Jenis Pekerjaan", titleEn: "Top Job Type",
          valueLabelId: "Jumlah", valueLabelEn: "Count",
          items: analytics.topJenisPekerjaan.map((e) => ({ label: e.label, value: e.value })),
        },
        {
          titleId: "Utilisasi Kendaraan", titleEn: "Vehicle Utilization",
          valueLabelId: "Jumlah Pemakaian", valueLabelEn: "Usage Count",
          items: analytics.utilisasiKendaraan.map((e) => ({ label: e.label, value: e.value })),
        },
      ],
      tableTitleId: "Rekap per Driver", tableTitleEn: "Per-Driver Recap",
      tableRows: analytics.driverSummaries, tableColumns: driverSummaryColumns,
    };
    if (format === "csv") exportSummaryCsv(opts);
    else if (format === "excel") exportSummaryExcel(opts);
    else exportSummaryPdf(opts);
    onSuccess(`Laporan ${format.toUpperCase()} berhasil diunduh`);
  });

  return (
    <div className={styles.reportOverlay}>
      <div className={styles.reportPanel}>
        <div className={styles.reportTopbar}>
          <div className={styles.reportTitleWrap}>
            <div className={styles.topbarEyebrow}>CIKOPS</div>
            <div className={styles.topbarTitle}>Laporan & Analytics</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            ✕ Tutup
          </button>
        </div>

        <div className={styles.reportBody}>
          <div className={styles.reportFilterRow}>
            <ReportRangePicker value={range} onChange={setRange} inputClassName={styles.toolbarDateInput} />
          </div>

          <div className={styles.reportActionRow}>
            <ReportExportButtons onExport={exportPicker.requestExport} disabled={loadingPreview || reportTasks.length === 0} />
          </div>
          {exportPicker.pending && <LanguagePickerModal format={exportPicker.pending} onConfirm={exportPicker.confirm} onClose={exportPicker.cancel} />}

          {loadingPreview ? (
            <div className={styles.tableWrap}>
              <div className={styles.tableLoading}>
                <div className={styles.spinner} />
                <div className={styles.loadingTxt}>Memuat data laporan...</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.statsRow}>
                <div className={`${styles.statCard} ${styles.statTotal}`}>
                  <div className={styles.statCardNum}>{analytics.totalTask}</div>
                  <div className={styles.statCardLabel}>Total Task</div>
                </div>
                <div className={`${styles.statCard} ${styles.statAssigned}`}>
                  <div className={styles.statCardNum}>{analytics.assigned}</div>
                  <div className={styles.statCardLabel}>Assigned</div>
                </div>
                <div className={`${styles.statCard} ${styles.statOngoing}`}>
                  <div className={styles.statCardNum}>{analytics.ongoing}</div>
                  <div className={styles.statCardLabel}>On Going</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDone}`}>
                  <div className={styles.statCardNum}>{analytics.done}</div>
                  <div className={styles.statCardLabel}>Done</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDriverAktif}`}>
                  <div className={styles.statCardNum}>
                    {analytics.driverAktif}
                  </div>
                  <div className={styles.statCardLabel}>Driver Aktif</div>
                </div>
                <div className={`${styles.statCard} ${styles.statCompletion}`}>
                  <div className={styles.statCardNum}>
                    {analytics.completionRate.toFixed(0)}%
                  </div>
                  <div className={styles.statCardLabel}>Completion Rate</div>
                </div>
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>📊</span>
                Analytics & Insights
              </div>

              <div className={styles.insightGrid}>
                <InsightCard
                  icon="🏆"
                  title="Top Driver (Task)"
                  entries={analytics.topDriverByTask}
                  color="blue"
                />
                <InsightCard
                  icon="⏱️"
                  title="Rata-rata Durasi Driver"
                  entries={analytics.avgDurationByDriver}
                  color="cyan"
                  valueFormatter={(v) => formatMinutes(v)}
                />
                <InsightCard
                  icon="🏢"
                  title="Top Departemen Requestor"
                  entries={analytics.topDepartementRequestor}
                  color="purple"
                />
                <InsightCard
                  icon="🧰"
                  title="Jenis Pekerjaan Terbanyak"
                  entries={analytics.topJenisPekerjaan}
                  color="green"
                />
                <InsightCard
                  icon="🚗"
                  title="Utilisasi Kendaraan"
                  entries={analytics.utilisasiKendaraan}
                  color="orange"
                />
                <InsightCard
                  icon="📅"
                  title="Aktivitas Harian"
                  entries={analytics.aktivitasHarian.map((e) => ({
                    ...e,
                    label: formatDateLabel(e.label),
                  }))}
                  color="red"
                />
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>👥</span>
                Ringkasan Per Driver
                <span className={styles.reportSectionCount}>
                  {analytics.driverSummaries.length} driver
                </span>
              </div>

              <div className={styles.driverSummaryGrid}>
                {analytics.driverSummaries.length === 0 ? (
                  <div className={styles.tableEmpty}>
                    <div className={styles.tableEmptyTitle}>
                      Tidak ada data driver pada periode ini
                    </div>
                  </div>
                ) : (
                  analytics.driverSummaries.map((s) => (
                    <div key={s.driverId} className={styles.driverSummaryCard}>
                      <div className={styles.driverSummaryHeader}>
                        <span>🏅</span> {s.driverNama}
                      </div>
                      <div className={styles.driverSummaryPeriod}>
                        {formatDateLabel(dateFrom)} s/d {formatDateLabel(dateTo)}
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Total Task</span>
                        <strong>{s.totalTask}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Selesai</span>
                        <strong>{s.selesai}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Completion Rate</span>
                        <strong className={styles.driverSummaryAccent}>
                          {s.completionRate.toFixed(0)}%
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Total Jam Kerja</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {formatMinutes(s.totalJamKerjaMinutes)}
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>Avg Durasi/Task</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {s.avgDurationMinutes !== null
                            ? formatMinutes(s.avgDurationMinutes)
                            : "-"}
                        </strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const INSIGHT_COLOR_CLASS: Record<string, string> = {
  blue: "insightBarBlue",
  cyan: "insightBarCyan",
  purple: "insightBarPurple",
  green: "insightBarGreen",
  orange: "insightBarOrange",
  red: "insightBarRed",
};

function InsightCard({
  icon,
  title,
  entries,
  color,
  valueFormatter,
}: {
  icon: string;
  title: string;
  entries: { label: string; value: number }[];
  color: string;
  valueFormatter?: (v: number) => string;
}) {
  const maxValue = Math.max(...entries.map((e) => e.value), 1);
  const barClass =
    styles[INSIGHT_COLOR_CLASS[color] as keyof typeof styles] || "";
  return (
    <div className={styles.insightCard}>
      <div className={styles.insightCardHeader}>
        <span>{icon}</span> {title}
      </div>
      {entries.length === 0 ? (
        <div className={styles.insightEmpty}>Tidak ada data</div>
      ) : (
        <div className={styles.insightList}>
          {entries.slice(0, 5).map((e) => (
            <div key={e.label} className={styles.insightRow}>
              <div className={styles.insightLabel} title={e.label}>
                {e.label}
              </div>
              <div className={styles.insightBarTrack}>
                <div
                  className={`${styles.insightBarFill} ${barClass}`}
                  style={{ width: `${(e.value / maxValue) * 100}%` }}
                />
              </div>
              <div className={styles.insightValue}>
                {valueFormatter ? valueFormatter(e.value) : e.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════
   CREATE TASK MODAL
════════════════════════════════════════════════ */

/** Builds a formatted WhatsApp share message for a newly-assigned driver
 *  task — greeting adapts to time of day, uses WhatsApp's own *bold*
 *  markup so it renders nicely once shared. */
function buildTaskWhatsAppMessage(params: {
  tanggal: string;
  driverName: string;
  vehicleLabel: string;
  jenisPekerjaan: string;
  asal: string;
  tujuan: string;
  requestor: string;
  departement: string;
  perihal: string;
}): string {
  const hour = new Date().getHours();
  const greeting = hour < 11 ? "Selamat Pagi" : hour < 15 ? "Selamat Siang" : hour < 18 ? "Selamat Sore" : "Selamat Malam";

  // params.tanggal bisa berupa single date "YYYY-MM-DD"
  // atau range "YYYY-MM-DD s/d YYYY-MM-DD" — handle keduanya
  function fmtWaDate(d: string): string {
    const parsed = new Date(d + "T00:00:00");
    if (isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  let tanggalFormatted: string;
  if (params.tanggal.includes(" s/d ")) {
    const [from, to] = params.tanggal.split(" s/d ");
    tanggalFormatted = `${fmtWaDate(from.trim())} s/d ${fmtWaDate(to.trim())}`;
  } else {
    tanggalFormatted = fmtWaDate(params.tanggal);
  }

  const lines = [
    `${greeting},`,
    "",
    "Berikut informasi penugasan driver:",
    "",
    `📅 *Tanggal* : ${tanggalFormatted}`,
    `🧑‍✈️ *Driver* : ${params.driverName}`,
    `🚗 *Kendaraan* : ${params.vehicleLabel}`,
    `🧰 *Jenis Pekerjaan* : ${params.jenisPekerjaan}`,
    `🚩 *Dari* : ${params.asal}`,
    `📍 *Tujuan* : ${params.tujuan}`,
    `👤 *Requestor* : ${params.requestor}${params.departement ? ` (${params.departement})` : ""}`,
  ];
  if (params.perihal.trim()) {
    lines.push(`📝 *Perihal* : ${params.perihal.trim()}`);
  }
  lines.push("", "Mohon dapat ditindaklanjuti. Terima kasih 🙏", "", "_Pesan otomatis — CIKOPS Fleet Ops_");

  return lines.join("\n");
}

export function CreateTaskModal({
  drivers,
  vehicles,
  employees,
  jobTypes,
  myProfile,
  places,
  onClose,
  onCreated,
  onError,
}: {
  drivers: Driver[];
  vehicles: Vehicle[];
  employees: Employee[];
  jobTypes: JobType[];
  myProfile: MyProfile | null;
  places: string[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [waMessage, setWaMessage] = useState<string | null>(null);

  async function handleSubmit(v: TaskFormValues) {
    setBusy(true);
    try {
      const { plant, tanggal, tanggalTo, asal, tujuan, driverId, vehicleId, jenisPekerjaan, requestor, departement, perihal, requestorEmail } = v;
      const driverName = drivers.find((d) => d.id === driverId)?.nama || "-";
      const vehicle = vehicles.find((x) => x.id === vehicleId);
      const vehicleLabel = vehicle ? `${vehicle.nopol}${vehicle.jenis ? ` (${vehicle.jenis})` : ""}` : "-";
      const driverPhone = drivers.find((d) => d.id === driverId)?.no_hp || undefined;
      const isRange = v.dateMode === "range";
      const dateTo = isRange ? tanggalTo : tanggal;

      let dayCount = 1;
      if (isRange) {
        const res = await createTaskBatch({
          driverId, vehicleId, jenisPekerjaan, tujuan, requestor, departement, perihal, plant,
          dateFrom: tanggal, dateTo: tanggalTo, lokasiAsal: asal,
        });
        dayCount = res.createdCount;
      } else {
        await createTask({
          tanggal, driver_id: driverId, vehicle_id: vehicleId, jenis_pekerjaan: jenisPekerjaan,
          tujuan, requestor, departement, perihal, plant, lokasi_asal: asal,
        });
      }

      // Notifikasi (best-effort, tidak menggagalkan penugasan)
      sendTaskBatchEmail({
        requestorEmail, requestor, driverName, driverPhone, vehicleLabel, jenisPekerjaan,
        tujuan, asal, departement, perihal, dateFrom: tanggal, dateTo, dayCount,
      }).catch((e) => console.warn("Task email failed:", e));
      sendPushToDriver(
        [driverId],
        "Ada Tugas Baru 🚗",
        `${asal} → ${tujuan} · ${jenisPekerjaan} · ${isRange ? `${tanggal} s/d ${tanggalTo}` : tanggal}`,
        { type: "task" }
      ).catch(() => {});

      setWaMessage(
        buildTaskWhatsAppMessage({
          tanggal: isRange ? `${tanggal} s/d ${tanggalTo}` : tanggal,
          driverName, vehicleLabel, jenisPekerjaan, asal, tujuan, requestor, departement, perihal,
        })
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal membuat tugas");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalPortal onOverlayClick={waMessage ? undefined : onClose} maxWidth={waMessage ? 520 : 980}>
      {waMessage ? (
        <TaskSuccess
          message={waMessage}
          onWhatsapp={`https://wa.me/?text=${encodeURIComponent(waMessage)}`}
          onDone={() => { setWaMessage(null); onCreated(); }}
        />
      ) : (
        <TaskForm
          drivers={drivers}
          vehicles={vehicles}
          employees={employees}
          jobTypes={jobTypes}
          lockedPlant={myProfile?.plantScope ?? null}
          places={places}
          busy={busy}
          error=""
          onSubmit={handleSubmit}
          onClose={onClose}
        />
      )}
    </ModalPortal>
  );
}

/* ════════════════════════════════════════════════════════════
   FLEETOS TABS — ported from the original FleetOS system into this
   merged dashboard. Styled with the shared "Sky & Gold" design tokens
   (var(--brand), var(--gold), var(--surface), etc.) via inline styles,
   since these are new components without a pre-existing CSS module.
════════════════════════════════════════════════════════════ */
