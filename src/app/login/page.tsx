'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import {
  customerLoginSchema,
  loginSchema,
  type CustomerLoginFormValues,
  type LoginFormValues,
} from '@/lib/validators/schemas';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  Sparkles,
  Smartphone,
  User,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Heart,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

type LoginTab = 'customer' | 'staff';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<LoginTab>('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const qrToken = searchParams.get('qr');
  const hintName = searchParams.get('hint');

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'customer') router.replace('/passport');
      else if (user.role === 'ba') router.replace('/ba');
      else if (user.role?.includes('admin')) router.replace('/admin');
    }
  }, [user, router]);

  // Customer Form (Nama & Nomor HP)
  const customerForm = useForm<CustomerLoginFormValues>({
    resolver: zodResolver(customerLoginSchema),
    defaultValues: {
      fullName: '',
      phone: '',
    },
  });

  // Staff Form (Email & Password)
  const staffForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Handle Customer Login (Name & Phone)
  const handleCustomerLogin = async (data: CustomerLoginFormValues) => {
    setLoading(true);
    setError('');
    setNotFound(false);
    setSuccessMsg('');

    try {
      const res = await fetch('/api/customers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: data.fullName,
          phone: data.phone,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.notFound) {
          setNotFound(true);
        }
        throw new Error(result.error || 'Gagal masuk ke Beauty Passport');
      }

      setSuccessMsg(`Selamat datang, ${result.customer?.fullName || data.fullName}! ✨`);

      // Sign in to Firebase Auth using Custom Token
      await signInWithCustomToken(auth, result.customToken);

      // Redirect to passport
      router.replace('/passport');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat masuk';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Staff Login (Email & Password)
  const handleStaffLogin = async (data: LoginFormValues) => {
    setLoading(true);
    setError('');
    setNotFound(false);
    setSuccessMsg('');

    try {
      const credential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const tokenResult = await credential.user.getIdTokenResult();
      const role = tokenResult.claims.role as string;

      if (role === 'ba') router.replace('/ba');
      else if (role?.includes('admin')) router.replace('/admin');
      else router.replace('/passport');
    } catch {
      setError('Email atau password staf salah. Pastikan akun terdaftar di sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFBFB] relative overflow-hidden">
      {/* Decorative Pastel Gradient Blobs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#E8C5C8]/40 rounded-full blur-3xl mix-blend-multiply" />
        <div className="absolute top-1/3 -left-28 w-96 h-96 bg-[#6DB9B2]/20 rounded-full blur-3xl mix-blend-multiply" />
        <div className="absolute -bottom-24 right-1/4 w-80 h-80 bg-[#E8A598]/20 rounded-full blur-3xl mix-blend-multiply" />
      </div>

      {/* Top Brand Bar */}
      <div className="h-1.5 bg-gradient-to-r from-[#277A73] via-[#6DB9B2] to-[#E8C5C8] z-10" />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10">
        <div className="w-full max-w-md">
          {/* Brand Header */}
          <div className="text-center mb-6">
            <Link href="/" className="inline-block group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#277A73] to-[#1E6560] text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-[#277A73]/20 group-hover:scale-105 transition-transform">
                <Sparkles className="w-8 h-8 text-[#E8C5C8]" />
              </div>
            </Link>
            <h2 className="text-xs uppercase font-extrabold tracking-widest text-[#277A73] mb-1">
              Wardah Official
            </h2>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Beauty Passport
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xs mx-auto">
              Your Beauty Journey, Our Priority 💙
            </p>

            {/* Hint from QR scan */}
            {hintName && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F6F4] border border-[#277A73]/20 text-[#277A73] text-xs font-semibold animate-in">
                <span>🌸</span>
                <span>Halo, {hintName}! Silakan masuk ke akunmu</span>
              </div>
            )}
          </div>

          {/* Card Container */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-xl shadow-gray-200/50 border border-gray-100">
            {/* Tabs */}
            <div className="flex p-1 bg-gray-100 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('customer');
                  setError('');
                  setNotFound(false);
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'customer'
                    ? 'bg-white text-[#277A73] shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>📱 Customer</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('staff');
                  setError('');
                  setNotFound(false);
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'staff'
                    ? 'bg-white text-[#277A73] shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <span>🔑 BA / Admin</span>
              </button>
            </div>

            {/* Success Message */}
            {successMsg && (
              <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2 animate-in">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm space-y-2 animate-in">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  <p className="leading-snug">{error}</p>
                </div>
                {notFound && (
                  <div className="pt-2 border-t border-rose-200/60">
                    <Link
                      href={`/register?phone=${encodeURIComponent(customerForm.getValues('phone') || '')}&name=${encodeURIComponent(customerForm.getValues('fullName') || '')}`}
                      className="inline-flex items-center gap-1 font-bold text-xs text-[#277A73] hover:underline"
                    >
                      <span>Daftar Akun Baru Sekarang</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* TAB 1: Customer Login (Nama & Nomor HP) */}
            {activeTab === 'customer' && (
              <form onSubmit={customerForm.handleSubmit(handleCustomerLogin)} className="space-y-4">
                <div className="p-3 bg-[#E8F6F4]/50 border border-[#277A73]/15 rounded-2xl mb-4 text-center">
                  <p className="text-xs text-[#277A73] font-semibold">
                    Masuk instan tanpa password dengan Nama & Nomor WhatsApp
                  </p>
                </div>

                {/* Nama Lengkap */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#277A73]" />
                    <span>Nama Lengkap</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Siti Rahmawati"
                    {...customerForm.register('fullName')}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                  />
                  {customerForm.formState.errors.fullName && (
                    <p className="text-xs text-rose-500 mt-1">
                      {customerForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* Nomor HP */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-[#277A73]" />
                    <span>Nomor WhatsApp / HP</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Contoh: 081234567890"
                    {...customerForm.register('phone')}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                  />
                  {customerForm.formState.errors.phone ? (
                    <p className="text-xs text-rose-500 mt-1">
                      {customerForm.formState.errors.phone.message}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Gunakan nomor HP yang didaftarkan saat belanja di counter Wardah
                    </p>
                  )}
                </div>

                {/* Submit Customer */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-[#277A73] hover:bg-[#1E6560] text-white font-bold text-sm shadow-lg shadow-[#277A73]/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all duration-200 active:scale-98 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      <span>Memeriksa Akun...</span>
                    </>
                  ) : (
                    <>
                      <span>Masuk ke Beauty Passport</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Register Link */}
                <div className="pt-4 text-center border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Belum punya Wardah Beauty Passport?{' '}
                    <Link
                      href="/register"
                      className="font-bold text-[#277A73] hover:text-[#1E6560] hover:underline"
                    >
                      Daftar Baru di Sini
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* TAB 2: Staff Login (BA / Admin via Email & Password) */}
            {activeTab === 'staff' && (
              <form onSubmit={staffForm.handleSubmit(handleStaffLogin)} className="space-y-4">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl mb-4 text-center">
                  <p className="text-xs text-gray-600 font-medium">
                    Portal resmi Beauty Advisor & Administrator Wardah
                  </p>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#277A73]" />
                    <span>Email Staf</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="ba.nama@wardah.id"
                    {...staffForm.register('email')}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                  />
                  {staffForm.formState.errors.email && (
                    <p className="text-xs text-rose-500 mt-1">
                      {staffForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#277A73]" />
                    <span>Password</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    {...staffForm.register('password')}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                  />
                  {staffForm.formState.errors.password && (
                    <p className="text-xs text-rose-500 mt-1">
                      {staffForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {/* Submit Staff */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gray-900 hover:bg-black text-white font-bold text-sm shadow-md disabled:opacity-50 hover:-translate-y-0.5 transition-all duration-200 active:scale-98 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      <span>Masuk Staf...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Masuk sebagai Staf</span>
                    </>
                  )}
                </button>

                <div className="pt-3 text-center">
                  <p className="text-[11px] text-gray-400">
                    Akun staf dikelola oleh Super Admin Wardah
                  </p>
                </div>
              </form>
            )}
          </div>

          {/* Footer note */}
          <div className="mt-6 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
            <span>Wardah Beauty Passport</span>
            <span>•</span>
            <span>Halal Green Beauty</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFBFB] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-[#E8F6F4] border-t-[#277A73] animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
