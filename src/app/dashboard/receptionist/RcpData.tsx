"use client";

/* DATA MASTER Receptionist — dua CRUD terpisah (tidak ada master karyawan; nama diketik manual):
   • Akun Wifi : akun dari IT (tambah / ubah / impor / nonaktifkan / hapus)
   • Driver    : tabel drivers CIKOPS yang sama → otomatis sinkron dengan menu Driver CIKOPS */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { addDriver, deleteDriver, getAllDriversFull, resetDriverPin, updateDriver, type DriverInput } from "@/lib/api";
import { DRIVER_TYPES, DRIVER_TYPE_COLOR, DRIVER_TYPE_LABEL, driverTypeOf } from "@/lib/duty";
import type { Driver, DriverType, Plant } from "@/lib/types";
import type { WifiAccount } from "@/lib/receptionist/model";
import { Accounts } from "./RcpWifi";
import { ExportButtons, col, hueOf, initialsOf } from "./shared";
import r from "./receptionist.module.css";
import { plantShort } from "@/lib/brand";

import { L } from "@/lib/i18n";
type Sub = "wifi" | "drivers";

export default function RcpData({ accounts, reloadWifi }: {
  accounts: WifiAccount[]; reloadWifi: () => Promise<void>;
}) {
  const [sub, setSub] = useState<Sub>("wifi");
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [drvErr, setDrvErr] = useState("");
  const loadDrivers = useCallback(async () => {
    try { setDrivers(await getAllDriversFull(null)); setDrvErr(""); } catch (e) { setDrvErr(e instanceof Error ? e.message : String(e)); setDrivers([]); }
  }, []);
  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const cards: { k: Sub; icon: string; title: string; desc: string; n: number | string; c: string }[] = [
    { k: "wifi", icon: "📶", title: L("Data Akun Wifi", "Wifi Account Data"), get desc() { return L("Akun tamu dari IT & masa berlakunya", "Guest accounts from IT & their validity"); }, n: accounts.length, c: "var(--purple)" },
    { k: "drivers", icon: "🚘", title: L("Data Driver", "Driver Data"), desc: L("Sinkron dengan driver CIKOPS", "Synced with CIKOPS drivers"), n: drivers ? drivers.length : "…", c: "var(--green)" },
  ];
  return (
    <>
      <nav className={r.subnav} aria-label="Data master">
        {cards.map((c) => (
          <button key={c.k} type="button" className={r.subCard} style={{ ["--c" as string]: c.c }} aria-pressed={sub === c.k} onClick={() => setSub(c.k)}>
            <span className={r.subIcon}>{c.icon}</span>
            <span><b>{c.title}</b><small>{c.desc}</small></span>
            <span className={r.subCount}>{c.n}</span>
          </button>
        ))}
      </nav>
      {sub === "wifi" && <Accounts accounts={accounts} reload={reloadWifi} />}
      {sub === "drivers" && <Drivers rows={drivers} error={drvErr} reload={loadDrivers} />}
    </>
  );
}

/* ═════════════════ DRIVER (tabel drivers CIKOPS) ═════════════════ */
const AVATARS = ["🧑‍✈️", "👨‍✈️", "👩‍✈️", "🧔", "👨", "👩", "🧑", "👴", "🚗", "🚐"];
interface DrvForm { nama: string; noHp: string; email: string; plant: Plant; type: DriverType; user: string; userTitle: string; avatar: string; aktif: boolean; pin: string }

function Drivers({ rows, error, reload }: { rows: Driver[] | null; error: string; reload: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | DriverType>("all");
  const [plant, setPlant] = useState<"all" | Plant>("all");
  const [edit, setEdit] = useState<{ d: Driver | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows) return <section className={r.card}><p className={r.empty}>{L("Memuat data driver…", "Loading driver data…")}</p></section>;
  const list = rows.filter((d) => (type === "all" || driverTypeOf(d) === type) && (plant === "all" || (d.plant ?? "CIK") === plant) &&
    (!q || [d.nama, d.no_hp ?? "", d.email ?? "", d.assigned_user ?? ""].join(" ").toLowerCase().includes(q.toLowerCase())));
  async function toggle(d: Driver) {
    setBusy(d.id);
    try { await updateDriver(d.id, toInput(d, { aktif: !d.aktif })); await reload(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function del(d: Driver) {
    if (!confirm(L(`Hapus driver "${d.nama}"? Riwayat tugasnya mungkin membuat penghapusan ditolak — nonaktifkan bila ragu.`, `Delete driver "${d.nama}"? Their task history may cause the deletion to be rejected — deactivate if unsure.`))) return;
    try { await deleteDriver(d.id); await reload(); } catch (e) { alert((e instanceof Error ? e.message : String(e)) + L("\n\nSaran: nonaktifkan driver ini saja.", "\n\nTip: just deactivate this driver.")); }
  }
  return (
    <section className={r.card}>
      <div className={r.cardHead}>
        <div><h2>{L("Data Driver", "Driver Data")}</h2><p>Data yang sama dengan menu Driver CIKOPS — perubahan di sini langsung berlaku di Penugasan & aplikasi driver.</p></div>
        <span className={r.row}>
          <ExportButtons rows={list} title={L("Data Driver", "Driver Data")} filename="Data_Driver" columns={[
            col<Driver>("n", L("Nama", "Name"), (d) => d.nama), col<Driver>("t", L("Tipe", "Type"), (d) => DRIVER_TYPE_LABEL[driverTypeOf(d)]), col<Driver>("p", "Plant", (d) => d.plant ?? "CIK"),
            col<Driver>("h", L("No HP", "Phone"), (d) => d.no_hp ?? ""), col<Driver>("e", "Email", (d) => d.email ?? ""), col<Driver>("u", "User", (d) => d.assigned_user ?? ""),
            col<Driver>("a", "Status", (d) => (d.aktif ? L("Aktif", "Active") : L("Nonaktif", "Inactive")))]} />
          <button type="button" className={`${r.btn} ${r.btnSm}`} onClick={() => setEdit({ d: null })}>+ Driver</button>
        </span>
      </div>
      {error && <div className={r.err}>{error}</div>}
      <div className={r.stats}>
        <button type="button" className={r.stat} aria-pressed={type === "all"} onClick={() => setType("all")}><i /><b>{rows.length}</b>semua</button>
        {DRIVER_TYPES.map((t) => (
          <button key={t} type="button" className={r.stat} style={{ ["--c" as string]: DRIVER_TYPE_COLOR[t] }} aria-pressed={type === t} onClick={() => setType(type === t ? "all" : t)}>
            <i /><b>{rows.filter((d) => driverTypeOf(d) === t).length}</b>{DRIVER_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <div className={r.toolbar}>
        <label className={r.search}><span>⌕</span><input className={r.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("Cari nama, no HP, email, user…", "Search name, phone, email, user…")} /></label>
        <div className={r.seg}>{(["all", "CIK", "PRB"] as const).map((p) => <button key={p} type="button" aria-pressed={plant === p} onClick={() => setPlant(p)}>{p === "all" ? L("Semua plant", "All plants") : p}</button>)}</div>
      </div>
      {list.length === 0 ? <p className={r.empty}>{L("Tidak ada driver yang cocok.", "No matching drivers.")}</p> : (
        <div className={r.tableBox}>
          <table className={r.table}>
            <thead><tr><th>Driver</th><th>{L("Tipe", "Type")}</th><th>Plant</th><th>{L("Kontak", "Contact")}</th><th>{L("Aktif", "Active")}</th><th /></tr></thead>
            <tbody>
              {list.map((d) => {
                const t = driverTypeOf(d);
                return (
                  <tr key={d.id} className={`${r.clickRow} ${d.aktif ? "" : r.rowOff}`} onClick={() => setEdit({ d })}>
                    <td><span className={r.who}><span className={`${r.avatar} ${r.avatarEmoji}`}>{d.avatar_emoji || "🧑‍✈️"}</span><span><b>{d.nama}</b><small>{t === "user" ? `mengantar ${d.assigned_user || "–"}` : DRIVER_TYPE_LABEL[t]}</small></span></span></td>
                    <td><span className={r.typeTag} style={{ ["--tc" as string]: DRIVER_TYPE_COLOR[t] }}>{DRIVER_TYPE_LABEL[t]}</span></td>
                    <td><span className={`${r.pill} ${d.plant === "PRB" ? r.pOrange : r.pBlue}`}>{d.plant ?? "CIK"}</span></td>
                    <td><div>{d.no_hp || <span className={r.mute}>–</span>}</div><div className={r.mute} style={{ fontSize: 12 }}>{d.email || ""}</div></td>
                    <td onClick={(e) => e.stopPropagation()}><button type="button" role="switch" aria-checked={d.aktif} aria-label={L(`Aktif ${d.nama}`, `Active ${d.nama}`)} className={r.switch} disabled={busy === d.id} onClick={() => toggle(d)} /></td>
                    <td className={r.num} onClick={(e) => e.stopPropagation()}><span className={r.rowActs}>
                      <button type="button" className={r.link} onClick={() => setEdit({ d })}>{L("Ubah", "Edit")}</button>
                      <button type="button" className={`${r.link} ${r.danger}`} onClick={() => del(d)}>{L("Hapus", "Delete")}</button>
                    </span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <DriverModal d={edit.d} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); }} />}
    </section>
  );
}

function toInput(d: Driver, patch: Partial<DriverInput> = {}): DriverInput {
  const t = driverTypeOf(d);
  return { nama: d.nama, no_hp: d.no_hp ?? null, email: d.email ?? null, avatar_emoji: d.avatar_emoji ?? null, aktif: d.aktif, plant: d.plant ?? "CIK",
    driver_type: t, assigned_user: t === "user" ? d.assigned_user ?? null : null, assigned_user_title: t === "user" ? d.assigned_user_title ?? null : null, ...patch };
}

function DriverModal({ d, onClose, onSaved }: { d: Driver | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState<DrvForm>(() => ({
    nama: d?.nama ?? "", noHp: d?.no_hp ?? "", email: d?.email ?? "", plant: d?.plant ?? "CIK", type: driverTypeOf(d), user: d?.assigned_user ?? "",
    userTitle: d?.assigned_user_title ?? "", avatar: d?.avatar_emoji || AVATARS[0], aktif: d?.aktif ?? true, pin: "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof DrvForm>(k: K, x: DrvForm[K]) => setV((o) => ({ ...o, [k]: x }));
  const pinOk = d ? v.pin === "" || /^\d{4,}$/.test(v.pin) : /^\d{4,}$/.test(v.pin);
  const ok = v.nama.trim() && pinOk && (v.type !== "user" || v.user.trim()) && !busy;
  async function save() {
    if (!ok) return;
    setBusy(true); setErr("");
    const input: DriverInput = { nama: v.nama.trim(), no_hp: v.noHp.trim() || null, email: v.email.trim() || null, avatar_emoji: v.avatar, aktif: v.aktif, plant: v.plant,
      driver_type: v.type, assigned_user: v.type === "user" ? v.user.trim() : null, assigned_user_title: v.type === "user" ? v.userTitle.trim() || null : null };
    try {
      if (d) { await updateDriver(d.id, input); if (v.pin) await resetDriverPin(d.id, v.pin); }
      else await addDriver(input, v.pin);
      await onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={600}>
      <form className={r.modal} onSubmit={(e) => { e.preventDefault(); save(); }} role="dialog" aria-modal="true" aria-labelledby="rcp-drv-title">
        <div className={r.modalHead}>
          <div className={r.who}><span className={`${r.avatar} ${r.avatarEmoji}`} style={{ width: 44, height: 44, fontSize: 22 }}>{v.avatar}</span>
            <div><h2 id="rcp-drv-title">{d ? L("Ubah driver", "Edit driver") : L("Driver baru", "New driver")}</h2><p>{L("Sinkron dengan driver CIKOPS", "Synced with CIKOPS drivers")}</p></div></div>
          <button type="button" className={r.iconBtn} onClick={onClose} aria-label={L("Tutup", "Close")}>✕</button>
        </div>
        <div className={r.form}>
          <div className={r.section}>Identitas</div>
          <label className={`${r.field} ${r.full}`}><span>{L("Nama driver *", "Driver name *")}</span><input className={r.input} value={v.nama} onChange={(e) => set("nama", e.target.value)} autoFocus required /></label>
          <div className={`${r.field} ${r.full}`}><span>Avatar</span>
            <div className={r.chips}>{AVATARS.map((a) => <button key={a} type="button" className={r.chip} style={{ fontSize: 18, flex: "0 0 auto" }} aria-pressed={v.avatar === a} onClick={() => set("avatar", a)}>{a}</button>)}</div>
          </div>
          <label className={r.field}><span>No HP / WhatsApp</span><input className={r.input} inputMode="tel" value={v.noHp} onChange={(e) => set("noHp", e.target.value)} /></label>
          <label className={r.field}><span>Email <em>(login aplikasi driver)</em></span><input className={r.input} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></label>
          <div className={r.section}>{L("Penugasan", "Assignment")}</div>
          <div className={`${r.field} ${r.full}`}><span>Tipe driver</span>
            <div className={r.chips}>{DRIVER_TYPES.map((t) => <button key={t} type="button" className={r.chip} aria-pressed={v.type === t} onClick={() => set("type", t)}>{DRIVER_TYPE_LABEL[t]}</button>)}</div>
          </div>
          {v.type === "user" && (
            <>
              <label className={r.field}><span>{L("Nama user *", "User name *")}</span><input className={r.input} value={v.user} onChange={(e) => set("user", e.target.value)} placeholder={L("Siapa yang diantar", "Who is being driven")} /></label>
              <label className={r.field}><span>Jabatan user</span><input className={r.input} value={v.userTitle} onChange={(e) => set("userTitle", e.target.value)} /></label>
            </>
          )}
          <div className={r.field}><span>Plant</span><div className={r.chips}>{(["CIK", "PRB"] as Plant[]).map((p) => <button key={p} type="button" className={r.chip} aria-pressed={v.plant === p} onClick={() => set("plant", p)}>{plantShort(p)}</button>)}</div></div>
          <div className={r.field}><span>Status</span><label className={r.check} style={{ height: 40 }}><button type="button" role="switch" aria-checked={v.aktif} className={r.switch} onClick={() => set("aktif", !v.aktif)} /> {v.aktif ? L("Aktif", "Active") : L("Nonaktif", "Inactive")}</label></div>
          <div className={r.section}>Keamanan</div>
          <label className={`${r.field} ${r.full}`}><span>{d ? L("PIN baru", "New PIN") : "PIN *"} <em>{d ? L("(kosongkan bila tidak diganti)", "(leave blank to keep unchanged)") : L("(minimal 4 angka)", "(at least 4 digits)")}</em></span>
            <input className={r.input} inputMode="numeric" value={v.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} placeholder="••••" aria-invalid={!pinOk && v.pin !== ""} /></label>
        </div>
        {err && <div className={r.err}>{err}</div>}
        <div className={r.modalFoot}>
          <span className={r.hint}>Tersimpan di tabel driver CIKOPS.</span><span className={r.grow} />
          <button type="button" className={r.ghost} onClick={onClose}>{L("Batal", "Cancel")}</button>
          <button type="submit" className={r.btn} disabled={!ok}>{busy ? L("Menyimpan…", "Saving…") : L("Simpan", "Save")}</button>
        </div>
      </form>
    </ModalPortal>
  );
}
