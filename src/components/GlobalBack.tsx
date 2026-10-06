"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/components/Icon";

/**
 * Tombol "Kembali" + "Home" melayang di pojok kiri-bawah untuk semua halaman
 * mandiri (gate, request, canteen, locker, gift, dst).
 * Tidak tampil di halaman yang sudah punya navigasi sendiri:
 * dashboard (back bar per modul), tv-display (header), driver & root.
 */
const HIDDEN_ON = ["/dashboard", "/tv-display", "/driver"];

export default function GlobalBack() {
  const pathname = usePathname();
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(typeof window !== "undefined" && window.history.length > 1);
  }, [pathname]);

  if (!pathname || pathname === "/" || HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  // Halaman internal (petugas) kembali ke dashboard; halaman publik ke beranda.
  const homeHref = pathname.startsWith("/gate") ? "/dashboard" : "/";

  return (
    <div className="globalBack" role="navigation" aria-label="Navigasi kembali">
      {canGoBack && (
        <button type="button" onClick={() => router.back()} className="gbBtn" title="Kembali ke halaman sebelumnya">
          <Icon name="back" size={15} strokeWidth={2.3} />
          Kembali
        </button>
      )}
      <Link href={homeHref} className="gbBtn gbHome" title="Kembali ke Home">
        <Icon name="home" size={15} strokeWidth={2.3} />
        Home
      </Link>
    </div>
  );
}
