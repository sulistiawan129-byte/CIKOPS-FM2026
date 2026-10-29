/* Identitas perusahaan & plant — bisa diganti per deployment lewat environment variable
   (mis. deployment DEMO memakai perusahaan fiktif). Kode plant di database tetap CIK / PRB.
   Catatan: NEXT_PUBLIC_* harus ditulis lengkap (bukan process.env[k]) supaya ikut terbawa ke browser. */
import type { Plant } from "./types";

const pick = (v: string | undefined, d: string) => (v && v.trim() ? v.trim() : d);
/** Deployment MOCKUP (backend tiruan) otomatis memakai identitas perusahaan fiktif. */
const MOCK = process.env.NEXT_PUBLIC_MOCK_BACKEND === "1";

const company = pick(process.env.NEXT_PUBLIC_COMPANY_NAME, MOCK ? "PT Nusantara Prima Industri" : "PT Frisian Flag Indonesia");
const plantCik = pick(process.env.NEXT_PUBLIC_PLANT_CIK_NAME, MOCK ? "Cikupa" : "Cikarang");
const plantPrb = pick(process.env.NEXT_PUBLIC_PLANT_PRB_NAME, MOCK ? "Parung" : "Pasar Rebo");

export const BRAND = {
  /** "PT Frisian Flag Indonesia" */
  company,
  /** "PT. Frisian Flag Indonesia - Plant Cikarang" — kop dokumen / bukti cetak */
  companyWithSite: `${company.replace(/^PT\.?\s+/i, "PT. ")} - Plant ${plantCik}`,
  plantName: { CIK: plantCik, PRB: plantPrb } as Record<Plant, string>,
  /** Nama admin di bukti permintaan / tanda terima */
  adminName: pick(process.env.NEXT_PUBLIC_ADMIN_NAME, MOCK ? "Rina Kusuma" : "Sulistiawan"),
  adminDept: pick(process.env.NEXT_PUBLIC_ADMIN_DEPT, "Facility Management"),
  /** Titik tengah peta pom bensin [lat, lng] */
  mapCenter: (() => {
    const v = (process.env.NEXT_PUBLIC_MAP_CENTER ?? "").split(",").map(Number);
    return (v.length === 2 && v.every((x) => Number.isFinite(x)) ? v : MOCK ? [-6.2357, 106.5106] : [-6.2607, 107.1525]) as [number, number];
  })(),
};

/** "Plant Cikarang" / "Plant Pasar Rebo" */
export const plantFull = (p: Plant | string | null | undefined) => `Plant ${BRAND.plantName[(p === "PRB" ? "PRB" : "CIK") as Plant]}`;
/** "Cikarang" / "Pasar Rebo" */
export const plantShort = (p: Plant | string | null | undefined) => BRAND.plantName[(p === "PRB" ? "PRB" : "CIK") as Plant];

/** Deployment DEMO: data fiktif, tombol masuk cepat per role, pita "DEMO". */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "1" || MOCK;
/** Backend tiruan di browser — tanpa Supabase, tanpa login. */
export const MOCK_MODE = MOCK;
/** Password semua akun demo (lihat supabase/05_data_demo.sql). */
export const DEMO_PASSWORD = pick(process.env.NEXT_PUBLIC_DEMO_PASSWORD, "Demo2026!");

/** Akun demo (dibuat oleh supabase/05_data_demo.sql). Password semuanya DEMO_PASSWORD. */
export const DEMO_ACCOUNTS: { email: string; role: string; label: string; desc: string; icon: string }[] = [
  { email: "master@demo.cikops.id", role: "master", label: "Master Admin", desc: "Semua modul & akun", icon: "home" },
  { email: "ga.cik@demo.cikops.id", role: "admin_ga_cik", label: `Admin GA ${plantCik}`, desc: "Fleet, finance, fasilitas", icon: "fleet" },
  { email: "ga.prb@demo.cikops.id", role: "admin_ga_prb", label: `Admin GA ${plantPrb}`, desc: `Fleet ${plantPrb} saja`, icon: "vehicles" },
  { email: "iss@demo.cikops.id", role: "admin_iss", label: "Admin / SPV ISS", desc: "Cleaning, Gardening & TGA", icon: "gafacility" },
  { email: "security@demo.cikops.id", role: "admin_security", label: "Admin Security", desc: "Laporan security", icon: "security" },
  { email: "resepsionis@demo.cikops.id", role: "receptionist", label: "Receptionist", desc: "Wifi tamu, barang, ruangan", icon: "receptionist" },
  { email: "manajemen@demo.cikops.id", role: "management", label: "Management", desc: "Command Center & laporan", icon: "reports" },
];
export const DEMO_DRIVER_EMAIL = "driver.andi@demo.cikops.id";
export const DEMO_TGA_PIN = "1234";
