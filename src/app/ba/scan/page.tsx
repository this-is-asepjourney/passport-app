'use client';

import { useEffect, useState, useRef, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { doc, getDoc, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import QRCode from 'react-qr-code';
import jsQR from 'jsqr';
import type { Customer, Product, ProductCategory, Purchase } from '@/types';
import { formatIDR, formatDate, formatDateTime } from '@/lib/utils';
import {
  Search,
  ArrowLeft,
  QrCode,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  ExternalLink,
  ShoppingBag,
  Sparkles,
  Printer,
  Share2,
  RotateCcw,
  ChevronDown,
  Receipt,
} from 'lucide-react';

interface CartItem {
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  isCustomPrice?: boolean;
}

interface RecommendedItem {
  productId: string;
  productName?: string;
  reason?: string;
  price?: number;
}

export default function BaScanAndBarcodePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-[#E2F0EF] border-t-[#277A73] animate-spin" />
        </div>
      }
    >
      <BaScanAndBarcodeContent />
    </Suspense>
  );
}

function BaScanAndBarcodeContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramCustomerId = searchParams.get('customerId') || '';

  // Mode: 'generate' (BA selects customer, updates purchase & shows barcode) vs 'camera' (BA scans QR)
  const [activeTab, setActiveTab] = useState<'generate' | 'camera'>('generate');

  // Customer Search & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerLoyalty, setCustomerLoyalty] = useState<{ currentPoints: number; tier: string } | null>(null);
  const [customerPurchases, setCustomerPurchases] = useState<Purchase[]>([]);
  const [customerRecommendations, setCustomerRecommendations] = useState<RecommendedItem[]>([]);

  // Products and Categories
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showExtraDetails, setShowExtraDetails] = useState(false);
  const [showTodayPurchases, setShowTodayPurchases] = useState(false);

  // Cart Management
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [customInvoiceNo, setCustomInvoiceNo] = useState('');
  const [transactionNotes, setTransactionNotes] = useState('');

  // Submit and Void states
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hydration-safe client states
  const [isMounted, setIsMounted] = useState(false);
  const [projectSplashUrl, setProjectSplashUrl] = useState('');

  useEffect(() => {
    setIsMounted(true);
    setProjectSplashUrl(window.location.origin);
  }, []);

  // Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Purchase | null>(null);

  // Void Modal State
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [purchaseToVoid, setPurchaseToVoid] = useState<Purchase | null>(null);
  const [voidReasonText, setVoidReasonText] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // Camera Scanner States (Alternative)
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isScanningActiveRef = useRef<boolean>(false);

  // Auth Guard
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user && !['ba', 'admin_region', 'super_admin'].includes(user.role ?? '')) {
      router.replace('/');
    }
  }, [user, loading, router]);

  // Products ref to avoid re-triggering selectCustomer callback when products list changes
  const productsRef = useRef<Product[]>([]);
  productsRef.current = products;

  // Track customer ID that has been loaded to avoid repeated re-fetching
  const loadedCustomerIdRef = useRef<string>('');

  // Load customer purchases & loyalty
  const loadCustomerPurchases = useCallback(async (customerId: string) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/purchases?customerId=${encodeURIComponent(customerId)}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (data.purchases) {
        setCustomerPurchases(data.purchases);
      }
      if (data.customer) {
        setSelectedCustomer((prev) => (prev && prev.id === customerId ? { ...prev, ...data.customer } : prev));
      }
      if (data.loyalty) {
        setCustomerLoyalty(data.loyalty);
      }
    } catch (err) {
      console.error('Error loading customer purchases:', err);
    }
  }, []);

  // Load latest consultation recommendations for this customer
  const loadCustomerRecommendations = useCallback(async (customerId: string, availableProducts?: Product[]) => {
    try {
      let recos: RecommendedItem[] = [];
      try {
        const snap = await getDocs(
          query(collection(db, 'consultations'), where('customerId', '==', customerId), orderBy('createdAt', 'desc'), limit(1))
        );
        if (!snap.empty) {
          recos = snap.docs[0].data().recommendedProducts || [];
        }
      } catch {
        const snap = await getDocs(
          query(collection(db, 'consultations'), where('customerId', '==', customerId), limit(5))
        );
        if (!snap.empty) {
          const sorted = snap.docs.sort((a, b) => {
            const tA = a.data().createdAt?.toMillis?.() ?? 0;
            const tB = b.data().createdAt?.toMillis?.() ?? 0;
            return tB - tA;
          });
          recos = sorted[0].data().recommendedProducts || [];
        }
      }

      // Attach prices from available products
      const prodsToMatch = availableProducts || productsRef.current;
      const enriched = recos.map((r) => {
        const prod = prodsToMatch.find(
          (p) => p.id === r.productId || (r.productName && p.name.toLowerCase() === r.productName.toLowerCase())
        );
        return {
          productId: prod?.id || r.productId,
          productName: prod?.name || r.productName || 'Produk Wardah',
          reason: r.reason || '',
          price: prod?.defaultPrice || 45000,
        };
      });

      setCustomerRecommendations(enriched);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setCustomerRecommendations([]);
    }
  }, []);

  // Select customer callback (stable reference, no longer depends on products array identity)
  const selectCustomer = useCallback(
    (c: Customer, prodsList?: Product[]) => {
      loadedCustomerIdRef.current = c.id;
      setSelectedCustomer(c);
      setCartItems([]);
      setErrorMsg(null);
      setCustomInvoiceNo(`WRD-${Date.now().toString().slice(-6)}`);
      setTransactionNotes('');
      loadCustomerPurchases(c.id);
      loadCustomerRecommendations(c.id, prodsList || productsRef.current);
    },
    [loadCustomerPurchases, loadCustomerRecommendations]
  );

  // 1. Initial Data Loading: Load Recent Customers, Active Products, Categories ONCE
  const initLoadedRef = useRef(false);
  useEffect(() => {
    if (!user || initLoadedRef.current) return;
    initLoadedRef.current = true;

    const initData = async () => {
      try {
        const [custSnap, prodSnap, catSnap] = await Promise.all([
          getDocs(query(collection(db, 'customers'), orderBy('updatedAt', 'desc'), limit(10))),
          getDocs(query(collection(db, 'products'), where('isActive', '==', true))),
          getDocs(collection(db, 'productCategories')),
        ]);

        const custs = custSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
        setRecentCustomers(custs);

        let prods = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
        // Fallback if products collection does not have isActive: true
        if (prods.length === 0) {
          const allProdsSnap = await getDocs(collection(db, 'products'));
          prods = allProdsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Product))
            .filter((p) => p.isActive !== false);
        }
        setProducts(prods);
        productsRef.current = prods;

        const cats = catSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductCategory));
        setCategories(cats);

        // Auto-select customer if customerId query param is provided and not yet loaded
        if (paramCustomerId && loadedCustomerIdRef.current !== paramCustomerId) {
          const directDoc = await getDoc(doc(db, 'customers', paramCustomerId));
          if (directDoc.exists()) {
            selectCustomer({ id: directDoc.id, ...directDoc.data() } as Customer, prods);
          }
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };

    initData();
  }, [user, paramCustomerId, selectCustomer]);

  // 2. Handle URL paramCustomerId change if navigating with different customer
  useEffect(() => {
    if (!paramCustomerId || loadedCustomerIdRef.current === paramCustomerId) return;

    const fetchDirectCustomer = async () => {
      try {
        const directDoc = await getDoc(doc(db, 'customers', paramCustomerId));
        if (directDoc.exists()) {
          selectCustomer({ id: directDoc.id, ...directDoc.data() } as Customer);
        }
      } catch (err) {
        console.error('Failed to load direct customer from param:', err);
      }
    };

    fetchDirectCustomer();
  }, [paramCustomerId, selectCustomer]);

  // Handle Search using unified intelligent customer search API
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const qText = searchQuery.trim();
    if (!qText) return;

    setSearching(true);
    setErrorMsg(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/customers/search?q=${encodeURIComponent(qText)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      const matched = (data.customers || []) as Customer[];

      setSearchResults(matched);
      if (matched.length === 1) {
        selectCustomer(matched[0]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mencari customer';
      setErrorMsg(message);
    } finally {
      setSearching(false);
    }
  };

  // Filtered Products for Catalog Search & Category Filter
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== 'all') {
        const matchesCategory =
          p.categoryId === selectedCategory ||
          categories.find((c) => c.id === selectedCategory)?.name.toLowerCase() === p.categoryId?.toLowerCase();
        if (!matchesCategory) return false;
      }

      // Keyword search
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku?.toLowerCase().includes(q);
        const matchesBarcode = (p.barcode || '').toLowerCase().includes(q);
        const matchesSap = (p.sapCode || '').toLowerCase().includes(q);
        const matchesOdoo = (p.odooCode || '').toLowerCase().includes(q);
        const matchesSeries = (p.series || '').toLowerCase().includes(q);
        return matchesName || matchesSku || matchesBarcode || matchesSap || matchesOdoo || matchesSeries;
      }

      return true;
    });
  }, [products, selectedCategory, categories, productSearch]);

  // Add Item to Cart (Generic)
  const addItemToCart = (product: Product, quantity = 1) => {
    if (!product || quantity <= 0) return;

    const existingIdx = cartItems.findIndex((it) => it.productId === product.id);
    if (existingIdx >= 0) {
      const updated = [...cartItems];
      updated[existingIdx].qty += quantity;
      updated[existingIdx].subtotal = updated[existingIdx].qty * updated[existingIdx].unitPrice;
      setCartItems(updated);
    } else {
      setCartItems((prev) => [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku || 'WRD-SKU',
          qty: quantity,
          unitPrice: product.defaultPrice,
          subtotal: quantity * product.defaultPrice,
        },
      ]);
    }
  };

  // Switch / change customer
  const handleSwitchCustomer = () => {
    setSelectedCustomer(null);
    setSearchQuery('');
    setSearchResults([]);
    setCartItems([]);
    setErrorMsg(null);
  };

  // Add Item from Recommendations
  const handleAddRecommendation = (reco: RecommendedItem) => {
    const prod = products.find((p) => p.id === reco.productId);
    if (prod) {
      addItemToCart(prod, 1);
    } else {
      // Add custom reco item
      const existingIdx = cartItems.findIndex((it) => it.productId === reco.productId);
      if (existingIdx >= 0) {
        const updated = [...cartItems];
        updated[existingIdx].qty += 1;
        updated[existingIdx].subtotal = updated[existingIdx].qty * updated[existingIdx].unitPrice;
        setCartItems(updated);
      } else {
        setCartItems((prev) => [
          ...prev,
          {
            productId: reco.productId,
            productName: reco.productName || 'Produk Wardah',
            sku: 'WRD-REC',
            qty: 1,
            unitPrice: reco.price || 45000,
            subtotal: reco.price || 45000,
          },
        ]);
      }
    }
  };

  // Add ALL Recommendations in 1-Click
  const handleAddAllRecommendations = () => {
    customerRecommendations.forEach((reco) => {
      handleAddRecommendation(reco);
    });
  };

  // Adjust item quantity in cart
  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    const updated = [...cartItems];
    updated[index].qty = newQty;
    updated[index].subtotal = newQty * updated[index].unitPrice;
    setCartItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Financial Calculations
  const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalQty = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const pointsEarned = Math.floor(totalAmount / 10000);

  // Separate Today's purchases from past purchases
  const isSameDay = (dateStr: string, targetDate = new Date()) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return (
      d.getDate() === targetDate.getDate() &&
      d.getMonth() === targetDate.getMonth() &&
      d.getFullYear() === targetDate.getFullYear()
    );
  };

  const todayPurchases = useMemo(() => {
    return customerPurchases.filter((p) => isSameDay(p.purchasedAt));
  }, [customerPurchases]);

  const pastPurchases = useMemo(() => {
    return customerPurchases.filter((p) => !isSameDay(p.purchasedAt));
  }, [customerPurchases]);

  // Submit Purchase Transaction
  const handleSubmitPurchase = async () => {
    if (!selectedCustomer || cartItems.length === 0) return;

    setIsSubmittingPurchase(true);
    setErrorMsg(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesi login telah berakhir');

      const invNo = customInvoiceNo.trim() || `WRD-${Date.now().toString().slice(-6)}`;

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          storeId: user?.storeId || undefined,
          invoiceNo: invNo,
          purchasedAt: new Date().toISOString(),
          paymentMethod: 'counter',
          notes: transactionNotes.trim() || undefined,
          items: cartItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan transaksi');

      // Create snapshot object for receipt modal
      const savedPurchaseSnapshot: Purchase = {
        id: data.purchaseId || `P-${Date.now()}`,
        customerId: selectedCustomer.id,
        customerNameSnapshot: selectedCustomer.fullName,
        customerPhoneSnapshot: selectedCustomer.phone,
        storeId: user?.storeId || '',
        storeNameSnapshot: 'Counter Resmi Wardah',
        regionId: 'dki_jakarta',
        baId: user?.uid || '',
        baNameSnapshot: user?.displayName || 'Beauty Advisor Wardah',
        invoiceNo: invNo,
        purchasedAt: new Date().toISOString(),
        totalAmount,
        status: 'valid',
        paymentMethod: 'counter',
        notes: transactionNotes.trim() || undefined,
        items: [...cartItems],
        createdAt: new Date().toISOString(),
      };

      // Open receipt modal
      setSelectedReceipt(savedPurchaseSnapshot);
      setReceiptModalOpen(true);

      // Reset cart and form
      setCartItems([]);
      setCustomInvoiceNo(`WRD-${Date.now().toString().slice(-6)}`);
      setTransactionNotes('');

      // Update selected customer state immediately
      if (data.customer) {
        setSelectedCustomer((prev) => (prev ? { ...prev, ...data.customer } : prev));
      }

      // Update recent customers in state
      setRecentCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id
            ? {
                ...c,
                purchaseCount: (c.purchaseCount || 0) + 1,
                totalSpent: (c.totalSpent || 0) + totalAmount,
                lastPurchaseAt: new Date().toISOString(),
              }
            : c
        )
      );

      await loadCustomerPurchases(selectedCustomer.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan pembelian';
      setErrorMsg(message);
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

  // Void Purchase Handler
  const handleOpenVoidModal = (purchase: Purchase) => {
    setPurchaseToVoid(purchase);
    setVoidReasonText('Kesalahan input produk oleh BA');
    setVoidModalOpen(true);
  };

  const handleConfirmVoid = async () => {
    if (!purchaseToVoid || !voidReasonText.trim()) return;

    setIsVoiding(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/purchases/void', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          purchaseId: purchaseToVoid.id,
          reason: voidReasonText.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membatalkan transaksi');

      setVoidModalOpen(false);
      setPurchaseToVoid(null);
      if (selectedCustomer) {
        await loadCustomerPurchases(selectedCustomer.id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal membatalkan transaksi';
      alert(message);
    } finally {
      setIsVoiding(false);
    }
  };

  // WhatsApp Share URL Generator
  const generateWhatsAppShareUrl = (purchase: Purchase, cust = selectedCustomer) => {
    if (!cust) return '#';
    let phone = cust.phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.slice(1);
    }

    const itemsSummary = purchase.items
      ?.map((it, idx) => `${idx + 1}. *${it.productName}* (${it.qty}x) = ${formatIDR(it.subtotal)}`)
      .join('\n');

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wardahbeauty.com';
    const passportLink = `${origin}/passport/purchases?c=${cust.id}&scanned=true`;

    const text = `Halo Kak *${cust.fullName}*! ✨\n\nTerima kasih telah berkunjung dan berbelanja produk Wardah di counter resmi kami hari ini.\n\nBerikut rincian struk belanja Kakak:\n📄 *No. Struk*: #${purchase.invoiceNo}\n📅 *Waktu*: ${formatDateTime(purchase.purchasedAt)}\n\n🛍️ *Daftar Produk yang Dibeli*:\n${itemsSummary}\n\n💰 *Total Belanja*: *${formatIDR(purchase.totalAmount)}*\n✨ *Poin Wardah Diperoleh*: +${Math.floor(purchase.totalAmount / 10000)} Poin Reward\n\n📱 *Beauty Passport Digital*:\nKakak bisa melihat riwayat lengkap dan menukarkan poin reward di link berikut:\n${passportLink}\n\n_Your Beauty Journey Our Priority 💙_\n*Wardah Beauty Advisor*`;

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  };

  // Camera Scanner Functions (Alternative Mode)
  const stopCamera = useCallback(() => {
    isScanningActiveRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleCameraScanResult = useCallback(
    async (codeData: string) => {
      stopCamera();
      let customerId = '';
      if (codeData.includes('/p/')) {
        const token = codeData.split('/p/')[1].split('?')[0];
        const snap = await getDocs(query(collection(db, 'customers'), where('qrTokenId', '==', token), limit(1)));
        if (!snap.empty) {
          customerId = snap.docs[0].id;
        }
      } else if (codeData.includes('c=')) {
        customerId = new URL(codeData, window.location.origin).searchParams.get('c') || '';
      }

      if (customerId) {
        router.push(`/ba/customers/${customerId}`);
      } else {
        router.push(`/ba/customers/${codeData}`);
      }
    },
    [router, stopCamera]
  );

  const scanFrame = useCallback(() => {
    if (!isScanningActiveRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          handleCameraScanResult(code.data);
          return;
        }
      }
    }
    if (isScanningActiveRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    }
  }, [handleCameraScanResult]);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        isScanningActiveRef.current = true;
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menyalakan kamera';
      setCameraError(message);
    }
  }, [scanFrame, stopCamera]);

  useEffect(() => {
    if (activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab, startCamera, stopCamera]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="bg-gradient-to-r from-[#277A73] to-[#1E6560] px-6 pt-10 pb-8 text-white shadow-md">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Link href="/ba" className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <span>Barcode</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/20">
                  Wardah Official
                </span>
              </h1>
              <p className="text-white/80 text-xs mt-0.5">
                Update produk belanja customer hari ini & tampilkan barcode untuk di-scan customer langsung ke splashscreen/login
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-black/20 p-1 rounded-xl border border-white/20">
            <button
              onClick={() => setActiveTab('generate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'generate' ? 'bg-white text-[#277A73] shadow-xs' : 'text-white/80 hover:text-white'
              }`}
            >
              Barcode
            </button>
            <button
              onClick={() => setActiveTab('camera')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'camera' ? 'bg-white text-[#277A73] shadow-xs' : 'text-white/80 hover:text-white'
              }`}
            >
              Scan Kamera BA
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 -mt-4 max-w-5xl mx-auto space-y-6">
        {/* Error Alert */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-xs animate-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="font-bold text-rose-500 hover:text-rose-700">
              ✕
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 1: PILIH CUSTOMER, UPDATE BELANJA & TAMPILKAN BARCODE       */}
        {activeTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Search / Customer + POS Cashier Form (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Customer Search Bar (Shown when NO customer is selected) */}
              {!selectedCustomer && (
                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
                  <label className="text-xs font-bold text-gray-700 block">
                    1. Pilih Pelanggan (Nama / Nomor HP / Member ID):
                  </label>
                  <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Ketik nomor HP (08...) atau nama customer..."
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-[#277A73] focus:ring-1 focus:ring-[#277A73]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searching}
                      className="px-4 py-2.5 bg-[#277A73] text-white font-bold text-xs rounded-xl hover:bg-[#1E6560] transition-colors shrink-0 shadow-xs"
                    >
                      {searching ? 'Mencari...' : 'Cari'}
                    </button>
                  </form>

                  {/* Search Results */}
                  {searchResults.length > 0 && (
                    <div className="pt-2 border-t border-gray-50 space-y-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        Hasil Pencarian ({searchResults.length})
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                        {searchResults.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => selectCustomer(cust)}
                            className="w-full p-2.5 rounded-xl border border-gray-200 hover:border-[#277A73] hover:bg-[#E8F6F4]/30 text-left flex items-center justify-between transition-all"
                          >
                            <div>
                              <p className="text-xs font-bold text-gray-900">{cust.fullName}</p>
                              <p className="text-[10px] text-gray-500">
                                {cust.phone} • ID: {cust.memberNo}
                              </p>
                            </div>
                            <span className="text-[11px] text-[#277A73] font-bold">Pilih Pelanggan →</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Pick: Recent Customers (Shown when NO customer is selected) */}
              {!selectedCustomer && recentCustomers.length > 0 && (
                <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
                  <h3 className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#277A73]" />
                    <span>Pilih Cepat Pelanggan Terakhir:</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {recentCustomers.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => selectCustomer(cust)}
                        className="p-3 rounded-2xl border border-gray-100 hover:border-[#277A73] text-left hover:bg-[#E8F6F4]/30 transition-all flex items-center justify-between group"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-gray-900 truncate group-hover:text-[#277A73] transition-colors">
                            {cust.fullName}
                          </p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">{cust.phone}</p>
                        </div>
                        <span className="text-xs text-[#277A73]">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Form Kasir & Update Belanja (Shown when customer IS selected) */}
              {selectedCustomer && (
                <div className="space-y-4 animate-in fade-in">
                  {/* Selected Customer Header Banner */}
                  <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-[#E8F6F4] text-[#277A73] font-bold flex items-center justify-center text-base shrink-0 shadow-xs">
                        {selectedCustomer.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate">
                            {selectedCustomer.fullName}
                          </h3>
                          <span className="text-[10px] font-bold text-[#277A73] bg-[#E8F6F4] px-2 py-0.5 rounded-full capitalize">
                            {customerLoyalty?.tier || 'Bronze'} Member
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 font-mono truncate">
                          {selectedCustomer.phone} • ID: {selectedCustomer.memberNo}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Link
                        href={`/ba/customers/${selectedCustomer.id}`}
                        className="text-xs text-[#277A73] font-bold hover:underline flex items-center gap-1 px-2.5 py-1.5 rounded-xl hover:bg-[#E8F6F4]/60 transition-colors"
                        title="Buka profil lengkap customer"
                      >
                        <span className="hidden sm:inline">Profil Lengkap</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        type="button"
                        onClick={handleSwitchCustomer}
                        className="text-xs text-gray-600 hover:text-gray-900 font-bold flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
                        title="Ganti ke pelanggan lain"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Ganti</span>
                      </button>
                    </div>
                  </div>

                  {/* Section: Transaksi Hari Ini (Collapsible) */}
                  {todayPurchases.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-[#F0FAF9] border border-[#277A73]/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setShowTodayPurchases(!showTodayPurchases)}
                          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#277A73]" />
                          <span className="text-xs font-bold text-gray-900">
                            Transaksi Hari Ini ({todayPurchases.length}):
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-gray-500 transition-transform ${
                              showTodayPurchases ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        <span className="text-xs font-black text-[#277A73]">
                          {formatIDR(todayPurchases.reduce((s, p) => s + (p.status === 'valid' ? p.totalAmount : 0), 0))}
                        </span>
                      </div>

                      {showTodayPurchases && (
                        <div className="space-y-2 pt-1 border-t border-[#277A73]/10 max-h-48 overflow-y-auto pr-1 animate-in fade-in">
                          {todayPurchases.map((tp) => (
                            <div
                              key={tp.id}
                              className={`p-2.5 bg-white rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs ${
                                tp.status === 'void' ? 'border-red-200 bg-red-50/40 opacity-70' : 'border-gray-100'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-gray-800">#{tp.invoiceNo}</span>
                                  <span className="text-[10px] text-gray-400">({formatDateTime(tp.purchasedAt)})</span>
                                  <span
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                      tp.status === 'void' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {tp.status === 'void' ? 'Void' : 'Valid'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-600 mt-1">
                                  {tp.items?.map((it) => `${it.qty}x ${it.productName}`).join(', ')}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-bold text-[#277A73]">{formatIDR(tp.totalAmount)}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReceipt(tp);
                                    setReceiptModalOpen(true);
                                  }}
                                  className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg text-[11px] transition-colors"
                                >
                                  Struk
                                </button>
                                <a
                                  href={generateWhatsAppShareUrl(tp)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 rounded-lg transition-colors"
                                  title="Kirim Struk ke WhatsApp"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </a>
                                {tp.status === 'valid' && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVoidModal(tp)}
                                    className="text-[10px] text-rose-500 hover:text-rose-700 font-bold px-1"
                                    title="Batalkan (Void) transaksi ini"
                                  >
                                    Void
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section: Rekomendasi Hasil Konsultasi Kulit */}
                  {customerRecommendations.length > 0 && (
                    <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-[#E8F6F4]/50 border border-amber-200/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <h4 className="text-xs font-bold text-gray-900">
                            Rekomendasi Konsultasi ({customerRecommendations.length}):
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddAllRecommendations}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded-lg transition-colors shadow-2xs shrink-0 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Tambah Semua</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                        {customerRecommendations.map((reco, idx) => (
                          <div
                            key={idx}
                            className="p-2 bg-white rounded-xl border border-gray-200/80 flex items-center justify-between text-xs hover:border-[#277A73] transition-all"
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-bold text-gray-900 truncate text-[11px]">{reco.productName}</p>
                              {reco.reason && <p className="text-[10px] text-gray-400 truncate">{reco.reason}</p>}
                              <p className="text-[10px] font-semibold text-[#277A73] mt-0.5">
                                {formatIDR(reco.price || 45000)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddRecommendation(reco)}
                              className="px-2 py-1 bg-[#277A73]/10 text-[#277A73] hover:bg-[#277A73] hover:text-white font-bold rounded-lg text-[10px] transition-colors shrink-0"
                            >
                              + Tambah
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section: Product Catalog Picker */}
                  <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-[#277A73]" />
                        <span>Pilih Produk yang Dibeli Customer:</span>
                      </label>
                      <span className="text-[11px] text-gray-400 font-medium">
                        Total {products.length} Katalog Produk
                      </span>
                    </div>

                    {/* Search & Category Pills */}
                    <div className="space-y-2.5">
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Scan barcode EAN-13 atau cari nama, SKU, series Wardah..."
                          className="w-full pl-10 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#277A73] focus:bg-white transition-all"
                        />
                        {productSearch && (
                          <button
                            type="button"
                            onClick={() => setProductSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Category Pills */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                        <button
                          type="button"
                          onClick={() => setSelectedCategory('all')}
                          className={`px-3 py-1.5 rounded-full font-bold text-[11px] whitespace-nowrap transition-all ${
                            selectedCategory === 'all'
                              ? 'bg-[#277A73] text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Semua ({products.length})
                        </button>
                        {categories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-3 py-1.5 rounded-full font-bold text-[11px] whitespace-nowrap transition-all ${
                              selectedCategory === cat.id
                                ? 'bg-[#277A73] text-white shadow-2xs'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>

                      {/* Quick-Pick Product Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                        {filteredProducts.slice(0, 30).map((prod) => {
                          const inCart = cartItems.find((ci) => ci.productId === prod.id);
                          return (
                            <div
                              key={prod.id}
                              className={`p-2.5 rounded-xl border transition-all flex items-center justify-between text-xs group ${
                                inCart
                                  ? 'border-[#277A73] bg-[#E8F6F4]/30'
                                  : 'border-gray-200/80 hover:border-[#277A73] bg-white'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <p className="font-bold text-gray-900 truncate group-hover:text-[#277A73] transition-colors text-xs">
                                  {prod.name}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {prod.barcode ? (
                                    <span className="text-[9px] text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                      {prod.barcode}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 font-mono">{prod.sku || 'WRD'}</span>
                                  )}
                                  {prod.series && (
                                    <span className="text-[9px] font-semibold text-[#277A73] bg-[#E8F6F4] px-1.5 py-0.5 rounded truncate max-w-[120px]">
                                      {prod.series}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-bold text-[#277A73]">
                                    {formatIDR(prod.defaultPrice)}
                                  </span>
                                  {inCart && (
                                    <span className="text-[9px] font-bold text-[#277A73] bg-[#E8F6F4] px-1.5 py-0.5 rounded-full">
                                      {inCart.qty}x
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => addItemToCart(prod, 1)}
                                className="px-2.5 py-1.5 bg-[#277A73] text-white font-bold rounded-lg text-[11px] hover:bg-[#1E6560] transition-colors shrink-0 flex items-center gap-1 shadow-2xs active:scale-95"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Tambah</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Section: Cart & Checkout */}
                  {cartItems.length > 0 ? (
                    <div className="p-4 bg-gray-50/90 rounded-3xl border border-gray-200 space-y-3.5 animate-in fade-in">
                      <div className="flex items-center justify-between border-b border-gray-200/80 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                            Daftar Pembelian Baru:
                          </span>
                          <span className="bg-[#277A73] text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                            {totalQty} item
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearCart}
                          className="text-[11px] text-rose-500 hover:text-rose-700 font-bold transition-colors"
                        >
                          Kosongkan Keranjang
                        </button>
                      </div>

                      {/* Items in Cart List */}
                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {cartItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 bg-white rounded-xl border border-gray-200/80 flex items-center justify-between gap-2.5 text-xs shadow-2xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-gray-900 leading-tight truncate">{item.productName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-gray-400 font-mono">{item.sku}</span>
                                <span className="text-[10px] text-gray-500">
                                  @ {formatIDR(item.unitPrice)}
                                </span>
                                {item.isCustomPrice && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                                    Harga Khusus
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Stepper */}
                            <div className="flex items-center gap-1 bg-gray-50 px-1.5 py-0.5 rounded-lg border border-gray-200 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(idx, item.qty - 1)}
                                className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold text-xs"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={item.qty}
                                onChange={(e) => handleUpdateItemQty(idx, Math.max(1, Number(e.target.value)))}
                                className="w-8 text-center font-bold text-xs bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(idx, item.qty + 1)}
                                className="w-5 h-5 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold text-xs"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            {/* Subtotal & Delete */}
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <span className="font-black text-[#277A73]">{formatIDR(item.subtotal)}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                                title="Hapus produk ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Collapsible Invoice & Notes */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowExtraDetails(!showExtraDetails)}
                            className="text-[11px] text-[#277A73] hover:text-[#1E6560] font-bold flex items-center gap-1 transition-colors"
                          >
                            <span>
                              {showExtraDetails
                                ? '▾ Sembunyikan Detail Struk'
                                : '▸ Tambah No. Invoice / Catatan (Opsional)'}
                            </span>
                          </button>
                          {showExtraDetails && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 animate-in fade-in">
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                                  No. Invoice:
                                </label>
                                <input
                                  type="text"
                                  value={customInvoiceNo}
                                  onChange={(e) => setCustomInvoiceNo(e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:border-[#277A73]"
                                  placeholder="WRD-XXXXXX"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                                  Catatan Kasir:
                                </label>
                                <input
                                  type="text"
                                  value={transactionNotes}
                                  onChange={(e) => setTransactionNotes(e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#277A73]"
                                  placeholder="Cth: Promo bundling, gift sample..."
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Total Belanja & Points Preview */}
                        <div className="p-3.5 bg-white rounded-2xl border border-gray-200 space-y-1 mt-2 shadow-xs">
                          <div className="flex justify-between items-center font-bold text-sm sm:text-base text-gray-900">
                            <span>Total Belanja:</span>
                            <span className="text-base sm:text-lg font-black text-[#277A73]">
                              {formatIDR(totalAmount)}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-[10px] sm:text-[11px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              <span>Poin Reward Diperoleh:</span>
                            </span>
                            <span className="font-bold text-amber-600">+{pointsEarned} Poin Wardah</span>
                          </div>
                        </div>

                        {/* Submit Button */}
                        <button
                          type="button"
                          onClick={handleSubmitPurchase}
                          disabled={isSubmittingPurchase}
                          className="w-full py-3.5 bg-[#277A73] hover:bg-[#1E6560] text-white font-bold text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-[#277A73]/25 flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                        >
                          {isSubmittingPurchase ? (
                            <>
                              <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                              <span>Menyimpan Transaksi...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Simpan Transaksi & Update Barcode</span>
                            </>
                          )}
                        </button>
                      </div>
                  ) : (
                    <div className="p-4 bg-gray-50/80 rounded-2xl border border-dashed border-gray-200 text-center text-xs text-gray-500">
                      Keranjang belanja masih kosong. Klik <strong>&apos;+ Tambah&apos;</strong> pada produk di atas untuk mencatat pembelian customer.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: High-Contrast Barcode for Customer to Scan (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm text-center space-y-4 sticky top-6">
                <div className="flex items-center justify-center gap-2">
                  <QrCode className="w-5 h-5 text-[#277A73]" />
                  <h3 className="font-bold text-sm text-gray-900">Barcode</h3>
                </div>

                <div className="space-y-3">
                  <div className="bg-[#E8F6F4]/70 p-3 rounded-2xl border border-[#277A73]/20 text-center">
                    <p className="text-xs font-bold text-[#277A73]">Scan untuk Menuju Splashscreen / Login</p>
                    <p className="text-[11px] text-gray-600 mt-1 leading-snug">
                      Arahkan kamera smartphone customer ke barcode ini untuk langsung diarahkan ke halaman splashscreen & login Wardah Beauty Passport.
                    </p>
                  </div>

                  {/* QR Code Container */}
                  <div className="p-4 bg-white rounded-2xl border-2 border-[#277A73]/20 shadow-md inline-block mx-auto transition-transform hover:scale-102">
                    {isMounted ? (
                      <QRCode value={projectSplashUrl || 'https://wardah.id'} size={190} level="H" fgColor="#277A73" />
                    ) : (
                      <div className="w-[190px] h-[190px] bg-gray-50 rounded-xl flex flex-col items-center justify-center gap-2 border border-gray-100">
                        <QrCode className="w-12 h-12 text-[#277A73]/30 animate-pulse" />
                        <span className="text-[10px] text-gray-400 font-medium">Memuat Barcode...</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <a
                      href={isMounted ? projectSplashUrl || '/' : '/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-bold text-xs text-[#277A73] hover:text-[#1E6560] bg-[#E8F6F4] px-3.5 py-2 rounded-xl transition-colors shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka Halaman Splashscreen (Preview)</span>
                    </a>
                  </div>
                </div>

                {/* If Customer is selected, show their info and recent purchases below the QR code */}
                {selectedCustomer ? (
                  <div className="pt-4 border-t border-gray-100 text-left space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-gray-800">Pelanggan Aktif:</p>
                      <span className="text-[10px] font-bold bg-[#E8F6F4] text-[#277A73] px-2.5 py-0.5 rounded-full">
                        {selectedCustomer.fullName}
                      </span>
                    </div>

                    {/* Stats summary of current customer */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-gray-50 rounded-xl text-left border border-gray-100">
                        <span className="text-[10px] text-gray-400 font-medium block">Total Transaksi</span>
                        <span className="font-bold text-[#277A73]">{selectedCustomer.purchaseCount || 0}x</span>
                      </div>
                      <div className="p-2 bg-gray-50 rounded-xl text-left border border-gray-100">
                        <span className="text-[10px] text-gray-400 font-medium block">Total Belanja</span>
                        <span className="font-bold text-[#277A73]">
                          {formatIDR(selectedCustomer.totalSpent || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Past Purchases Summary */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Riwayat Transaksi:
                        </p>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {pastPurchases.length} transaksi
                        </span>
                      </div>

                      {pastPurchases.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic">Belum ada transaksi sebelumnya.</p>
                      ) : (
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                          {pastPurchases.slice(0, 4).map((p) => (
                            <div
                              key={p.id}
                              className="flex justify-between items-center text-xs py-1 border-b border-gray-50 last:border-0"
                            >
                              <div>
                                <div className="flex items-center gap-1">
                                  <p className="font-semibold text-gray-800 text-[11px]">
                                    {formatIDR(p.totalAmount)}
                                  </p>
                                  <span
                                    className={`text-[8px] font-bold px-1 rounded ${
                                      p.status === 'void' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {p.status === 'void' ? 'Void' : 'Valid'}
                                  </span>
                                </div>
                                <p className="text-[9px] text-gray-400">{formatDate(p.purchasedAt)}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-mono text-gray-400">
                                  #{p.invoiceNo || p.id.slice(0, 6)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedReceipt(p);
                                    setReceiptModalOpen(true);
                                  }}
                                  className="text-[10px] text-[#277A73] font-bold hover:underline"
                                >
                                  Detail
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-gray-100 text-center">
                    <p className="text-[11px] text-gray-400">
                      💡 Tip: Pilih pelanggan di sebelah kiri untuk mencatat pembelian baru atau melihat riwayat belanjanya.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: SCANNER KAMERA ALTERNATIF BAGI BA                        */}
        {/* ============================================================== */}
        {activeTab === 'camera' && (
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm max-w-md mx-auto space-y-4 text-center">
            <h3 className="font-bold text-sm text-gray-900">Scan Barcode / QR Customer</h3>
            <p className="text-xs text-gray-500">
              Arahkan kamera ke QR code customer jika customer ingin menunjukkan kartunya kepada Anda.
            </p>

            <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black shadow-inner">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <div className="absolute inset-0 border-2 border-[#277A73]/70 pointer-events-none rounded-2xl" />
              {cameraError && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 text-white text-xs font-semibold">
                  {cameraError}
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveTab('generate')}
              className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
            >
              Kembali ke Barcode
            </button>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL: STRUK / NOTA DIGITAL TRANSAKSI BELANJA                  */}
      {/* ============================================================== */}
      {receiptModalOpen && selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-[#E8F6F4]/50">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#277A73]" />
                <h3 className="font-bold text-sm text-gray-900">Struk Transaksi Digital</h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white text-gray-400 hover:text-gray-700 flex items-center justify-center shadow-xs"
              >
                ✕
              </button>
            </div>

            {/* Receipt Body (Printable Slip) */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono bg-white">
              {/* Receipt Header */}
              <div className="text-center space-y-1">
                <h2 className="text-base font-black text-gray-900 tracking-wide font-sans">WARDAH BEAUTY COUNTER</h2>
                <p className="text-[10px] text-gray-500">Official Beauty Passport Terminal</p>
                <p className="text-[10px] text-gray-400">Counter: {selectedReceipt.storeNameSnapshot || 'Counter Wardah'}</p>
                <div className="border-b border-dashed border-gray-300 my-2" />
              </div>

              {/* Receipt Meta */}
              <div className="space-y-1 text-[11px] text-gray-600">
                <div className="flex justify-between">
                  <span>No. Struk:</span>
                  <span className="font-bold text-gray-900">#{selectedReceipt.invoiceNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>Waktu:</span>
                  <span>{formatDateTime(selectedReceipt.purchasedAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>BA:</span>
                  <span className="font-bold">{selectedReceipt.baNameSnapshot || 'Beauty Advisor'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-bold">{selectedReceipt.customerNameSnapshot}</span>
                </div>
                <div className="border-b border-dashed border-gray-300 my-2" />
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase">
                  <span>Item</span>
                  <span>Subtotal</span>
                </div>
                {selectedReceipt.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-start text-xs">
                    <div className="pr-2">
                      <p className="font-bold text-gray-900 leading-tight">{it.productName}</p>
                      <p className="text-[10px] text-gray-500">
                        {it.qty} × {formatIDR(it.unitPrice)}
                      </p>
                    </div>
                    <span className="font-bold text-gray-900 shrink-0">{formatIDR(it.subtotal)}</span>
                  </div>
                ))}
                <div className="border-b border-dashed border-gray-300 my-2" />
              </div>

              {/* Totals & Payments */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between font-bold text-sm text-gray-900">
                  <span>Total Belanja:</span>
                  <span className="text-[#277A73]">{formatIDR(selectedReceipt.totalAmount)}</span>
                </div>

                <div className="flex justify-between text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg font-bold">
                  <span>Poin Reward Bertambah:</span>
                  <span>+{Math.floor(selectedReceipt.totalAmount / 10000)} Poin</span>
                </div>
                {selectedReceipt.notes && (
                  <div className="text-[10px] text-gray-500 italic mt-1">Catatan: {selectedReceipt.notes}</div>
                )}
                {selectedReceipt.status === 'void' && (
                  <div className="p-2 rounded-lg bg-red-100 text-red-700 font-bold text-center text-xs mt-2">
                    TRANSAKSI TELAH DIBATALKAN (VOID)
                    {selectedReceipt.voidReason && <p className="text-[10px] font-normal">Alasan: {selectedReceipt.voidReason}</p>}
                  </div>
                )}
              </div>

              {/* Receipt Footer */}
              <div className="text-center pt-3 border-t border-dashed border-gray-300 space-y-1">
                <p className="text-[10px] text-gray-500">Terima kasih atas kunjungan Anda!</p>
                <p className="text-[10px] text-[#277A73] font-bold italic font-sans">
                  Your Beauty Journey Our Priority 💙
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
              <a
                href={generateWhatsAppShareUrl(selectedReceipt)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 bg-[#25D366] hover:bg-[#1EBE5D] text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                <span>Kirim via WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-2.5 px-4 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Struk</span>
              </button>

              <button
                type="button"
                onClick={() => setReceiptModalOpen(false)}
                className="py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs rounded-xl transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: KONFIRMASI VOID / BATALKAN TRANSAKSI                     */}
      {/* ============================================================== */}
      {voidModalOpen && purchaseToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 border border-gray-100">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
              <RotateCcw className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-gray-900">Batalkan Transaksi (Void)?</h3>
              <p className="text-xs text-gray-500">
                Invoice #{purchaseToVoid.invoiceNo} senilai{' '}
                <strong className="text-gray-900">{formatIDR(purchaseToVoid.totalAmount)}</strong> akan dibatalkan dan
                poin customer akan disesuaikan kembali.
              </p>
            </div>

            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-gray-700 block">Alasan Pembatalan (Void):</label>
              <textarea
                value={voidReasonText}
                onChange={(e) => setVoidReasonText(e.target.value)}
                placeholder="Masukkan alasan pembatalan..."
                rows={2}
                className="w-full p-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:border-[#277A73]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVoidModalOpen(false)}
                disabled={isVoiding}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={isVoiding || !voidReasonText.trim()}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {isVoiding ? 'Memproses...' : 'Ya, Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
