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

import { loc , L} from "@/lib/i18n";
import { PlantSwitch, effectivePlant, type PlantSel } from "@/components/PlantSwitch";
import { plantFull } from "@/lib/brand";
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
  // Plant: akun CIK/PRB dikunci ke plant-nya; akun lain memilih Semua / CIK / PRB
  const lockedPlant = myProfile?.plantScope ?? null;
  const [plantSel, setPlantSel] = useState<PlantSel>("all");
  const plant = effectivePlant(lockedPlant, plantSel);

  const loadPreview = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setLoadingPreview(true);
    try {
      const data = await getTasksByRange(dateFrom, dateTo, plant);
      setReportTasks(data); // ⚠️ sebelumnya data hasil fetch tidak pernah disimpan ke state — makanya preview & export selalu kosong
    } catch (e) {
      onError(e instanceof Error ? e.message : L("Gagal memuat data laporan", "Failed to load report data"));
    } finally {
      setLoadingPreview(false);
    }
  }, [dateFrom, dateTo, onError, plant]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  // daftar driver juga dibatasi plant supaya "Driver Aktif" & rekap per driver tidak memuat driver plant lain
  const plantDrivers = useMemo(() => (plant ? drivers.filter((d) => (d.plant ?? "CIK") === plant) : drivers), [drivers, plant]);
  const analytics = useMemo(
    () => computeReportAnalytics(reportTasks, plantDrivers),
    [reportTasks, plantDrivers]
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
      titleId: plant ? `Laporan Tugas Driver — ${plantFull(plant)}` : "Laporan Tugas Driver — Semua Plant", titleEn: plant ? `Driver Task Report — ${plantFull(plant)}` : "Driver Task Report — All Plants",
      periodLabel, filename: plant ? `Laporan_Tugas_Driver_${plant}` : "Laporan_Tugas_Driver",
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
    onSuccess(L(`Laporan ${format.toUpperCase()} berhasil diunduh`, `${format.toUpperCase()} report downloaded successfully`));
  });

  return (
    <div className={styles.reportOverlay}>
      <div className={styles.reportPanel}>
        <div className={styles.reportTopbar}>
          <div className={styles.reportTitleWrap}>
            <div className={styles.topbarEyebrow}>CIKOPS</div>
            <div className={styles.topbarTitle}>{L("Laporan & Analytics", "Report & Analytics")}</div>
          </div>
          <button className={styles.modalClose} onClick={onClose}>
            ✕ {L("Tutup", "Close")}
          </button>
        </div>

        <div className={styles.reportBody}>
          <div className={styles.reportFilterRow}>
            <ReportRangePicker value={range} onChange={setRange} inputClassName={styles.toolbarDateInput} />
            <PlantSwitch value={plantSel} onChange={setPlantSel} locked={lockedPlant} />
          </div>

          <div className={styles.reportActionRow}>
            <ReportExportButtons onExport={exportPicker.requestExport} disabled={loadingPreview || reportTasks.length === 0} />
          </div>
          {exportPicker.pending && <LanguagePickerModal format={exportPicker.pending} onConfirm={exportPicker.confirm} onClose={exportPicker.cancel} />}

          {loadingPreview ? (
            <div className={styles.tableWrap}>
              <div className={styles.tableLoading}>
                <div className={styles.spinner} />
                <div className={styles.loadingTxt}>{L("Memuat data laporan...", "Loading report data...")}</div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.statsRow}>
                <div className={`${styles.statCard} ${styles.statTotal}`}>
                  <div className={styles.statCardNum}>{analytics.totalTask}</div>
                  <div className={styles.statCardLabel}>{L("Total Task", "Total Tasks")}</div>
                </div>
                <div className={`${styles.statCard} ${styles.statAssigned}`}>
                  <div className={styles.statCardNum}>{analytics.assigned}</div>
                  <div className={styles.statCardLabel}>{L("Ditugaskan", "Assigned")}</div>
                </div>
                <div className={`${styles.statCard} ${styles.statOngoing}`}>
                  <div className={styles.statCardNum}>{analytics.ongoing}</div>
                  <div className={styles.statCardLabel}>{L("Berjalan", "On Going")}</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDone}`}>
                  <div className={styles.statCardNum}>{analytics.done}</div>
                  <div className={styles.statCardLabel}>{L("Selesai", "Done")}</div>
                </div>
                <div className={`${styles.statCard} ${styles.statDriverAktif}`}>
                  <div className={styles.statCardNum}>
                    {analytics.driverAktif}
                  </div>
                  <div className={styles.statCardLabel}>{L("Driver Aktif", "Active Drivers")}</div>
                </div>
                <div className={`${styles.statCard} ${styles.statCompletion}`}>
                  <div className={styles.statCardNum}>
                    {analytics.completionRate.toFixed(0)}%
                  </div>
                  <div className={styles.statCardLabel}>{L("Tingkat Penyelesaian", "Completion Rate")}</div>
                </div>
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>📊</span>
                Analytics & Insights
              </div>

              <div className={styles.insightGrid}>
                <InsightCard
                  icon="🏆"
                  title={L("Top Driver (Task)", "Top Drivers (Tasks)")}
                  entries={analytics.topDriverByTask}
                  color="blue"
                />
                <InsightCard
                  icon="⏱️"
                  title={L("Rata-rata Durasi Driver", "Average Driver Duration")}
                  entries={analytics.avgDurationByDriver}
                  color="cyan"
                  valueFormatter={(v) => formatMinutes(v)}
                />
                <InsightCard
                  icon="🏢"
                  title={L("Top Departemen Requestor", "Top Requesting Departments")}
                  entries={analytics.topDepartementRequestor}
                  color="purple"
                />
                <InsightCard
                  icon="🧰"
                  title={L("Jenis Pekerjaan Terbanyak", "Most Common Job Types")}
                  entries={analytics.topJenisPekerjaan}
                  color="green"
                />
                <InsightCard
                  icon="🚗"
                  title={L("Utilisasi Kendaraan", "Vehicle Utilisation")}
                  entries={analytics.utilisasiKendaraan}
                  color="orange"
                />
                <InsightCard
                  icon="📅"
                  title={L("Aktivitas Harian", "Daily Activity")}
                  entries={analytics.aktivitasHarian.map((e) => ({
                    ...e,
                    label: formatDateLabel(e.label),
                  }))}
                  color="red"
                />
              </div>

              <div className={styles.reportSectionHeader}>
                <span className={styles.reportSectionIco}>👥</span>
                {L("Ringkasan Per Driver", "Summary Per Driver")}
                <span className={styles.reportSectionCount}>
                  {analytics.driverSummaries.length} driver
                </span>
              </div>

              <div className={styles.driverSummaryGrid}>
                {analytics.driverSummaries.length === 0 ? (
                  <div className={styles.tableEmpty}>
                    <div className={styles.tableEmptyTitle}>
                      {L("Tidak ada data driver pada periode ini", "No driver data for this period")}
                    </div>
                  </div>
                ) : (
                  analytics.driverSummaries.map((s) => (
                    <div key={s.driverId} className={styles.driverSummaryCard}>
                      <div className={styles.driverSummaryHeader}>
                        <span>🏅</span> {s.driverNama}
                      </div>
                      <div className={styles.driverSummaryPeriod}>
                        {formatDateLabel(dateFrom)} {L("s/d", "to")} {formatDateLabel(dateTo)}
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>{L("Total Task", "Total Tasks")}</span>
                        <strong>{s.totalTask}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>{L("Selesai", "Completed")}</span>
                        <strong>{s.selesai}</strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>{L("Tingkat Penyelesaian", "Completion Rate")}</span>
                        <strong className={styles.driverSummaryAccent}>
                          {s.completionRate.toFixed(0)}%
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>{L("Total Jam Kerja", "Total Working Hours")}</span>
                        <strong className={styles.driverSummaryAccentBlue}>
                          {formatMinutes(s.totalJamKerjaMinutes)}
                        </strong>
                      </div>
                      <div className={styles.driverSummaryRow}>
                        <span>{L("Rata-rata Durasi/Task", "Avg Duration/Task")}</span>
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
        <div className={styles.insightEmpty}>{L("Tidak ada data", "No data")}</div>
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
  const greeting = hour < 11 ? L("Selamat Pagi", "Good morning") : hour < 15 ? L("Selamat Siang", "Good afternoon") : hour < 18 ? L("Selamat Sore", "Good evening") : L("Selamat Malam", "Good night");

  // params.tanggal bisa berupa single date "YYYY-MM-DD"
  // atau range "YYYY-MM-DD s/d YYYY-MM-DD" — handle keduanya
  function fmtWaDate(d: string): string {
    const parsed = new Date(d + "T00:00:00");
    if (isNaN(parsed.getTime())) return d;
    return parsed.toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  let tanggalFormatted: string;
  if (params.tanggal.includes(" s/d ")) {
    const [from, to] = params.tanggal.split(" s/d ");
    tanggalFormatted = `${fmtWaDate(from.trim())} ${L("s/d", "to")} ${fmtWaDate(to.trim())}`;
  } else {
    tanggalFormatted = fmtWaDate(params.tanggal);
  }

  const lines = [
    `${greeting},`,
    "",
    L("Berikut informasi penugasan driver:", "Here are the driver assignment details:"),
    "",
    `📅 *${L("Tanggal", "Date")}* : ${tanggalFormatted}`,
    `🧑‍✈️ *Driver* : ${params.driverName}`,
    `🚗 *${L("Kendaraan", "Vehicle")}* : ${params.vehicleLabel}`,
    `🧰 *${L("Jenis Pekerjaan", "Job Type")}* : ${params.jenisPekerjaan}`,
    `🚩 *${L("Dari", "From")}* : ${params.asal}`,
    `📍 *${L("Tujuan", "Destination")}* : ${params.tujuan}`,
    `👤 *Requestor* : ${params.requestor}${params.departement ? ` (${params.departement})` : ""}`,
  ];
  if (params.perihal.trim()) {
    lines.push(`📝 *${L("Perihal", "Subject")}* : ${params.perihal.trim()}`);
  }
  lines.push("", L("Mohon dapat ditindaklanjuti. Terima kasih 🙏", "Please follow up. Thank you 🙏"), "", L("_Pesan otomatis — CIKOPS Fleet Ops_", "_Automated message — CIKOPS Fleet Ops_"));

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
      onError(err instanceof Error ? err.message : L("Gagal membuat tugas", "Failed to create the task"));
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
