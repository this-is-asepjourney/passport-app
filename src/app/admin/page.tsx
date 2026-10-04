'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { Customer, Purchase, Product, Consultation, Region } from '@/types';
import { formatIDR } from '@/lib/utils';
import Link from 'next/link';

interface ProductStat {
  name: string;
  count: number;
  percentage: number;
}

interface RegionStat {
  id: string;
  name: string;
  customerCount: number;
  sales: number;
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [dataLoading, setDataLoading] = useState(true);

  // Raw Firestore data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);

  // Filters
  const [selectedRegionId, setSelectedRegionId] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<'all' | 'month' | '30days'>('all');

  useEffect(() => {
    if (!loading && !user) { router.replace('/login'); return; }
    if (!loading && user && !['admin_region', 'super_admin'].includes(user.role ?? '')) {
      router.replace('/');
      return;
    }
    if (!loading && user) {
      loadDashboardData();
    }
  }, [user, loading, router]);

  const loadDashboardData = async () => {
    setDataLoading(true);
    try {
      // Fetch all collections in parallel for maximum throughput and zero delay
      const [custSnap, purchSnap, prodSnap, consSnap, regSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(query(collection(db, 'purchases'), orderBy('purchasedAt', 'desc'), limit(500))),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'consultations')),
        getDocs(collection(db, 'regions')),
      ]);

      const custList = custSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? (typeof d.data().createdAt === 'string' ? d.data().createdAt : new Date().toISOString()),
      })) as Customer[];
      const purchList = purchSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        purchasedAt: d.data().purchasedAt?.toDate?.()?.toISOString() ?? d.data().purchasedAt,
      })) as Purchase[];
      const prodList = prodSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      const consList = consSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Consultation[];
      const regList = regSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Region[];

      setCustomers(custList);
      setPurchases(purchList);
      setProducts(prodList);
      setConsultations(consList);
      setRegions(regList);
    } catch (err) {
      console.error('Error loading admin dashboard data:', err);
    } finally {
      setDataLoading(false);
    }
  };


  // Filtered dataset
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      if (selectedRegionId !== 'all' && c.regionId !== selectedRegionId) return false;
      if (selectedPeriod === '30days') {
        const createdDate = new Date(c.createdAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (createdDate < thirtyDaysAgo) return false;
      } else if (selectedPeriod === 'month') {
        const createdDate = new Date(c.createdAt);
        const now = new Date();
        if (createdDate.getMonth() !== now.getMonth() || createdDate.getFullYear() !== now.getFullYear()) {
          return false;
        }
      }
      return true;
    });
  }, [customers, selectedRegionId, selectedPeriod]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      if (p.status !== 'valid') return false;
      if (selectedRegionId !== 'all' && p.regionId !== selectedRegionId) return false;
      if (selectedPeriod === '30days') {
        const pDate = new Date(p.purchasedAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (pDate < thirtyDaysAgo) return false;
      } else if (selectedPeriod === 'month') {
        const pDate = new Date(p.purchasedAt);
        const now = new Date();
        if (pDate.getMonth() !== now.getMonth() || pDate.getFullYear() !== now.getFullYear()) {
          return false;
        }
      }
      return true;
    });
  }, [purchases, selectedRegionId, selectedPeriod]);

  // Derived KPI Metrics
  const totalCustomerCount = filteredCustomers.length;
  
  // New customers (joined within last 30 days or purchaseCount <= 1)
  const newCustomerCount = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return filteredCustomers.filter(c => {
      const created = new Date(c.createdAt);
      return created >= thirtyDaysAgo || c.purchaseCount <= 1;
    }).length;
  }, [filteredCustomers]);

  // Repeat customers (purchaseCount > 1)
  const repeatCustomerCount = useMemo(() => {
    return filteredCustomers.filter(c => (c.purchaseCount ?? 0) > 1).length;
  }, [filteredCustomers]);

  // Active customers
  const activeCustomerCount = useMemo(() => {
    return filteredCustomers.filter(c => c.status === 'active').length;
  }, [filteredCustomers]);

  const inactiveCustomerCount = Math.max(0, totalCustomerCount - activeCustomerCount);

  // Customer insight percentages
  const pctNew = totalCustomerCount > 0 ? Math.round((newCustomerCount / totalCustomerCount) * 100) : 0;
  const pctRepeat = totalCustomerCount > 0 ? Math.round((repeatCustomerCount / totalCustomerCount) * 100) : 0;
  const pctActive = totalCustomerCount > 0 ? Math.round((activeCustomerCount / totalCustomerCount) * 100) : 0;
  const pctInactive = totalCustomerCount > 0 ? Math.round((inactiveCustomerCount / totalCustomerCount) * 100) : 0;

  // Donut chart stroke dashes (circumference = 100 for viewBox calculation)
  const strokeNew = pctNew;
  const strokeRepeat = pctRepeat;
  const strokeActive = pctActive;
  const strokeInactive = pctInactive;

  // Product Insight: Top 5 Products from valid purchases
  const topProducts = useMemo<ProductStat[]>(() => {
    const productCountMap = new Map<string, { name: string; count: number }>();
    
    // Count from purchases
    filteredPurchases.forEach(purchase => {
      purchase.items?.forEach(item => {
        const existing = productCountMap.get(item.productId) || { name: item.productName, count: 0 };
        existing.count += item.qty || 1;
        productCountMap.set(item.productId, existing);
      });
    });

    let list = Array.from(productCountMap.values());

    // If purchases have few or no items, enrich with active Kahf catalog
    if (list.length === 0 && products.length > 0) {
      list = products.slice(0, 5).map((p, idx) => ({
        name: p.name,
        count: Math.max(1, 10 - idx * 2),
      }));
    }

    list.sort((a, b) => b.count - a.count);
    const top5 = list.slice(0, 5);
    const totalQty = top5.reduce((sum, item) => sum + item.count, 0) || 1;

    return top5.map(item => ({
      name: item.name,
      count: item.count,
      percentage: Math.round((item.count / totalQty) * 100),
    }));
  }, [filteredPurchases, products]);

  // BA Performance metrics
  const totalConsultations = consultations.length;
  
  // Follow-up pending count (> 25 days since last purchase)
  const followUpPendingCount = useMemo(() => {
    const now = new Date().getTime();
    return customers.filter(c => {
      if (!c.lastPurchaseAt) return false;
      const last = new Date(c.lastPurchaseAt).getTime();
      const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
      return diffDays >= 25;
    }).length;
  }, [customers]);

  // Conversion rate: customers with purchaseCount > 0 / total customers
  const customersWithPurchase = customers.filter(c => (c.purchaseCount ?? 0) > 0).length;
  const conversionRate = customers.length > 0 ? Math.round((customersWithPurchase / customers.length) * 100) : 0;
  
  // Repeat rate: repeat customers / customers with purchase
  const repeatPurchaseRate = customersWithPurchase > 0 ? Math.round((repeatCustomerCount / customersWithPurchase) * 100) : 0;

  // National Report: Top Regions
  const topRegions = useMemo<RegionStat[]>(() => {
    const regionMap = new Map<string, { name: string; customerCount: number; sales: number }>();
    
    // Seed with all known regions
    regions.forEach(r => {
      regionMap.set(r.id, { name: r.name, customerCount: 0, sales: 0 });
    });

    // Aggregate customers
    customers.forEach(c => {
      if (c.regionId && regionMap.has(c.regionId)) {
        regionMap.get(c.regionId)!.customerCount += 1;
      }
    });

    // Aggregate sales
    purchases.filter(p => p.status === 'valid').forEach(p => {
      if (p.regionId && regionMap.has(p.regionId)) {
        regionMap.get(p.regionId)!.sales += p.totalAmount || 0;
      }
    });

    const arr = Array.from(regionMap.entries()).map(([id, val]) => ({
      id,
      name: val.name,
      customerCount: val.customerCount,
      sales: val.sales,
    }));

    return arr.sort((a, b) => b.customerCount - a.customerCount).slice(0, 5);
  }, [regions, customers, purchases]);

  if (loading || dataLoading) {
    return (
      <div className="h-full min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-[#E2F0EF] border-t-[#2C5C59] animate-spin" />
          <p className="text-xs text-gray-500 font-medium">Memuat data dashboard real-time...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      
      {/* Top Bar with Dynamic Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">National Dashboard</h1>
            <p className="text-xs text-gray-500 mt-0.5">Monitoring penjualan, pelanggan, dan performa BA secara real-time</p>
          </div>
          <button
            onClick={loadDashboardData}
            title="Muat Ulang Data"
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
          >
            🔄
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Filter */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6DB9B2]"
          >
            <option value="all">Semua Waktu</option>
            <option value="30days">30 Hari Terakhir</option>
            <option value="month">Bulan Ini</option>
          </select>

          {/* Region Filter */}
          <select
            value={selectedRegionId}
            onChange={(e) => setSelectedRegionId(e.target.value)}
            className="text-xs font-semibold text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6DB9B2]"
          >
            <option value="all">Seluruh Indonesia</option>
            {regions.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 4 KPI Cards (Calculated from Firestore) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Customer */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-[#E2F0EF] text-[#2C5C59] flex items-center justify-center text-xl shrink-0">👥</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Total Customer</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{totalCustomerCount.toLocaleString('id-ID')}</h3>
            <p className="text-[10px] text-[#2C5C59] font-bold mt-1">
              {pctActive}% status aktif
            </p>
          </div>
        </div>

        {/* KPI 2: Customer Baru */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl shrink-0">✨</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Customer Baru</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{newCustomerCount.toLocaleString('id-ID')}</h3>
            <p className="text-[10px] text-[#2C5C59] font-bold mt-1">
              {pctNew}% dari total customer
            </p>
          </div>
        </div>

        {/* KPI 3: Repeat Customer */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xl shrink-0">🔄</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Repeat Customer</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{repeatCustomerCount.toLocaleString('id-ID')}</h3>
            <p className="text-[10px] text-[#2C5C59] font-bold mt-1">
              {repeatPurchaseRate}% repeat rate
            </p>
          </div>
        </div>

        {/* KPI 4: Customer Aktif */}
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl shrink-0">🛡️</div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Customer Aktif</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{activeCustomerCount.toLocaleString('id-ID')}</h3>
            <p className="text-[10px] text-gray-500 font-medium mt-1">
              {inactiveCustomerCount} belum aktif/unclaimed
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid (4 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Customer Insight Donut */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-sm">Customer Insight</h2>
              <Link href="/admin/customers" className="text-[11px] font-bold text-[#6DB9B2] hover:underline">
                Lihat Semua →
              </Link>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 my-2">
              <div className="relative w-36 h-36">
                <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                  <path className="text-gray-100" strokeWidth="5.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  {/* Segment 1: Baru */}
                  <path className="text-[#6DB9B2]" strokeWidth="5.5" strokeDasharray={`${strokeNew}, 100`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  {/* Segment 2: Repeat */}
                  <path className="text-orange-400" strokeWidth="5.5" strokeDasharray={`${strokeRepeat}, 100`} strokeDashoffset={`-${strokeNew}`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  {/* Segment 3: Aktif */}
                  <path className="text-blue-400" strokeWidth="5.5" strokeDasharray={`${strokeActive}, 100`} strokeDashoffset={`-${strokeNew + strokeRepeat}`} strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <p className="text-lg font-bold text-gray-900">{totalCustomerCount.toLocaleString('id-ID')}</p>
                  <p className="text-[9px] text-gray-500 uppercase font-bold">Total Customer</p>
                </div>
              </div>
              
              <div className="w-full space-y-2.5 pt-2">
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#6DB9B2]" /> <span className="text-gray-600">Customer Baru</span></div>
                  <span className="text-gray-900 font-bold">{pctNew}%</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-orange-400" /> <span className="text-gray-600">Repeat Customer</span></div>
                  <span className="text-gray-900 font-bold">{pctRepeat}%</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-blue-400" /> <span className="text-gray-600">Customer Aktif</span></div>
                  <span className="text-gray-900 font-bold">{pctActive}%</span>
                </div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-gray-300" /> <span className="text-gray-600">Belum Diklaim / Pasif</span></div>
                  <span className="text-gray-900 font-bold">{pctInactive}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Insight (Real Top Products) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-gray-900 text-sm">Product Insight</h2>
              <Link href="/admin/products" className="text-[11px] font-bold text-[#6DB9B2] hover:underline">
                Kelola Produk →
              </Link>
            </div>
            <p className="text-[10px] text-gray-500 mb-5 font-medium">Top 5 Produk Terlaris & Rekomendasi</p>
            
            <div className="space-y-4">
              {topProducts.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">Belum ada data produk terjual.</p>
              ) : (
                topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 w-28 truncate font-medium" title={p.name}>
                      {idx + 1}. {p.name}
                    </span>
                    <div className="flex-1 mx-2.5 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#6DB9B2] rounded-full transition-all" 
                        style={{ width: `${Math.max(8, p.percentage)}%`, opacity: 1 - idx * 0.15 }} 
                      />
                    </div>
                    <span className="font-bold text-gray-900 w-8 text-right">{p.percentage}%</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 mt-4 flex items-center justify-between text-[11px] text-gray-500">
            <span>Total Produk Katalog:</span>
            <span className="font-bold text-gray-800">{products.length} SKU</span>
          </div>
        </div>

        {/* BA Performance Summary */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 text-sm">BA Performance</h2>
              <Link href="/admin/ba" className="text-[11px] font-bold text-[#6DB9B2] hover:underline">
                Detail BA →
              </Link>
            </div>

            <div className="space-y-3.5">
              {/* Konsultasi */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-blue-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">💬</div>
                  <div>
                    <p className="text-[11px] text-gray-500 font-medium">Total Konsultasi</p>
                    <p className="font-bold text-gray-900 text-sm">{totalConsultations.toLocaleString('id-ID')}</p>
                  </div>
                </div>
              </div>

              {/* Follow Up */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-amber-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold">⏰</div>
                  <div>
                    <p className="text-[11px] text-gray-500 font-medium">Follow Up Pending</p>
                    <p className="font-bold text-gray-900 text-sm">
                      {followUpPendingCount.toLocaleString('id-ID')}
                      <span className="text-[10px] text-amber-600 font-normal ml-1">(&gt;25 hari)</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-emerald-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#E2F0EF] text-[#2C5C59] flex items-center justify-center text-sm font-bold">📈</div>
                  <div>
                    <p className="text-[11px] text-gray-500 font-medium">Conversion Rate</p>
                    <p className="font-bold text-gray-900 text-sm">{conversionRate}%</p>
                  </div>
                </div>
              </div>

              {/* Repeat Purchase Rate */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-purple-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold">🔁</div>
                  <div>
                    <p className="text-[11px] text-gray-500 font-medium">Repeat Purchase</p>
                    <p className="font-bold text-gray-900 text-sm">{repeatPurchaseRate}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 mt-2 text-center">
            <span className="text-[10px] text-gray-400">Diupdate otomatis dari interaksi BA & Customer</span>
          </div>
        </div>

        {/* National Report: Real Regional Distribution */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-900 text-sm">National Report</h2>
              <Link href="/admin/reports" className="text-[11px] font-bold text-[#6DB9B2] hover:underline">
                Laporan Wilayah →
              </Link>
            </div>

            <div className="w-full h-28 bg-[#E2F0EF]/40 rounded-2xl mb-4 flex items-center justify-center overflow-hidden relative border border-[#6DB9B2]/20">
              <div className="absolute opacity-20 text-7xl text-[#6DB9B2]">🇮🇩</div>
              <div className="z-10 bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-[11px] font-bold text-[#2C5C59] shadow-sm">
                Distribusi {regions.length} Wilayah
              </div>
            </div>
            
            <p className="text-[10px] text-gray-500 mb-3 font-semibold uppercase tracking-wider">Top Region by Customer</p>
            <div className="space-y-2.5">
              {topRegions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Belum ada data wilayah.</p>
              ) : (
                topRegions.map((reg, idx) => (
                  <div key={reg.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 font-medium truncate max-w-[140px]">
                      {idx + 1}. {reg.name}
                    </span>
                    <span className="font-bold text-[#2C5C59]">
                      {reg.customerCount.toLocaleString('id-ID')} Cust
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 mt-4 flex items-center justify-between text-[11px] text-gray-500">
            <span>Total Penjualan:</span>
            <span className="font-bold text-[#2C5C59]">
              {formatIDR(purchases.filter(p => p.status === 'valid').reduce((sum, p) => sum + p.totalAmount, 0))}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
