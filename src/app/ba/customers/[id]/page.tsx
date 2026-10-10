/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { recordPurchaseSchema, type RecordPurchaseFormValues } from '@/lib/validators/schemas';
import type { Customer, Purchase, Product, SkinProfile, Consultation } from '@/types';
import { formatIDR, formatDateTime, formatDate, maskPhone } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/media';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import {
  ArrowLeft,
  ShoppingBag,
  Sparkles,
  Calendar,
  Plus,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Bell,
  Send,
  X,
  QrCode,
} from 'lucide-react';

const SKIN_TYPE_DESCRIPTIONS: Record<string, string> = {
  normal: 'Kondisi kulit seimbang, tidak berminyak atau kering berlebih.',
  oily: 'Produksi sebum tinggi, rentan kilap dan pori-pori tersumbat.',
  dry: 'Memerlukan hidrasi ekstra untuk menjaga pelindung skin barrier.',
  combination: 'Berminyak di area T-zone dan normal/kering di area pipi.',
  sensitive: 'Mudah reaktif terhadap sinar matahari, cuaca, atau bahan keras.',
};

export default function BaCustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [skinProfile, setSkinProfile] = useState<SkinProfile | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [notifTitle, setNotifTitle] = useState('Pesan dari Beauty Advisor Wardah 🌿');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState<'ba_message' | 'follow_up' | 'promo' | 'consultation'>('ba_message');
  const [notifSubmitting, setNotifSubmitting] = useState(false);
  const [projectSplashUrl, setProjectSplashUrl] = useState('');

  useEffect(() => {
    setProjectSplashUrl(window.location.origin);
  }, []);

  // Form for recording purchases
  const form = useForm<RecordPurchaseFormValues>({
    resolver: zodResolver(recordPurchaseSchema),
    defaultValues: {
      invoiceNo: '',
      purchasedAt: '',
      items: [{ productId: '', qty: 1, unitPrice: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  // Fast, Parallel Data Fetching
  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');

    try {
      // Execute all 5 Firestore queries in PARALLEL
      const [customerDoc, purchasesSnap, skinProfileDoc, consultationsSnap, productsSnap] =
        await Promise.all([
          getDoc(doc(db, 'customers', id)),
          getDocs(
            query(
              collection(db, 'purchases'),
              where('customerId', '==', id),
              orderBy('purchasedAt', 'desc')
            )
          ),
          getDoc(doc(db, 'skinProfiles', id)),
          getDocs(
            query(
              collection(db, 'consultations'),
              where('customerId', '==', id),
              orderBy('createdAt', 'desc')
            )
          ),
          getDocs(query(collection(db, 'products'), where('isActive', '==', true))),
        ]);

      // 1. Customer
      if (customerDoc.exists()) {
        setCustomer({ id: customerDoc.id, ...customerDoc.data() } as Customer);
      } else {
        setCustomer(null);
      }

      // 2. Purchases
      const allPurchases = purchasesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        purchasedAt: d.data().purchasedAt?.toDate?.()?.toISOString() ?? d.data().purchasedAt,
      })) as Purchase[];
      setPurchases(allPurchases);

      // 3. Skin Profile
      if (skinProfileDoc.exists()) {
        setSkinProfile({ id: skinProfileDoc.id, ...skinProfileDoc.data() } as SkinProfile);
      } else {
        setSkinProfile(null);
      }

      // 4. Consultations
      const allConsultations = consultationsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? d.data().createdAt,
      })) as Consultation[];
      setConsultations(allConsultations);

      // 5. Products
      const allProducts = productsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as Product[];
      setProducts(allProducts);
    } catch (err: unknown) {
      console.error('Error loading customer details in parallel:', err);
      setError('Gagal memuat beberapa data profil.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Form Item Price Calculation
  const watchedItems = form.watch('items');
  const totalAmount = useMemo(() => {
    return (watchedItems || []).reduce((sum, item) => sum + (item.qty || 0) * (item.unitPrice || 0), 0);
  }, [watchedItems]);

  // Fast Checkout from Recommendations
  const handleCheckoutRecommendation = (recommendedItems: Array<{ productId: string; productName?: string }>) => {
    const formItems = recommendedItems.map((item) => {
      const prod = products.find(
        (p) => p.id === item.productId || (item.productName && p.name.toLowerCase() === item.productName.toLowerCase())
      );
      return {
        productId: prod?.id || item.productId,
        qty: 1,
        unitPrice: prod?.defaultPrice || 45000,
      };
    });

    form.reset({
      invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
      purchasedAt: new Date().toISOString().slice(0, 16),
      items: formItems.length > 0 ? formItems : [{ productId: '', qty: 1, unitPrice: 0 }],
    });

    setShowForm(true);
  };

  // Submit Purchase Transaction
  const handleSubmit = async (values: RecordPurchaseFormValues) => {
    if (!customer) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/purchases', {

        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          customerId: customer.id,
          storeId: user?.storeId || undefined,
          invoiceNo: values.invoiceNo,
          purchasedAt: values.purchasedAt,
          items: values.items.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            return {
              productId: item.productId,
              productName: product?.name ?? 'Produk Wardah',
              sku: product?.sku ?? '',
              qty: Number(item.qty),
              unitPrice: Number(item.unitPrice),
              subtotal: Number(item.qty) * Number(item.unitPrice),
            };
          }),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Gagal menyimpan pembelian');
      }

      setSuccess('Transaksi berhasil dicatat! Tampilkan barcode ke customer untuk scan riwayat.');
      setShowForm(false);
      setShowBarcodeModal(true);
      form.reset({
        invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
        purchasedAt: new Date().toISOString().slice(0, 16),
        items: [{ productId: '', qty: 1, unitPrice: 0 }],
      });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan pembelian.');
    } finally {
      setSubmitting(false);
    }
  };

  // Void Purchase Handler
  const handleVoid = async (purchaseId: string) => {
    const reason = window.prompt('Masukkan alasan pembatalan (void) transaksi:');
    if (!reason) return;

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/purchases/void', {

        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ purchaseId, reason }),
      });

      if (res.ok) {
        setSuccess('Pembelian berhasil dibatalkan (void).');
        await loadData();
      } else {
        const data = await res.json();
        setError(data.error || 'Gagal membatalkan transaksi.');
      }
    } catch {
      setError('Gagal memproses pembatalan.');
    }
  };

  // Send Notification to Customer
  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !notifTitle.trim() || !notifMessage.trim()) return;

    setNotifSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesi login telah berakhir.');

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
          actionUrl: '/passport/recommendations',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim pesan');

      setSuccess(`Notifikasi berhasil dikirim ke akun Wardah Passport ${customer.fullName}!`);
      setShowNotifModal(false);
      setNotifMessage('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim notifikasi');
    } finally {
      setNotifSubmitting(false);
    }
  };

  // Loading Skeleton State
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-[#E2F0EF] border-t-[#2C5C59] animate-spin mb-4" />
        <p className="text-sm font-bold text-gray-800">Menghubungkan ke Beauty Passport...</p>
        <p className="text-xs text-gray-400 mt-1">Mengambil profil kulit & riwayat pembelian customer</p>
      </div>
    );
  }

  // Customer Not Found State
  if (!customer) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6 text-center">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-sm border border-gray-100">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 text-3xl">
            🔍
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Customer Tidak Ditemukan</h2>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            Data QR Code atau ID Customer tidak terdaftar pada sistem database Wardah Passport.
          </p>
          <Link
            href="/ba/scan"
            className="w-full py-3 px-4 bg-[#2C5C59] text-white font-bold text-xs rounded-xl hover:bg-[#1f4240] transition-colors block shadow-sm"
          >
            ← Kembali ke Scanner
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24">
      {/* ============================================================== */}
      {/* EXECUTIVE HERO HEADER (Signature Kahf Deep Pine)               */}
      {/* ============================================================== */}
      <div className="bg-gradient-to-br from-[#1A3D3A] via-[#2C5C59] to-[#162A29] px-6 pt-6 pb-12 relative overflow-hidden rounded-b-[2.5rem] shadow-lg text-white">
        {/* Subtle Ambient Glows */}
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#6DB9B2]/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-black/30 blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-xl mx-auto">
          {/* Top Bar Navigation */}
          <div className="flex items-center justify-between mb-5">
            <Link
              href="/ba/scan"
              className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white backdrop-blur-md transition-colors border border-white/15"
              title="Kembali ke Scanner"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#6DB9B2]/30 text-[#A2E0DB] border border-[#6DB9B2]/40 backdrop-blur-md flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#A2E0DB]" />
                <span>Verified Passport</span>
              </span>
            </div>
          </div>

          {/* Customer Avatar & Bio Row */}
          <div className="flex items-center gap-4">
            {/* Avatar with Error-Handling & Kahf Monogram Fallback */}
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden shadow-xl border-2 border-white/30 bg-[#234B48] flex items-center justify-center shrink-0">
              {customer.photoUrl && !imageError ? (
                <img
                  src={resolveMediaUrl(customer.photoUrl)}
                  alt=""
                  onError={() => setImageError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#2C5C59] to-[#438a84] flex items-center justify-center text-white text-3xl font-black">
                  {customer.fullName?.charAt(0)?.toUpperCase() || 'K'}
                </div>
              )}
            </div>

            {/* Customer Details */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-white leading-tight truncate">
                {customer.fullName}
              </h1>
              <p className="text-white/80 text-xs sm:text-sm font-medium mt-0.5">
                {maskPhone(customer.phone)}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="font-mono text-[11px] font-semibold text-[#A2E0DB] bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">
                  ID: {customer.memberNo}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    customer.status === 'active'
                      ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                      : 'bg-amber-400 text-amber-950'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      customer.status === 'active' ? 'bg-emerald-800' : 'bg-amber-800'
                    }`}
                  />
                  <span>{customer.status === 'active' ? 'Member Aktif' : 'Belum Klaim'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/15 text-center shadow-sm">
              <p className="text-white font-black text-2xl leading-none mb-1">
                {customer.purchaseCount || 0}
              </p>
              <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">
                Pembelian
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/15 text-center shadow-sm">
              <p className="text-white font-black text-xl leading-none mb-1">
                {formatIDR(customer.totalSpent || 0)}
              </p>
              <p className="text-white/70 text-[11px] font-semibold uppercase tracking-wider">
                Total Belanja
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MAIN CONTENT CONTAINER                                         */}
      {/* ============================================================== */}
      <div className="px-5 -mt-5 space-y-4 max-w-xl mx-auto relative z-20">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 shadow-sm animate-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Informasi Transaksi</p>
              <p className="mt-0.5">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-rose-500 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 shadow-sm animate-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Berhasil</p>
              <p className="mt-0.5">{success}</p>
            </div>
            <button onClick={() => setSuccess('')} className="text-emerald-500 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Primary Action Buttons */}
        <div className="space-y-2.5">
          {/* Quick Checkout Recommendations (If Customer has recommendations) */}
          {consultations[0]?.recommendedProducts && consultations[0].recommendedProducts.length > 0 && (
            <button
              type="button"
              onClick={() => handleCheckoutRecommendation(consultations[0].recommendedProducts!)}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-[#2C5C59] text-white hover:opacity-95 font-bold text-xs transition-all duration-200 flex items-center justify-between shadow-md shadow-amber-500/20"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">🛒</span>
                <div className="text-left">
                  <p className="font-bold text-white">Checkout {consultations[0].recommendedProducts.length} Produk Rekomendasi</p>
                  <p className="text-[10px] text-white/80 font-normal">Muat otomatis produk hasil konsultasi terakhir</p>
                </div>
              </div>
              <span className="text-[11px] bg-white/20 text-white px-2.5 py-1 rounded-xl font-bold whitespace-nowrap">
                Muat Item →
              </span>
            </button>
          )}

          {/* Kasir & Update Belanja Hari Ini (Scan Barcode) */}
          <Link
            href={`/ba/scan?customerId=${customer.id}`}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#277A73] to-[#1E6560] text-white hover:opacity-95 font-bold text-sm transition-all duration-200 shadow-md shadow-[#277A73]/25 flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4 text-white" />
            <span>Kasir & Update Belanja Hari Ini (Tampilkan Barcode)</span>
          </Link>

          {/* Record Purchase Modal Trigger */}
          <button
            type="button"
            onClick={() => {
              form.reset({
                invoiceNo: `INV-${Date.now().toString().slice(-6)}`,
                purchasedAt: new Date().toISOString().slice(0, 16),
                items: [{ productId: '', qty: 1, unitPrice: 0 }],
              });
              setShowForm(true);
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold text-xs hover:bg-gray-50 transition-all duration-200 shadow-xs flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-[#277A73]" />
            <span>Input Transaksi Cepat (Form Sederhana)</span>
          </button>

          {/* Tampilkan Barcode Riwayat Customer (untuk di-Scan Customer) */}
          <button
            type="button"
            onClick={() => setShowBarcodeModal(true)}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#277A73] to-[#1E6560] text-white hover:opacity-95 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2 shadow-md shadow-[#277A73]/25"
          >
            <QrCode className="w-4 h-4 text-white" />
            <span>Tampilkan Barcode (Untuk di-Scan)</span>
          </button>

          {/* Update / Start Consultation Button */}
          <Link
            href={`/ba/customers/${customer.id}/consultation`}
            className="w-full py-3.5 px-6 rounded-2xl bg-[#E2F0EF] text-[#2C5C59] hover:bg-[#d0e6e4] font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2 border border-[#6DB9B2]/30 shadow-sm"
          >
            <span>📝</span>
            <span>{skinProfile ? 'Perbarui Konsultasi Kulit' : 'Mulai Konsultasi Kulit'}</span>
          </Link>

          {/* Kirim Notifikasi ke Passport Customer */}
          <button
            type="button"
            onClick={() => {
              setNotifTitle('Pesan Khusus dari Beauty Advisor Wardah ✨');
              setNotifMessage('');
              setShowNotifModal(true);
            }}
            className="w-full py-3.5 px-6 rounded-2xl bg-white text-[#2C5C59] hover:bg-gray-50 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2 border border-[#2C5C59]/20 shadow-sm"
          >
            <Bell className="w-4 h-4 text-[#2C5C59]" />
            <span>Kirim Pesan ke Passport Customer</span>
          </button>

          {/* Quick Product Recommendation Link for BA */}
          <Link
            href="/ba/products"
            className="w-full py-2.5 px-4 rounded-2xl bg-white text-gray-700 hover:text-[#2C5C59] hover:bg-gray-50 font-bold text-xs transition-colors flex items-center justify-between border border-gray-200 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span>⭐</span>
              <span>Katalog & Rekomendasi Produk Sesuai Profil</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        </div>

        {/* ============================================================== */}
        {/* SKIN PROFILE SUMMARY CARD                                      */}
        {/* ============================================================== */}
        {skinProfile ? (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#2C5C59] uppercase tracking-wider flex items-center gap-1.5">
                <span>🧴</span>
                <span>Profil Kulit Customer</span>
              </h3>
              <span className="text-[10px] font-semibold bg-[#E2F0EF] text-[#2C5C59] px-2.5 py-0.5 rounded-full border border-[#6DB9B2]/20">
                Terverifikasi
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Skin Type */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#E2F0EF] to-[#edf6f5] border border-[#6DB9B2]/20">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  Tipe Kulit
                </span>
                <span className="text-base font-extrabold text-[#2C5C59] capitalize mt-0.5 block">
                  {skinProfile.skinType || 'Normal'}
                </span>
                <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
                  {SKIN_TYPE_DESCRIPTIONS[skinProfile.skinType?.toLowerCase() || 'normal'] ||
                    'Kondisi kulit memerlukan perawatan teratur.'}
                </p>
              </div>

              {/* Skin Concerns */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#FDF2F4] to-[#fbf7f8] border border-[#F4B2BA]/30">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                  Fokus Masalah (Concern)
                </span>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {skinProfile.concerns && skinProfile.concerns.length > 0 ? (
                    skinProfile.concerns.map((concern, idx) => (
                      <span
                        key={idx}
                        className="text-xs font-bold text-[#B05B66] bg-white px-2.5 py-1 rounded-xl shadow-2xs border border-[#F4B2BA]/40"
                      >
                        {concern}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-gray-500">Tidak ada masalah khusus</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-gray-900">Belum Ada Profil Kulit</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Lakukan konsultasi pertama untuk mendapatkan rekomendasi produk presisi.
              </p>
            </div>
            <Link
              href={`/ba/customers/${customer.id}/consultation`}
              className="px-3 py-2 bg-[#2C5C59] text-white font-bold text-xs rounded-xl hover:bg-[#1f4240] transition-colors shrink-0 shadow-sm"
            >
              Mulai Konsultasi
            </Link>
          </div>
        )}

        {/* ============================================================== */}
        {/* CONSULTATION HISTORY                                           */}
        {/* ============================================================== */}
        {consultations.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#2C5C59]" />
              <span>Riwayat Konsultasi Kulit ({consultations.length})</span>
            </h3>

            <div className="space-y-2.5">
              {consultations.map((consult) => (
                <div
                  key={consult.id}
                  className="p-3.5 rounded-2xl border border-gray-100 bg-gray-50/70 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-xs text-[#2C5C59]">{formatDate(consult.createdAt)}</p>
                      <p className="text-[11px] text-gray-500">Oleh BA: {consult.baNameSnapshot}</p>
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 bg-white border border-gray-200 rounded-lg capitalize text-gray-700">
                      {consult.skinType}
                    </span>
                  </div>

                  {consult.notes && (
                    <p className="text-xs text-gray-600 bg-white p-2.5 rounded-xl border border-gray-100 italic">
                      &ldquo;{consult.notes}&rdquo;
                    </p>
                  )}

                  {consult.recommendedProducts && consult.recommendedProducts.length > 0 && (
                    <div className="pt-2 border-t border-gray-200/60 space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Produk Rekomendasi ({consult.recommendedProducts.length}):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {consult.recommendedProducts.map((p) => (
                          <span
                            key={p.productId}
                            className="text-[11px] font-semibold bg-[#E2F0EF] text-[#2C5C59] px-2 py-0.5 rounded-lg border border-[#6DB9B2]/20"
                          >
                            • {p.productName}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCheckoutRecommendation(consult.recommendedProducts!)}
                        className="w-full py-2 px-3 bg-[#2C5C59] hover:bg-[#1f4240] text-white text-[11px] font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Checkout Produk Rekomendasi Konsultasi Ini</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PURCHASE HISTORY                                               */}
        {/* ============================================================== */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#2C5C59]" />
            <span>Riwayat Pembelian ({purchases.length})</span>
          </h3>

          {purchases.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-2 text-2xl">
                🛒
              </div>
              <p className="text-xs font-bold text-gray-700">Belum Ada Transaksi Pembelian</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Tekan tombol &ldquo;Input Pembelian Baru&rdquo; di atas untuk mencatat belanja customer.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className={`p-3.5 rounded-2xl border transition-colors ${
                    purchase.status === 'void'
                      ? 'bg-gray-50 border-gray-200 opacity-60'
                      : 'bg-white border-gray-100 hover:border-[#6DB9B2]/40 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-900">
                        {formatDateTime(purchase.purchasedAt)}
                      </p>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        {purchase.items.length} item · No. {purchase.invoiceNo}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-[#2C5C59]">
                        {formatIDR(purchase.totalAmount)}
                      </p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                          purchase.status === 'void'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {purchase.status === 'void' ? 'Void (Dibatalkan)' : 'Valid'}
                      </span>
                    </div>
                  </div>

                  {purchase.status === 'valid' && (
                    <div className="mt-2.5 pt-2 border-t border-gray-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleVoid(purchase.id)}
                        className="text-[11px] font-bold text-rose-500 hover:text-rose-700 transition-colors"
                      >
                        Batalkan Transaksi (Void)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODAL: INPUT PURCHASE TRANSACTION                              */}
      {/* ============================================================== */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 sm:rounded-t-3xl rounded-t-3xl">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Catat Pembelian Baru</h3>
                <p className="text-xs text-gray-500">
                  Untuk {customer.fullName} ({customer.memberNo})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <form id="purchase-form" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      No. Struk / Invoice <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="INV-..."
                      {...form.register('invoiceNo')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:border-[#6DB9B2] focus:ring-2 focus:ring-[#6DB9B2]/20 outline-none font-mono"
                    />
                    {form.formState.errors.invoiceNo && (
                      <p className="text-[11px] text-rose-500 mt-1">
                        {form.formState.errors.invoiceNo.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Tanggal</label>
                    <input
                      type="datetime-local"
                      {...form.register('purchasedAt')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:border-[#6DB9B2] focus:ring-2 focus:ring-[#6DB9B2]/20 outline-none"
                    />
                  </div>
                </div>

                {/* Items */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-gray-900">
                      Daftar Produk Belanja <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => append({ productId: '', qty: 1, unitPrice: 0 })}
                      className="text-xs px-3 py-1.5 rounded-xl bg-[#E2F0EF] text-[#2C5C59] font-bold hover:bg-[#d0e6e4] transition-colors flex items-center gap-1 border border-[#6DB9B2]/20"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Item</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="p-3.5 rounded-2xl border border-gray-200 bg-gray-50/60 space-y-3 relative group"
                      >
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 text-xs flex items-center justify-center shadow-sm transition-colors"
                          >
                            ✕
                          </button>
                        )}

                        <div>
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                            Pilih Produk Wardah
                          </label>
                          <select
                            {...form.register(`items.${index}.productId`)}
                            onChange={(e) => {
                              form.setValue(`items.${index}.productId`, e.target.value);
                              const product = products.find((p) => p.id === e.target.value);
                              if (product) form.setValue(`items.${index}.unitPrice`, product.defaultPrice);
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:border-[#6DB9B2] focus:ring-2 focus:ring-[#6DB9B2]/20 outline-none bg-white font-medium"
                          >
                            <option value="">Pilih Produk...</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({formatIDR(p.defaultPrice)})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                              Qty
                            </label>
                            <input
                              type="number"
                              min={1}
                              {...form.register(`items.${index}.qty`, { valueAsNumber: true })}
                              className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold focus:border-[#6DB9B2] outline-none bg-white text-center"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                              Harga Satuan
                            </label>
                            <input
                              type="number"
                              min={0}
                              {...form.register(`items.${index}.unitPrice`, { valueAsNumber: true })}
                              className="w-full px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold focus:border-[#6DB9B2] outline-none bg-white text-right"
                            />
                          </div>
                          <div className="text-right">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                              Subtotal
                            </label>
                            <p className="text-xs font-black text-[#2C5C59] py-1.5">
                              {formatIDR(
                                (form.watch(`items.${index}.qty`) || 0) *
                                  (form.watch(`items.${index}.unitPrice`) || 0)
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {form.formState.errors.items && (
                    <p className="text-xs text-rose-500 mt-2">
                      {form.formState.errors.items.message}
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3 sm:rounded-b-3xl">
              <div>
                <p className="text-xs font-bold text-gray-500">Total Transaksi</p>
                <p className="text-xl font-black text-[#2C5C59] leading-tight">
                  {formatIDR(totalAmount)}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="py-2.5 px-4 bg-white border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-100 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  form="purchase-form"
                  disabled={submitting || totalAmount <= 0}
                  className="py-2.5 px-5 bg-[#2C5C59] text-white font-bold text-xs rounded-xl hover:bg-[#1f4240] disabled:opacity-50 transition-all shadow-md shadow-[#2C5C59]/20"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Transaksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kirim Notifikasi / Pesan BA */}
      {showNotifModal && customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#2C5C59] bg-[#E2F0EF] px-2.5 py-1 rounded-full">
                  Kirim Notifikasi Passport
                </span>
                <h3 className="text-lg font-black text-gray-900 mt-2">Kirim Pesan untuk {customer.fullName}</h3>
                <p className="text-xs text-gray-500">Pesan akan langsung tampil di menu Notifikasi Wardah Passport pelanggan.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotifModal(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Templates */}
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Template Cepat
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setNotifTitle('Rekomendasi Skincare Wardah Sesuai Kulitmu ✨');
                    setNotifMessage(`Halo Kak ${customer.fullName}, berdasarkan tipe kulitmu (${skinProfile?.skinType || 'normal'}), jangan lupa gunakan sunscreen dan moisturizer Wardah secara teratur untuk perlindungan maksimal ya!`);
                    setNotifType('ba_message');
                  }}
                  className="p-2 text-left rounded-xl border border-gray-200 hover:border-[#2C5C59] text-xs text-gray-700 hover:bg-[#E2F0EF]/30 transition-colors"
                >
                  🧴 Rekomendasi Rutinitas Produk Kulit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifTitle('Hasil Konsultasi Kulit Siap Dilihat ✨');
                    setNotifMessage(`Halo Kak ${customer.fullName}, hasil konsultasi kulitmu sudah tersimpan di Passport. Kamu bisa cek rekomendasi produk terbaik kapan pun di tab Rekomendasi.`);
                    setNotifType('consultation');
                  }}
                  className="p-2 text-left rounded-xl border border-gray-200 hover:border-[#2C5C59] text-xs text-gray-700 hover:bg-[#E2F0EF]/30 transition-colors"
                >
                  📝 Pengingat Hasil Konsultasi Kulit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifTitle('Pengingat Refill Produk Favoritmu 🧴');
                    setNotifMessage(`Halo Kak ${customer.fullName}, stok produk perawatan Wardah-mu mungkin sudah menipis nih. Yuk mampir lagi ke counter kami untuk refill dan raih reward poin spesial!`);
                    setNotifType('follow_up');
                  }}
                  className="p-2 text-left rounded-xl border border-gray-200 hover:border-[#2C5C59] text-xs text-gray-700 hover:bg-[#E2F0EF]/30 transition-colors"
                >
                  🔄 Pengingat Repurchase / Refill
                </button>
              </div>
            </div>

            <form onSubmit={handleSendNotification} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Judul Notifikasi</label>
                <input
                  type="text"
                  required
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2C5C59] focus:ring-1 focus:ring-[#2C5C59]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">Isi Pesan</label>
                <textarea
                  required
                  rows={4}
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  placeholder="Tulis pesan personal untuk customer..."
                  className="w-full px-3.5 py-2 text-xs sm:text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#2C5C59] focus:ring-1 focus:ring-[#2C5C59]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNotifModal(false)}
                  disabled={notifSubmitting}
                  className="w-1/3 py-2.5 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={notifSubmitting}
                  className="w-2/3 py-2.5 bg-[#2C5C59] text-white font-bold rounded-xl text-xs hover:bg-[#1f4240] transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  {notifSubmitting ? (
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Kirim Pesan Sekarang
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tampilkan Barcode untuk di-Scan */}
      {showBarcodeModal && customer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="text-[11px] font-bold text-[#277A73] bg-[#E8F6F4] px-2.5 py-0.5 rounded-full">
                Barcode
              </span>
              <button
                type="button"
                onClick={() => setShowBarcodeModal(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-base font-bold text-gray-900">Wardah Beauty Passport</h3>
              <p className="text-xs text-gray-500">Scan untuk langsung menuju Splashscreen / Login</p>
            </div>

            {/* QR Code */}
            <div className="p-4 bg-white rounded-2xl border-2 border-[#277A73]/20 shadow-sm inline-block mx-auto">
              <QRCode
                value={projectSplashUrl || '/'}
                size={200}
                level="H"
                fgColor="#277A73"
              />
            </div>

            <div className="bg-[#E8F6F4] p-3 rounded-2xl text-[11px] text-[#277A73] font-medium leading-relaxed space-y-1">
              <p>
                📱 <strong>Minta customer scan barcode ini</strong> dengan kamera HP untuk langsung diarahkan ke halaman splashscreen & login Wardah Beauty Passport.
              </p>
              <a
                href={projectSplashUrl || '/'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-bold underline text-[10px] mt-1"
              >
                <span>Buka Splashscreen (Preview)</span>
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowBarcodeModal(false)}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
      </div>
  );
}
