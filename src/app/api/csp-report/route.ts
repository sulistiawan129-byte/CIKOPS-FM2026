// Penerima laporan pelanggaran Content-Security-Policy (lihat next.config.js).
// Hanya MENCATAT ke log server (Vercel → Logs) — tidak menyimpan apa pun dan tidak butuh login (browser mengirimnya otomatis).
// Dibatasi: ukuran isi ≤ 8 KB, hanya beberapa kolom dicatat, tiap kolom dipotong — supaya tidak bisa dipakai membanjiri log.
export const dynamic = "force-dynamic";

const KEYS = ["document-uri", "documentURL", "violated-directive", "effectiveDirective", "blocked-uri", "blockedURL", "source-file", "sourceFile", "line-number", "lineNumber", "disposition"];

export async function POST(req: Request) {
  try {
    const len = Number(req.headers.get("content-length") || "0");
    if (len > 8192) return new Response(null, { status: 413 });
    const text = (await req.text()).slice(0, 8192);
    const j = JSON.parse(text) as unknown;
    const items = Array.isArray(j) ? j.map((x) => (x as { body?: unknown })?.body ?? x) : [(j as { "csp-report"?: unknown })?.["csp-report"] ?? j];
    for (const it of items.slice(0, 3)) {
      const o = (it ?? {}) as Record<string, unknown>;
      const slim: Record<string, string> = {};
      for (const k of KEYS) if (o[k] !== undefined) slim[k] = String(o[k]).slice(0, 200);
      // eslint-disable-next-line no-console
      console.warn("[csp-violation]", JSON.stringify(slim));
    }
  } catch { /* isi tidak valid — abaikan */ }
  return new Response(null, { status: 204 });
}
