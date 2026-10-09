'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import {
  customerRegisterSchema,
  type CustomerRegisterFormValues,
} from '@/lib/validators/schemas';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  Sparkles,
  Smartphone,
  User,
  MapPin,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

function RegisterFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Prefill phone and name from URL query if available
  const initialPhone = searchParams.get('phone') || '';
  const initialName = searchParams.get('name') || '';

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'customer') router.replace('/passport');
      else if (user.role === 'ba') router.replace('/ba');
      else if (user.role?.includes('admin')) router.replace('/admin');
    }
  }, [user, router]);

  const form = useForm<CustomerRegisterFormValues>({
    resolver: zodResolver(customerRegisterSchema),
    defaultValues: {
      phone: initialPhone,
      fullName: initialName,
      city: '',
    },
  });

  const handleRegister = async (data: CustomerRegisterFormValues) => {
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/customers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: data.phone,
          fullName: data.fullName,
          city: data.city,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Gagal mendaftarkan akun');
      }

      setSuccessMsg(
        result.message || 'Pendaftaran berhasil! Mengalihkan ke Wardah Beauty Passport Anda...'
      );

      // Sign in to Firebase Auth using Custom Token
      if (result.customToken) {
        await signInWithCustomToken(auth, result.customToken);
      }

      // Redirect to passport
      router.replace('/passport');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat pendaftaran';
      setError(message);
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
              Daftar Beauty Passport
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-xs mx-auto">
              Hanya butuh nama, nomor HP, dan kota untuk menikmati keuntungan member Wardah.
            </p>
          </div>

          {/* Card Container */}
          <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-xl shadow-gray-200/50 border border-gray-100">
            {/* Quick Benefits Banner */}
            <div className="p-3.5 bg-[#E8F6F4]/60 border border-[#277A73]/15 rounded-2xl mb-6 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#277A73] text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[#E8C5C8]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900">Member Beauty Passport</p>
                <p className="text-[11px] text-gray-500 truncate">
                  Poin belanja, rekomendasi kulit & konsultasi BA Wardah
                </p>
              </div>
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
              </div>
            )}

            {/* Register Form: Nomor HP, Nama Lengkap, Kota */}
            <form onSubmit={form.handleSubmit(handleRegister)} className="space-y-4">
              <div className="p-3 bg-[#E8F6F4]/50 border border-[#277A73]/15 rounded-2xl mb-2 text-center">
                <p className="text-xs text-[#277A73] font-semibold">
                  Daftar instan tanpa password dengan Nama & Nomor WhatsApp
                </p>
              </div>

              {/* 1. Nomor HP / WhatsApp */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-[#277A73]" />
                  <span>Nomor WhatsApp / HP</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  {...form.register('phone')}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                />
                {form.formState.errors.phone ? (
                  <p className="text-xs text-rose-500 mt-1">
                    {form.formState.errors.phone.message}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Nomor ini digunakan untuk login & menerima poin reward belanja
                  </p>
                )}
              </div>

              {/* 2. Nama Lengkap */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#277A73]" />
                  <span>Nama Lengkap</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Siti Rahmawati"
                  {...form.register('fullName')}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                />
                {form.formState.errors.fullName && (
                  <p className="text-xs text-rose-500 mt-1">
                    {form.formState.errors.fullName.message}
                  </p>
                )}
              </div>

              {/* 3. Kota Domisili */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#277A73]" />
                  <span>Kota Domisili</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Jakarta Selatan, Surabaya, Bandung..."
                  {...form.register('city')}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#277A73] focus:bg-white focus:ring-3 focus:ring-[#277A73]/10 transition-all placeholder:text-gray-400"
                />
                {form.formState.errors.city && (
                  <p className="text-xs text-rose-500 mt-1">
                    {form.formState.errors.city.message}
                  </p>
                )}
              </div>

              {/* Privacy Policy notice */}
              <div className="p-3 bg-gray-50 rounded-xl text-[11px] text-gray-500 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#277A73] shrink-0 mt-0.5" />
                <p>
                  Dengan mendaftar, Anda menyetujui{' '}
                  <Link href="/privacy" className="text-[#277A73] font-semibold underline" target="_blank">
                    Kebijakan Privasi
                  </Link>{' '}
                  dan pemrosesan data untuk layanan Wardah Beauty Passport.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-[#277A73] hover:bg-[#1E6560] text-white font-bold text-sm shadow-lg shadow-[#277A73]/20 disabled:opacity-50 hover:-translate-y-0.5 transition-all duration-200 active:scale-98 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    <span>Mendaftarkan Akun...</span>
                  </>
                ) : (
                  <>
                    <span>✨ Buat Passport Saya</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Login link */}
              <div className="pt-4 text-center border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Sudah punya akun?{' '}
                  <Link
                    href="/login"
                    className="font-bold text-[#277A73] hover:text-[#1E6560] hover:underline"
                  >
                    Masuk di Sini
                  </Link>
                </p>
              </div>
            </form>
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

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAFBFB] flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-[#E8F6F4] border-t-[#277A73] animate-spin" />
        </div>
      }
    >
      <RegisterFormContent />
    </Suspense>
  );
}
