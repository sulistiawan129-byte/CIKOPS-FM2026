/** Escape teks sebelum disisipkan ke HTML yang ditulis lewat document.write / innerHTML.
 *  WAJIB untuk setiap nilai yang berasal dari pengguna atau database (nama, departemen, catatan, dll.) —
 *  banyak formulir publik menerima teks bebas tanpa login (lihat docs/AUDIT_KEAMANAN_ISO27001.md, T-01). */
export function escapeHtml(v: unknown): string {
  return String(v ?? "").replace(/[&<>"'`]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" })[c] as string);
}
