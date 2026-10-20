"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./dashboard.module.css";
import { ModalPortal } from "@/components/ModalPortal";
import { type MyProfile, getAllDriversFull, addDriver, updateDriver, deleteDriver, sendDriverCredentials, type DriverInput, getAllEmployeesFull, addEmployee, updateEmployee, deleteEmployee, getAllJobTypesFull, addJobType, updateJobType, deleteJobType, getAppSetting, setAppSetting, getDriverTiers } from "@/lib/api";
import type { Plant, DriverTier } from "@/lib/types";
import type { DriverType } from "@/lib/types";
import { getUserDutyStatus, isUserDriver, useNowTick, dutyHoursLabel, driverTypeOf, DRIVER_TYPES, DRIVER_TYPE_LABEL, DRIVER_TYPE_COLOR } from "@/lib/duty";
import type { Driver } from "@/lib/types";
import { useLang } from "@/lib/providers";
import { ModuleHeader, ModulePage, ModuleTabs } from "./ModuleShell";
import { PLANT_COLOR } from "./dashboardShared";
import { SkeletonRows } from "./TaskModals";
import { CrudList, SettingsPage } from "@/components/settings/Settings";

const AVATAR_EMOJIS = ["🧑", "👨", "👩", "🧔", "👨‍🦱", "👩‍🦱", "👨‍🦳", "👩‍🦳", "🧑‍✈️", "🕺"];

export function MasterDataTab({
  initialSub = "drivers",
  restrictedToDriversOnly = false,
  myProfile = null,
}: {
  initialSub?: "drivers" | "employees" | "jobtypes";
  restrictedToDriversOnly?: boolean;
  myProfile?: MyProfile | null;
}) {
  const { lang } = useLang();
   const [sub, setSub] = useState<"drivers" | "employees" | "jobtypes" | "settings">(
   restrictedToDriversOnly ? "drivers" : initialSub
   );

  const cardStyle: CSSProperties = { borderRadius: "var(--r2)" };

  const subTabs = ([
    { id: "drivers", label: lang === "en" ? "Drivers" : "Driver", icon: "🧑‍✈️" },
    { id: "employees", label: lang === "en" ? "Employees" : "Pegawai", icon: "👤" },
    { id: "jobtypes", label: lang === "en" ? "Job Types" : "Jenis Pekerjaan", icon: "🧰" },
    { id: "settings", label: lang === "en" ? "Settings" : "Pengaturan", icon: "⚙️" },
  ] as const).filter((s) => !restrictedToDriversOnly || s.id === "drivers" || s.id === "employees");
  return (
    <ModulePage>
      <ModuleHeader
        kicker={lang === "en" ? "System · Master Data" : "Sistem · Master Data"}
        title="Master Data"
        desc={lang === "en" ? "Shared reference data for all modules: drivers, employees (also used by Receptionist & the TGA app), job types, and app settings." : "Data acuan bersama untuk semua modul: driver, pegawai (dipakai juga oleh Receptionist & aplikasi TGA), jenis pekerjaan, dan pengaturan aplikasi."}
      />
      <ModuleTabs tabs={subTabs.map((x) => ({ ...x }))} value={sub} onChange={(v) => setSub(v)} />

      {sub === "drivers" && <DriversMasterPanel cardStyle={cardStyle} myProfile={myProfile} />}
      {sub === "employees" && <EmployeesMasterPanel cardStyle={cardStyle} />}
      {sub === "jobtypes" && <JobTypesMasterPanel cardStyle={cardStyle} />}
      {sub === "settings" && <SettingsPanel cardStyle={cardStyle} />}
    </ModulePage>
  );
}

/* ── Pengaturan aplikasi (model CRUD standar, src/components/settings) ──
   Disimpan di app_settings. manager_email tetap diisi (dibaca Edge Function
   email klaim & pengingat dokumen); nama penerima di manager_contacts. */
interface ManagerContact extends Record<string, unknown> { email: string; nama: string }
interface DriverUserRow extends Record<string, unknown> { id: string; nama: string; plant: string }

function SettingsPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  void cardStyle;
  const [contacts, setContacts] = useState<ManagerContact[]>([]);
  const [driverUserIds, setDriverUserIds] = useState<string[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [me, mc, du, drv] = await Promise.all([
        getAppSetting("manager_email"), getAppSetting("manager_contacts"), getAppSetting("driver_user_ids"), getAllDriversFull(),
      ]);
      const emails = (me ?? "").split(",").map((e) => e.trim()).filter(Boolean);
      let named: ManagerContact[] = [];
      try { named = mc ? (JSON.parse(mc) as ManagerContact[]) : []; } catch { named = []; }
      setContacts(emails.map((email) => ({ email, nama: named.find((n) => n.email.toLowerCase() === email.toLowerCase())?.nama ?? "" })));
      setDriverUserIds((du ?? "").split(",").filter(Boolean));
      setAllDrivers(drv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pengaturan");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveContacts(next: ManagerContact[]) {
    await Promise.all([
      setAppSetting("manager_email", next.map((c) => c.email).join(",")),
      setAppSetting("manager_contacts", JSON.stringify(next)),
    ]);
    setContacts(next);
  }
  async function saveDriverUsers(next: string[]) {
    await setAppSetting("driver_user_ids", next.join(","));
    setDriverUserIds(next);
  }
  const dup = (email: string, except?: string) => contacts.some((c) => c.email.toLowerCase() === email.toLowerCase() && c.email !== except);

  if (loading) return <SkeletonRows />;
  const driverRows: DriverUserRow[] = driverUserIds.map((id) => {
    const d = allDrivers.find((x) => x.id === id);
    return { id, nama: d ? `${d.avatar_emoji || "🧑"} ${d.nama}` : "(driver sudah dihapus)", plant: d?.plant ?? "-" };
  });
  const driverOptions = allDrivers.filter((d) => !driverUserIds.includes(d.id)).map((d) => ({ value: d.id, label: `${d.nama} · ${d.plant}` }));

  return (
    <SettingsPage>
      {error && <div style={{ gridColumn: "1 / -1", padding: 12, borderRadius: 12, background: "var(--red-soft)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <CrudList<ManagerContact>
        icon="📧" title="Penerima email manajer" itemName="penerima"
        desc="Mendapat salinan setiap klaim yang diajukan dan pengingat dokumen kendaraan (KIR, servis, STNK)."
        empty="Belum ada penerima — salinan klaim & pengingat dokumen tidak terkirim."
        rows={contacts} rowKey={(r) => r.email}
        columns={[
          { label: "Email", render: (r) => <b>{r.email}</b> },
          { label: "Nama / jabatan", render: (r) => r.nama || <span style={{ color: "var(--t3)" }}>—</span> },
        ]}
        fields={[
          { key: "email", label: "Email", type: "email", required: true, placeholder: "manager@perusahaan.com" },
          { key: "nama", label: "Nama / jabatan", placeholder: "mis. GA Manager" },
        ]}
        onCreate={async (v) => {
          const email = String(v.email ?? "").trim();
          if (dup(email)) throw new Error("Email ini sudah ada di daftar.");
          await saveContacts([...contacts, { email, nama: String(v.nama ?? "").trim() }]);
        }}
        onUpdate={async (row, v) => {
          const email = String(v.email ?? "").trim();
          if (dup(email, row.email)) throw new Error("Email ini sudah ada di daftar.");
          await saveContacts(contacts.map((c) => (c.email === row.email ? { email, nama: String(v.nama ?? "").trim() } : c)));
        }}
        onDelete={async (row) => { await saveContacts(contacts.filter((c) => c.email !== row.email)); }}
      />
      <CrudList<DriverUserRow>
        icon="🧾" title="Driver user — Tanda Terima terpisah" itemName="driver"
        desc="Driver di daftar ini mendapat file rekap Tanda Terima sendiri (budget berbeda) saat export per minggu. Driver lain masuk file gabungan."
        empty="Belum ada driver user — semua driver masuk file gabungan."
        rows={driverRows} rowKey={(r) => r.id}
        columns={[{ label: "Driver", render: (r) => <b>{r.nama}</b> }, { label: "Plant", render: (r) => r.plant }]}
        fields={[{ key: "id", label: "Driver", type: "select", required: true, options: driverOptions }]}
        onCreate={async (v) => { await saveDriverUsers([...driverUserIds, String(v.id)]); }}
        onDelete={async (row) => { await saveDriverUsers(driverUserIds.filter((x) => x !== row.id)); }}
      />
    </SettingsPage>
  );
}

/* ── Drivers sub-panel ── */
function DriversMasterPanel({ cardStyle, myProfile = null }: { cardStyle: CSSProperties; myProfile?: MyProfile | null }) {
  const isAdmin = myProfile?.role === "admin";
  const { lang, t } = useLang();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [tiers, setTiers] = useState<DriverTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [formNama, setFormNama] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAvatar, setFormAvatar] = useState(AVATAR_EMOJIS[0]);
  const [formAktif, setFormAktif] = useState(true);
  const [formPin, setFormPin] = useState("");
  const [formPlant, setFormPlant] = useState<Plant>("CIK");
  const [formType, setFormType] = useState<DriverType>("operational");
  const [formUser, setFormUser] = useState("");
  const [formUserTitle, setFormUserTitle] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | DriverType>("all");
  const dutyNow = useNowTick();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Driver | null>(null);

  const [pinTarget, setPinTarget] = useState<Driver | null>(null);
  const [credSending, setCredSending] = useState(false);
  const [credResult, setCredResult] = useState<{ ok: boolean; msg: string; tempPassword?: string } | null>(null);

  async function handleSendCredentials() {
    if (!pinTarget?.email || credSending) return;
    setCredSending(true);
    setCredResult(null);
    try {
      const res = await sendDriverCredentials(pinTarget.email, lang === "en" ? "en" : "id");
      if (res.ok) {
        setCredResult({
          ok: true,
          msg: lang === "en"
            ? `${res.created ? "Account created" : "Password reset"} — temporary password sent to ${pinTarget.email}.`
            : `${res.created ? "Akun dibuat" : "Password direset"} — password sementara sudah dikirim ke ${pinTarget.email}.`,
        });
      } else {
        const errMsg = res.error || (lang === "en" ? "Unknown error — check Edge Function logs." : "Error tidak diketahui — cek log Edge Function di Supabase.");
        setCredResult({ ok: false, msg: errMsg, tempPassword: res.tempPassword });
      }
    } catch (e) {
      setCredResult({ ok: false, msg: e instanceof Error ? e.message : (lang === "en" ? "Failed." : "Gagal.") });
    } finally {
      setCredSending(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, tr] = await Promise.all([getAllDriversFull(myProfile?.plantScope ?? null), getDriverTiers()]);
      setDrivers(d);
      setTiers(tr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data driver");
    } finally {
      setLoading(false);
    }
  }, [myProfile?.plantScope]);
  useEffect(() => { load(); }, [load]);

  function openAdd() {
     setEditing(null);
    setFormNama(""); setFormPhone(""); setFormEmail(""); setFormAvatar(AVATAR_EMOJIS[0]); setFormAktif(true); setFormPin("");
   setFormPlant(myProfile?.plantScope ?? "CIK");
    setFormType("operational"); setFormUser(""); setFormUserTitle("");
    setShowForm(true);
  }
   function openEdit(d: Driver) {
  setEditing(d);
 setFormNama(d.nama); setFormPhone(d.no_hp || ""); setFormEmail(d.email || ""); setFormAvatar(d.avatar_emoji || AVATAR_EMOJIS[0]); setFormAktif(d.aktif); setFormPin("");
   setFormPlant(d.plant || "CIK");
   setFormType(driverTypeOf(d)); setFormUser(d.assigned_user || ""); setFormUserTitle(d.assigned_user_title || "");
   setShowForm(true);
 }

  const canSave = formNama.trim() !== "" && (!!editing || formPin.length >= 4) && (formType !== "user" || formUser.trim() !== "");

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: DriverInput = { nama: formNama.trim(), no_hp: formPhone.trim() || null, email: formEmail.trim() || null, avatar_emoji: formAvatar, aktif: formAktif, plant: myProfile?.plantScope ?? formPlant, driver_type: formType, assigned_user: formType === "user" ? formUser.trim() : null, assigned_user_title: formType === "user" ? (formUserTitle.trim() || null) : null };
      if (editing) await updateDriver(editing.id, payload);
      else await addDriver(payload, formPin);
      setShowForm(false);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menyimpan driver");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteDriver(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert((e instanceof Error ? e.message : "Gagal menghapus driver") + " — driver ini mungkin masih punya riwayat tugas/klaim/overtime, coba nonaktifkan saja.");
    }
  }

  const inputStyle: CSSProperties = {};
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 700, color: "var(--t2)", marginBottom: 5, display: "block" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--t3)" }}>{drivers.length} {lang === "en" ? "drivers total" : "total driver"}</div>
        <button className="pillBtn" onClick={openAdd}>+ {lang === "en" ? "Add Driver" : "Tambah Driver"}</button>
      </div>

      {/* Klasifikasi: Driver Pool / Driver User / Driver Support */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }} role="group" aria-label={lang === "en" ? "Driver type" : "Tipe driver"}>
        {(["all", ...DRIVER_TYPES] as ("all" | DriverType)[]).map((k) => {
          const n = k === "all" ? drivers.length : drivers.filter((d) => driverTypeOf(d) === k).length;
          const on = typeFilter === k;
          const color = k === "all" ? "var(--t1)" : DRIVER_TYPE_COLOR[k];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setTypeFilter(k)}
              style={{ padding: "6px 14px", borderRadius: "var(--pill)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: `1px solid ${on ? color : "var(--border2)"}`, background: on ? "var(--surface2)" : "transparent", color: on ? color : "var(--t2)" }}
            >
              {k === "all" ? (lang === "en" ? "All" : "Semua") : DRIVER_TYPE_LABEL[k]} <span style={{ opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {error && <div style={{ padding: 12, borderRadius: 10, background: "var(--red-soft)", color: "var(--red)", marginBottom: 14, fontSize: 13 }}>{error}</div>}

      <div className="statPop" style={{ ...cardStyle, overflow: "hidden" }}>
        {loading ? (
          <SkeletonRows />
        ) : drivers.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t3)" }}>{t.actionNoDataYet}</div>
        ) : (
          drivers.filter((d) => typeFilter === "all" || driverTypeOf(d) === typeFilter).map((d) => (
            <div key={d.id} className="rowHover" style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{d.avatar_emoji || "🧑"}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
     <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{d.nama}</span>
  <span
     style={{
       fontSize: 9.5, fontWeight: 800, padding: "1px 7px", borderRadius: 6,
        background: "var(--bg2)", color: PLANT_COLOR[d.plant || "CIK"], border: `1px solid ${PLANT_COLOR[d.plant || "CIK"]}33`,
      }}
    >
      {d.plant || "CIK"}
    </span>
  </div>
                <div style={{ fontSize: 13, color: "var(--t3)" }}>{d.no_hp || "-"} {d.email ? `· ${d.email}` : ""}</div>
                {isUserDriver(d) && (() => {
                  const du = getUserDutyStatus(d, dutyNow);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: "var(--pill)", background: du.onDuty ? "var(--green-soft)" : "var(--surface2)", color: du.onDuty ? "var(--green)" : "var(--t3)", border: `1px solid ${du.onDuty ? "var(--green)" : "var(--border2)"}` }}>
                        🔒 {du.onDuty ? "ON DUTY" : "OFF DUTY"} · {dutyHoursLabel}
                      </span>
                      <span style={{ fontSize: 12.5, color: "var(--t2)" }}>
                        {lang === "en" ? "User" : "User"}: <b style={{ color: "var(--t1)" }}>{du.userName || "—"}</b>{du.userTitle ? ` · ${du.userTitle}` : ""}
                      </span>
                    </div>
                  );
                })()}
              </div>
              <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: "var(--pill)", background: "var(--surface2)", border: `1px solid ${DRIVER_TYPE_COLOR[driverTypeOf(d)]}`, color: DRIVER_TYPE_COLOR[driverTypeOf(d)], whiteSpace: "nowrap" }}>
                {DRIVER_TYPE_LABEL[driverTypeOf(d)].toUpperCase()}
              </span>
              <div style={{ fontSize: 13, color: "var(--t3)", minWidth: 90 }}>
                {tiers.find((tr) => tr.id === d.tier_id)?.name || (lang === "en" ? "No tier" : "Tanpa tier")}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--pill)", background: d.aktif ? "var(--green-soft)" : "var(--red-soft)", color: d.aktif ? "var(--green)" : "var(--red)" }}>
                {d.aktif ? (lang === "en" ? "Active" : "Aktif") : (lang === "en" ? "Inactive" : "Nonaktif")}
              </span>
              <button onClick={() => { setPinTarget(d); setCredResult(null); }} title="Reset Password" style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🔑</button>
              <button onClick={() => openEdit(d)} style={{ border: "1px solid var(--border2)", background: "var(--surface2)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>✏️</button>
              {isAdmin && (
                <button onClick={() => setConfirmDelete(d)} style={{ border: "1px solid var(--red)", background: "var(--red-soft)", color: "var(--red)", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>🗑️</button>
              )}
            </div>
          ))
        )}
      </div>

      {showForm && (
        <ModalPortal onOverlayClick={() => setShowForm(false)} maxWidth={440}>
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, var(--brand), var(--brand2))", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🧑‍✈️</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                {editing ? (lang === "en" ? "Edit Driver" : "Edit Driver") : (lang === "en" ? "Add Driver" : "Tambah Driver")}
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <label>AVATAR</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12, background: "var(--bg2)", borderRadius: 12 }}>
                  {AVATAR_EMOJIS.map((em) => (
                    <button
                      key={em} type="button" onClick={() => setFormAvatar(em)}
                      style={{
                        width: 38, height: 38, borderRadius: "50%", fontSize: 17, cursor: "pointer",
                        background: formAvatar === em ? "linear-gradient(135deg, var(--brand), var(--brand2))" : "var(--surface)",
                        border: formAvatar === em ? "2px solid var(--brand2)" : "1px solid var(--border2)",
                        boxShadow: formAvatar === em ? "var(--shadow-brand)" : "none",
                        transition: "transform 0.15s ease",
                        transform: formAvatar === em ? "scale(1.08)" : "scale(1)",
                      }}
                    >{em}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
     <label>PLANT *</label>
    <div style={{ display: "flex", gap: 8 }}>
      {((myProfile?.plantScope ? [myProfile.plantScope] : ["CIK", "PRB"]) as Plant[]).map((p) => (
        <button
           key={p}
          type="button"
          onClick={() => setFormPlant(p)}
          style={{
           flex: 1,
            padding: "9px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
            border: formPlant === p ? `1px solid ${PLANT_COLOR[p]}` : "1px solid var(--border2)",
            background: formPlant === p ? "var(--bg2)" : "transparent",
            color: formPlant === p ? PLANT_COLOR[p] : "var(--t3)",
          }}
        >
          {p}
        </button>
      ))}
     </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>{lang === "en" ? "DRIVER TYPE" : "TIPE DRIVER"} *</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {([
                    ["operational", DRIVER_TYPE_LABEL.operational, lang === "en" ? "Pool — takes task assignments" : "Pool — menerima penugasan"],
                    ["user", DRIVER_TYPE_LABEL.user, lang === "en" ? "Dedicated to one user" : "Khusus untuk 1 user"],
                    ["support", DRIVER_TYPE_LABEL.support, lang === "en" ? "Support / backup — takes assignments" : "Pendukung / cadangan — menerima penugasan"],
                  ] as [DriverType, string, string][]).map(([val, title, sub]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFormType(val)}
                      style={{
                        flex: "1 1 150px", padding: "9px 10px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                        border: formType === val ? "1px solid var(--brand)" : "1px solid var(--border2)",
                        background: formType === val ? "var(--bg2)" : "transparent",
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13, color: formType === val ? "var(--brand)" : "var(--t2)" }}>{title}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{sub}</div>
                    </button>
                  ))}
                </div>
                {formType === "user" && (
                  <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "var(--bg2)", border: "1px solid var(--border2)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label>{lang === "en" ? "USER NAME" : "NAMA USER"} *</label>
                        <input className={styles.formInput} value={formUser} onChange={(e) => setFormUser(e.target.value)} placeholder={lang === "en" ? "Who this driver serves" : "Siapa yang diantar"} />
                      </div>
                      <div>
                        <label>{lang === "en" ? "TITLE / NOTE" : "JABATAN / KET."}</label>
                        <input className={styles.formInput} value={formUserTitle} onChange={(e) => setFormUserTitle(e.target.value)} placeholder="Plant Director" />
                      </div>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.55, color: "var(--t2)" }}>
                      🔒 {lang === "en"
                        ? `Automatically ON DUTY every day ${dutyHoursLabel} (WIB). Status is locked and this driver can't be given operational task assignments.`
                        : `Otomatis ON DUTY setiap hari pukul ${dutyHoursLabel} WIB. Status terkunci dan driver ini tidak bisa ditugaskan ke penugasan operasional.`}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label>{lang === "en" ? "NAME" : "NAMA"} *</label>
                <input className={styles.formInput} value={formNama} onChange={(e) => setFormNama(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                <div>
                  <label>{lang === "en" ? "PHONE" : "NO. HP"}</label>
                  <input className={styles.formInput} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="0812xxxxxxx" />
                </div>
                <div>
                  <label>EMAIL</label>
                  <input className={styles.formInput} value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                </div>
              </div>
              {!editing && (
                <div style={{ marginBottom: 14, padding: 14, background: "var(--gold-soft)", borderRadius: 12, border: "1px solid var(--gold)" }}>
                  <label className="fLabel" style={{ ...labelStyle, color: "var(--gold2)" }}>🔑 {lang === "en" ? "INITIAL PIN (min. 4 digits)" : "PIN AWAL (min. 4 digit)"} *</label>
                  <input className={styles.formInput} type="password" inputMode="numeric" value={formPin} onChange={(e) => setFormPin(e.target.value.replace(/\D/g, ""))} placeholder="1234" />
                </div>
              )}
              <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={formAktif} onChange={(e) => setFormAktif(e.target.checked)} id="driverAktif" />
                <label className="fLabel" htmlFor="driverAktif" style={{ fontSize: 12.5, color: "var(--t2)" }}>{lang === "en" ? "Active" : "Aktif"}</label>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
                <button className="pillBtn" onClick={handleSave} disabled={!canSave || saving} style={{ flex: 1, justifyContent: "center", opacity: canSave && !saving ? 1 : 0.5 }}>{saving ? t.actionSaving : t.actionSave}</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {pinTarget && (
        <ModalPortal onOverlayClick={() => { if (!credSending) setPinTarget(null); }} maxWidth={420}>
          <div style={{ ...cardStyle, padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔑</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4, color: "var(--t1)" }}>{lang === "en" ? "Driver Login Access" : "Akses Login Driver"}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 14 }}>
              {pinTarget.nama}{pinTarget.email ? ` · ${pinTarget.email}` : ""}
            </div>

            {!pinTarget.email ? (
              <div style={{ fontSize: 12.5, color: "var(--orange)", lineHeight: 1.6, marginBottom: 6 }}>
                {lang === "en" ? "⚠ This driver has no email yet — fill it in first (Edit), otherwise they can't log in at all." : "⚠ Driver ini belum punya email — isi dulu (Edit), tanpa email dia tidak bisa login sama sekali."}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.65, marginBottom: 14 }}>
                  {lang === "en"
                    ? "One click below: creates the account (or resets the password) with a random temporary password, then emails it to the driver — including a reminder to change it via Profile → Change Password."
                    : "Satu klik di bawah: akun dibuat (atau password-nya direset) dengan password sementara acak, lalu dikirim otomatis ke email driver — lengkap dengan saran ganti password lewat Profil → Ubah Password."}
                </div>

                {credResult && (
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, padding: "10px 13px", borderRadius: 10, marginBottom: 12, background: credResult.ok ? "rgba(34,197,94,0.1)" : "rgba(229,72,77,0.1)", border: `1px solid ${credResult.ok ? "rgba(34,197,94,0.35)" : "rgba(229,72,77,0.3)"}`, color: credResult.ok ? "var(--green)" : "var(--red)" }}>
                    {credResult.ok ? "✅ " : "⚠ "}{credResult.msg}
                    {credResult.tempPassword && (
                      <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 15, fontWeight: 800, color: "var(--t1)", background: "var(--bg2)", padding: "8px 12px", borderRadius: 8, letterSpacing: 1 }}>
                        {credResult.tempPassword}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSendCredentials}
                  disabled={credSending}
                  style={{ width: "100%", padding: "12px", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 700, cursor: credSending ? "default" : "pointer", opacity: credSending ? 0.65 : 1, marginBottom: 12 }}
                >
                  {credSending
                    ? (lang === "en" ? "Sending..." : "Mengirim...")
                    : (lang === "en" ? "📧 Create/Reset & Email Temp Password" : "📧 Buat/Reset Akun & Kirim Email")}
                </button>

                <details style={{ marginBottom: 4 }}>
                  <summary style={{ fontSize: 12, color: "var(--t3)", cursor: "pointer" }}>
                    {lang === "en" ? "Manual way (via Supabase Dashboard)" : "Cara manual (lewat Supabase Dashboard)"}
                  </summary>
                  <ol style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.7, margin: "8px 0 0", paddingLeft: 18 }}>
                    <li>{lang === "en" ? "Supabase Dashboard → Authentication → Users" : "Supabase Dashboard → Authentication → Users"}</li>
                    <li>{lang === "en" ? "Find " : "Cari "}<strong style={{ color: "var(--t2)" }}>{pinTarget.email}</strong></li>
                    <li>{lang === "en" ? "Open the user → set a new password" : "Buka user-nya → isi password baru"}</li>
                  </ol>
                </details>
              </>
            )}

            <button onClick={() => setPinTarget(null)} disabled={credSending} style={{ width: "100%", marginTop: 10, padding: "11px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: credSending ? "default" : "pointer" }}>
              {lang === "en" ? "Close" : "Tutup"}
            </button>
          </div>
        </ModalPortal>
      )}

      {confirmDelete && (
        <ModalPortal onOverlayClick={() => setConfirmDelete(null)} maxWidth={360}>
          <div style={{ ...cardStyle, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8, color: "var(--t1)" }}>{lang === "en" ? "Delete this driver?" : "Hapus driver ini?"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18 }}><strong style={{ color: "var(--t1)" }}>{confirmDelete.nama}</strong> {lang === "en" ? "will be permanently deleted." : "akan dihapus permanen."}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--surface2)", color: "var(--t2)", fontWeight: 700, cursor: "pointer" }}>{t.actionCancel}</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{t.actionYesDelete}</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}

interface EmployeeRow extends Record<string, unknown> { id: string; nama: string; departement: string }
interface JobTypeRow extends Record<string, unknown> { id: string; label: string }

/* ── Pegawai (dipakai Receptionist, aplikasi TGA & permintaan karyawan) ── */
function EmployeesMasterPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  void cardStyle;
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRows((await getAllEmployeesFull()).map((e) => ({ id: e.id, nama: e.nama, departement: e.departement ?? "" }))); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <SkeletonRows />;
  const depts = [...new Set(rows.map((r) => r.departement).filter(Boolean))].sort();
  const input = (v: Partial<EmployeeRow>) => ({ nama: String(v.nama ?? "").trim(), departement: String(v.departement ?? "").trim() || null });
  return (
    <SettingsPage>
      {error && <div style={{ gridColumn: "1 / -1", padding: 12, borderRadius: 12, background: "var(--red-soft)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <div style={{ gridColumn: "1 / -1" }}>
        <CrudList<EmployeeRow>
          icon="👤" title="Pegawai" itemName="pegawai"
          desc={`Data karyawan untuk pemohon TGA, Receptionist, dan permintaan karyawan. ${depts.length} departemen.`}
          rows={rows} rowKey={(r) => r.id}
          columns={[{ label: "Nama", render: (r) => <b>{r.nama}</b> }, { label: "Departemen", render: (r) => r.departement || "—" }]}
          fields={[
            { key: "nama", label: "Nama", required: true },
            { key: "departement", label: "Departemen", placeholder: depts.slice(0, 3).join(" / ") || "mis. GA" },
          ]}
          onCreate={async (v) => { await addEmployee(input(v)); await load(); }}
          onUpdate={async (row, v) => { await updateEmployee(row.id, input(v)); await load(); }}
          onDelete={async (row) => { await deleteEmployee(row.id); await load(); }}
        />
      </div>
    </SettingsPage>
  );
}

/* ── Jenis pekerjaan (pilihan saat menugaskan driver) ── */
function JobTypesMasterPanel({ cardStyle }: { cardStyle: CSSProperties }) {
  void cardStyle;
  const [rows, setRows] = useState<JobTypeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setRows((await getAllJobTypesFull()).map((j) => ({ id: j.id, label: j.label }))); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <SkeletonRows />;
  const dup = (label: string, except?: string) => rows.some((r) => r.label.toLowerCase() === label.toLowerCase() && r.id !== except);
  return (
    <SettingsPage>
      {error && <div style={{ gridColumn: "1 / -1", padding: 12, borderRadius: 12, background: "var(--red-soft)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
      <CrudList<JobTypeRow>
        icon="🧰" title="Jenis pekerjaan" itemName="jenis pekerjaan"
        desc="Pilihan jenis pekerjaan saat menugaskan driver (mis. Antar tamu, Ambil dokumen)."
        rows={rows} rowKey={(r) => r.id}
        columns={[{ label: "Jenis pekerjaan", render: (r) => <b>{r.label}</b> }]}
        fields={[{ key: "label", label: "Jenis pekerjaan", required: true }]}
        onCreate={async (v) => { const l = String(v.label).trim(); if (dup(l)) throw new Error("Jenis pekerjaan ini sudah ada."); await addJobType(l); await load(); }}
        onUpdate={async (row, v) => { const l = String(v.label).trim(); if (dup(l, row.id)) throw new Error("Jenis pekerjaan ini sudah ada."); await updateJobType(row.id, l); await load(); }}
        onDelete={async (row) => { await deleteJobType(row.id); await load(); }}
      />
    </SettingsPage>
  );
}
