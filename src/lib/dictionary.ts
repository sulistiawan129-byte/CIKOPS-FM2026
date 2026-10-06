export type Lang = "id" | "en";

/* Flat string dictionary — same pattern FleetOS used (DICT.id / DICT.en),
 * adapted to TypeScript. Add new keys here as pages are ported; keep id/en
 * objects with identical key sets (the `Dict` type below enforces it). */
export interface Dict {
  // App identity
  appName: string;
  appTagline: string;

  // Splash
  splashTagline: string;

  // Landing
  pilihDriver: string;
  memuatDriver: string;
  online: string;
  masuk: string;
  gantiTema: string;

  // PIN entry screen
  kembali: string;
  masukkanPin: string;
  pinSalah: string;

  // App header / nav
  driverPanel: string;
  keluar: string;
  hariIni: string;
  riwayat: string;
  klaim: string;
  profil: string;
  statBaru: string;
  statProses: string;
  statSelesai: string;

  // Today tab
  memuatTugasHariIni: string;
  belumAdaTugasHariIni: string;
  tugasBaruOtomatis: string;
  liveUpdateOtomatis: string;

  // History tab
  dariTanggal: string;
  sampaiTanggal: string;
  statusLabel: string;
  terapkan: string;
  reset: string;
  memuatRiwayat: string;
  tidakAdaRiwayat: string;
  cobaUbahRentang: string;
  pilihRentangTanggal: string;
  tekanTerapkan: string;

  // Profile tab
  informasi: string;
  noHp: string;
  keamanan: string;
  pinAkses: string;
  ubahPin: string;
  keluarDariAkun: string;

  // Supabase Auth login
  masukDenganAkun: string;
  loginWelcome: string;
  sedangMasuk: string;
  loginGagal: string;
  akunBukanDriver: string;
  loginHintAdmin: string;
  lihatPassword: string;
  sembunyikanPassword: string;
  ubahPassword: string;
  passwordBaru: string;
  konfirmasiPasswordBaru: string;
  passwordMin6: string;
  passwordTidakSama: string;
  passwordDiubah: string;
  gagalMengubahPassword: string;
  menyimpan: string;
  simpanPassword: string;

  // PIN change modal
  masukkanPinLama: string;
  buatPinBaru: string;
  konfirmasiPinBaru: string;
  verifikasiIdentitas: string;
  empatDigitMudahDiingat: string;
  ketikUlangPin: string;
  batal: string;
  pinBaruTidakCocok: string;
  pinLamaSalah: string;
  pinBerhasilDiubah: string;

  // Cancel task modal
  batalkanTugasIni: string;
  tujuanLabel: string;
  yaBatalkanTugas: string;
  tidakKembali: string;

  // Task card
  tujuan: string;
  kendaraan: string;
  jenisPekerjaan: string;
  requestor: string;
  perihal: string;
  terimaTugas: string;
  selesaikanTugas: string;
  batalkanTugas: string;
  memproses: string;
  selesai: string;
  dibatalkanOleh: string;

  // Status labels
  statusAssigned: string;
  statusOngoing: string;
  statusCancelled: string;
  statusDone: string;

  // Toasts / errors
  tugasBaruMasuk: string;
  tugasDiterima: string;
  tugasSelesaiToast: string;
  tugasDibatalkanToast: string;
  gagalMemuatDataDriver: string;
  gagalMemuatTugas: string;
  gagalMenerimaTugas: string;
  gagalMenyelesaikanTugas: string;
  gagalMembatalkanTugas: string;
  gagalMemuatRiwayat: string;
  gagalMengubahPin: string;

  // Language toggle (new)
  language: string;

  // Admin/GA Login (new)
  loginTitle: string;
  loginSubtitle: string;
  loginEmail: string;
  loginPassword: string;
  loginButton: string;
  loginSigningIn: string;
  loginErrorGeneric: string;
  loginBackToDriver: string;

  // Common actions (shared across FleetOS tabs)
  actionCancel: string;
  actionSave: string;
  actionSaving: string;
  actionDelete: string;
  actionEdit: string;
  actionAdd: string;
  actionYesDelete: string;
  actionLoading: string;
  actionSignOut: string;
  actionNoDataYet: string;

  // Form field labels (FleetOS tabs)
  fieldDriver: string;
  fieldPlant: string;
  fieldTierName: string;
  fieldColor: string;
  fieldAmountPerPersonMonth: string;
  fieldTotalCashOp: string;
  fieldStationName: string;
  fieldLatitude: string;
  fieldLongitude: string;
  fieldAddress: string;
  fieldFuelsAvailable: string;
  fieldNotes: string;
  fieldPlateNumber: string;
  fieldType: string;
  fieldYear: string;
  fieldFuel: string;
  fieldOdometer: string;
  fieldDefaultDriver: string;
  fieldDepartment: string;
  fieldStatus: string;
  fieldScheduleKir: string;
  fieldScheduleService: string;
  fieldScheduleStnk: string;
}

export const DICT: Record<Lang, Dict> = {
  id: {
    appName: "CIKOPS-FM",
    appTagline: "Facility Management",

    splashTagline: "Facility Management",

    pilihDriver: "Pilih Driver",
    memuatDriver: "Memuat driver...",
    online: "Online",
    masuk: "Masuk →",
    gantiTema: "Ganti tema",

    kembali: "← Kembali",
    masukkanPin: "MASUKKAN PIN 4 DIGIT",
    pinSalah: "PIN salah, coba lagi",

    driverPanel: "Driver Panel",
    keluar: "Keluar",
    hariIni: "Hari Ini",
    riwayat: "Riwayat",
    klaim: "Klaim",
    profil: "Profil",
    statBaru: "Baru",
    statProses: "Proses",
    statSelesai: "Selesai",

    memuatTugasHariIni: "Memuat tugas hari ini...",
    belumAdaTugasHariIni: "Belum ada tugas hari ini",
    tugasBaruOtomatis: "Tugas baru akan muncul otomatis di sini",
    liveUpdateOtomatis: "Live — update otomatis",

    dariTanggal: "Dari Tanggal",
    sampaiTanggal: "Sampai Tanggal",
    statusLabel: "STATUS",
    terapkan: "Terapkan",
    reset: "Reset",
    memuatRiwayat: "Memuat riwayat...",
    tidakAdaRiwayat: "Tidak ada riwayat",
    cobaUbahRentang: "Coba ubah rentang tanggal atau filter status",
    pilihRentangTanggal: "Pilih rentang tanggal",
    tekanTerapkan: 'Tekan "Terapkan" untuk melihat riwayat tugas',

    informasi: "INFORMASI",
    noHp: "No. HP",
    keamanan: "KEAMANAN",
    pinAkses: "PIN Akses",
    ubahPin: "Ubah PIN",
    keluarDariAkun: "Keluar dari akun",

    masukDenganAkun: "Masuk dengan akun driver kamu",
    loginWelcome: "Selamat datang 👋",
    sedangMasuk: "Masuk...",
    loginGagal: "Email atau password salah.",
    akunBukanDriver: "Akun ini tidak terhubung ke driver aktif. Hubungi admin.",
    loginHintAdmin: "Belum punya akun? Hubungi admin GA untuk dibuatkan.",
    lihatPassword: "Lihat password",
    sembunyikanPassword: "Sembunyikan password",
    ubahPassword: "Ubah Password",
    passwordBaru: "Password baru",
    konfirmasiPasswordBaru: "Ulangi password baru",
    passwordMin6: "Password minimal 6 karakter.",
    passwordTidakSama: "Password tidak sama. Coba lagi.",
    passwordDiubah: "Password berhasil diubah ✅",
    gagalMengubahPassword: "Gagal mengubah password.",
    menyimpan: "Menyimpan...",
    simpanPassword: "Simpan Password",

    masukkanPinLama: "Masukkan PIN Lama",
    buatPinBaru: "Buat PIN Baru",
    konfirmasiPinBaru: "Konfirmasi PIN Baru",
    verifikasiIdentitas: "Verifikasi identitas Anda",
    empatDigitMudahDiingat: "4 digit angka, mudah diingat",
    ketikUlangPin: "Ketik ulang PIN yang sama",
    batal: "Batal",
    pinBaruTidakCocok: "PIN baru tidak cocok, ulangi",
    pinLamaSalah: "PIN lama salah",
    pinBerhasilDiubah: "PIN berhasil diubah ✓",

    batalkanTugasIni: "Batalkan tugas ini?",
    tujuanLabel: "Tujuan",
    yaBatalkanTugas: "Ya, Batalkan Tugas",
    tidakKembali: "Tidak, Kembali",

    tujuan: "TUJUAN",
    kendaraan: "Kendaraan",
    jenisPekerjaan: "Jenis Pekerjaan",
    requestor: "Requestor",
    perihal: "Perihal",
    terimaTugas: "Terima Tugas →",
    selesaikanTugas: "Selesaikan Tugas ✓",
    batalkanTugas: "Batalkan Tugas",
    memproses: "Memproses...",
    selesai: "Selesai",
    dibatalkanOleh: "oleh",

    statusAssigned: "Baru",
    statusOngoing: "Berlangsung",
    statusCancelled: "Dibatalkan",
    statusDone: "Selesai",

    tugasBaruMasuk: "Tugas baru masuk 🔔",
    tugasDiterima: "Tugas diterima ✓",
    tugasSelesaiToast: "Tugas selesai ✓",
    tugasDibatalkanToast: "Tugas dibatalkan",
    gagalMemuatDataDriver: "Gagal memuat data driver",
    gagalMemuatTugas: "Gagal memuat tugas",
    gagalMenerimaTugas: "Gagal menerima tugas",
    gagalMenyelesaikanTugas: "Gagal menyelesaikan tugas",
    gagalMembatalkanTugas: "Gagal membatalkan tugas",
    gagalMemuatRiwayat: "Gagal memuat riwayat",
    gagalMengubahPin: "Gagal mengubah PIN",

    language: "Bahasa",

    // Admin/GA Login (new)
    loginTitle: "Masuk Admin/GA",
    loginSubtitle: "Sistem CIKOPS-FM",
    loginEmail: "Email",
    loginPassword: "Kata Sandi",
    loginButton: "Masuk",
    loginSigningIn: "Masuk...",
    loginErrorGeneric: "Email atau kata sandi salah",
    loginBackToDriver: "← Ke Driver Panel",

    // Common actions (shared across FleetOS tabs)
    actionCancel: "Batal",
    actionSave: "Simpan",
    actionSaving: "Menyimpan...",
    actionDelete: "Hapus",
    actionEdit: "Edit",
    actionAdd: "Tambah",
    actionYesDelete: "Ya, Hapus",
    actionLoading: "Memuat...",
    actionSignOut: "Keluar",
    actionNoDataYet: "Belum ada data.",

    // Form field labels (FleetOS tabs)
    fieldDriver: "DRIVER",
    fieldPlant: "PLANT",
    fieldTierName: "NAMA TIER",
    fieldColor: "WARNA",
    fieldAmountPerPersonMonth: "NOMINAL / ORANG / BULAN",
    fieldTotalCashOp: "TOTAL CASH OPERATIONAL",
    fieldStationName: "NAMA SPBU",
    fieldLatitude: "LATITUDE",
    fieldLongitude: "LONGITUDE",
    fieldAddress: "ALAMAT",
    fieldFuelsAvailable: "JENIS BBM TERSEDIA",
    fieldNotes: "CATATAN",
    fieldPlateNumber: "PLAT NOMOR",
    fieldType: "TIPE",
    fieldYear: "TAHUN",
    fieldFuel: "BBM",
    fieldOdometer: "ODOMETER (KM)",
    fieldDefaultDriver: "DRIVER DEFAULT",
    fieldDepartment: "DEPARTEMEN",
    fieldStatus: "STATUS",
    fieldScheduleKir: "JADWAL KIR",
    fieldScheduleService: "JADWAL SERVICE",
    fieldScheduleStnk: "JADWAL STNK",
  },
  en: {
    appName: "CIKOPS",
    appTagline: "Fleet Operations",

    splashTagline: "Fleet Operations",

    pilihDriver: "Select Driver",
    memuatDriver: "Loading drivers...",
    online: "Online",
    masuk: "Log In →",
    gantiTema: "Toggle theme",

    kembali: "← Back",
    masukkanPin: "ENTER YOUR 4-DIGIT PIN",
    pinSalah: "Wrong PIN, try again",

    driverPanel: "Driver Panel",
    keluar: "Log Out",
    hariIni: "Today",
    riwayat: "History",
    klaim: "Claims",
    profil: "Profile",
    statBaru: "New",
    statProses: "Ongoing",
    statSelesai: "Done",

    memuatTugasHariIni: "Loading today's tasks...",
    belumAdaTugasHariIni: "No tasks yet today",
    tugasBaruOtomatis: "New tasks will appear here automatically",
    liveUpdateOtomatis: "Live — auto-updating",

    dariTanggal: "From Date",
    sampaiTanggal: "To Date",
    statusLabel: "STATUS",
    terapkan: "Apply",
    reset: "Reset",
    memuatRiwayat: "Loading history...",
    tidakAdaRiwayat: "No history found",
    cobaUbahRentang: "Try a different date range or status filter",
    pilihRentangTanggal: "Select a date range",
    tekanTerapkan: 'Press "Apply" to view task history',

    informasi: "INFORMATION",
    noHp: "Phone",
    keamanan: "SECURITY",
    pinAkses: "Access PIN",
    ubahPin: "Change PIN",
    keluarDariAkun: "Sign out",

    masukDenganAkun: "Sign in with your driver account",
    loginWelcome: "Welcome back 👋",
    sedangMasuk: "Signing in...",
    loginGagal: "Wrong email or password.",
    akunBukanDriver: "This account isn't linked to an active driver. Contact your admin.",
    loginHintAdmin: "No account yet? Ask your GA admin to create one.",
    lihatPassword: "Show password",
    sembunyikanPassword: "Hide password",
    ubahPassword: "Change Password",
    passwordBaru: "New password",
    konfirmasiPasswordBaru: "Repeat new password",
    passwordMin6: "Password must be at least 6 characters.",
    passwordTidakSama: "Passwords don't match. Try again.",
    passwordDiubah: "Password changed ✅",
    gagalMengubahPassword: "Failed to change password.",
    menyimpan: "Saving...",
    simpanPassword: "Save Password",

    masukkanPinLama: "Enter Current PIN",
    buatPinBaru: "Create New PIN",
    konfirmasiPinBaru: "Confirm New PIN",
    verifikasiIdentitas: "Verify your identity",
    empatDigitMudahDiingat: "4 digits, easy to remember",
    ketikUlangPin: "Re-enter the same PIN",
    batal: "Cancel",
    pinBaruTidakCocok: "New PINs don't match, try again",
    pinLamaSalah: "Current PIN is incorrect",
    pinBerhasilDiubah: "PIN changed successfully ✓",

    batalkanTugasIni: "Cancel this task?",
    tujuanLabel: "Destination",
    yaBatalkanTugas: "Yes, Cancel Task",
    tidakKembali: "No, Go Back",

    tujuan: "DESTINATION",
    kendaraan: "Vehicle",
    jenisPekerjaan: "Job Type",
    requestor: "Requestor",
    perihal: "Subject",
    terimaTugas: "Accept Task →",
    selesaikanTugas: "Complete Task ✓",
    batalkanTugas: "Cancel Task",
    memproses: "Processing...",
    selesai: "Done",
    dibatalkanOleh: "by",

    statusAssigned: "New",
    statusOngoing: "Ongoing",
    statusCancelled: "Cancelled",
    statusDone: "Done",

    tugasBaruMasuk: "New task received 🔔",
    tugasDiterima: "Task accepted ✓",
    tugasSelesaiToast: "Task completed ✓",
    tugasDibatalkanToast: "Task cancelled",
    gagalMemuatDataDriver: "Failed to load driver data",
    gagalMemuatTugas: "Failed to load tasks",
    gagalMenerimaTugas: "Failed to accept task",
    gagalMenyelesaikanTugas: "Failed to complete task",
    gagalMembatalkanTugas: "Failed to cancel task",
    gagalMemuatRiwayat: "Failed to load history",
    gagalMengubahPin: "Failed to change PIN",

    language: "Language",

    // Admin/GA Login (new)
    loginTitle: "Admin/GA Sign In",
    loginSubtitle: "CIKOPS-FM System",
    loginEmail: "Email",
    loginPassword: "Password",
    loginButton: "Sign In",
    loginSigningIn: "Signing in...",
    loginErrorGeneric: "Incorrect email or password",
    loginBackToDriver: "← To Driver Panel",

    // Common actions (shared across FleetOS tabs)
    actionCancel: "Cancel",
    actionSave: "Save",
    actionSaving: "Saving...",
    actionDelete: "Delete",
    actionEdit: "Edit",
    actionAdd: "Add",
    actionYesDelete: "Yes, Delete",
    actionLoading: "Loading...",
    actionSignOut: "Sign Out",
    actionNoDataYet: "No data yet.",

    // Form field labels (FleetOS tabs)
    fieldDriver: "DRIVER",
    fieldPlant: "PLANT",
    fieldTierName: "TIER NAME",
    fieldColor: "COLOR",
    fieldAmountPerPersonMonth: "AMOUNT / PERSON / MONTH",
    fieldTotalCashOp: "TOTAL OPERATIONAL CASH",
    fieldStationName: "STATION NAME",
    fieldLatitude: "LATITUDE",
    fieldLongitude: "LONGITUDE",
    fieldAddress: "ADDRESS",
    fieldFuelsAvailable: "AVAILABLE FUEL TYPES",
    fieldNotes: "NOTES",
    fieldPlateNumber: "PLATE NUMBER",
    fieldType: "TYPE",
    fieldYear: "YEAR",
    fieldFuel: "FUEL",
    fieldOdometer: "ODOMETER (KM)",
    fieldDefaultDriver: "DEFAULT DRIVER",
    fieldDepartment: "DEPARTMENT",
    fieldStatus: "STATUS",
    fieldScheduleKir: "KIR SCHEDULE",
    fieldScheduleService: "SERVICE SCHEDULE",
    fieldScheduleStnk: "STNK SCHEDULE",
  },
};
