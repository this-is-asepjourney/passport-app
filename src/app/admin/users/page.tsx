'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { auth, db } from '@/lib/firebase/client';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import Link from 'next/link';
import { resolveMediaUrl } from '@/lib/media';
import type { Store } from '@/types';
import {
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Store as StoreIcon,
  UserPlus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

interface UserListItem {
  uid: string;
  displayName?: string;
  name?: string;
  email?: string;
  photoUrl?: string;
  role?: string;
  storeId?: string;
  storeName?: string;
  phone?: string;
}

export default function AdminUsersPage() {
  const { user } = useAuth();

  const [usersList, setUsersList] = useState<UserListItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Selected User
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [targetUid, setTargetUid] = useState('');
  const [role, setRole] = useState<string>('ba');
  const [storeId, setStoreId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [showManualUid, setShowManualUid] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    setDataLoading(true);
    try {
      const [usersSnap, storesSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), limit(100))),
        getDocs(collection(db, 'stores')),
      ]);

      const storesData = storesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Store[];
      setStores(storesData);

      const storeMap = new Map<string, string>();
      storesData.forEach((s) => storeMap.set(s.id, s.name));

      const usersData: UserListItem[] = usersSnap.docs.map((d) => {
        const u = d.data();
        return {
          uid: d.id,
          displayName: u.displayName || u.name || 'Pengguna',
          name: u.name,
          email: u.email || '',
          role: u.role || 'customer',
          storeId: u.storeId,
          storeName: u.storeId ? storeMap.get(u.storeId) || u.storeName : undefined,
          phone: u.phone || u.phoneNumber || '',
        };
      });

      setUsersList(usersData);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin') {
      loadData();
    }
  }, [user]);

  const handleSelectUser = (u: UserListItem) => {
    setSelectedUser(u);
    setTargetUid(u.uid);
    setRole(u.role || 'ba');
    setStoreId(u.storeId || '');
    setMessage('');
    setError('');
  };

  const handleSetRole = async () => {
    if (!targetUid) {
      setError('Pilih pengguna dari daftar atau masukkan UID');
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const idToken = await auth.currentUser?.getIdToken();

      const res = await fetch('/api/admin/set-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUid,
          role,
          storeId: storeId || undefined,
          regionId: regionId || undefined,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setMessage(result.message || `Role ${role} berhasil diperbarui!`);
      loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah role');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return usersList;
    const q = search.toLowerCase();
    return usersList.filter(
      (u) =>
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [usersList, search]);

  if (user?.role !== 'super_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="text-center bg-white p-8 rounded-3xl shadow-sm border border-gray-100 max-w-sm">
          <p className="text-5xl mb-4">🔒</p>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Akses Terbatas</h2>
          <p className="text-xs text-gray-500">
            Hanya Super Admin yang dapat mengakses halaman pengelolaan role pengguna ini.
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-block px-5 py-2.5 bg-[#277A73] text-white text-xs font-bold rounded-xl shadow-xs"
          >
            ← Kembali ke Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="p-2 bg-white rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              ←
            </Link>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              Pengguna & Hak Akses Role
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-11">
            Pilih pengguna langsung dari daftar untuk mengubah role tanpa perlu mencari UID di Firebase Console.
          </p>
        </div>

        {/* Shortcut to dedicated BA Management */}
        <Link
          href="/admin/ba"
          className="px-5 py-3 bg-[#277A73] hover:bg-[#1E6560] text-white text-xs font-bold rounded-2xl shadow-lg shadow-[#277A73]/25 transition-all flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          <span>Kelola Beauty Advisor (BA) Lengkap ➔</span>
        </Link>
      </div>

      {/* Info Banner: Beauty Advisor Dedicated Flow */}
      <div className="p-4.5 rounded-3xl bg-gradient-to-r from-[#E2F0EF] to-white border border-[#6DB9B2]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#277A73] text-white flex items-center justify-center font-bold text-lg shrink-0">
            👩‍💼
          </div>
          <div>
            <h3 className="font-bold text-[#277A73] text-sm">
              Mau Mendaftarkan Beauty Advisor Baru?
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Gunakan menu <strong>Kelola Akses BA</strong> untuk membuat akun lengkap dengan email, password acak, dan penugasan counter Wardah dalam 1 klik.
            </p>
          </div>
        </div>
        <Link
          href="/admin/ba"
          className="self-start sm:self-center px-4 py-2 bg-white text-[#277A73] border border-[#277A73]/30 hover:bg-[#E2F0EF] text-xs font-bold rounded-xl transition-colors whitespace-nowrap shadow-2xs"
        >
          Buka Kelola BA ➔
        </Link>
      </div>

      {/* Main Grid: User List (Left) + Role Editor (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: User Directory Table (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, email, role, atau nomor HP..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
              />
            </div>
            <button
              type="button"
              onClick={loadData}
              className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
              title="Segarkan data pengguna"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[550px] divide-y divide-gray-50 flex-1">
            {dataLoading ? (
              <div className="py-16 text-center">
                <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#277A73] animate-spin mx-auto mb-2" />
                <p className="text-xs text-gray-400">Memuat data pengguna...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-xs">
                Tidak ada pengguna yang cocok dengan pencarian &quot;{search}&quot;.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUser?.uid === u.uid;
                return (
                  <div
                    key={u.uid}
                    onClick={() => handleSelectUser(u)}
                    className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[#E2F0EF]/60 border-l-4 border-[#277A73]'
                        : 'hover:bg-gray-50/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 overflow-hidden ${
                          u.role === 'super_admin'
                            ? 'bg-purple-100 text-purple-700'
                            : u.role === 'admin_region'
                            ? 'bg-blue-100 text-blue-700'
                            : u.role === 'ba'
                            ? 'bg-[#E2F0EF] text-[#277A73]'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {u.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={resolveMediaUrl(u.photoUrl)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          u.displayName?.charAt(0).toUpperCase() || 'U'
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 text-xs truncate">
                          {u.displayName}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{u.email || u.phone || '-'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          u.role === 'super_admin'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : u.role === 'admin_region'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : u.role === 'ba'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {u.role || 'customer'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Role & Permissions Form (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <div className="w-9 h-9 rounded-xl bg-[#E2F0EF] text-[#277A73] flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Atur Hak Akses Pengguna</h3>
              <p className="text-xs text-gray-500">Pilih role dan penugasan counter</p>
            </div>
          </div>

          {message && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Selected User Summary Banner */}
          {selectedUser ? (
            <div className="p-3.5 rounded-2xl bg-[#E2F0EF]/40 border border-[#6DB9B2]/30 text-xs space-y-1">
              <span className="text-[10px] font-bold text-[#277A73] uppercase tracking-wider block">
                Pengguna Terpilih:
              </span>
              <p className="font-bold text-gray-900 text-sm">{selectedUser.displayName}</p>
              <p className="text-gray-500 text-[11px] font-mono">{selectedUser.email}</p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              👈 <strong>Pilih pengguna</strong> dari daftar di sebelah kiri untuk mulai mengatur role tanpa perlu mengetikkan UID.
            </div>
          )}

          <div className="space-y-3.5">
            {/* Role Dropdown */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Pilih Role Akses <span className="text-rose-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#277A73]"
              >
                <option value="customer">customer (Pelanggan Biasa)</option>
                <option value="ba">ba (Beauty Advisor Counter Wardah)</option>
                <option value="admin_region">admin_region (Admin Regional / Supervisor)</option>
                <option value="super_admin">super_admin (Super Administrator)</option>
              </select>
            </div>

            {/* If Role is BA: Counter dropdown */}
            {role === 'ba' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Penugasan Counter Wardah
                </label>
                <select
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                >
                  <option value="">Pilih Counter...</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Optional Manual UID Toggle for Power Users */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowManualUid(!showManualUid)}
                className="text-[11px] text-gray-400 hover:text-gray-600 underline"
              >
                {showManualUid ? 'Sembunyikan Input Manual UID' : 'Mode Lanjutan: Masukkan UID Manual'}
              </button>

              {showManualUid && (
                <div className="mt-2">
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">UID Pengguna</label>
                  <input
                    type="text"
                    value={targetUid}
                    onChange={(e) => setTargetUid(e.target.value)}
                    placeholder="Firebase Auth UID"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                </div>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 leading-relaxed">
              ⚠️ Perubahan role tersimpan langsung ke Firebase Custom Claims. Pengguna akan mendapatkan hak akses baru pada saat sesi login berikutnya.
            </div>

            <button
              type="button"
              onClick={handleSetRole}
              disabled={loading || !targetUid}
              className="w-full py-3.5 rounded-2xl bg-[#277A73] hover:bg-[#1E6560] disabled:bg-gray-300 text-white font-bold text-xs shadow-md shadow-[#277A73]/25 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Perubahan...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Simpan Perubahan Role</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
