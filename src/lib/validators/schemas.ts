import * as z from 'zod';

// ---- Auth schemas ----
export const loginSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

export const phoneSchema = z.object({
  phone: z
    .string()
    .regex(/^(\+62|62|0)?8[0-9]{6,12}$/, 'Nomor HP tidak valid'),
});

export const loginPhoneSchema = z.object({
  phone: z
    .string()
    .regex(/^(\+62|62|0)?8[0-9]{6,12}$/, 'Nomor HP tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

// Customer Login by Name and Phone
export const customerLoginSchema = z.object({
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(100),
  phone: z
    .string()
    .min(8, 'Nomor HP minimal 8 digit')
    .max(20, 'Nomor HP maksimal 20 digit')
    .regex(/^(\+62|62|0)?8[0-9]{6,13}$/, 'Format nomor HP tidak valid (contoh: 081234567890)'),
});

export const otpSchema = z.object({
  otp: z.string().length(6, 'OTP harus 6 digit').regex(/^\d+$/, 'OTP hanya angka'),
});

// Customer Register with Phone, Full Name, Password, and City
export const customerRegisterSchema = z.object({
  phone: z
    .string()
    .min(8, 'Nomor HP minimal 8 digit')
    .max(20, 'Nomor HP maksimal 20 digit')
    .regex(/^(\+62|62|0)?8[0-9]{6,13}$/, 'Format nomor HP tidak valid (contoh: 081234567890)'),
  fullName: z.string().min(2, 'Nama lengkap minimal 2 karakter').max(100),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  city: z.string().min(2, 'Kota domisili minimal 2 karakter').max(100),
});

export const registerSchema = customerRegisterSchema;

// ---- Purchase schemas ----
export const purchaseItemSchema = z.object({
  productId: z.string().min(1, 'Produk wajib dipilih'),
  qty: z.number().int().positive('Qty harus > 0'),
  unitPrice: z.number().positive('Harga harus > 0'),
});

export const recordPurchaseSchema = z.object({
  invoiceNo: z.string().min(1, 'No. struk wajib diisi').max(100),
  purchasedAt: z.string(), // ISO datetime string
  items: z.array(purchaseItemSchema).min(1, 'Minimal 1 item'),
});

export const voidPurchaseSchema = z.object({
  reason: z.string().min(5, 'Alasan void minimal 5 karakter').max(300),
});

// ---- Customer quick register by BA ----
export const quickRegisterCustomerSchema = z.object({
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(100),
  phone: z
    .string()
    .regex(/^(\+62|62|0)8[1-9][0-9]{6,10}$/, 'Nomor HP tidak valid'),
  city: z.string().max(100).optional(),
});

// ---- Master data schemas ----
export const productSchema = z.object({
  categoryId: z.string().min(1, 'Kategori wajib dipilih'),
  sku: z.string().min(1, 'SKU wajib diisi').max(50),
  name: z.string().min(1, 'Nama wajib diisi').max(200),
  description: z.string().max(500).optional(),
  imageUrl: z.string().optional(),
  defaultPrice: z.number().positive('Harga harus > 0'),
  isActive: z.boolean(),
  suitableSkinTypes: z.array(z.string()).optional(),
  suitableConcerns: z.array(z.string()).optional(),
  routineStep: z.string().optional(),
});

export const storeSchema = z.object({
  regionId: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  address: z.string().max(500).optional(),
  isActive: z.boolean(),
});

export const productCategorySchema = z.object({
  name: z.string().min(2, 'Nama kategori minimal 2 karakter').max(100),
  slug: z.string().min(2, 'Kode/Slug minimal 2 karakter').max(50).optional(),
  description: z.string().max(300).optional(),
  icon: z.string().max(20).optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type PhoneFormValues = z.infer<typeof phoneSchema>;
export type LoginPhoneFormValues = z.infer<typeof loginPhoneSchema>;
export type CustomerLoginFormValues = z.infer<typeof customerLoginSchema>;
export type OtpFormValues = z.infer<typeof otpSchema>;
export type CustomerRegisterFormValues = z.infer<typeof customerRegisterSchema>;
export type RegisterFormValues = CustomerRegisterFormValues;
export type RecordPurchaseFormValues = z.infer<typeof recordPurchaseSchema>;
export type VoidPurchaseFormValues = z.infer<typeof voidPurchaseSchema>;
export type QuickRegisterCustomerFormValues = z.infer<typeof quickRegisterCustomerSchema>;
export type ProductFormValues = z.infer<typeof productSchema>;
export type ProductCategoryFormValues = z.infer<typeof productCategorySchema>;
export type StoreFormValues = z.infer<typeof storeSchema>;
