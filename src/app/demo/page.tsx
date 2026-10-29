"use client";

/* /demo — pusat demo CIKOPS (deployment mockup): semua aplikasi & role dalam satu halaman,
   tanpa login. Di deployment biasa halaman ini hanya mengarahkan ke dashboard. */
import { useEffect } from "react";
import { BRAND, DEMO_ACCOUNTS, MOCK_MODE, plantFull } from "@/lib/brand";
import { mockSignInAs } from "@/lib/mock/client";
import { resetDb } from "@/lib/mock/core";
import Icon from "@/components/Icon";
import s from "./demo.module.css";

const APPS = [
  { href: "/dashboard-viewonly", icon: "📺", title: "FM Command Center", desc: "Layar TV: ringkasan semua modul, fleet live, TGA, kantin, ATK, pelanggaran.", tag: "Publik" },
  { href: "/driver", icon: "🚗", title: "Aplikasi Driver", desc: "Terima tugas, mulai & selesai perjalanan, ajukan klaim sendiri.", tag: "HP" },
  { href: "/tga", icon: "🛠️", title: "Aplikasi TGA (teknisi)", desc: "Pilih nama teknisi, PIN 1234. Terima tugas, catat pekerjaan, status Busy/Available.", tag: "HP" },
  { href: "/tugas-tga", icon: "📋", title: "Form penugasan TGA", desc: "Staf GA menugaskan teknisi tanpa login. Kode: DEMO2026.", tag: "Publik" },
  { href: "/request", icon: "📨", title: "Form permintaan karyawan", desc: "Minta mobil/driver, toner printer, bantuan teknisi.", tag: "Publik" },
  { href: "/gate", icon: "🚧", title: "Pos gate security", desc: "Catat kendaraan keluar–masuk plant.", tag: "Pos" },
  { href: "/canteen", icon: "🍱", title: "Input kantin", desc: "Laporan porsi snack & makan per shift.", tag: "Pos" },
  { href: "/locker", icon: "🔐", title: "Locker karyawan", desc: "Daftar & lepas locker.", tag: "Publik" },
];

export default function DemoHub() {
  useEffect(() => { if (!MOCK_MODE) window.location.replace("/dashboard"); }, []);
  if (!MOCK_MODE) return null;
  const open = (email: string) => { mockSignInAs(email); window.location.href = "/dashboard"; };
  return (
    <div className={s.page}>
      <header className={s.hero}>
        <div className={s.brand}><img src="/logo.png" alt="" /><span>CIKOPS-FM</span><em>DEMO</em></div>
        <h1>Integrated Facility Management<br /><span>dalam satu sistem</span></h1>
        <p>Mockup lengkap CIKOPS untuk <b>{BRAND.company}</b> ({plantFull("CIK")} & {plantFull("PRB")}). Semua data fiktif, tanpa login —
          pilih peran atau aplikasi di bawah. Perubahan hanya tersimpan di browser Anda.</p>
      </header>

      <section className={s.sec}>
        <h2>Dashboard — masuk sebagai</h2>
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
        <h2>Aplikasi & halaman lain</h2>
        <div className={s.apps}>
          {APPS.map((a) => (
            <a key={a.href} href={a.href} className={s.app}>
              <span className={s.emoji}>{a.icon}</span>
              <span className={s.appBody}><b>{a.title}</b><small>{a.desc}</small></span>
              <em className={s.tag}>{a.tag}</em>
            </a>
          ))}
        </div>
      </section>

      <footer className={s.foot}>
        <button type="button" onClick={() => { if (confirm("Kembalikan semua data demo ke kondisi awal?")) { resetDb(); window.location.reload(); } }}>↺ Reset data demo</button>
        <span>Data dibuat ulang otomatis setiap hari · tanggal selalu mengikuti hari ini</span>
      </footer>
    </div>
  );
}
