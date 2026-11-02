"use client";

/* /bukti?t=TOKEN — halaman publik Bukti Permintaan (tanpa login).
   Tautan dikirim ke requestor lewat email / WhatsApp; bisa dicetak atau disimpan sebagai PDF. */

import { useEffect, useState } from "react";
import { getReceipt } from "@/lib/receptionist/api";
import type { ReceiptData } from "@/lib/receptionist/model";
import { ProofCard } from "../dashboard/receptionist/ProofCard";

import { L } from "@/lib/i18n";
export default function BuktiPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<ReceiptData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(t);
    if (t.length < 16) { setState("missing"); return; }
    getReceipt(t).then((d) => { setData(d); setState(d ? "ok" : "missing"); }).catch(() => setState("error"));
  }, []);

  return (
    <main className="buktiPage">
      <style>{`
        .buktiPage { min-height: 100vh; padding: 28px 16px 48px; display: flex; flex-direction: column; align-items: center; gap: 18px;
          background: radial-gradient(60rem 30rem at 10% -10%, rgba(45,91,255,.18), transparent 60%), radial-gradient(50rem 30rem at 110% 110%, rgba(124,58,237,.14), transparent 60%), #eef2f9; }
        .buktiBar { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .buktiBar button { min-height: 42px; padding: 0 18px; border-radius: 12px; border: 0; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
        .buktiPrimary { background: linear-gradient(135deg, #2d5bff, #5b86ff); color: #fff; box-shadow: 0 10px 24px -12px rgba(45,91,255,.8); }
        .buktiGhost { background: #fff; color: #0b1b3a; box-shadow: 0 0 0 1px #d6deee; }
        .buktiMsg { max-width: 440px; padding: 28px 24px; border-radius: 20px; background: #fff; color: #0b1b3a; text-align: center; box-shadow: 0 20px 50px -24px rgba(11,27,58,.4); }
        .buktiMsg h1 { margin: 0 0 8px; font-size: 20px; } .buktiMsg p { margin: 0; color: #5b6b8c; line-height: 1.55; }
        .buktiNote { font-size: 12px; color: #5b6b8c; text-align: center; max-width: 420px; }
        @media print { .buktiPage { background: #fff !important; padding: 0; } .buktiBar, .buktiNote { display: none !important; } }
      `}</style>
      {state === "loading" && <div className="buktiMsg"><p>{L("Memuat bukti…", "Loading receipt…")}</p></div>}
      {state === "missing" && <div className="buktiMsg"><h1>{L("Bukti tidak ditemukan", "Receipt not found")}</h1><p>{L("Tautan tidak valid atau sudah dihapus. Hubungi resepsionis untuk mendapatkan bukti yang baru.", "The link is invalid or has been removed. Contact the receptionist for a new receipt.")}</p></div>}
      {state === "error" && <div className="buktiMsg"><h1>{L("Gagal memuat", "Failed to load")}</h1><p>{L("Periksa koneksi lalu muat ulang halaman ini.", "Check your connection and reload this page.")}</p></div>}
      {state === "ok" && data && (
        <>
          <div style={{ width: "100%", ["--hole" as string]: "#eef2f9" }}><ProofCard data={data} token={token} /></div>
          <div className="buktiBar">
            <button type="button" className="buktiPrimary" onClick={() => window.print()}>{L("🖨 Cetak / simpan PDF", "🖨 Print / save as PDF")}</button>
            <button type="button" className="buktiGhost" onClick={() => navigator.clipboard?.writeText(window.location.href)}>{L("🔗 Salin tautan", "🔗 Copy link")}</button>
          </div>
          <p className="buktiNote">{L("Simpan tautan ini. Data sensitif (password wifi) otomatis disembunyikan setelah masa akses berakhir.", "Keep this link. Sensitive data (wifi password) is hidden automatically once the access period ends.")}</p>
        </>
      )}
    </main>
  );
}
