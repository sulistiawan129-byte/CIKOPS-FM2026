"use client";

/* Tautan — semua link CIKOPS di satu halaman: aplikasi lapangan, halaman publik, link login
   per role, link langsung menu, unduhan, sistem lain, dan link tambahan buatan admin.
   Setiap link: salin, buka, kirim WhatsApp, atau tampilkan QR untuk dicetak. */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import l from "./links.module.css";
import { ModuleHeader } from "./ModuleShell";
import { ModalPortal } from "@/components/ModalPortal";
import { CrudList } from "@/components/settings/Settings";
import { NAV_GROUPS } from "./dashboardShared";
import { ROLE_INFO, canAccessTab, getAppSetting, setAppSetting, type MyProfile, type StaffRole } from "@/lib/api";
import { SECDESK_URL } from "@/lib/security/secdesk";
import { useLang } from "@/lib/providers";

interface LinkItem {
  id: string; icon: string; title: string; desc: string; who: string;
  /** path di CIKOPS (/driver) atau URL lengkap (https://…) */
  href: string;
  /** menu terkait — link tampil bagi akun yang boleh membuka salah satu menu ini */
  tab?: string | string[];
}
interface LinkGroup { id: string; icon: string; title: string; desc: string; items: LinkItem[] }
type CustomLink = { id: string; title: string; url: string; note: string } & Record<string, unknown>;

const CUSTOM_KEY = "shared_links";
const EDITORS = ["master", "admin", "ga", "admin_ga_cik"];

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* izin clipboard ditolak → cara lama */ }
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } finally { ta.remove(); }
}

export function LinksTab({ myProfile = null }: { myProfile?: MyProfile | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const [origin, setOrigin] = useState("");
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<LinkItem | null>(null);
  const [custom, setCustom] = useState<CustomLink[]>([]);
  const [customErr, setCustomErr] = useState<string | null>(null);
  const canEdit = !myProfile || EDITORS.includes(myProfile.role);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    getAppSetting(CUSTOM_KEY)
      .then((raw) => { try { setCustom(raw ? (JSON.parse(raw) as CustomLink[]) : []); } catch { setCustom([]); } })
      .catch((e) => setCustomErr(e instanceof Error ? e.message : String(e)));
  }, []);
  async function saveCustom(next: CustomLink[]) {
    await setAppSetting(CUSTOM_KEY, JSON.stringify(next));
    setCustom(next);
  }

  const full = (href: string) => (/^https?:\/\//.test(href) ? href : `${origin}${href}`);
  const can = (tab?: string | string[]) => !tab || (Array.isArray(tab) ? tab : [tab]).some((t) => canAccessTab(myProfile, t));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups: LinkGroup[] = useMemo(() => {
    const roleLinks: LinkItem[] = (Object.keys(ROLE_INFO) as StaffRole[]).map((r) => {
      const info = ROLE_INFO[r];
      const first = info.tabs?.[0];
      return {
        id: `role-${r}`, icon: "👤", title: en ? info.en : info.id, desc: en ? info.descEn : info.descId,
        who: en ? "Login with the account from Accounts & Roles" : "Login dengan akun dari menu Akun & Role",
        href: info.home || !first ? "/dashboard" : `/dashboard/${first}`, tab: info.home || !first ? undefined : first,
      };
    }).filter((x) => myProfile === null || myProfile.role === "master" || myProfile.role === "admin" || x.id === `role-${myProfile.role}`);

    const menuLinks: LinkItem[] = NAV_GROUPS.flatMap((g) => g.tabs.filter((t) => t.id !== "links").map((t) => ({
      id: `menu-${t.id}`, icon: t.icon, title: en ? t.labelEn : t.labelId, desc: (en ? t.descEn : t.descId) ?? "",
      who: en ? "Staff (login)" : "Staf (login)", href: `/dashboard/${t.id}`, tab: t.id,
    })));

    return [
      {
        id: "apps", icon: "📱", title: en ? "Field apps (login)" : "Aplikasi lapangan (login)",
        desc: en ? "Open in Chrome, or install the APK. Bookmark / add to home screen." : "Buka di Chrome atau pasang APK-nya. Bisa ditambahkan ke layar utama.",
        items: [
          { id: "driver", icon: "🚗", title: en ? "Driver app" : "Aplikasi Driver", desc: en ? "Tasks, claims (Self-Claim), notifications" : "Tugas, klaim (Self-Claim), notifikasi", who: en ? "Drivers — email & password from GA admin" : "Driver — email & password dari admin GA", href: "/driver", tab: "tasks" },
          { id: "tga", icon: "🛠️", title: en ? "TGA app" : "Aplikasi TGA", desc: en ? "GA technicians log work & receive tasks" : "Teknisi GA mencatat kegiatan & menerima tugas", who: en ? "GA technicians — name + PIN" : "Teknisi GA — nama + PIN", href: "/tga", tab: "tga" },
        ],
      },
      {
        id: "public", icon: "🌐", title: en ? "Public pages (no login)" : "Halaman publik (tanpa login)",
        desc: en ? "Safe to share widely or print as a QR code." : "Aman dibagikan ke banyak orang atau dicetak sebagai QR.",
        items: [
          { id: "request", icon: "📨", title: en ? "Employee requests" : "Permintaan karyawan", desc: en ? "Car / driver, printer, GA technician, other requests" : "Minta mobil/driver, printer, teknisi GA, dan lainnya", who: en ? "All employees" : "Semua karyawan", href: "/request" },
          { id: "tugas-tga", icon: "🛠️", title: en ? "TGA assignment form" : "Form penugasan TGA", desc: en ? "GA staff assign technicians — needs the access code (TGA → Assignment form)" : "Staf GA menugaskan teknisi — perlu kode penugasan (menu TGA → Form penugasan)", who: en ? "All GA staff" : "Semua staf GA", href: "/tugas-tga", tab: "tga" },
          { id: "locker", icon: "🔐", title: "Locker", desc: en ? "Register / release a locker" : "Daftar & lepas locker", who: en ? "Employees" : "Karyawan", href: "/locker", tab: "locker" },
          { id: "gift", icon: "🎁", title: en ? "Gift registration" : "Pendaftaran pembagian", desc: en ? "Employees register themselves (self-register mode)" : "Karyawan mendaftar sendiri (mode Daftar Sendiri)", who: en ? "Employees" : "Karyawan", href: "/gift", tab: "gift" },
          { id: "gift-verify", icon: "🔑", title: en ? "Gift — staff verification" : "Pembagian — verifikasi petugas", desc: en ? "Check passcodes at the handover desk" : "Cek passcode di meja pembagian", who: en ? "Gift desk staff" : "Petugas pembagian", href: "/gift/verify", tab: "gift" },
          { id: "gift-lookup", icon: "🔍", title: en ? "Gift — lookup by NIK" : "Pembagian — cari NIK", desc: en ? "Imported-data mode" : "Mode Import Data", who: en ? "Gift desk staff" : "Petugas pembagian", href: "/gift/lookup", tab: "gift" },
          { id: "canteen", icon: "🍱", title: en ? "Canteen input" : "Input kantin", desc: en ? "Daily meal & snack counts" : "Jumlah makan & snack harian", who: en ? "Canteen staff" : "Staf kantin", href: "/canteen", tab: "canteen" },
          { id: "gate", icon: "🚧", title: en ? "Gate post" : "Pos gate", desc: en ? "Vehicle out / back at the security post" : "Kendaraan keluar / kembali di pos security", who: en ? "Security post" : "Pos security", href: "/gate", tab: ["gate", "security"] },
          { id: "viewonly", icon: "📺", title: en ? "Public Command Center" : "Command Center publik", desc: en ? "For TV screens — today's summary only" : "Untuk layar TV — ringkasan hari ini saja", who: en ? "TV / lobby screens" : "Layar TV / lobby", href: "/dashboard-viewonly" },
        ],
      },
      {
        id: "roles", icon: "👥", title: en ? "Login link per role" : "Link login per role",
        desc: en ? "Each account lands on its own module after signing in." : "Setiap akun langsung masuk ke modulnya sesudah login.",
        items: roleLinks,
      },
      {
        id: "menus", icon: "🧭", title: en ? "Direct menu links" : "Link langsung ke menu",
        desc: en ? "Opens the dashboard straight on that menu (login required)." : "Membuka dashboard langsung di menu itu (perlu login).",
        items: menuLinks,
      },
      {
        id: "external", icon: "🔗", title: en ? "Other systems" : "Sistem lain",
        desc: en ? "Separate apps connected to CIKOPS." : "Aplikasi terpisah yang tersambung ke CIKOPS.",
        items: [
          { id: "secdesk", icon: "🛡️", title: "Security Desk (G4S)", desc: en ? "Daily security input — source of the Security module" : "Input harian security — sumber data modul Security", who: en ? "Security team" : "Tim security", href: SECDESK_URL, tab: "security" },
        ],
      },
      {
        id: "downloads", icon: "⬇️", title: en ? "Excel modules (VBA)" : "Modul Excel (VBA)",
        desc: en ? "Import into the Excel file (Alt+F11 → File → Import)." : "Impor ke file Excel (Alt+F11 → File → Import).",
        items: [
          { id: "vba-ga", icon: "🧹", title: "modSyncGA_v2.bas", desc: en ? "Cleaning & Gardening Excel — pulls from CIKOPS" : "Excel Cleaning & Gardening — tarik data dari CIKOPS", who: "Admin ISS", href: "/downloads/modSyncGA_v2.bas", tab: "gafacility" },
          { id: "vba-atk", icon: "✏️", title: "modSyncCikops.bas", desc: en ? "Office supplies Excel — two-way sync" : "Excel ATK — sinkron dua arah", who: "Admin GA", href: "/downloads/modSyncCikops.bas", tab: "atk" },
        ],
      },
    ];
  }, [en, myProfile]);

  const needle = q.trim().toLowerCase();
  const visible = groups
    .map((g) => ({ ...g, items: g.items.filter((x) => can(x.tab) && (!needle || [x.title, x.desc, x.who, x.href].join(" ").toLowerCase().includes(needle))) }))
    .filter((g) => g.items.length > 0);
  const customVisible = custom.filter((c) => !needle || [c.title, c.url, c.note].join(" ").toLowerCase().includes(needle));

  async function copy(id: string, text: string) {
    await copyText(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
  }
  const shareText = (x: { title: string; desc: string; who?: string }, url: string) =>
    `*${x.title}*\n${x.desc}${x.who ? `\n${en ? "For" : "Untuk"}: ${x.who}` : ""}\n${url}`;
  const allText = () => [
    ...visible.map((g) => `== ${g.title} ==\n${g.items.map((x) => `• ${x.title}: ${full(x.href)}`).join("\n")}`),
    ...(custom.length ? [`== ${en ? "Other links" : "Link lainnya"} ==\n${custom.map((c) => `• ${c.title}: ${c.url}`).join("\n")}`] : []),
  ].join("\n\n");

  const Row = ({ x }: { x: LinkItem }) => {
    const url = full(x.href);
    return (
      <li className={l.row}>
        <span className={l.icon} aria-hidden="true">{x.icon}</span>
        <div className={l.info}>
          <b>{x.title}</b>
          <small>{x.desc}</small>
          <span className={l.who}>{x.who}</span>
        </div>
        <button type="button" className={l.url} onClick={() => copy(x.id, url)} title={en ? "Copy" : "Salin"}>{url.replace(/^https?:\/\//, "")}</button>
        <div className={l.actions}>
          <button type="button" className={`${l.btn} ${copied === x.id ? l.btnOk : l.btnMain}`} onClick={() => copy(x.id, url)}>{copied === x.id ? (en ? "✓ Copied" : "✓ Tersalin") : (en ? "Copy" : "Salin")}</button>
          <a className={l.btn} href={url} target="_blank" rel="noreferrer">{en ? "Open" : "Buka"}</a>
          <a className={l.btn} href={`https://wa.me/?text=${encodeURIComponent(shareText(x, url))}`} target="_blank" rel="noreferrer" title="WhatsApp">WA</a>
          <button type="button" className={l.btn} onClick={() => setQr(x)}>QR</button>
        </div>
      </li>
    );
  };

  return (
    <div className={l.root}>
      <ModuleHeader
        kicker={en ? "System · Links" : "Sistem · Tautan"}
        title={en ? "Links & sharing" : "Tautan & bagikan"}
        desc={en ? "Every CIKOPS link in one place — copy, send via WhatsApp, or print a QR code." : "Semua link CIKOPS di satu tempat — tinggal salin, kirim lewat WhatsApp, atau cetak QR-nya."}
        actions={<button type="button" className={`${l.btn} ${copied === "__all" ? l.btnOk : l.btnMain}`} onClick={() => copy("__all", allText())}>{copied === "__all" ? (en ? "✓ Copied" : "✓ Tersalin") : (en ? "Copy all links" : "Salin semua link")}</button>}
      />
      <input className={l.search} placeholder={en ? "Search links, e.g. driver, gate, canteen…" : "Cari link, mis. driver, gate, kantin…"} value={q} onChange={(e) => setQ(e.target.value)} aria-label={en ? "Search links" : "Cari link"} />

      {visible.map((g) => (
        <section key={g.id} className={l.group}>
          <header><h2><span aria-hidden="true">{g.icon}</span>{g.title}<em>{g.items.length}</em></h2><p>{g.desc}</p></header>
          <ul className={l.list}>{(g.items.length > 8 && !expanded[g.id] && !needle ? g.items.slice(0, 6) : g.items).map((x) => <Row key={x.id} x={x} />)}</ul>
          {g.items.length > 8 && !needle && (
            <button type="button" className={l.more} onClick={() => setExpanded((e) => ({ ...e, [g.id]: !e[g.id] }))}>
              {expanded[g.id] ? (en ? "Show less" : "Tampilkan lebih sedikit") : (en ? `Show all (${g.items.length})` : `Tampilkan semua (${g.items.length})`)}
            </button>
          )}
        </section>
      ))}

      <CrudList<CustomLink>
        icon="📎" title={en ? "Other links" : "Link lainnya"} itemName="link"
        desc={customErr ?? (en ? "Add links that live outside CIKOPS, e.g. the APK on Google Drive, SOP documents, or forms." : "Tambahkan link di luar CIKOPS, mis. APK di Google Drive, dokumen SOP, atau formulir.")}
        empty={en ? "No extra links yet." : "Belum ada link tambahan."}
        rows={customVisible} rowKey={(r) => r.id} canEdit={canEdit}
        columns={[
          { label: en ? "Name" : "Nama", render: (r) => <><b>{r.title}</b>{r.note ? <div className={l.note}>{r.note}</div> : null}</> },
          { label: "Link", render: (r) => (
            <span className={l.inline}>
              <button type="button" className={l.url} onClick={() => copy(r.id, r.url)}>{r.url.replace(/^https?:\/\//, "")}</button>
              <button type="button" className={`${l.btn} ${copied === r.id ? l.btnOk : l.btnMain}`} onClick={() => copy(r.id, r.url)}>{copied === r.id ? "✓" : (en ? "Copy" : "Salin")}</button>
              <button type="button" className={l.btn} onClick={() => setQr({ id: r.id, icon: "📎", title: r.title, desc: r.note, who: "", href: r.url })}>QR</button>
            </span>
          ) },
        ]}
        fields={[
          { key: "title", label: en ? "Name" : "Nama", required: true, placeholder: en ? "e.g. Driver APK" : "mis. APK Driver" },
          { key: "url", label: "URL", required: true, placeholder: "https://…", validate: (v) => (/^https?:\/\/\S+$/.test(v.trim()) ? null : (en ? "Must start with https://" : "Harus diawali https://")) },
          { key: "note", label: en ? "Note" : "Keterangan", placeholder: en ? "Who it's for / how to use" : "Untuk siapa / cara pakai" },
        ]}
        onCreate={async (v) => { await saveCustom([...custom, { id: crypto.randomUUID(), title: String(v.title ?? "").trim(), url: String(v.url ?? "").trim(), note: String(v.note ?? "").trim() }]); }}
        onUpdate={async (row, v) => { await saveCustom(custom.map((c) => (c.id === row.id ? { ...c, title: String(v.title ?? c.title).trim(), url: String(v.url ?? c.url).trim(), note: String(v.note ?? "").trim() } : c))); }}
        onDelete={async (row) => { await saveCustom(custom.filter((c) => c.id !== row.id)); }}
      />

      {qr && <QrModal item={qr} url={full(qr.href)} en={en} onClose={() => setQr(null)} />}
    </div>
  );
}

function QrModal({ item, url, en, onClose }: { item: LinkItem; url: string; en: boolean; onClose: () => void }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc(""));
  }, [url]);
  function print() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(item.title)}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}img{width:320px;height:320px}h1{margin:16px 0 6px;font-size:26px}p{margin:4px 0;color:#444}code{font-size:14px}</style></head>
      <body><img src="${src}" alt=""><h1>${esc(item.title)}</h1>${item.desc ? `<p>${esc(item.desc)}</p>` : ""}<p><code>${esc(url)}</code></p>
      <script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  }
  return (
    <ModalPortal onOverlayClick={onClose} maxWidth={400}>
      <div className={l.qr}>
        <h2>{item.title}</h2>
        {src ? <img src={src} alt={`QR ${item.title}`} /> : <div className={l.qrPh} />}
        <code>{url}</code>
        <div className={l.qrBtns}>
          {src && <a className={`${l.btn} ${l.btnMain}`} href={src} download={`QR-${item.title.replace(/[^\w-]+/g, "_")}.png`}>{en ? "Download PNG" : "Unduh PNG"}</a>}
          {src && <button type="button" className={l.btn} onClick={print}>{en ? "Print" : "Cetak"}</button>}
          <button type="button" className={l.btn} onClick={onClose}>{en ? "Close" : "Tutup"}</button>
        </div>
      </div>
    </ModalPortal>
  );
}
