// Salin modul VBA (sumber: vba/) ke public/downloads supaya bisa diunduh dari CIKOPS.
// Dijalankan otomatis sebelum `npm run dev` dan `npm run build`.
import { copyFileSync, mkdirSync } from "node:fs";

const files = {
  "vba/ga/modGA.bas": "modGA.bas",
  "vba/ga/modSyncGA.bas": "modSyncGA.bas",
  "vba/ga/modSyncGA_v2.bas": "modSyncGA_v2.bas",
  "vba/modSyncCikops.bas": "modSyncCikops.bas",
};
mkdirSync("public/downloads", { recursive: true });
for (const [src, name] of Object.entries(files)) copyFileSync(src, `public/downloads/${name}`);
