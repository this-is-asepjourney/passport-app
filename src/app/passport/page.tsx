/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatIDR, formatDate } from '@/lib/utils';
import type { Customer, Purchase } from '@/types';
import Link from 'next/link';
import { ImageUpload } from '@/components/ImageUpload';
import { PassportBottomNav } from '@/components/passport/PassportBottomNav';
import { useNotifications } from '@/hooks/useNotifications';
import {
  Bell,
  ChevronRight,
  ShoppingBag,
  Sparkles,
  Star,
  Heart,
  HeartPulse,
  QrCode,
  MapPin,
  LogOut,
  X,
  CheckCircle2,
} from 'lucide-react';

const DEFAULT_HIJAB_AVATAR = 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=200&auto=format&fit=crop&q=80';

// Daftar produk favorit Wardah untuk modal "Favorite Products"
const WARDAH_FAVORITES = [
  {
    name: 'Wardah Crystal Secret Brightening Day Cream',
    category: 'Moisturizer',
    price: 98000,
    rating: 4.9,
    image: '✨',
  },
  {
    name: 'Wardah Hydra Rose Dewy Aqua Gel',
    category: 'Hydration',
    price: 115000,
    rating: 4.8,
    image: '🌹',
  },
  {
    name: 'Wardah UV Shield Essential Sunscreen Gel SPF 35',
    category: 'Sun Protection',
    price: 37500,
    rating: 4.9,
    image: '☀️',
  },
  {
    name: 'Wardah Colorfit Velvet Matte Lip Mousse',
    category: 'Decorative',
    price: 75000,
    rating: 4.9,
    image: '💄',
  },
];

export default function PassportPage() {
  const { user, customer, setCustomer, updateUserPhoto, loading, signOutUser } = useAuth();
  const { unreadCount } = useNotifications();
  const router = useRouter();
  const [recentPurchases, setRecentPurchases] = useState<Purchase[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user?.role !== 'customer') {
      router.replace('/');
      return;
    }

    const loadPurchases = async () => {
      if (!customer?.id) return;
      try {
        const purchasesQ = query(
          collection(db, 'purchases'),
          where('customerId', '==', customer.id),
          where('status', '==', 'valid'),
          orderBy('purchasedAt', 'desc'),
          limit(3)
        );
        const purchasesSnap = await getDocs(purchasesQ);
        const purchases = purchasesSnap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          purchasedAt: d.data().purchasedAt?.toDate?.()?.toISOString() ?? d.data().purchasedAt,
        })) as Purchase[];
        setRecentPurchases(purchases);
      } catch (err) {
        console.error(err);
      }
    };

    if (customer?.id) loadPurchases();
  }, [user, customer?.id, loading, router]);

  const handlePhotoUpload = async (url: string) => {
    if (!customer) return;
    try {
      await updateUserPhoto(url);
    } catch (error) {
      console.error('Failed to update photo URL', error);
    }
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#277A73] animate-spin" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-white">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-xl font-bold text-[#277A73] mb-2">Profil Belum Lengkap</h2>
        <p className="text-gray-500 text-sm mb-6">
          Selesaikan pendaftaran untuk mengakses Wardah Beauty Passport Anda.
        </p>
        <Link href="/register" className="py-3 px-6 bg-[#277A73] text-white rounded-full font-semibold shadow-md">
          Lengkapi Data
        </Link>
      </div>
    );
  }

  const customerFirstName = customer.fullName ? customer.fullName.split(' ')[0] : 'Elsa';

  return (
    <div className="min-h-screen bg-[#F8FBFB] flex justify-center">
      <div className="w-full max-w-lg min-h-screen pb-24 relative overflow-hidden bg-white sm:shadow-lg sm:border-x sm:border-gray-100 flex flex-col">
        {/* Soft Background Glows */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#E2F5F3] rounded-full filter blur-[90px] opacity-60 pointer-events-none -translate-y-1/3 translate-x-1/4" />
        <div className="absolute top-64 left-0 w-64 h-64 bg-[#FDEEED] rounded-full filter blur-[90px] opacity-40 pointer-events-none -translate-x-1/3" />

        {/* ============================================================== */}
        {/* TOP BRAND HEADER (Logo Wardah + Notification Bell)            */}
        {/* ============================================================== */}
        <div className="px-6 pt-10 pb-4 relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-[#277A73] font-serif">
              Wardah
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Notification Bell */}
            <Link
              href="/passport/notifications"
              className="p-2.5 bg-white/90 border border-gray-100 rounded-2xl shadow-xs text-[#277A73] hover:bg-gray-50 relative transition-transform active:scale-95"
              title="Kotak Masuk Notifikasi"
            >
              <Bell className="w-5 h-5 text-[#277A73]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>

            {/* Logout Option */}
            <button
              onClick={signOutUser}
              className="p-2.5 bg-white/90 border border-gray-100 rounded-2xl shadow-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* USER PROFILE ROW (Hijab Avatar + Greeting)                     */}
        {/* ============================================================== */}
        <div className="px-6 pt-2 pb-5 relative z-10 flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <ImageUpload
              onUploadSuccess={handlePhotoUpload}
              folder="profiles"
              currentImage={customer.photoUrl || DEFAULT_HIJAB_AVATAR}
              shape="circle"
              showBadge={true}
              className="w-16 h-16 shadow-sm border-2 border-[#E2F0EF]"
              label=""
            />
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-1.5 truncate">
              Halo, {customerFirstName}! <span className="text-amber-400">✨</span>
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Ini adalah beauty passport kamu.</p>
          </div>
        </div>

        {/* ============================================================== */}
        {/* MEMBER TIER & LOYALTY CARD                                    */}
        {/* ============================================================== */}
        <div className="px-6 relative z-10 mb-6">
          <Link
            href="/passport/loyalty"
            className="block bg-gradient-to-r from-[#FAF2E5] to-[#F5E6CC] border border-[#E8D4B0] rounded-2xl p-3.5 shadow-xs hover:shadow-sm transition-all active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-400 to-amber-200 flex items-center justify-center text-white shadow-xs">
                  <Star className="w-5 h-5 fill-white" />
                </div>
                <div>
                  <p className="font-bold text-[#8C6D23] text-sm">Member Gold</p>
                  <p className="text-xs text-[#A68638] font-medium">1.250 Poin</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#8C6D23]" />
            </div>
          </Link>
        </div>

        {/* ============================================================== */}
        {/* QUICK MENU (5 Iconic Pastel Circle Buttons)                    */}
        {/* ============================================================== */}
        <div className="px-6 relative z-10 mb-7">
          <h2 className="text-sm font-bold text-[#1E6B65] mb-3">Quick Menu</h2>

          {/* Row 1: 3 Items */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            {/* 1. Riwayat Pembelian */}
            <Link
              href="/passport/purchases"
              className="bg-white rounded-2xl p-3 flex flex-col items-center text-center border border-gray-100/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#EBF4FA] text-[#3171A8] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-gray-800 leading-tight">
                Riwayat Pembelian
              </span>
            </Link>

            {/* 2. Riwayat Konsultasi */}
            <Link
              href="/passport/recommendations"
              className="bg-white rounded-2xl p-3 flex flex-col items-center text-center border border-gray-100/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#FCEEF0] text-[#D44B69] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <HeartPulse className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-gray-800 leading-tight">
                Riwayat Konsultasi
              </span>
            </Link>

            {/* 3. Rekomendasi Personal */}
            <Link
              href="/passport/recommendations"
              className="bg-white rounded-2xl p-3 flex flex-col items-center text-center border border-gray-100/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#E8F6F4] text-[#277A73] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-gray-800 leading-tight">
                Rekomendasi Personal
              </span>
            </Link>
          </div>

          {/* Row 2: 2 Centered Items */}
          <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto">
            {/* 4. Loyalty & Reward */}
            <Link
              href="/passport/loyalty"
              className="bg-white rounded-2xl p-3 flex flex-col items-center text-center border border-gray-100/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#FEF7E9] text-[#D9832B] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Star className="w-5 h-5 fill-[#D9832B]" />
              </div>
              <span className="text-[11px] font-medium text-gray-800 leading-tight">
                Loyalty & Reward
              </span>
            </Link>

            {/* 5. Favorite Products */}
            <button
              type="button"
              onClick={() => setShowFavoriteModal(true)}
              className="bg-white rounded-2xl p-3 flex flex-col items-center text-center border border-gray-100/80 shadow-xs hover:shadow-sm transition-all active:scale-95 group"
            >
              <div className="w-12 h-12 rounded-full bg-[#F3EFFC] text-[#7D55C7] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Heart className="w-5 h-5 fill-[#7D55C7]" />
              </div>
              <span className="text-[11px] font-medium text-gray-800 leading-tight">
                Favorite Products
              </span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* BEAUTY JOURNEY BANNER CARD                                     */}
        {/* ============================================================== */}
        <div className="px-6 relative z-10 mb-6">
          <h2 className="text-sm font-bold text-[#1E6B65] mb-2.5">Beauty Journey</h2>
          <Link
            href="/passport/skin-profile"
            className="block bg-gradient-to-r from-[#E3F7F5] to-[#D5F2EF] border border-[#BCE7E3] rounded-3xl p-4 shadow-xs hover:shadow-sm transition-all active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#277A73] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-[#1E6B65] leading-relaxed">
                    Kulit lebih sehat, percaya diri setiap hari bersama Wardah 💙
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#277A73] shrink-0" />
            </div>
          </Link>
        </div>

        {/* ============================================================== */}
        {/* SCAN BARCODE DARI BA (Call to Action)                          */}
        {/* ============================================================== */}
        <div className="px-6 relative z-10 mb-6">
          <div className="bg-gradient-to-br from-[#277A73] to-[#1E6560] rounded-3xl p-4.5 text-white shadow-sm flex items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full inline-block">
                Scan Barcode BA
              </span>
              <h3 className="text-sm font-bold">Sedang di Counter Wardah?</h3>
              <p className="text-[11px] text-white/80 leading-snug">
                Scan barcode di layar Beauty Advisor untuk langsung memuat riwayat belanja terbarumu.
              </p>
            </div>
            <Link
              href="/passport/qr"
              className="py-2.5 px-3.5 bg-white text-[#277A73] font-bold text-xs rounded-xl hover:bg-gray-50 transition-colors shadow-xs shrink-0 flex items-center gap-1.5"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan QR</span>
            </Link>
          </div>
        </div>

        {/* ============================================================== */}
        {/* RIWAYAT BELANJA (RECENT PURCHASES)                             */}
        {/* ============================================================== */}
        <div className="px-6 relative z-10 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#1E6B65]">Riwayat Belanja Terakhir</h2>
            <Link
              href="/passport/purchases"
              className="text-xs font-semibold text-[#277A73] hover:underline"
            >
              Lihat Semua →
            </Link>
          </div>

          {recentPurchases.length === 0 ? (
            <div className="bg-white rounded-3xl p-6 text-center border border-gray-100 shadow-xs">
              <span className="text-3xl mb-2 block">🛍️</span>
              <p className="text-xs font-semibold text-gray-700">Belum ada riwayat belanja terbaru.</p>
              <p className="text-[11px] text-gray-400 mt-1">
                Kunjungi counter Wardah terdekat dan minta Beauty Advisor mencatat transaksi Anda.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-xs space-y-3">
              {recentPurchases.map((purchase, idx) => (
                <div
                  key={purchase.id}
                  className={`flex justify-between items-center ${
                    idx !== recentPurchases.length - 1 ? 'border-b border-gray-50 pb-3' : ''
                  }`}
                >
                  <div className="flex gap-3 items-center">
                    <div className="w-10 h-10 rounded-xl bg-[#E8F6F4] flex items-center justify-center text-[#277A73] shrink-0">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-900">{formatIDR(purchase.totalAmount)}</p>
                      <p className="text-[10px] text-gray-500">{formatDate(purchase.purchasedAt)}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-[#E8F6F4] text-[#277A73] rounded-md">
                      Berhasil
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      #{purchase.invoiceNo || purchase.id.slice(0, 6)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Slogan Footer */}
        <div className="px-6 pb-6 text-center text-[#277A73] text-xs font-medium italic relative z-10">
          Your Beauty Journey Our Priority 💙
        </div>

        {/* Bottom Navigation */}
        <PassportBottomNav activeTab="home" />

        {/* ============================================================== */}
        {/* MODAL FAVORITE PRODUCTS                                        */}
        {/* ============================================================== */}
        {showFavoriteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#F3EFFC] text-[#7D55C7] flex items-center justify-center">
                    <Heart className="w-4 h-4 fill-[#7D55C7]" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">Produk Favorit Wardah</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFavoriteModal(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {WARDAH_FAVORITES.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{item.image}</span>
                      <div>
                        <p className="text-xs font-bold text-gray-900 line-clamp-1">{item.name}</p>
                        <p className="text-[10px] text-gray-500">{item.category} • ⭐ {item.rating}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#277A73] shrink-0">
                      {formatIDR(item.price)}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                href="/passport/recommendations"
                onClick={() => setShowFavoriteModal(false)}
                className="w-full py-2.5 bg-[#277A73] text-white font-bold rounded-xl text-xs hover:bg-[#1E6560] transition-colors block text-center shadow-xs"
              >
                Cek Semua Rekomendasi Personal
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
