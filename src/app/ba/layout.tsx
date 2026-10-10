'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState } from 'react';
import {
  Home,
  Users,
  MessageSquare,
  Sparkles,
  Calendar,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
  X,
  QrCode,
} from 'lucide-react';

export default function BaLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOutUser } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const menuItems = [
    { name: 'Beranda', href: '/ba', icon: Home },
    { name: 'Barcode', href: '/ba/scan', icon: QrCode },
    { name: 'Customer Database', href: '/ba/customers', icon: Users },
    { name: 'Konsultasi Kulit', href: '/ba/consultation', icon: MessageSquare },
    { name: 'Rekomendasi Produk', href: '/ba/products', icon: Sparkles },
    { name: 'Follow Up Pelanggan', href: '/ba/follow-up', icon: Calendar },
    { name: 'Laporan Transaksi', href: '/ba/purchases', icon: ClipboardList },
    { name: 'Pengaturan Akun', href: '/ba/settings', icon: Settings },
  ];

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOutUser();
      router.replace('/login');
    } catch (err) {
      console.error('Logout error:', err);
      alert('Gagal keluar dari sesi. Silakan coba lagi.');
    } finally {
      setLoggingOut(false);
      setIsLogoutModalOpen(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* Mobile Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`
        fixed lg:sticky top-0 left-0 z-50 h-screen w-72 bg-white border-r border-gray-100 flex flex-col shrink-0 transition-transform duration-300 shadow-xl lg:shadow-none
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}
      >
        {/* Brand Header */}
        <div className="p-5 h-18 flex items-center justify-between border-b border-gray-100">
          <Link
            href="/ba"
            className="flex items-center gap-2.5"
            onClick={() => setIsSidebarOpen(false)}
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#277A73] to-[#1E6560] text-white flex items-center justify-center font-black text-xl shadow-md">
              W
            </div>
            <div>
              <span className="text-lg font-black text-[#277A73] tracking-tight block leading-none">
                Wardah BA
              </span>
              <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase block mt-1">
                Beauty Advisor
              </span>
            </div>
          </Link>

          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Card */}
        <div className="px-4 pt-4 pb-2">
          <div className="p-3 bg-[#E2F0EF]/50 rounded-2xl border border-[#6DB9B2]/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2C5C59] text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden shadow-xs">
              {user?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                user?.displayName?.charAt(0)?.toUpperCase() || 'B'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900 truncate">
                {user?.displayName || 'Beauty Advisor'}
              </p>
              <p className="text-[11px] text-[#2C5C59] font-medium truncate">
                {user?.email || 'BA Wardah Official'}
              </p>
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all font-bold text-xs ${
                  isActive
                    ? 'bg-[#2C5C59] text-white shadow-md shadow-[#2C5C59]/20'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#A2E0DB]' : 'text-gray-400'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section: Prominent, Isolated Logout Button */}
        <div className="p-4 border-t border-gray-100 pb-16 lg:pb-5">
          <button
            type="button"
            onClick={() => setIsLogoutModalOpen(true)}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all border border-rose-200/80 active:scale-98 shadow-2xs"
          >
            <LogOut className="w-4 h-4 text-rose-600" />
            <span>Keluar dari Akun BA</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="lg:hidden h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="p-2 -ml-1 text-gray-700 rounded-xl hover:bg-gray-100 active:scale-95"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Buka Menu"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-base font-black text-[#277A73]">Wardah BA</span>
              <span className="text-[10px] font-bold bg-[#E2F0EF] text-[#277A73] px-2 py-0.5 rounded-full border border-[#6DB9B2]/30">
                Official
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/ba/scan"
              className="p-2 rounded-xl bg-[#E2F0EF] text-[#2C5C59] hover:bg-[#d4ecea] transition-colors"
              title="Buka Barcode"
            >
              <QrCode className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => setIsLogoutModalOpen(true)}
              className="p-2 rounded-xl bg-gray-50 text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page Children Container */}
        <div className="flex-1 overflow-auto bg-[#F8FAFC]">{children}</div>
      </main>

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
              <h3 className="font-extrabold text-base text-gray-900">Keluar dari Sesi BA?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Anda akan keluar dari sesi akun Beauty Advisor ini. Anda dapat masuk kembali kapan saja dengan akun resmi Anda.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                disabled={loggingOut}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {loggingOut ? 'Memproses...' : 'Ya, Keluar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
