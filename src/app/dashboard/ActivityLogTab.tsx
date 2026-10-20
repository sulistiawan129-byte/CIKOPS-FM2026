"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./dashboard.module.css";
import { getActivityLog, type ActivityLogEntry } from "@/lib/api";
import { useLang } from "@/lib/providers";
import of from "./opfund.module.css";
import { ModuleHeader, ModulePage } from "./ModuleShell";

export function ActivityLogTab() {
  const { lang } = useLang();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [daysFilter, setDaysFilter] = useState<number>(7);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const TABLE_OPTIONS = ["all", "claims", "kantong", "drivers", "employees", "job_types"];
  const TABLE_LABEL: Record<string, string> = {
    all: lang === "en" ? "All Tables" : "Semua Tabel",
    claims: "Claims",
    kantong: lang === "en" ? "Operational Fund" : "Dana Operasional",
    drivers: "Drivers",
    employees: "Employees",
    job_types: lang === "en" ? "Job Types" : "Jenis Pekerjaan",
  };
  const ACTION_COLOR: Record<string, string> = { INSERT: "var(--green)", UPDATE: "var(--brand)", DELETE: "var(--red)" };
  const ACTION_LABEL_ID: Record<string, string> = { INSERT: "Ditambah", UPDATE: "Diubah", DELETE: "Dihapus" };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActivityLog({
        tableName: tableFilter === "all" ? undefined : tableFilter,
        days: daysFilter,
      });
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat log aktivitas");
    } finally {
      setLoading(false);
    }
  }, [tableFilter, daysFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function diffFields(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
    if (!oldData || !newData) return [];
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    keys.forEach((k) => {
      if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) {
        changes.push({ field: k, from: oldData[k], to: newData[k] });
      }
    });
    return changes;
  }

  function fmtVal(v: unknown): string {
    if (v === null || v === undefined) return "-";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  return (
    <ModulePage>
      <ModuleHeader
        kicker={lang === "en" ? "System · Audit" : "Sistem · Audit"}
        title={lang === "en" ? "Activity Log" : "Log Aktivitas"}
        desc={lang === "en"
          ? "Complete audit trail of who changed what, across Claims, Operational Fund, and Master Data. Visible only to master admin."
          : "Jejak audit lengkap siapa mengubah apa, mencakup Claims, Dana Operasional, dan Master Data. Cuma bisa dilihat oleh master admin."}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <select
          className={styles.formSelect}
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          style={{ width: "auto" }}
        >
          {TABLE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TABLE_LABEL[t]}</option>
          ))}
        </select>
        <div style={{ display: "flex", borderRadius: "var(--pill)", border: "1px solid var(--border2)", padding: 3, gap: 2 }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDaysFilter(d)}
              className="tabPill"
              style={{
                padding: "6px 14px", borderRadius: "var(--pill)", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                background: daysFilter === d ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "transparent",
                color: daysFilter === d ? "#fff" : "var(--t2)",
              }}
            >
              {lang === "en" ? `${d}d` : `${d} hari`}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div className="neonCard" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>{lang === "en" ? "Loading..." : "Memuat..."}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--t3)" }}>
            {lang === "en" ? "No activity in this period." : "Tidak ada aktivitas pada periode ini."}
          </div>
        ) : (
          logs.map((log, i) => {
            const isOpen = expandedId === log.id;
            const changes = log.action === "UPDATE" ? diffFields(log.oldData, log.newData) : [];
            return (
              <div key={log.id} className="staggerItem" style={{ borderBottom: "1px solid var(--border)", animationDelay: `${Math.min(i, 10) * 0.03}s` }}>
                <div
                  onClick={() => setExpandedId(isOpen ? null : log.id)}
                  className="rowHover"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer", position: "relative", zIndex: 1 }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--pill)", background: `${ACTION_COLOR[log.action]}18`, color: ACTION_COLOR[log.action], whiteSpace: "nowrap" }}>
                    {ACTION_LABEL_ID[log.action] || log.action}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>
                      {log.actorName} <span style={{ fontWeight: 400, color: "var(--t3)" }}>· {log.actorRole}{log.actorPlant ? ` · ${log.actorPlant}` : ""}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--t3)" }}>
                      {TABLE_LABEL[log.tableName] || log.tableName}
                      {changes.length > 0 && ` — ${changes.length} ${lang === "en" ? "field(s) changed" : "field berubah"}`}
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", whiteSpace: "nowrap" }}>
                    {new Date(log.createdAt).toLocaleString(lang === "en" ? "en-GB" : "id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <span style={{ color: "var(--t3)", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 18px 16px 18px", position: "relative", zIndex: 1 }}>
                    {log.action === "UPDATE" && changes.length > 0 ? (
                      <div style={{ borderRadius: 10, border: "1px solid var(--border2)", overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", padding: "8px 12px", background: "var(--bg2)", fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase" }}>
                          <div>{lang === "en" ? "Field" : "Field"}</div>
                          <div>{lang === "en" ? "Before" : "Sebelum"}</div>
                          <div>{lang === "en" ? "After" : "Sesudah"}</div>
                        </div>
                        {changes.map((c) => (
                          <div key={c.field} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
                            <div style={{ fontWeight: 700, color: "var(--t2)" }}>{c.field}</div>
                            <div style={{ color: "var(--red)" }}>{fmtVal(c.from)}</div>
                            <div style={{ color: "var(--green)" }}>{fmtVal(c.to)}</div>
                          </div>
                        ))}
                      </div>
                    ) : log.action === "INSERT" ? (
                      <div style={{ fontSize: 12, color: "var(--t2)", fontFamily: "var(--mono)", background: "var(--bg2)", borderRadius: 10, padding: 12 }}>
                        {JSON.stringify(log.newData, null, 2)}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--t2)", fontFamily: "var(--mono)", background: "var(--bg2)", borderRadius: 10, padding: 12 }}>
                        {JSON.stringify(log.oldData, null, 2)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </ModulePage>
  );
}
