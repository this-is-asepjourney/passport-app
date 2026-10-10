'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import Link from 'next/link';
import { resolveMediaUrl } from '@/lib/media';
import { formatIDR } from '@/lib/utils';
import type { Purchase, Store } from '@/types';
import {
  UserPlus,
  Search,
  KeyRound,
  Pencil,
  Trash2,
  Store as StoreIcon,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  Power,
  Users,
  Award,
  TrendingUp,
} from 'lucide-react';

interface BaAccount {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  photoUrl?: string;
  employeeCode: string;
  storeId: string;
  storeName: string;
  storeCity?: string;
  isActive: boolean;
  orders: number;
  sales: number;
  createdAt?: string;
}

type PeriodFilter = 'today' | '7days' | 'month' | '30days' | 'all';

export default function AdminBaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'accounts' | 'performance'>('accounts');

  // Core data states
  const [baList, setBaList] = useState<BaAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [rawPurchases, setRawPurchases] = useState<Purchase[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [period, setPeriod] = useState<PeriodFilter>('month');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string;
    email: string;
    password: string;
    employeeCode: string;
    storeName: string;
    phone: string;
  } | null>(null);

  const [editingBa, setEditingBa] = useState<BaAccount | null>(null);
  const [resetPasswordBa, setResetPasswordBa] = useState<BaAccount | null>(null);
  const [deletingBa, setDeletingBa] = useState<BaAccount | null>(null);

  // Form states - Create
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createStoreId, setCreateStoreId] = useState('');
  const [createIsActive, setCreateIsActive] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Form states - Edit
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editStoreId, setEditStoreId] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  // Form states - Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Action statuses
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();

      // Ambil data BA via backend API yang menggabungkan Firebase Auth & Firestore
      const [baRes, storesSnap, purchasesSnap] = await Promise.all([
        fetch('/api/admin/ba', {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'purchases')),
      ]);

      const storesData = storesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Store[];
      setStores(storesData);

      const purchasesData = purchasesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        purchasedAt: d.data().purchasedAt?.toDate?.()?.toISOString() ?? d.data().purchasedAt,
      })) as Purchase[];
      setRawPurchases(purchasesData);

      if (baRes.ok) {
        const baJson = await baRes.json();
        const baseBas = (baJson.bas || []) as BaAccount[];

        // Hitung transaksi per BA
        const storeMap = new Map<string, string>();
        storesData.forEach((s) => storeMap.set(s.id, s.name));

        const aggMap = new Map<string, { orders: number; sales: number }>();
        purchasesData.forEach((p) => {
          if (!p.baId || p.status !== 'valid') return;
          const curr = aggMap.get(p.baId) || { orders: 0, sales: 0 };
          curr.orders += 1;
          curr.sales += p.totalAmount || 0;
          aggMap.set(p.baId, curr);
        });

        const fullBas: BaAccount[] = baseBas.map((ba) => {
          const agg = aggMap.get(ba.uid) || { orders: 0, sales: 0 };
          return {
            ...ba,
            storeName: ba.storeId ? storeMap.get(ba.storeId) || ba.storeName || 'Counter Wardah' : 'Counter Wardah',
            orders: agg.orders,
            sales: agg.sales,
          };
        });

        setBaList(fullBas);
      }
    } catch (err: any) {
      console.error('Error loading BA data:', err);
      showToast('error', 'Gagal memuat data Beauty Advisor');
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user && !['admin_region', 'super_admin'].includes(user.role ?? '')) {
      router.replace('/');
      return;
    }
    if (!loading && user) {
      loadData();
    }
  }, [user, loading, router, loadData]);

  // Generate random strong password
  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
    let res = '';
    for (let i = 0; i < 10; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  // Open Create Modal with auto-suggestions
  const handleOpenCreateModal = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePassword(generateRandomPassword());
    setCreatePhone('');
    setCreateCode(`WRD-BA-${Date.now().toString().slice(-4)}`);
    setCreateStoreId(stores[0]?.id || '');
    setCreateIsActive(true);
    setActionError('');
    setIsCreateOpen(true);
  };

  // Submit Create BA
  const handleCreateBa = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError('');

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/ba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fullName: createName,
          email: createEmail,
          password: createPassword,
          phone: createPhone,
          employeeCode: createCode,
          storeId: createStoreId,
          isActive: createIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat akun Beauty Advisor');

      setIsCreateOpen(false);
      setCreatedCredentials({
        fullName: createName,
        email: createEmail,
        password: createPassword,
        employeeCode: createCode,
        storeName: stores.find((s) => s.id === createStoreId)?.name || 'Counter Wardah',
        phone: createPhone,
      });

      showToast('success', `Akun Beauty Advisor ${createName} berhasil didaftarkan!`);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Gagal membuat akun Beauty Advisor');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (ba: BaAccount) => {
    setEditingBa(ba);
    setEditName(ba.fullName);
    setEditPhone(ba.phone || '');
    setEditCode(ba.employeeCode || '');
    setEditStoreId(ba.storeId || stores[0]?.id || '');
    setEditIsActive(ba.isActive !== false);
    setActionError('');
  };

  // Submit Edit BA
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBa) return;
    setActionLoading(true);
    setActionError('');

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/ba/${editingBa.uid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fullName: editName,
          phone: editPhone,
          employeeCode: editCode,
          storeId: editStoreId,
          isActive: editIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui data BA');

      setEditingBa(null);
      showToast('success', 'Data Beauty Advisor berhasil diperbarui!');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Gagal memperbarui data BA');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Reset Password Modal
  const handleOpenResetPassword = (ba: BaAccount) => {
    setResetPasswordBa(ba);
    setNewPassword(generateRandomPassword());
    setActionError('');
  };

  // Submit Reset Password
  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordBa) return;
    setActionLoading(true);
    setActionError('');

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/ba/${resetPasswordBa.uid}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mereset password');

      const targetBa = resetPasswordBa;
      setResetPasswordBa(null);
      showToast('success', `Password ${targetBa.fullName} berhasil diperbarui!`);

      // Tampilkan credentials popup
      setCreatedCredentials({
        fullName: targetBa.fullName,
        email: targetBa.email,
        password: newPassword,
        employeeCode: targetBa.employeeCode,
        storeName: targetBa.storeName,
        phone: targetBa.phone,
      });
    } catch (err: any) {
      setActionError(err.message || 'Gagal mereset password');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Active Status
  const handleToggleStatus = async (ba: BaAccount) => {
    try {
      const nextStatus = !ba.isActive;
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/ba/${ba.uid}/toggle-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ isActive: nextStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah status');

      showToast(
        'success',
        `Akun ${ba.fullName} berhasil ${nextStatus ? 'diaktifkan' : 'dinonaktifkan'}!`
      );
      loadData();
    } catch (err: any) {
      showToast('error', err.message || 'Gagal mengubah status akun');
    }
  };

  // Delete BA
  const handleDeleteBa = async () => {
    if (!deletingBa) return;
    setActionLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/admin/ba/${deletingBa.uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus BA');

      showToast('success', `Akun ${deletingBa.fullName} berhasil dihapus dari sistem!`);
      setDeletingBa(null);
      loadData();
    } catch (err: any) {
      showToast('error', err.message || 'Gagal menghapus akun BA');
    } finally {
      setActionLoading(false);
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Filtered BA list for Accounts Tab
  const filteredBas = useMemo(() => {
    return baList.filter((ba) => {
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = ba.fullName.toLowerCase().includes(q);
        const matchesEmail = ba.email.toLowerCase().includes(q);
        const matchesPhone = (ba.phone || '').toLowerCase().includes(q);
        const matchesCode = (ba.employeeCode || '').toLowerCase().includes(q);
        const matchesStore = ba.storeName.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesCode && !matchesStore) {
          return false;
        }
      }

      // Store filter
      if (storeFilter !== 'all' && ba.storeId !== storeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'active' && !ba.isActive) return false;
      if (statusFilter === 'inactive' && ba.isActive) return false;

      return true;
    });
  }, [baList, search, storeFilter, statusFilter]);

  // Compute Performance ranking list based on selected Period
  const performanceList = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    // Filter purchases by period
    const filteredPurchases = rawPurchases.filter((p) => {
      if (p.status !== 'valid') return false;
      const pTime = new Date(p.purchasedAt).getTime();
      const pDate = new Date(p.purchasedAt);

      if (period === 'today') return pTime >= todayStart;
      if (period === '7days') return pTime >= sevenDaysAgo;
      if (period === '30days') return pTime >= thirtyDaysAgo;
      if (period === 'month')
        return pDate.getMonth() === now.getMonth() && pDate.getFullYear() === now.getFullYear();
      return true;
    });

    const aggMap = new Map<string, { orders: number; sales: number }>();
    filteredPurchases.forEach((p) => {
      if (!p.baId) return;
      const curr = aggMap.get(p.baId) || { orders: 0, sales: 0 };
      curr.orders += 1;
      curr.sales += p.totalAmount || 0;
      aggMap.set(p.baId, curr);
    });

    const entries = baList.map((ba) => {
      const agg = aggMap.get(ba.uid) || { orders: 0, sales: 0 };
      return {
        ...ba,
        orders: agg.orders,
        sales: agg.sales,
      };
    });

    entries.sort((a, b) => b.sales - a.sales);

    if (search.trim()) {
      const q = search.toLowerCase();
      return entries.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          e.storeName.toLowerCase().includes(q)
      );
    }

    return entries;
  }, [baList, rawPurchases, period, search]);

  const totalSales = performanceList.reduce((sum, b) => sum + b.sales, 0);
  const totalOrders = performanceList.reduce((sum, b) => sum + b.orders, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-bold animate-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Section */}
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
              Kelola Beauty Advisor & Akses
            </h1>
            <span className="text-xs font-bold bg-[#E2F0EF] text-[#277A73] px-3 py-1 rounded-full border border-[#6DB9B2]/30">
              {baList.length} BA Terdaftar
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 ml-11">
            Buat akun, atur penugasan counter Wardah, reset password, dan monitor performa tanpa perlu ke Firebase Console.
          </p>
        </div>

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="px-5 py-3 bg-[#277A73] hover:bg-[#1E6560] text-white text-xs font-bold rounded-2xl shadow-lg shadow-[#277A73]/25 transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Daftarkan Beauty Advisor Baru</span>
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'accounts'
              ? 'border-[#277A73] text-[#277A73]'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Manajemen Akun & Penugasan Counter ({baList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('performance')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'performance'
              ? 'border-[#277A73] text-[#277A73]'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Monitoring Performa Penjualan & Transaksi</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: ACCOUNTS & ACCESS MANAGEMENT                            */}
      {/* ============================================================== */}
      {activeTab === 'accounts' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white rounded-3xl p-4.5 border border-gray-100 shadow-xs">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Total BA</p>
              <h4 className="text-xl font-black text-gray-900 mt-1">{baList.length} Orang</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">Seluruh cabang Wardah</p>
            </div>

            <div className="bg-white rounded-3xl p-4.5 border border-gray-100 shadow-xs">
              <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Aktif Bertugas</p>
              <h4 className="text-xl font-black text-emerald-600 mt-1">
                {baList.filter((b) => b.isActive).length} Orang
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5">Memiliki akses aplikasi</p>
            </div>

            <div className="bg-white rounded-3xl p-4.5 border border-gray-100 shadow-xs">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Non-Aktif / Cuti</p>
              <h4 className="text-xl font-black text-gray-600 mt-1">
                {baList.filter((b) => !b.isActive).length} Orang
              </h4>
              <p className="text-[11px] text-gray-500 mt-0.5">Akses dinonaktifkan</p>
            </div>

            <div className="bg-white rounded-3xl p-4.5 border border-gray-100 shadow-xs">
              <p className="text-[11px] font-bold text-[#277A73] uppercase tracking-wider">Counter Tercover</p>
              <h4 className="text-xl font-black text-[#277A73] mt-1">{stores.length} Counter</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">Counter resmi terdaftar</p>
            </div>
          </div>

          {/* Table & Controls Card */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="w-full md:w-80 relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama, email, NIK, counter..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                {/* Store Filter */}
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                >
                  <option value="all">Semua Counter Wardah</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-xl text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                >
                  <option value="all">Semua Status</option>
                  <option value="active">Hanya Aktif</option>
                  <option value="inactive">Hanya Non-Aktif</option>
                </select>

                <button
                  type="button"
                  onClick={loadData}
                  className="p-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
                  title="Segarkan Data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* BA Accounts Table */}
            <div className="overflow-x-auto">
              {dataLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#277A73] animate-spin" />
                  <p className="text-xs text-gray-400 font-medium">Memuat data Beauty Advisor...</p>
                </div>
              ) : filteredBas.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3 text-2xl">
                    👩‍💼
                  </div>
                  <h4 className="font-bold text-gray-900 text-base">Tidak ada Beauty Advisor ditemukan</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                    Coba sesuaikan kata kunci pencarian atau daftarkan Beauty Advisor baru melalui tombol di atas.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenCreateModal}
                    className="mt-4 px-4 py-2 bg-[#277A73] text-white text-xs font-bold rounded-xl shadow-xs"
                  >
                    + Daftarkan BA Sekarang
                  </button>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="py-3 px-4">Beauty Advisor</th>
                      <th className="py-3 px-4">Kontak & Login</th>
                      <th className="py-3 px-4">Penugasan Counter</th>
                      <th className="py-3 px-4 text-center">Status Akun</th>
                      <th className="py-3 px-4 text-right">Aktivitas</th>
                      <th className="py-3 px-4 text-center">Aksi Manajemen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredBas.map((ba) => (
                      <tr key={ba.uid} className="hover:bg-gray-50/80 transition-colors">
                        {/* BA Name & Employee Code */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#277A73] to-[#1E6560] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0 overflow-hidden">
                              {ba.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={resolveMediaUrl(ba.photoUrl)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                ba.fullName.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-sm leading-tight">
                                {ba.fullName}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="bg-gray-100 text-gray-600 font-mono text-[10px] px-1.5 py-0.5 rounded border border-gray-200">
                                  {ba.employeeCode || 'WRD-BA'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Contact & Email */}
                        <td className="py-3.5 px-4 space-y-1">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-900 truncate max-w-[180px]">
                              {ba.email || '-'}
                            </span>
                          </div>
                          {ba.phone && (
                            <div className="flex items-center gap-1.5 text-gray-500 text-[11px]">
                              <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{ba.phone}</span>
                              <Link
                                href={`https://wa.me/${ba.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                className="text-[10px] text-emerald-600 hover:underline font-semibold ml-1"
                              >
                                Chat WA
                              </Link>
                            </div>
                          )}
                        </td>

                        {/* Store / Counter */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-start gap-1.5">
                            <StoreIcon className="w-4 h-4 text-[#277A73] shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-gray-900 text-xs">{ba.storeName}</p>
                              {ba.storeCity && (
                                <p className="text-[10px] text-gray-400 mt-0.5">{ba.storeCity}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Status Toggle & Badge */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(ba)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all shadow-2xs ${
                              ba.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                            }`}
                            title={ba.isActive ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                ba.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
                              }`}
                            />
                            <span>{ba.isActive ? 'Aktif' : 'Non-Aktif'}</span>
                          </button>
                        </td>

                        {/* Total Sales Activity */}
                        <td className="py-3.5 px-4 text-right">
                          <p className="font-extrabold text-[#277A73] text-xs">
                            {formatIDR(ba.sales)}
                          </p>
                          <p className="text-[10px] text-gray-400">{ba.orders} Penjualan</p>
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Edit BA Profile & Store */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(ba)}
                              className="p-1.5 rounded-xl bg-gray-50 hover:bg-[#E2F0EF] text-gray-600 hover:text-[#277A73] border border-gray-200 transition-colors"
                              title="Edit Profil & Pindah Counter"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Reset Password */}
                            <button
                              type="button"
                              onClick={() => handleOpenResetPassword(ba)}
                              className="p-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors"
                              title="Reset Password BA"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete BA */}
                            {user?.role === 'super_admin' && (
                              <button
                                type="button"
                                onClick={() => setDeletingBa(ba)}
                                className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors"
                                title="Hapus Akun BA"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: SALES & PERFORMANCE MONITORING                          */}
      {/* ============================================================== */}
      {activeTab === 'performance' && (
        <div className="space-y-5 animate-in fade-in-50 duration-200">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 font-medium">Beauty Advisor Aktif Bertugas</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {baList.filter((p) => p.isActive).length} / {baList.length} BA
              </h3>
              <p className="text-[11px] text-[#277A73] font-semibold mt-1">
                Tersedia di counter counter Wardah
              </p>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 font-medium">Total Transaksi ({period})</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">
                {totalOrders.toLocaleString('id-ID')}
              </h3>
              <p className="text-[11px] text-gray-400 mt-1">Transaksi penjualan terverifikasi</p>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-500 font-medium">Total Omset Penjualan BA</p>
              <h3 className="text-2xl font-bold text-[#277A73] mt-1">{formatIDR(totalSales)}</h3>
              <p className="text-[11px] text-gray-400 mt-1">Akumulasi sesuai periode terpilih</p>
            </div>
          </div>

          {/* Performance Table & Filters */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-50/40">
              {/* Period Filter */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                <span className="text-xs font-bold text-gray-500 mr-1">Periode:</span>
                {[
                  { id: 'today', label: 'Hari Ini' },
                  { id: '7days', label: '7 Hari' },
                  { id: 'month', label: 'Bulan Ini' },
                  { id: '30days', label: '30 Hari' },
                  { id: 'all', label: 'Semua' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id as PeriodFilter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                      period === p.id
                        ? 'bg-[#277A73] text-white shadow-sm'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="w-full sm:w-72">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama BA / kode / toko..."
                  className="w-full px-3.5 py-2 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              {dataLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#277A73] animate-spin" />
                </div>
              ) : performanceList.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  Belum ada data performa Beauty Advisor untuk periode ini.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/70 text-gray-500 uppercase tracking-wider text-[10px] font-bold">
                      <th className="py-3 px-4 w-12 text-center">Rank</th>
                      <th className="py-3 px-4">Nama Beauty Advisor</th>
                      <th className="py-3 px-4">Kode NIK</th>
                      <th className="py-3 px-4">Counter Penugasan</th>
                      <th className="py-3 px-4 text-center">Total Transaksi</th>
                      <th className="py-3 px-4 text-right">Total Omset Penjualan</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {performanceList.map((ba, idx) => (
                      <tr key={ba.uid} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-3 px-4 text-center font-bold">
                          {idx === 0 ? (
                            <span className="text-base" title="Top 1">🥇</span>
                          ) : idx === 1 ? (
                            <span className="text-base" title="Top 2">🥈</span>
                          ) : idx === 2 ? (
                            <span className="text-base" title="Top 3">🥉</span>
                          ) : (
                            <span className="text-gray-400">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {ba.fullName}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-gray-500">
                          {ba.employeeCode || '-'}
                        </td>
                        <td className="py-3 px-4 text-gray-700">{ba.storeName}</td>
                        <td className="py-3 px-4 text-center font-semibold text-gray-800">
                          {ba.orders.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-[#277A73]">
                          {formatIDR(ba.sales)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              ba.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {ba.isActive ? 'Aktif' : 'Non-Aktif'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 1: CREATE BEAUTY ADVISOR                                 */}
      {/* ============================================================== */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#E2F0EF] text-[#277A73] flex items-center justify-center font-bold">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-base">Daftarkan Beauty Advisor Baru</h3>
                  <p className="text-[11px] text-gray-500">
                    Akun login & akses counter akan langsung dibuat otomatis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateBa} className="p-6 overflow-y-auto space-y-4 flex-1">
              {actionError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Nama Lengkap */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Nama Lengkap BA <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => {
                    setCreateName(e.target.value);
                    if (!createEmail && e.target.value.trim()) {
                      const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '.');
                      setCreateEmail(`${slug}@wardah.id`);
                    }
                  }}
                  placeholder="Mis. Siti Rahmawati"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                />
              </div>

              {/* Email Akun Login */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Email Akun Login <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="siti.rahma@wardah.id"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Digunakan untuk masuk ke aplikasi Beauty Advisor
                </p>
              </div>

              {/* Password Akun */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700">
                    Password Akun <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCreatePassword(generateRandomPassword())}
                    className="text-[11px] font-bold text-[#277A73] hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Buat Acak
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* No Handphone & NIK BA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    No. WhatsApp / HP
                  </label>
                  <input
                    type="tel"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Kode NIK / ID BA
                  </label>
                  <input
                    type="text"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    placeholder="WRD-BA-001"
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                </div>
              </div>

              {/* Penugasan Counter */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Penugasan Counter Wardah <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={createStoreId}
                  onChange={(e) => setCreateStoreId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city}) · Kode: {s.code || s.id}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  Setiap transaksi yang dicatat BA ini akan otomatis dialokasikan ke counter ini
                </p>
              </div>

              {/* Status Switch */}
              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createIsActive}
                    onChange={(e) => setCreateIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-[#277A73] focus:ring-[#277A73]"
                  />
                  <span className="text-xs font-bold text-gray-800">
                    Aktifkan Akun Langsung (BA dapat langsung login)
                  </span>
                </label>
              </div>

              {/* Footer buttons */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#277A73] hover:bg-[#1E6560] text-white text-xs font-bold shadow-md shadow-[#277A73]/20 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Mendaftarkan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan & Buat Akun BA</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: CREDENTIALS SUCCESS POPUP (READY TO COPY/SEND TO BA)   */}
      {/* ============================================================== */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in zoom-in-95 duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl shadow-xs">
              🎉
            </div>

            <div>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
                Akun Berhasil Dibuat
              </span>
              <h3 className="text-lg font-black text-gray-900 mt-2">
                Kredensial Login Beauty Advisor
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Kirim data login berikut kepada Beauty Advisor agar dapat segera bertugas.
              </p>
            </div>

            {/* Credentials Card */}
            <div className="p-4 rounded-2xl bg-[#E2F0EF]/60 border border-[#6DB9B2]/30 space-y-2.5 text-left text-xs">
              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase">
                  Nama Lengkap
                </span>
                <span className="font-bold text-gray-900">{createdCredentials.fullName}</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">
                    Email Login
                  </span>
                  <span className="font-mono font-bold text-[#277A73]">
                    {createdCredentials.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdCredentials.email, 'email')}
                  className="p-1.5 text-gray-500 hover:text-[#277A73] transition-colors"
                  title="Salin Email"
                >
                  {copiedKey === 'email' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">
                    Password Akun
                  </span>
                  <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                    {createdCredentials.password}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdCredentials.password, 'pass')}
                  className="p-1.5 text-gray-500 hover:text-[#277A73] transition-colors"
                  title="Salin Password"
                >
                  {copiedKey === 'pass' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div>
                <span className="text-[10px] font-bold text-gray-400 block uppercase">
                  Counter Penugasan
                </span>
                <span className="font-semibold text-gray-700">
                  {createdCredentials.storeName}
                </span>
              </div>
            </div>

            {/* Quick Share Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const message = `Halo ${createdCredentials.fullName}!\n\nAkun Anda sebagai Beauty Advisor Wardah telah aktif.\nBerikut data login Anda:\n\n📧 Email: ${createdCredentials.email}\n🔑 Password: ${createdCredentials.password}\n🏢 Counter: ${createdCredentials.storeName}\n\nSilakan masuk di: ${window.location.origin}/login\n\nSelamat bertugas! 💙`;
                  copyToClipboard(message, 'all');
                }}
                className="w-full py-3 bg-[#277A73] hover:bg-[#1E6560] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-[#277A73]/20 transition-all"
              >
                {copiedKey === 'all' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>✓ Kredensial Berhasil Disalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Salin Seluruh Kredensial Login</span>
                  </>
                )}
              </button>

              {createdCredentials.phone && (
                <Link
                  href={`https://wa.me/${createdCredentials.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Halo ${createdCredentials.fullName}!\n\nAkun Anda sebagai Beauty Advisor Wardah telah aktif.\nBerikut data login Anda:\n\n📧 Email: ${createdCredentials.email}\n🔑 Password: ${createdCredentials.password}\n🏢 Counter: ${createdCredentials.storeName}\n\nSilakan masuk di: ${window.location.origin}/login\n\nSelamat bertugas! 💙`
                  )}`}
                  target="_blank"
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border border-emerald-200 transition-colors block"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Kirim Kredensial via WhatsApp</span>
                </Link>
              )}

              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="w-full py-2 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
              >
                Tutup Jendela Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: EDIT BA PROFILE & STORE REASSIGNMENT                   */}
      {/* ============================================================== */}
      {editingBa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center font-bold">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900 text-base">Edit Data Beauty Advisor</h3>
                  <p className="text-[11px] text-gray-500">{editingBa.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBa(null)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto space-y-4 flex-1">
              {actionError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    No. Handphone / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Kode NIK / ID BA
                  </label>
                  <input
                    type="text"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Penugasan Counter Wardah
                </label>
                <select
                  required
                  value={editStoreId}
                  onChange={(e) => setEditStoreId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-gray-200 rounded-xl text-gray-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                >
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="w-4 h-4 rounded text-[#277A73] focus:ring-[#277A73]"
                  />
                  <span className="text-xs font-bold text-gray-800">
                    Status Akun Aktif (BA dapat login dan input transaksi)
                  </span>
                </label>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingBa(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#277A73] hover:bg-[#1E6560] text-white text-xs font-bold shadow-md shadow-[#277A73]/20 disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: RESET PASSWORD                                        */}
      {/* ============================================================== */}
      {resetPasswordBa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-base">Reset Password Akun BA</h3>
                <p className="text-xs text-gray-500">{resetPasswordBa.fullName}</p>
              </div>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleSaveResetPassword} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700">Password Baru</label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    className="text-[11px] font-bold text-[#277A73] hover:underline flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Buat Acak
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs font-mono bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#277A73]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetPasswordBa(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || newPassword.length < 6}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/20 disabled:opacity-50"
                >
                  {actionLoading ? 'Menyimpan...' : 'Perbarui Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: DELETE CONFIRMATION                                   */}
      {/* ============================================================== */}
      {deletingBa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-2xl">
              🗑️
            </div>

            <div>
              <h3 className="font-black text-gray-900 text-base">Hapus Akun Beauty Advisor?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Apakah Anda yakin ingin menghapus akun <span className="font-bold text-gray-900">{deletingBa.fullName}</span>?
                Akses login ke sistem akan dicabut secara permanen.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingBa(null)}
                className="w-1/2 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleDeleteBa}
                className="w-1/2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/25 disabled:opacity-50"
              >
                {actionLoading ? 'Menghapus...' : 'Ya, Hapus Akun'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
