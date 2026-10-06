import { redirect } from "next/navigation";

// Alamat lama (/tv-display) dialihkan ke Dashboard-ViewOnly supaya link yang
// sudah terlanjur dibagikan tetap jalan.
export default function LegacyTvDisplay() {
  redirect("/dashboard-viewonly");
}
