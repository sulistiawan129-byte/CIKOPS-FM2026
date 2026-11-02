"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getLockerByConfirmToken, confirmLockerAnswer } from "@/lib/lockerApi";

import { L } from "@/lib/i18n";
/* ════════════════════════════════════════════════════════════
   /locker/confirm — landing page for the "still using this locker?"
   email link. Two-step by design (interstitial summary, then a
   button the human actually has to click) so an email security
   scanner auto-fetching the link can't silently trigger the action —
   mirrors the original handleConfirmPage_() two-step flow exactly.
════════════════════════════════════════════════════════════ */

type ViewState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "interstitial"; lockerNumber: string; nama: string; answer: "yes" | "no" }
  | { kind: "done"; title: string; message: string };

export default function LockerConfirmPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, var(--navy), var(--brand))" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: "4px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} />
        </div>
      }
    >
      <LockerConfirmInner />
    </Suspense>
  );
}

function LockerConfirmInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const answerParam = params.get("answer");
  const finalFlag = params.get("final");

  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token || (answerParam !== "yes" && answerParam !== "no")) {
        setState({ kind: "invalid", message: L("Link konfirmasi ini tidak valid atau tidak lengkap.", "This confirmation link is invalid or incomplete.") });
        return;
      }

      if (finalFlag !== "1") {
        // Step 1: read-only summary — nothing is executed yet.
        try {
          const data = await getLockerByConfirmToken(token);
          if (cancelled) return;
          if (!data) {
            setState({ kind: "invalid", message: L("Link ini sudah pernah digunakan sebelumnya, atau sudah kedaluwarsa.", "This link has already been used, or has expired.") });
            return;
          }
          setState({ kind: "interstitial", lockerNumber: data.lockerNumber, nama: data.nama, answer: answerParam });
        } catch (e) {
          if (!cancelled) {
            setState({ kind: "invalid", message: e instanceof Error ? e.message : L("Terjadi kesalahan.", "Something went wrong.") });
          }
        }
        return;
      }

      // Step 2: the actual human-clicked final action.
      try {
        const res = await confirmLockerAnswer(token, answerParam);
        if (cancelled) return;
        if (res.kept) {
          setState({
            kind: "done",
            title: L("Terima Kasih!", "Thank You!"),
            message: L(`Konfirmasi Anda diterima. Locker nomor ${res.lockerNumber} tetap terdaftar atas nama Anda.`, `Your confirmation was received. Locker number ${res.lockerNumber} stays registered in your name.`),
          });
        } else {
          setState({
            kind: "done",
            title: L("Locker Dinonaktifkan", "Locker Released"),
            message: L(`Terima kasih atas konfirmasinya. Locker nomor ${res.lockerNumber} telah dinonaktifkan dan siap digunakan peserta lain.`, `Thank you for confirming. Locker number ${res.lockerNumber} has been released and is ready for someone else.`),
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({ kind: "invalid", message: e instanceof Error ? e.message : L("Link ini sudah pernah digunakan sebelumnya.", "This link has already been used.") });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, answerParam, finalFlag]);

  async function handleFinalize() {
    if (state.kind !== "interstitial") return;
    setSubmitting(true);
    const url = new URL(window.location.href);
    url.searchParams.set("final", "1");
    window.location.href = url.toString();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background: "linear-gradient(160deg, var(--navy), var(--brand))",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "var(--surface)",
          borderRadius: 20,
          padding: "36px 28px",
          textAlign: "center",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <img src="/logo.png" alt="Logo" style={{ width: 64, margin: "0 auto 16px", display: "block" }} />

        {state.kind === "loading" && (
          <>
            <div style={{ width: 36, height: 36, borderRadius: "50%", border: "4px solid var(--border)", borderTopColor: "var(--brand)", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
            <p style={{ color: "var(--t3)", fontSize: 14 }}>{L("Memuat...", "Loading...")}</p>
          </>
        )}

        {state.kind === "invalid" && (
          <>
            <h2 style={{ color: "var(--t1)", fontSize: 19, margin: "0 0 12px" }}>{L("Link Tidak Valid", "Invalid Link")}</h2>
            <p style={{ color: "var(--t2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{state.message}</p>
          </>
        )}

        {state.kind === "interstitial" && (
          <>
            <h2 style={{ color: "var(--t1)", fontSize: 19, margin: "0 0 12px" }}>
              {L("Konfirmasi Locker", "Locker Confirmation")} {state.lockerNumber}
            </h2>
            <p style={{ color: "var(--t2)", fontSize: 14, lineHeight: 1.6, margin: "0 0 22px" }}>
              {L("Halo", "Hello")} {state.nama || ""}, {L("Anda memilih bahwa Anda", "you chose that you")}{" "}
              <b>{state.answer === "yes" ? L("MASIH menggunakan", "STILL use") : L("SUDAH TIDAK menggunakan", "NO LONGER use")}</b>{" "}
              {L("locker nomor", "locker number")} {state.lockerNumber}. {L("Klik tombol di bawah untuk menyelesaikan konfirmasi ini.", "Click the button below to finish this confirmation.")}
            </p>
            <button
              onClick={handleFinalize}
              disabled={submitting}
              style={{
                display: "inline-block",
                padding: "14px 30px",
                background: "var(--navy)",
                color: "#fff",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: 15,
                cursor: submitting ? "default" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? L("Memproses...", "Processing...") : L("Selesaikan Konfirmasi", "Finish Confirmation")}
            </button>
          </>
        )}

        {state.kind === "done" && (
          <>
            <h2 style={{ color: "var(--t1)", fontSize: 19, margin: "0 0 12px" }}>{state.title}</h2>
            <p style={{ color: "var(--t2)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}
