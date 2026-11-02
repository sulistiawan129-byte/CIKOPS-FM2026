"use client";
import React from "react";

import { L } from "@/lib/i18n";
interface Props {
  children: React.ReactNode;
  label?: string;
}
interface State {
  hasError: boolean;
  message: string;
}

/** Menangkap error render di dalam 1 tab/komponen, supaya tidak
 *  merambat jadi "Application error" yang membuat SELURUH dashboard
 *  blank. Kalau ada bug di satu tab, cuma tab itu yang tampil pesan
 *  error — tab lain & sidebar tetap berfungsi normal. */
export class TabErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`[TabErrorBoundary${this.props.label ? ` — ${this.props.label}` : ""}]`, error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--t1)", marginBottom: 8 }}>
            Terjadi kesalahan di tab {this.props.label ?? "ini"}
          </div>
          <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 20, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            {this.state.message || L("Terjadi error tak terduga. Coba muat ulang halaman, atau hubungi tim IT kalau masalah berlanjut.", "An unexpected error occurred. Try reloading the page, or contact the IT team if the problem continues.")}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: "" })}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            {L("Coba Lagi", "Try Again")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
