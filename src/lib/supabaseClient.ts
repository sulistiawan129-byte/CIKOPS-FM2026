import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMockClient } from "./mock/client";

/** Deployment MOCKUP: seluruh aplikasi berjalan dengan backend tiruan di browser (tanpa Supabase & tanpa login). */
export const MOCK_BACKEND = process.env.NEXT_PUBLIC_MOCK_BACKEND === "1";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!MOCK_BACKEND && (!supabaseUrl || !supabaseAnonKey)) {
  // Tidak melempar error keras saat build, tapi beri sinyal jelas di console.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum diset. " +
      "Cek file .env.local atau Environment Variables di Vercel."
  );
}

// iOS Safari Private Browsing memblokir localStorage, yang menyebabkan
// Supabase client error saat inisialisasi dan semua request gagal.
// Gunakan memory storage sebagai fallback supaya /canteen tetap bisa
// diakses dari iPhone bahkan dalam mode Private.
function safeStorage(): Storage | undefined {
  try {
    const key = "__supabase_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return localStorage;
  } catch {
    return undefined; // iOS Safari Private Mode — fall back to in-memory
  }
}

export const supabase: SupabaseClient = MOCK_BACKEND ? (createMockClient() as SupabaseClient) : createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage(),
    persistSession: safeStorage() !== undefined,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
