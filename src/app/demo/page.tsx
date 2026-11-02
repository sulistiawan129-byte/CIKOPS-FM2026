"use client";

/* /demo — pusat demo CIKOPS (deployment mockup): semua aplikasi & role dalam satu halaman,
   tanpa login. Di deployment biasa halaman ini hanya mengarahkan ke dashboard. */
import { useEffect } from "react";
import { BRAND, DEMO_ACCOUNTS, MOCK_MODE, plantFull } from "@/lib/brand";
import { mockSignInAs } from "@/lib/mock/client";
import { resetDb } from "@/lib/mock/core";
import Icon from "@/components/Icon";
import { L } from "@/lib/i18n";
import s from "./demo.module.css";

const apps = () => [
  { href: "/dashboard-viewonly", icon: "📺", title: "FM Command Center", desc: L("Layar TV: ringkasan semua modul, fleet live, TGA, kantin, ATK, pelanggaran.", "TV screen: summary of every module, live fleet, TGA, canteen, ATK, violations."), tag: L("Publik", "Public") },
  { href: "/driver", icon: "🚗", title: L("Aplikasi Driver", "Driver App"), desc: L("Terima tugas, mulai & selesai perjalanan, ajukan klaim sendiri.", "Accept tasks, start & finish trips, submit your own claims."), tag: L("HP", "Mobile") },
  { href: "/tga", icon: "🛠️", title: L("Aplikasi TGA (teknisi)", "TGA App (technician)"), desc: L("Pilih nama teknisi, PIN 1234. Terima tugas, catat pekerjaan, status Busy/Available.", "Pick a technician name, PIN 1234. Accept tasks, log work, Busy/Available status."), tag: L("HP", "Mobile") },
  { href: "/tugas-tga", icon: "📋", title: L("Form penugasan TGA", "TGA assignment form"), desc: L("Staf GA menugaskan teknisi tanpa login. Kode: DEMO2026.", "GA staff assign technicians without logging in. Code: DEMO2026."), tag: L("Publik", "Public") },
  { href: "/request", icon: "📨", title: L("Form permintaan karyawan", "Employee request form"), desc: L("Minta mobil/driver, toner printer, bantuan teknisi.", "Request a car/driver, printer toner, technician help."), tag: L("Publik", "Public") },
  { href: "/gate", icon: "🚧", title: L("Pos gate security", "Security gate post"), desc: L("Catat kendaraan keluar–masuk plant.", "Log vehicles entering and leaving the plant."), tag: L("Pos", "Post") },
  { href: "/canteen", icon: "🍱", title: L("Input kantin", "Canteen input"), desc: L("Laporan porsi snack & makan per shift.", "Snack & meal portion report per shift."), tag: L("Pos", "Post") },
  { href: "/locker", icon: "🔐", title: "Locker", desc: L("Daftar & lepas locker.", "Register & release a locker."), tag: L("Publik", "Public") },
];

export default function DemoHub() {
  useEffect(() => { if (!MOCK_MODE) window.location.replace("/dashboard"); }, []);
  if (!MOCK_MODE) return null;
  const open = (email: string) => { mockSignInAs(email); window.location.href = "/dashboard"; };
  return (
    <div className={s.page}>
      <header className={s.hero}>
        <div className={s.brand}><img src="/logo.png" alt="" /><span>CIKOPS-FM</span><em>DEMO</em></div>
        <h1>Integrated Facility Management<br /><span>{L("dalam satu sistem", "in one system")}</span></h1>
        <p>{L("Mockup lengkap CIKOPS untuk", "A complete CIKOPS mockup for")} <b>{BRAND.company}</b> ({plantFull("CIK")} & {plantFull("PRB")}). {L("Semua data fiktif, tanpa login — pilih peran atau aplikasi di bawah. Perubahan hanya tersimpan di browser Anda.", "All data is fictional and no login is needed — pick a role or an app below. Changes are stored only in your browser.")}</p>
      </header>

      <section className={s.sec}>
        <h2>{L("Dashboard — masuk sebagai", "Dashboard — sign in as")}</h2>
        <div className={s.roles}>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" className={s.role} onClick={() => open(a.email)}>
              <span className={s.ic}><Icon name={a.icon} size={20} /></span>
              <span><b>{a.label}</b><small>{a.desc}</small></span>
              <i>→</i>
            </button>
          ))}
        </div>
      </section>

      <section className={s.sec}>
        <h2>{L("Aplikasi & halaman lain", "Apps & other pages")}</h2>
        <div className={s.apps}>
          {apps().map((a) => (
            <a key={a.href} href={a.href} className={s.app}>
              <span className={s.emoji}>{a.icon}</span>
              <span className={s.appBody}><b>{a.title}</b><small>{a.desc}</small></span>
              <em className={s.tag}>{a.tag}</em>
            </a>
          ))}
        </div>
      </section>

      <footer className={s.foot}>
        <button type="button" onClick={() => { if (confirm(L("Kembalikan semua data demo ke kondisi awal?", "Restore all demo data to its initial state?"))) { resetDb(); window.location.reload(); } }}>{L("↺ Reset data demo", "↺ Reset demo data")}</button>
        <span>{L("Data dibuat ulang otomatis setiap hari · tanggal selalu mengikuti hari ini", "Data is regenerated automatically every day · dates always follow today")}</span>
      </footer>
    </div>
  );
}
