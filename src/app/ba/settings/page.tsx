'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/client';
import {
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import {
  User,
  ShieldCheck,
  Bell,
  Camera,
  Store,
  LogOut,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Save,
  MapPin,
  BadgeCheck,
} from 'lucide-react';
import { ImageUpload } from '@/components/ImageUpload';

export default function BaSettingsPage() {
  const { user, loading, updateUserPhoto, signOutUser } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');

  // BA Profile State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeCity, setStoreCity] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securitySaving, setSecuritySaving] = useState(false);

  // Preferences State
  const [scannerSound, setScannerSound] = useState(true);
  const [scannerVibrate, setScannerVibrate] = useState(true);
  const [defaultFacing, setDefaultFacing] = useState<'environment' | 'user'>('environment');
  const [notifyConsultation, setNotifyConsultation] = useState(true);
  const [notifyFollowUp, setNotifyFollowUp] = useState(true);
  const [prefSaving, setPrefSaving] = useState(false);

  // Alert Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Load BA details
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }

    if (user) {
      setFullName(user.displayName || '');
      setPhone(user.phone || '');

      // Load baProfiles and store details
      const loadBaData = async () => {
        try {
          // 1. Get user document
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const uData = userDoc.data();
            if (uData.name) setFullName(uData.name);
            if (uData.phone) setPhone(uData.phone);
          }

          // 2. Get baProfile document
          const baDoc = await getDoc(doc(db, 'baProfiles', user.uid));
          if (baDoc.exists()) {
            const bData = baDoc.data();
            setEmployeeCode(bData.employeeCode || `KHF-BA-${user.uid.slice(0, 5).toUpperCase()}`);

            // 3. Get store document
            if (bData.storeId) {
              const storeDoc = await getDoc(doc(db, 'stores', bData.storeId));
              if (storeDoc.exists()) {
                const sData = storeDoc.data();
                setStoreName(sData.name || '');
                setStoreCity(sData.city || '');
              }
            }
          } else {
            setEmployeeCode(`KHF-BA-${user.uid.slice(0, 5).toUpperCase()}`);
          }

          // Load local preferences
          const savedPref = localStorage.getItem(`kahf_ba_pref_${user.uid}`);
          if (savedPref) {
            const p = JSON.parse(savedPref);
            if (typeof p.scannerSound === 'boolean') setScannerSound(p.scannerSound);
            if (typeof p.scannerVibrate === 'boolean') setScannerVibrate(p.scannerVibrate);
            if (p.defaultFacing) setDefaultFacing(p.defaultFacing);
            if (typeof p.notifyConsultation === 'boolean') setNotifyConsultation(p.notifyConsultation);
            if (typeof p.notifyFollowUp === 'boolean') setNotifyFollowUp(p.notifyFollowUp);
          }
        } catch (err) {
          console.error('Error loading BA settings:', err);
        }
      };

      loadBaData();
    }
  }, [user, loading, router]);

  // Handle Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setFeedback(null);

    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: fullName,
        });
      }

      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: fullName,
          phone: phone,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setFeedback({ type: 'success', message: 'Profil Beauty Advisor berhasil diperbarui.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Gagal menyimpan profil.' });
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    if (newPassword.length < 6) {
      setFeedback({ type: 'error', message: 'Password baru minimal 6 karakter.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'Konfirmasi password baru tidak cocok.' });
      return;
    }

    setSecuritySaving(true);
    setFeedback(null);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Pengguna tidak aktif.');

      // Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await updatePassword(currentUser, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'success', message: 'Password akun BA Anda berhasil diperbarui.' });
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setFeedback({ type: 'error', message: 'Password saat ini yang Anda masukkan salah.' });
      } else {
        setFeedback({ type: 'error', message: err.message || 'Gagal mengubah password.' });
      }
    } finally {
      setSecuritySaving(false);
    }
  };

  // Handle Preferences Save
  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPrefSaving(true);
    setFeedback(null);

    try {
      const prefData = {
        scannerSound,
        scannerVibrate,
        defaultFacing,
        notifyConsultation,
        notifyFollowUp,
      };
      localStorage.setItem(`kahf_ba_pref_${user.uid}`, JSON.stringify(prefData));
      setFeedback({ type: 'success', message: 'Preferensi perangkat dan scanner berhasil disimpan.' });
    } catch {
      setFeedback({ type: 'error', message: 'Gagal menyimpan preferensi lokal.' });
    } finally {
      setPrefSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutUser();
      router.replace('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#2C5C59] animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Pengaturan Akun BA</h1>
          <p className="text-xs text-gray-500 mt-1">
            Kelola identitas Beauty Advisor, keamanan akun, dan preferensi scanner
          </p>
        </div>

        {/* Big Prominent Logout Button */}
        <button
          type="button"
          onClick={() => setIsLogoutModalOpen(true)}
          className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all flex items-center gap-2 shadow-2xs self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4 text-rose-600" />
          <span>Keluar Akun BA</span>
        </button>
      </div>

      {/* Alert Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-sm animate-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <p className="font-bold">{feedback.type === 'success' ? 'Sukses' : 'Kendala'}</p>
            <p className="mt-0.5">{feedback.message}</p>
          </div>
          <button onClick={() => setFeedback(null)} className="font-bold text-sm">
            ✕
          </button>
        </div>
      )}

      {/* BA Identity Summary Card */}
      <div className="bg-gradient-to-r from-[#2C5C59] to-[#1F4240] rounded-3xl p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="relative w-18 h-18 shrink-0">
          <ImageUpload
            onUploadSuccess={async (url) => {
              await updateUserPhoto(url);
              setFeedback({ type: 'success', message: 'Foto profil Beauty Advisor berhasil diperbarui.' });
            }}
            folder="profiles"
            currentImage={user?.photoUrl || undefined}
            shape="rounded"
            showBadge={true}
            className="w-18 h-18 rounded-2xl shadow-inner border border-white/30 bg-white/10"
            label=""
          />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{fullName || 'Beauty Advisor Wardah'}</h2>
              <span className="bg-[#6DB9B2]/30 text-[#A2E0DB] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-[#6DB9B2]/40">
                Official BA
              </span>
            </div>
            <p className="text-white/80 text-xs mt-0.5">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-white/90">
              <span className="bg-white/10 px-2.5 py-0.5 rounded-lg font-mono text-[11px]">
                {employeeCode || 'WRD-BA-OFFICIAL'}
              </span>
              {storeName && (
                <span className="flex items-center gap-1 bg-white/10 px-2.5 py-0.5 rounded-lg text-[11px]">
                  <Store className="w-3 h-3 text-[#A2E0DB]" />
                  <span>{storeName} {storeCity ? `(${storeCity})` : ''}</span>
                </span>
              )}
            </div>
          </div>
        </div>


      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-4 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all relative ${
            activeTab === 'profile' ? 'text-[#2C5C59]' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Profil BA</span>
          {activeTab === 'profile' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2C5C59] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 px-4 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all relative ${
            activeTab === 'security' ? 'text-[#2C5C59]' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Keamanan & Password</span>
          {activeTab === 'security' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2C5C59] rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`pb-3 px-4 font-bold text-xs sm:text-sm flex items-center gap-2 transition-all relative ${
            activeTab === 'preferences' ? 'text-[#2C5C59]' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Preferensi Scanner & Notifikasi</span>
          {activeTab === 'preferences' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#2C5C59] rounded-full" />
          )}
        </button>
      </div>

      {/* TAB 1: PROFILE MANAGEMENT */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-bold text-base text-gray-900">Data Diri Beauty Advisor</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Informasi ini akan tercatat pada setiap struk konsultasi dan rekomendasi produk pelanggan.
            </p>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nama Lengkap BA <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama Lengkap Anda"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] focus:bg-white font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Nomor HP / WhatsApp
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="08123456789"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] focus:bg-white font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Kode Karyawan (Employee Code)
                </label>
                <input
                  type="text"
                  value={employeeCode}
                  disabled
                  className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-mono font-semibold text-gray-600 cursor-not-allowed"
                />
                <p className="text-[10px] text-gray-400 mt-1">Dikelola oleh Administrator Regional</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Penugasan Toko (Store Assignment)
                </label>
                <input
                  type="text"
                  value={storeName ? `${storeName} (${storeCity})` : 'Belum Ditugaskan Toko'}
                  disabled
                  className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-xs font-semibold text-gray-600 cursor-not-allowed"
                />
                <p className="text-[10px] text-gray-400 mt-1">Dikelola oleh Administrator Regional</p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={profileSaving}
                className="px-6 py-2.5 bg-[#2C5C59] text-white font-bold text-xs rounded-xl hover:bg-[#1f4240] transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{profileSaving ? 'Menyimpan...' : 'Simpan Profil'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: SECURITY & PASSWORD */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-bold text-base text-gray-900">Ubah Password Akun BA</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Gunakan kombinasi minimal 6 karakter dengan huruf dan angka untuk keamanan data.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Password Saat Ini <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Masukkan password lama"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Password Baru <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Konfirmasi Password Baru <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi password baru"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#6DB9B2] focus:bg-white"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={securitySaving}
                className="px-6 py-2.5 bg-[#2C5C59] text-white font-bold text-xs rounded-xl hover:bg-[#1f4240] transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{securitySaving ? 'Menyimpan...' : 'Perbarui Password'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: SCANNER PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="font-bold text-base text-gray-900">Preferensi Scanner & Notifikasi</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Sesuaikan respons kamera dan umpan balik saat melakukan scan Beauty Passport pelanggan.
            </p>
          </div>

          <form onSubmit={handleSavePreferences} className="space-y-5">
            {/* Camera Options */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Kamera Scanner
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-white cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="facing"
                    checked={defaultFacing === 'environment'}
                    onChange={() => setDefaultFacing('environment')}
                    className="w-4 h-4 text-[#2C5C59] focus:ring-[#6DB9B2]"
                  />
                  <div>
                    <span className="block text-xs font-bold text-gray-800">
                      Kamera Belakang (Rekomendasi)
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      Cocok untuk memindai layar ponsel pelanggan
                    </span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3.5 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-white cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="facing"
                    checked={defaultFacing === 'user'}
                    onChange={() => setDefaultFacing('user')}
                    className="w-4 h-4 text-[#2C5C59] focus:ring-[#6DB9B2]"
                  />
                  <div>
                    <span className="block text-xs font-bold text-gray-800">
                      Kamera Depan (Webcam Laptop)
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      Cocok jika BA menggunakan laptop toko
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Feedback Options */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Umpan Balik Scanner
              </h4>
              <div className="space-y-2">
                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-100 bg-gray-50 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">
                      Suara Beep Chime Saat QR Terdeteksi
                    </span>
                    <span className="text-[11px] text-gray-500 block">
                      Bunyi nada konfirmasi saat kamera berhasil membaca QR pelanggan
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={scannerSound}
                    onChange={(e) => setScannerSound(e.target.checked)}
                    className="w-4 h-4 rounded text-[#2C5C59] focus:ring-[#6DB9B2]"
                  />
                </label>

                <label className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-100 bg-gray-50 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-gray-800 block">
                      Getaran Haptic (Ponsel)
                    </span>
                    <span className="text-[11px] text-gray-500 block">
                      Getaran fisik sesaat pada ponsel saat pemindaian berhasil
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={scannerVibrate}
                    onChange={(e) => setScannerVibrate(e.target.checked)}
                    className="w-4 h-4 rounded text-[#2C5C59] focus:ring-[#6DB9B2]"
                  />
                </label>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={prefSaving}
                className="px-6 py-2.5 bg-[#2C5C59] text-white font-bold text-xs rounded-xl hover:bg-[#1f4240] transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{prefSaving ? 'Menyimpan...' : 'Simpan Preferensi'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* LOGOUT CONFIRMATION MODAL                                      */}
      {/* ============================================================== */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center space-y-4 animate-in zoom-in-95 border border-gray-100">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <LogOut className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-extrabold text-base text-gray-900">Keluar dari Akun BA?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Anda akan mengakhiri sesi aktif sebagai Beauty Advisor. Anda dapat login kembali sewaktu-waktu.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
