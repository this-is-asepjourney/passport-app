'use client';

import { useEffect, useState, use } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import type { Customer } from '@/types';
import { formatIDR } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/media';
import Link from 'next/link';
import { Bell, Send, CheckCircle2, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';

const ADMIN_NOTIF_TEMPLATES = [
  {
    title: 'Pengumuman Resmi Manajemen Wardah 📢',
    message: 'Halo Kak! Terima kasih telah menjadi bagian dari keluarga Wardah Beauty Passport. Nikmati berbagai kemudahan cek hasil konsultasi kulit, riwayat belanja, dan reward loyalitas eksklusif di aplikasi ini.',
    type: 'admin_broadcast' as const,
    actionUrl: '/passport',
  },
  {
    title: 'Bonus Poin Loyalitas & Reward Spesial 🎁',
    message: 'Kabar gembira! Akunmu mendapatkan penawaran spesial atau pembaruan poin loyalitas Wardah. Kunjungi counter Wardah terdekat untuk menukarkan poinmu dengan produk favorit.',
    type: 'reward' as const,
    actionUrl: '/passport',
  },
  {
    title: 'Promo Spesial Member Eksklusif ✨',
    message: 'Spesial untuk kamu! Dapatkan diskon istimewa pada pembelian produk perawatan Wardah pilihan minggu ini. Cukup tunjukkan barcode Passport-mu saat berbelanja di counter resmi.',
    type: 'promo' as const,
    actionUrl: '/passport',
  },
];

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  // Password Reset State
  const [isResetting, setIsResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState({ type: '', text: '' });

  // Admin Notification State
  const [notifTitle, setNotifTitle] = useState(ADMIN_NOTIF_TEMPLATES[0].title);
  const [notifMessage, setNotifMessage] = useState(ADMIN_NOTIF_TEMPLATES[0].message);
  const [notifType, setNotifType] = useState<'admin_broadcast' | 'promo' | 'reward'>('admin_broadcast');
  const [notifActionUrl, setNotifActionUrl] = useState('/passport');
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [notifStatus, setNotifStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user && !['admin_region', 'super_admin'].includes(user.role ?? '')) {
      router.replace('/');
      return;
    }
    if (user) {
      loadCustomer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, id, router]);

  const loadCustomer = async () => {
    try {
      const snap = await getDoc(doc(db, 'customers', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as Customer;
        setCustomer(data);
        setEditForm({ fullName: data.fullName, phone: data.phone, status: data.status, memberNo: data.memberNo });
      } else {
        setCustomer(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!customer) return;
    try {
      await updateDoc(doc(db, 'customers', customer.id), editForm);
      setCustomer({ ...customer, ...editForm } as Customer);
      setIsEditing(false);
    } catch (err) {
      console.error('Update failed:', err);
      alert('Gagal mengupdate data customer');
    }
  };

  const handleDelete = async () => {
    if (!customer || !confirm('Yakin ingin menghapus customer ini?')) return;
    try {
      await deleteDoc(doc(db, 'customers', customer.id));
      router.push('/admin/customers');
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Gagal menghapus customer');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer?.uid) {
      setResetMessage({ type: 'error', text: 'Customer ini belum tertaut dengan akun Auth (uid kosong).' });
      return;
    }
    if (newPassword.length < 6) {
      setResetMessage({ type: 'error', text: 'Password minimal 6 karakter' });
      return;
    }

    setIsResetting(true);
    setResetMessage({ type: '', text: '' });

    try {
      const idToken = await auth.currentUser?.getIdToken();

      const res = await fetch('/api/admin/customers/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          uid: customer.uid,
          newPassword
        })
      });

      const data = await res.json();
      if (res.ok) {
        setResetMessage({ type: 'success', text: 'Password berhasil diubah!' });
        setNewPassword('');
      } else {
        setResetMessage({ type: 'error', text: data.error || 'Gagal mengubah password' });
      }
    } catch (err: unknown) {
      setResetMessage({ type: 'error', text: (err as Error).message || 'Terjadi kesalahan' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleSendAdminNotif = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !notifTitle.trim() || !notifMessage.trim()) return;

    setIsSendingNotif(true);
    setNotifStatus(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesi login telah kedaluwarsa');

      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          customerId: customer.id,
          title: notifTitle.trim(),
          message: notifMessage.trim(),
          type: notifType,
          actionUrl: notifActionUrl.trim() || '/passport',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesan');

      setNotifStatus({ type: 'success', text: 'Notifikasi berhasil dikirim langsung ke Wardah Beauty Passport customer!' });
      setTimeout(() => setNotifStatus(null), 3000);
    } catch (err: any) {
      setNotifStatus({ type: 'error', text: err.message || 'Gagal mengirim notifikasi' });
    } finally {
      setIsSendingNotif(false);
    }
  };

  if (loading || dataLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 rounded-full border-4 border-purple-200 border-t-purple-600 animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 mb-4">Customer tidak ditemukan.</p>
        <Link href="/admin/customers" className="text-purple-600 font-medium">← Kembali ke daftar</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/admin/customers" className="text-gray-500 hover:text-gray-800 text-sm font-semibold">
          ← Kembali ke Pelanggan
        </Link>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#E2F0EF] text-[#2C5C59] flex items-center justify-center font-bold text-2xl shadow-inner overflow-hidden border border-[#6DB9B2]/30 shrink-0">
            {customer.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(customer.photoUrl)} alt="" className="w-full h-full object-cover" />
            ) : (
              customer.fullName.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.fullName}</h1>
            <p className="text-sm text-gray-500">Member ID: {customer.memberNo} • {customer.phone}</p>
          </div>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
          customer.status === 'active' ? 'bg-green-100 text-green-700' :
          customer.status === 'unclaimed' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {customer.status === 'active' ? 'Aktif' : customer.status === 'unclaimed' ? 'Belum Klaim' : 'Diblokir'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Profile & Notifications */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4">
              <h2 className="text-lg font-bold text-gray-900">Informasi Profil</h2>
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} className="text-xs font-bold text-purple-600 hover:text-purple-800">
                  Edit Profil
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setIsEditing(false)} className="text-xs font-medium text-gray-500">Batal</button>
                  <button onClick={handleUpdate} className="text-xs font-bold text-white bg-purple-600 px-3 py-1.5 rounded-lg hover:bg-purple-700">Simpan</button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Nama Lengkap</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={editForm.fullName || ''} 
                    onChange={e => setEditForm({...editForm, fullName: e.target.value})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">{customer.fullName}</p>
                )}
              </div>
              
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Nomor HP</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={editForm.phone || ''} 
                    onChange={e => setEditForm({...editForm, phone: e.target.value})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">{customer.phone}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Nomor Member</label>
                {isEditing ? (
                  <input 
                    type="text" 
                    value={editForm.memberNo || ''} 
                    onChange={e => setEditForm({...editForm, memberNo: e.target.value})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                  />
                ) : (
                  <p className="font-semibold text-gray-900">{customer.memberNo}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-500 uppercase">Status Akun</label>
                {isEditing ? (
                  <select 
                    value={editForm.status || 'unclaimed'} 
                    onChange={e => setEditForm({...editForm, status: e.target.value as "active" | "unclaimed" | "blocked"})}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                  >
                    <option value="active">Aktif</option>
                    <option value="unclaimed">Belum Klaim</option>
                    <option value="blocked">Diblokir</option>
                  </select>
                ) : (
                  <p className="font-semibold text-gray-900 capitalize">{customer.status}</p>
                )}
              </div>
            </div>

            {/* Metrics */}
            <div className="pt-2 grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Total Belanja</p>
                <p className="text-xl font-bold text-gray-900">{formatIDR(customer.totalSpent)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1">Jumlah Transaksi</p>
                <p className="text-xl font-bold text-gray-900">{customer.purchaseCount}x</p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button 
                onClick={handleDelete}
                className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3.5 py-2 rounded-xl transition-colors"
              >
                Hapus Customer
              </button>
            </div>
          </div>

          {/* Admin Notification Dispatch Card */}
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Kirim Pesan Resmi ke Wardah Passport</h3>
                <p className="text-xs text-gray-500">Kirim notifikasi individual dari Manajemen/Admin ke customer ini.</p>
              </div>
            </div>

            {/* Quick Templates */}
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-2 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Pilih Format Pesan Cepat:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {ADMIN_NOTIF_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setNotifTitle(tmpl.title);
                      setNotifMessage(tmpl.message);
                      setNotifType(tmpl.type);
                      setNotifActionUrl(tmpl.actionUrl);
                    }}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                      notifTitle === tmpl.title
                        ? 'border-purple-600 bg-purple-50/60 font-semibold text-purple-800'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    <p className="font-bold line-clamp-1">{tmpl.title.split(' ')[0]} {tmpl.title.split(' ')[1]}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{tmpl.title}</p>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSendAdminNotif} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Judul Notifikasi</label>
                  <input
                    type="text"
                    required
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Kategori Pesan</label>
                  <select
                    value={notifType}
                    onChange={(e) => setNotifType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none bg-white"
                  >
                    <option value="admin_broadcast">Pengumuman Resmi Admin</option>
                    <option value="reward">Pemberian Reward / Poin</option>
                    <option value="promo">Promo & Voucher Eksklusif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Isi Pesan Notifikasi</label>
                <textarea
                  required
                  rows={3}
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-200 outline-none"
                  placeholder="Tulis pesan pengumuman atau informasi untuk customer..."
                />
              </div>

              {notifStatus && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    notifStatus.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {notifStatus.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{notifStatus.text}</span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={isSendingNotif}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  {isSendingNotif ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Kirim Pesan ke Customer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Password Reset & Quick Info */}
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-2">Bantuan Sandi Customer</h3>
            <p className="text-xs text-gray-500 mb-5">
              Jika customer lupa password, Admin dapat membuatkan password sementara untuk akun mereka.
            </p>
            
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700">Password Baru</label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-purple-200 outline-none bg-white"
                  required
                  minLength={6}
                />
              </div>
              
              {resetMessage.text && (
                <div className={`p-3 rounded-xl text-xs font-medium ${resetMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                  {resetMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={isResetting}
                className="w-full bg-gray-900 text-white font-bold py-2.5 rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 text-xs"
              >
                {isResetting ? 'Menyimpan...' : 'Ubah Password'}
              </button>
            </form>
          </div>

          <div className="bg-purple-50/60 p-5 rounded-3xl border border-purple-100/80 text-purple-950 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-4 h-4 text-purple-700" />
              <span>Sistem Notifikasi Terintegrasi</span>
            </div>
            <p className="text-purple-800/80 leading-relaxed text-[11px]">
              Setiap pesan yang dikirim oleh Admin atau Beauty Advisor akan disinkronkan secara real-time ke aplikasi Wardah Beauty Passport pelanggan via Cloud Firestore.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
