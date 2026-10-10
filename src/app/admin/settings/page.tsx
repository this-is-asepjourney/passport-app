'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase/client';
import { updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ImageUpload } from '@/components/ImageUpload';

export default function SettingsPage() {
  const { user, loading, updateUserPhoto } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'system'>('profile');

  // Profile Form State
  const [displayName, setDisplayName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securitySaving, setSecuritySaving] = useState(false);

  // Notification Preferences State
  const [notifDailyReport, setNotifDailyReport] = useState(true);
  const [notifLowStock, setNotifLowStock] = useState(true);
  const [notifNewConsultation, setNotifNewConsultation] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // System Settings State
  const [sessionTimeout, setSessionTimeout] = useState('60');
  const [timezone, setTimezone] = useState('WIB (Asia/Jakarta)');
  const [systemSaving, setSystemSaving] = useState(false);

  // Toast / Alert Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
    if (user) {
      setDisplayName(user.displayName || 'Admin Wardah');
      
      // Load saved preferences from localStorage if available
      try {
        const savedNotifs = localStorage.getItem(`kahf_settings_notif_${user.uid}`);
        if (savedNotifs) {
          const parsed = JSON.parse(savedNotifs);
          if (typeof parsed.dailyReport === 'boolean') setNotifDailyReport(parsed.dailyReport);
          if (typeof parsed.lowStock === 'boolean') setNotifLowStock(parsed.lowStock);
          if (typeof parsed.newConsultation === 'boolean') setNotifNewConsultation(parsed.newConsultation);
        }
        const savedSystem = localStorage.getItem(`kahf_settings_system_${user.uid}`);
        if (savedSystem) {
          const parsed = JSON.parse(savedSystem);
          if (parsed.sessionTimeout) setSessionTimeout(parsed.sessionTimeout);
          if (parsed.timezone) setTimezone(parsed.timezone);
        }
      } catch (e) {
        // ignore
      }
    }
  }, [user, loading, router]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 4500);
  };

  // 1. Handle Profile Update
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setProfileSaving(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName: displayName.trim(),
        photoURL: photoUrl.trim() || null,
      });

      // Update Firestore user document
      await setDoc(doc(db, 'users', auth.currentUser.uid), {
        name: displayName.trim(),
        photoUrl: photoUrl.trim() || null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      showFeedback('success', 'Profil admin berhasil diperbarui!');
    } catch (err: any) {
      console.error(err);
      showFeedback('error', err.message || 'Gagal menyimpan profil.');
    } finally {
      setProfileSaving(false);
    }
  };

  // 2. Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !auth.currentUser.email) return;

    if (newPassword.length < 6) {
      showFeedback('error', 'Kata sandi baru minimal harus 6 karakter.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showFeedback('error', 'Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setSecuritySaving(true);
    try {
      // If current password provided, re-authenticate first
      if (currentPassword) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showFeedback('success', 'Kata sandi berhasil diperbarui!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        showFeedback('error', 'Kata sandi saat ini salah.');
      } else if (err.code === 'auth/requires-recent-login') {
        showFeedback('error', 'Silakan masukkan Kata Sandi Saat Ini untuk verifikasi keamanan.');
      } else {
        showFeedback('error', err.message || 'Gagal memperbarui kata sandi.');
      }
    } finally {
      setSecuritySaving(false);
    }
  };

  // 3. Handle Notification Preferences
  const handleSaveNotifications = async () => {
    if (!user) return;
    setNotifSaving(true);
    try {
      const prefs = {
        dailyReport: notifDailyReport,
        lowStock: notifLowStock,
        newConsultation: notifNewConsultation,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(`kahf_settings_notif_${user.uid}`, JSON.stringify(prefs));
      
      // Also save to Firestore user profile
      await setDoc(doc(db, 'users', user.uid), {
        notificationPreferences: prefs,
      }, { merge: true });

      showFeedback('success', 'Preferensi notifikasi berhasil disimpan!');
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Gagal menyimpan preferensi notifikasi.');
    } finally {
      setNotifSaving(false);
    }
  };

  // 4. Handle System Settings
  const handleSaveSystem = async () => {
    if (!user) return;
    setSystemSaving(true);
    try {
      const systemSettings = {
        sessionTimeout,
        timezone,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(`kahf_settings_system_${user.uid}`, JSON.stringify(systemSettings));
      
      // Also save to Firestore
      await setDoc(doc(db, 'users', user.uid), {
        systemSettings,
      }, { merge: true });

      showFeedback('success', 'Pengaturan sistem berhasil disimpan!');
    } catch (err: any) {
      console.error(err);
      showFeedback('error', 'Gagal menyimpan pengaturan sistem.');
    } finally {
      setSystemSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#2C5C59] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pengaturan</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola preferensi akun dan sistem administrasi Wardah.</p>
        </div>
      </div>

      {/* Alert Banner */}
      {feedback && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 border ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          <span>{feedback.type === 'success' ? '✅' : '⚠️'}</span>
          <span className="text-sm font-medium">{feedback.message}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[550px]">
        
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 border-r border-gray-100 bg-gray-50/40 p-6 flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`text-left px-4 py-3 rounded-2xl text-sm font-bold transition-colors ${
              activeTab === 'profile'
                ? 'bg-[#E2F0EF] text-[#2C5C59] shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            👤 Profil Admin
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`text-left px-4 py-3 rounded-2xl text-sm font-bold transition-colors ${
              activeTab === 'security'
                ? 'bg-[#E2F0EF] text-[#2C5C59] shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            🔒 Keamanan & Sandi
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`text-left px-4 py-3 rounded-2xl text-sm font-bold transition-colors ${
              activeTab === 'notifications'
                ? 'bg-[#E2F0EF] text-[#2C5C59] shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            🔔 Notifikasi
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`text-left px-4 py-3 rounded-2xl text-sm font-bold transition-colors ${
              activeTab === 'system'
                ? 'bg-[#E2F0EF] text-[#2C5C59] shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            ⚙️ Sistem
          </button>
        </div>

        {/* Settings Content */}
        <div className="flex-1 p-6 md:p-8">
          
          {/* TAB 1: PROFIL ADMIN */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-4">Profil Admin</h2>
              
              <div className="flex items-center gap-6">
                <div className="relative w-20 h-20 shrink-0">
                  <ImageUpload
                    onUploadSuccess={async (url) => {
                      setPhotoUrl(url);
                      await updateUserPhoto(url);
                      showFeedback('success', 'Foto profil admin berhasil diunggah dan disinkronkan.');
                    }}
                    folder="profiles"
                    currentImage={photoUrl || user?.photoUrl || undefined}
                    shape="circle"
                    showBadge={true}
                    className="w-20 h-20 shadow-md border-2 border-[#E2F0EF]"
                    label=""
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-700 block">Foto Profil Administrator</label>
                  <p className="text-xs text-gray-500">
                    Klik atau ketuk foto di samping untuk mengunggah avatar baru ke Cloudflare R2.
                  </p>
                  <p className="text-[11px] text-[#2C5C59] font-semibold">
                    Otomatis dikompres & disinkronkan ke seluruh sistem admin & layout.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nama Admin"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] transition-all bg-gray-50 focus:bg-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Alamat Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Peran Akses</label>
                  <input
                    type="text"
                    value={user?.role === 'super_admin' ? 'Super Admin' : 'Admin Regional'}
                    disabled
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed text-sm font-semibold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">UID Pengguna</label>
                  <input
                    type="text"
                    value={user?.uid || ''}
                    disabled
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-6 py-3 bg-[#2C5C59] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#6DB9B2]/20 hover:bg-[#1f4240] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {profileSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: KEAMANAN & KATA SANDI */}
          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-4">Keamanan Akun</h2>
              <p className="text-xs text-gray-500">Perbarui kata sandi akun Anda secara berkala untuk menjaga keamanan data administrasi.</p>
              
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Kata Sandi Saat Ini</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan kata sandi saat ini"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] transition-all bg-gray-50 focus:bg-white text-sm"
                  />
                  <p className="text-[11px] text-gray-400">Diperlukan untuk konfirmasi perubahan sandi.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Kata Sandi Baru</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] transition-all bg-gray-50 focus:bg-white text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Konfirmasi Kata Sandi Baru</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] transition-all bg-gray-50 focus:bg-white text-sm"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-start">
                <button
                  type="submit"
                  disabled={securitySaving}
                  className="px-6 py-3 bg-[#2C5C59] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#6DB9B2]/20 hover:bg-[#1f4240] transition-colors disabled:opacity-50"
                >
                  {securitySaving ? 'Memproses...' : 'Perbarui Kata Sandi'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PREFERENSI NOTIFIKASI */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-4">Preferensi Notifikasi</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Email Laporan Harian</h4>
                    <p className="text-xs text-gray-500 mt-1">Terima ringkasan transaksi penjualan dan performa BA setiap pagi.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={notifDailyReport}
                      onChange={(e) => setNotifDailyReport(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2C5C59]"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Peringatan Stok Tipis</h4>
                    <p className="text-xs text-gray-500 mt-1">Notifikasi otomatis jika stok produk mendekati batas minimum.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={notifLowStock}
                      onChange={(e) => setNotifLowStock(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2C5C59]"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-100 rounded-2xl bg-gray-50/50">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Notifikasi Konsultasi Baru</h4>
                    <p className="text-xs text-gray-500 mt-1">Pemberitahuan aktivitas sesi konsultasi BA dengan pelanggan baru.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={notifNewConsultation}
                      onChange={(e) => setNotifNewConsultation(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2C5C59]"></div>
                  </label>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-start">
                <button
                  type="button"
                  onClick={handleSaveNotifications}
                  disabled={notifSaving}
                  className="px-6 py-3 bg-[#2C5C59] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#6DB9B2]/20 hover:bg-[#1f4240] transition-colors disabled:opacity-50"
                >
                  {notifSaving ? 'Menyimpan...' : 'Simpan Preferensi Notifikasi'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: PENGATURAN SISTEM */}
          {activeTab === 'system' && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-4">Pengaturan Sistem</h2>
              
              <div className="space-y-4">
                <div className="space-y-2 max-w-sm">
                  <label className="text-sm font-bold text-gray-700">Batas Waktu Sesi (Menit)</label>
                  <input
                    type="number"
                    min="15"
                    max="480"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] transition-all bg-gray-50 focus:bg-white text-sm"
                  />
                  <p className="text-[11px] text-gray-400">Batas durasi login sebelum pengguna diminta login ulang otomatis.</p>
                </div>

                <div className="space-y-2 max-w-sm">
                  <label className="text-sm font-bold text-gray-700">Zona Waktu Default</label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] transition-all bg-gray-50 focus:bg-white text-sm"
                  >
                    <option value="WIB (Asia/Jakarta)">WIB (Asia/Jakarta)</option>
                    <option value="WITA (Asia/Makassar)">WITA (Asia/Makassar)</option>
                    <option value="WIT (Asia/Jayapura)">WIT (Asia/Jayapura)</option>
                  </select>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 flex justify-start">
                <button
                  type="button"
                  onClick={handleSaveSystem}
                  disabled={systemSaving}
                  className="px-6 py-3 bg-[#2C5C59] text-white text-sm font-bold rounded-xl shadow-lg shadow-[#6DB9B2]/20 hover:bg-[#1f4240] transition-colors disabled:opacity-50"
                >
                  {systemSaving ? 'Menyimpan...' : 'Simpan Sistem'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
