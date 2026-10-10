'use client';

import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) return null;
  if (!user || (!user.role?.includes('admin') && user.role !== 'ba')) return null;

  const navItems = [
    { href: '/admin', label: 'Dashboard Nasional', icon: '🏠' },
    { href: '/admin/customers', label: 'Customer Insight', icon: '👥' },
    { href: '/admin/products', label: 'Product Insight', icon: '📦' },
    { href: '/admin/ba', label: 'Kelola Beauty Advisor', icon: '👩‍💼' },
    { href: '/admin/reports', label: 'Regional Report', icon: '📊' },
    { href: '/admin/settings', label: 'Pengaturan', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-white border-r border-gray-100 flex flex-col transition-transform duration-300 shrink-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo Area */}
        <div className="h-16 flex items-center px-6 border-b border-gray-50">
          <span className="text-xl font-bold text-[#277A73] tracking-tight">Wardah</span>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive 
                    ? 'bg-[#E2F0EF] text-[#2C5C59]' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white flex items-center justify-between px-4 lg:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              className="lg:hidden p-2 -ml-2 text-gray-500 rounded-lg hover:bg-gray-50"
              onClick={() => setIsSidebarOpen(true)}
            >
              ☰
            </button>
            <div className="hidden md:block">
              {/* Optional spacer if needed */}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#E2F0EF] text-[#2C5C59] flex items-center justify-center font-bold text-sm shadow-xs overflow-hidden border border-[#6DB9B2]/30 shrink-0">
                {user?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  (user?.displayName || user?.email || 'A')[0].toUpperCase()
                )}
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-gray-900 leading-tight">Halo, {user?.displayName || user?.email?.split('@')[0] || 'Admin'}!</p>
                <p className="text-xs text-gray-500 mt-0.5">{user?.role === 'super_admin' ? 'Super Admin' : 'Admin Regional'}</p>
              </div>
            </div>
            <button 
              onClick={signOutUser}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-bold"
              title="Keluar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
              Keluar
            </button>
          </div>
        </header>

        {/* Page Content area */}
        <div className="flex-1 overflow-auto p-4 lg:p-8 bg-[#F8FAFC]">
          {children}
        </div>
      </main>
    </div>
  );
}
