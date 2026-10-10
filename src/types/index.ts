// =============================================
// Domain Types — Kahf Passport
// =============================================

export type UserRole = 'customer' | 'ba' | 'admin_region' | 'super_admin';

export interface User {
  uid: string;
  name: string;
  phone?: string;
  email?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export type CustomerStatus = 'unclaimed' | 'active' | 'blocked';

export interface Customer {
  id: string;
  publicId: string;
  uid: string | null;
  fullName: string;
  phone: string;
  photoUrl?: string;
  birthDate?: string;
  gender?: 'male' | 'female';
  city?: string;
  regionId?: string;
  memberNo: string;
  registeredByBaId: string | null;
  registeredStoreId: string | null;
  status: CustomerStatus;
  claimedAt?: string;
  qrTokenId: string;
  lastPurchaseAt?: string;
  purchaseCount: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

export interface QrToken {
  id: string;
  customerId: string;
  isActive: boolean;
  createdAt: string;
  revokedAt?: string;
}

export interface Region {
  id: string;
  name: string;
  parentId?: string;
  level: number;
}

export interface Store {
  id: string;
  regionId: string;
  code: string;
  name: string;
  city: string;
  address: string;
  isActive: boolean;
  createdAt: string;
}

export interface BaProfile {
  uid: string;
  storeId: string;
  employeeCode: string;
  isActive: boolean;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  mainCategory?: string;
}

export interface Product {
  id: string;
  categoryId: string;
  sku: string;
  name: string;
  description?: string;
  imageUrl?: string;
  defaultPrice: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  suitableSkinTypes?: string[];
  suitableConcerns?: string[];
  routineStep?: string;
  barcode?: string;
  sapCode?: string;
  odooCode?: string;
  series?: string;
  mainCategory?: string;
}

export type PurchaseStatus = 'valid' | 'void';

export interface PurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

export interface Purchase {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  storeId: string;
  storeNameSnapshot: string;
  regionId: string;
  baId: string;
  baNameSnapshot: string;
  invoiceNo: string;
  purchasedAt: string;
  totalAmount: number;
  status: PurchaseStatus;
  paymentMethod?: string;
  notes?: string;
  cashReceived?: number;
  cashChange?: number;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
  items: PurchaseItem[];
  createdAt: string;
}

export interface CustomerConsent {
  id: string;
  customerId: string;
  type: 'data_processing' | 'marketing';
  version: string;
  grantedAt: string;
  channel: 'self_register' | 'ba_assisted';
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface DailySalesSummary {
  id: string;
  date: string;
  storeId: string;
  regionId: string;
  totalSales: number;
  totalOrders: number;
  totalQty: number;
  newCustomers: number;
  repeatCustomers: number;
  uniqueCustomers: number;
}

export interface DailyProductSummary {
  id: string;
  date: string;
  productId: string;
  productName: string;
  regionId: string;
  qty: number;
  sales: number;
}

export interface DailyBaSummary {
  id: string;
  date: string;
  baId: string;
  baName: string;
  orders: number;
  sales: number;
  newCustomers: number;
}

export interface CustomClaims {
  role: UserRole;
  storeId?: string;
  regionId?: string;
}

// =============================================
// Phase 2 — Skin Profile & Konsultasi
// =============================================

export type SkinType = 'normal' | 'oily' | 'dry' | 'combination' | 'sensitive';

export interface SkinProfile {
  id: string;
  customerId: string;
  skinType: SkinType;
  concerns: string[];       // e.g. ['jerawat', 'kusam', 'flek hitam']
  preferences: string[];    // e.g. ['natural look', 'full coverage']
  updatedAt: string;
  updatedByBaId?: string;
}

export interface Consultation {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  baId: string;
  baNameSnapshot: string;
  storeId: string;
  storeNameSnapshot: string;
  skinType: SkinType;
  concerns: string[];
  notes: string;
  recommendedProducts: RecommendedProduct[];
  createdAt: string;
}

export interface RecommendedProduct {
  productId: string;
  productName: string;
  sku: string;
  reason: string;           // alasan rekomendasi
}

export interface Recommendation {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  baId: string;
  baNameSnapshot: string;
  storeNameSnapshot: string;
  consultationId?: string;
  products: RecommendedProduct[];
  status: 'pending' | 'purchased' | 'dismissed';
  createdAt: string;
}

// =============================================
// Phase 2 — Reminder Repurchase
// =============================================

export interface Reminder {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  customerPhone: string;
  productId: string;
  productName: string;
  reminderDate: string;       // YYYY-MM-DD
  status: 'pending' | 'sent' | 'cancelled';
  purchaseId?: string;        // pembelian yang men-trigger reminder
  message?: string;
  sentAt?: string;
  createdAt: string;
}

// =============================================
// Phase 2 — Loyalty Point & Reward
// =============================================

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyAccount {
  id: string;                 // same as customerId
  customerId: string;
  currentPoints: number;
  totalEarnedPoints: number;
  totalRedeemedPoints: number;
  tier: LoyaltyTier;
  tierUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type LedgerType = 'earn' | 'redeem' | 'expire' | 'adjust';

export interface LoyaltyLedger {
  id: string;
  customerId: string;
  type: LedgerType;
  points: number;             // positive for earn, negative for redeem/expire
  balance: number;            // balance after this entry
  description: string;
  referenceType?: 'purchase' | 'reward' | 'admin';
  referenceId?: string;
  createdAt: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  stock: number;
  isActive: boolean;
  imageUrl?: string;
  createdAt: string;
}

export interface RewardRedemption {
  id: string;
  customerId: string;
  customerNameSnapshot: string;
  rewardId: string;
  rewardNameSnapshot: string;
  pointsSpent: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  fulfilledAt?: string;
  fulfilledByBaId?: string;
  createdAt: string;
}

// Tier thresholds
export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 500,
  gold: 1500,
  platinum: 5000,
};

// Points per IDR spent
export const POINTS_PER_IDR = 10000; // 1 point per 10.000 IDR

// =============================================
// Customer Notification & Messaging
// =============================================

export type NotificationType =
  | 'ba_message'        // Pesan langsung / personal dari BA
  | 'follow_up'         // Notifikasi tindak lanjut / repurchase
  | 'admin_broadcast'   // Pesan resmi / pengumuman dari Admin
  | 'consultation'      // Hasil konsultasi & rekomendasi produk siap
  | 'reward'            // Notifikasi poin / reward
  | 'promo';            // Info promo & produk baru

export interface CustomerNotification {
  id: string;
  customerId: string;
  customerUid?: string | null;
  customerName?: string;
  senderId: string;
  senderName: string;
  senderRole: 'ba' | 'admin';
  storeId?: string;
  storeName?: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

