/* Menu kantin mingguan untuk layar TV (/menu-tv).
   Struktur data sudah final; isinya masih CONTOH sampai ada input menu di Dashboard → Kantin.
   Tiap butir menu: nama, kalori (kkal) dan berat (gram). */

export interface MenuItem { name: string; kcal: number; gram: number }

export interface DayMenu {
  /** Snack / sarapan: 1 jenis per hari */
  snack: MenuItem;
  /** Lauk utama: selalu 3 pilihan */
  main: { daging: MenuItem; ayam: MenuItem; telur: MenuItem };
  /** Special lauk (mis. soto) — hanya muncul di hari tertentu */
  special?: MenuItem;
  /** Menu pendamping: tempe, tahu, perkedel, dll. */
  sides: MenuItem[];
}

export interface WeeklyMenu {
  /** Senin minggu ini, YYYY-MM-DD */
  weekStart: string;
  /** 7 hari, Senin → Minggu */
  days: DayMenu[];
  /** Pasti ada setiap hari: nasi, sambal, kerupuk, buah */
  staples: MenuItem[];
}

const it = (name: string, kcal: number, gram: number): MenuItem => ({ name, kcal, gram });

export const SAMPLE_DAYS: DayMenu[] = [
  { snack: it("Bubur Kacang Hijau", 180, 150),
    main: { daging: it("Rendang Sapi", 285, 70), ayam: it("Ayam Goreng Kremes", 310, 90), telur: it("Telur Balado", 140, 60) },
    sides: [it("Tempe Orek", 120, 40), it("Tahu Goreng", 95, 50)] },
  { snack: it("Pisang Goreng", 210, 100),
    main: { daging: it("Semur Daging", 260, 75), ayam: it("Ayam Bakar Madu", 260, 90), telur: it("Telur Dadar Padang", 160, 60) },
    sides: [it("Perkedel Kentang", 130, 45), it("Tempe Mendoan", 140, 45)] },
  { snack: it("Roti Isi Cokelat", 240, 90),
    main: { daging: it("Empal Gepuk", 270, 70), ayam: it("Ayam Lada Hitam", 280, 90), telur: it("Telur Bumbu Bali", 150, 60) },
    sides: [it("Tahu Bacem", 100, 50), it("Tempe Goreng Tepung", 150, 40)] },
  { snack: it("Lemper Ayam", 190, 80),
    main: { daging: it("Sapi Lada Hitam", 275, 70), ayam: it("Ayam Woku", 270, 90), telur: it("Semur Telur", 145, 60) },
    special: it("Soto Ayam Lamongan", 320, 250),
    sides: [it("Perkedel Jagung", 135, 45), it("Tahu Isi", 110, 50)] },
  { snack: it("Kue Lapis", 170, 75),
    main: { daging: it("Bistik Jawa", 255, 75), ayam: it("Ayam Goreng Lengkuas", 300, 90), telur: it("Telur Ceplok Kecap", 150, 60) },
    sides: [it("Tempe Kemangi", 115, 40), it("Tahu Crispy", 120, 50)] },
  { snack: it("Onde-onde", 200, 70),
    main: { daging: it("Daging Balado", 280, 70), ayam: it("Ayam Asam Manis", 285, 90), telur: it("Telur Dadar Sayur", 155, 60) },
    sides: [it("Perkedel Tahu", 125, 45), it("Tempe Bacem", 125, 40)] },
  { snack: it("Kolak Pisang", 220, 180),
    main: { daging: it("Tongseng Sapi", 290, 80), ayam: it("Ayam Panggang Bumbu Rujak", 275, 90), telur: it("Telur Rica-rica", 160, 60) },
    sides: [it("Tahu Goreng", 95, 50), it("Tempe Orek Kering", 130, 40)] },
];

export const SAMPLE_STAPLES: MenuItem[] = [
  it("Nasi Putih", 260, 200), it("Sambal", 30, 20), it("Kerupuk", 45, 10), it("Buah Potong", 50, 80),
];

/** Senin dari minggu yang memuat `isoDate` (YYYY-MM-DD). */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Senin = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export const addDaysIso = (isoDate: string, n: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Contoh menu untuk minggu yang memuat `isoDate`. */
export function sampleWeek(isoDate: string): WeeklyMenu {
  return { weekStart: mondayOf(isoDate), days: SAMPLE_DAYS, staples: SAMPLE_STAPLES };
}
