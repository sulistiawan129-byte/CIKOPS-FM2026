import { redirect } from "next/navigation";

export default function Home() {
  // Mockup: halaman awal = pusat demo (semua aplikasi & role)
  redirect(process.env.NEXT_PUBLIC_MOCK_BACKEND === "1" ? "/demo" : "/driver");
}
