'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { formatIDR } from '@/lib/utils';
import Link from 'next/link';

interface RegionReport {
  id: string;
  name: string;
  storeCount: number;
  baCount: number;
  customerCount: number;
  totalSales: number;
  totalTransactions: number;
}

export default function RegionalReportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<RegionReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<'all' | 'month' | '30days'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'customers' | 'stores' | 'ba'>('sales');

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user && !['admin_region', 'super_admin'].includes(user.role ?? '')) {
      router.replace('/');
      return;
    }
    if (user) {
      loadData();
    }
  }, [user, loading, router, periodFilter]);

  const loadData = async () => {
    setDataLoading(true);
    try {
      // Fetch all collections in parallel for zero delay and maximum speed
      const [regionsSnap, storesSnap, baSnap, custSnap, purchSnap] = await Promise.all([
        getDocs(collection(db, 'regions')),
        getDocs(collection(db, 'stores')),
        getDocs(collection(db, 'baProfiles')),
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'purchases')),
      ]);

      const regions = regionsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));

      const stores = storesSnap.docs.map(doc => ({
        id: doc.id,
        regionId: doc.data().regionId as string,
        name: doc.data().name as string,
      }));

      // Store-to-Region lookup map
      const storeRegionMap = new Map<string, string>();
      stores.forEach(s => {
        if (s.regionId) storeRegionMap.set(s.id, s.regionId);
      });

      const baList = baSnap.docs.map(doc => ({
        id: doc.id,
        storeId: doc.data().storeId as string,
        regionId: doc.data().regionId as string | undefined,
      }));

      const custList = custSnap.docs.map(doc => ({
        id: doc.id,
        regionId: doc.data().regionId as string | undefined,
        registeredStoreId: doc.data().registeredStoreId as string | undefined,
        createdAt: doc.data().createdAt?.toDate?.()?.toISOString() ?? (typeof doc.data().createdAt === 'string' ? doc.data().createdAt : undefined),
      }));

      const purchList = purchSnap.docs.map(doc => ({
        id: doc.id,
        customerId: doc.data().customerId as string | undefined,
        regionId: doc.data().regionId as string | undefined,
        storeId: doc.data().storeId as string | undefined,
        totalAmount: (doc.data().totalAmount as number) || 0,
        status: doc.data().status as string,
        purchasedAt: doc.data().purchasedAt?.toDate?.()?.toISOString() ?? doc.data().purchasedAt,
      }));


      // Date filtering helper
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const isDateValid = (dateStr?: string) => {
        if (!dateStr || periodFilter === 'all') return true;
        const d = new Date(dateStr);
        if (periodFilter === '30days') return d >= thirtyDaysAgo;
        if (periodFilter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        return true;
      };

      // Filtered purchases & customers based on period
      const validPurchases = purchList.filter(p => p.status === 'valid' && isDateValid(p.purchasedAt));
      const filteredCustomers = custList.filter(c => isDateValid(c.createdAt));

      // Build the aggregated report array
      const reportData: RegionReport[] = regions.map(r => {
        const regionStores = stores.filter(s => s.regionId === r.id);
        const storeCount = regionStores.length;
        const storeIdSet = new Set(regionStores.map(s => s.id));

        // Count BAs whose store or profile matches this region
        const regionBaCount = baList.filter(ba => {
          if (ba.regionId === r.id) return true;
          if (ba.storeId && storeIdSet.has(ba.storeId)) return true;
          return false;
        }).length;

        // Sum Sales for this region
        const regionPurchases = validPurchases.filter(p => {
          if (p.regionId === r.id) return true;
          if (p.storeId && storeIdSet.has(p.storeId)) return true;
          return false;
        });

        // Count Customers whose regionId matches, registered in region store, or bought in region store
        const regionCustIdSet = new Set(regionPurchases.map(p => p.customerId).filter(Boolean));
        const regionCustomerCount = filteredCustomers.filter(c => {
          if (c.regionId === r.id) return true;
          if (c.registeredStoreId && storeIdSet.has(c.registeredStoreId)) return true;
          if (regionCustIdSet.has(c.id)) return true;
          return false;
        }).length;

        const totalSales = regionPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
        const totalTransactions = regionPurchases.length;

        return {
          id: r.id,
          name: r.name,
          storeCount,
          baCount: regionBaCount,
          customerCount: regionCustomerCount,
          totalSales,
          totalTransactions,
        };
      });

      setReports(reportData);
    } catch (err) {
      console.error('Failed to load regional report data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  // Sorted reports
  const sortedReports = useMemo(() => {
    const list = [...reports];
    list.sort((a, b) => {
      if (sortBy === 'sales') return b.totalSales - a.totalSales;
      if (sortBy === 'customers') return b.customerCount - a.customerCount;
      if (sortBy === 'stores') return b.storeCount - a.storeCount;
      if (sortBy === 'ba') return b.baCount - a.baCount;
      return 0;
    });
    return list;
  }, [reports, sortBy]);

  // Export to CSV
  const handleDownloadCSV = () => {
    if (sortedReports.length === 0) return;

    const headers = ['Region ID', 'Nama Wilayah', 'Jumlah Toko', 'Jumlah BA', 'Total Customer', 'Jumlah Transaksi', 'Total Penjualan (IDR)'];
    const rows = sortedReports.map(r => [
      `"${r.id}"`,
      `"${r.name}"`,
      r.storeCount,
      r.baCount,
      r.customerCount,
      r.totalTransactions,
      r.totalSales,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `laporan-regional-wardah-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalNationalSales = sortedReports.reduce((sum, r) => sum + r.totalSales, 0);
  const totalNationalStores = sortedReports.reduce((sum, r) => sum + r.storeCount, 0);
  const totalNationalCustomers = sortedReports.reduce((sum, r) => sum + r.customerCount, 0);
  const totalNationalBAs = sortedReports.reduce((sum, r) => sum + r.baCount, 0);

  if (loading || dataLoading) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#E2F0EF] border-t-[#2C5C59] animate-spin" />
          <p className="text-xs text-gray-500 font-medium">Mengagregasi data regional...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Regional Report</h1>
          <p className="text-sm text-gray-500 mt-1">Laporan performa penjualan dan pelanggan per wilayah (Region).</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Period Filter Dropdown */}
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            className="text-sm font-semibold text-gray-700 bg-white border border-gray-200 px-4 py-2.5 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#6DB9B2]"
          >
            <option value="all">📅 Semua Waktu</option>
            <option value="month">📅 Bulan Ini</option>
            <option value="30days">📅 30 Hari Terakhir</option>
          </select>

          {/* Download CSV Button */}
          <button
            onClick={handleDownloadCSV}
            className="text-sm font-bold text-white bg-[#2C5C59] px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-[#1f4240] transition-colors shadow-lg shadow-[#6DB9B2]/20"
          >
            📥 Unduh Laporan (CSV)
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-gray-500 font-medium">Top Region (Sales)</p>
          <h3 className="text-2xl font-bold text-[#2C5C59] mt-1">{sortedReports[0]?.name || '-'}</h3>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {totalNationalSales > 0 ? Math.round(((sortedReports[0]?.totalSales || 0) / totalNationalSales) * 100) : 0}% dari total omset nasional
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-gray-500 font-medium">Total Wilayah Aktif</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            {sortedReports.length} <span className="text-sm font-normal text-gray-500">Region</span>
          </h3>
          <p className="text-[11px] text-[#2C5C59] font-semibold mt-1.5">
            {totalNationalBAs} BA terdistribusi
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-gray-500 font-medium">Total Toko Nasional</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">
            {totalNationalStores} <span className="text-sm font-normal text-gray-500">Toko</span>
          </h3>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {totalNationalCustomers.toLocaleString('id-ID')} Total Customer
          </p>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col justify-center">
          <p className="text-xs text-gray-500 font-medium">Total Penjualan Nasional</p>
          <h3 className="text-2xl font-bold text-[#2C5C59] mt-1">
            {formatIDR(totalNationalSales)}
          </h3>
          <p className="text-[11px] text-gray-400 mt-1.5">
            {sortedReports.reduce((s, r) => s + r.totalTransactions, 0)} Total Transaksi
          </p>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-600">Urutkan Berdasarkan:</span>
            <div className="flex gap-1">
              {[
                { id: 'sales', label: 'Penjualan' },
                { id: 'customers', label: 'Customer' },
                { id: 'stores', label: 'Toko' },
                { id: 'ba', label: 'BA' },
              ].map(btn => (
                <button
                  key={btn.id}
                  onClick={() => setSortBy(btn.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    sortBy === btn.id
                      ? 'bg-[#2C5C59] text-white shadow-sm'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-gray-500 font-medium">
            Menampilkan {sortedReports.length} Region
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Region</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Jml Toko</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Jml BA</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Transaksi</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total Penjualan</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Belum ada data region terdaftar.
                  </td>
                </tr>
              ) : (
                sortedReports.map((r, index) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'bg-[#E2F0EF] text-[#2C5C59]' : 'bg-gray-100 text-gray-600'}`}>
                          {index + 1}
                        </div>
                        <div>
                          <span className="font-bold text-gray-900 block">{r.name}</span>
                          <span className="text-[10px] text-gray-400">ID: {r.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-600">{r.storeCount}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-600">{r.baCount}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-600">{r.customerCount.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-600">{r.totalTransactions.toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4 text-right font-bold text-[#2C5C59]">{formatIDR(r.totalSales)}</td>
                    <td className="px-6 py-4 text-center">
                      <Link 
                        href={`/admin/regions/${r.id}`} 
                        className="inline-block px-3 py-1 bg-[#E2F0EF] text-[#2C5C59] rounded-lg text-xs font-bold hover:bg-[#6DB9B2] hover:text-white transition-colors"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
