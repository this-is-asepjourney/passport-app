/**
 * Script Import Katalog Produk Wardah dari File Excel Form Order MT (.xlsx)
 *
 * Cara Menjalankan:
 *   npm run import:products
 * atau dengan path custom:
 *   npm run import:products "FORM ORDER WARDAH MT 112026.xlsx"
 */

import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Helper icon
function getWardahCategoryIcon(name, mainCategory) {
  const n = name.toLowerCase();
  if (n.includes('sunscreen') || n.includes('uv')) return '☀️';
  if (n.includes('acne')) return '🔴';
  if (n.includes('c-defense') || n.includes('vitamin c')) return '🍊';
  if (n.includes('hydra') || n.includes('rose')) return '🌹';
  if (n.includes('lightening') || n.includes('bright')) return '✨';
  if (n.includes('crystal')) return '💎';
  if (n.includes('renew') || n.includes('aging')) return '⏳';
  if (n.includes('lip')) return '💄';
  if (n.includes('eye') || n.includes('eyexpert')) return '👁️';
  if (n.includes('powder') || n.includes('cushion') || n.includes('foundation') || n.includes('face make up')) return '🪞';
  if (n.includes('cleanser') || n.includes('wash') || n.includes('micellar')) return '🧴';
  if (n.includes('hair') || n.includes('shampoo')) return '💇';
  if (n.includes('deodorant')) return '🌿';
  if (n.includes('scentsation') || n.includes('parfum') || n.includes('mist')) return '🌸';
  if (n.includes('spa')) return '🫧';
  if (n.includes('package')) return '🎁';
  if (n.includes('tool') || n.includes('brush') || n.includes('blender')) return '🖌️';
  if (mainCategory === 'DECORATIVE') return '💄';
  if (mainCategory === 'PERSONAL CARE') return '🧼';
  return '✨';
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferRoutineStep(name) {
  const n = name.toLowerCase();
  if (n.includes('sunscreen') || n.includes('spf') || n.includes('uv shield')) return 'protection';
  if (n.includes('cleanser') || n.includes('foam') || n.includes('wash') || n.includes('micellar') || n.includes('balm') || n.includes('scrub')) return 'cleanser';
  if (n.includes('serum') || n.includes('ampoule') || n.includes('essence') || n.includes('treatment') || n.includes('peeling')) return 'treatment';
  if (n.includes('moisturizer') || n.includes('day cream') || n.includes('night cream') || n.includes('gel') || n.includes('lotion')) return 'moisturizer';
  if (n.includes('parfum') || n.includes('body mist') || n.includes('eau de toilette') || n.includes('scentsation')) return 'fragrance';
  if (n.includes('hair') || n.includes('shampoo') || n.includes('conditioner') || n.includes('body')) return 'body_hair';
  return null;
}

function inferSkinTypes(name, series) {
  const combined = `${name} ${series}`.toLowerCase();
  const types = [];
  if (combined.includes('acne') || combined.includes('oil control') || combined.includes('matte')) {
    types.push('oily', 'combination');
  }
  if (combined.includes('hydra') || combined.includes('dry') || combined.includes('nourish')) {
    types.push('dry');
  }
  if (combined.includes('calm') || combined.includes('soothe') || combined.includes('sensitive') || combined.includes('low ph')) {
    types.push('sensitive');
  }
  if (combined.includes('lightening') || combined.includes('crystal') || combined.includes('perfect bright')) {
    if (!types.includes('normal')) types.push('normal');
  }
  return types.length > 0 ? types : ['normal'];
}

function inferSkinConcerns(name, series) {
  const combined = `${name} ${series}`.toLowerCase();
  const concerns = [];
  if (combined.includes('acne') || combined.includes('jerawat') || combined.includes('salicylic')) {
    concerns.push('jerawat');
  }
  if (combined.includes('blackhead') || combined.includes('pore') || combined.includes('pori')) {
    concerns.push('komedo_pori');
  }
  if (combined.includes('bright') || combined.includes('lightening') || combined.includes('kusam') || combined.includes('glow') || combined.includes('crystal')) {
    concerns.push('kusam');
  }
  if (combined.includes('oil control') || combined.includes('sebum') || combined.includes('clay')) {
    concerns.push('minyak');
  }
  if (combined.includes('aging') || combined.includes('renew') || combined.includes('wrinkle') || combined.includes('collagen')) {
    concerns.push('penuaan');
  }
  if (combined.includes('hydra') || combined.includes('dehidrasi') || combined.includes('rose')) {
    concerns.push('dehidrasi');
  }
  if (combined.includes('calm') || combined.includes('soothe') || combined.includes('sensitive')) {
    concerns.push('sensitif');
  }
  return concerns;
}

async function main() {
  const filePath = process.argv[2] || path.join(process.cwd(), 'FORM ORDER WARDAH MT 102026.xlsx');

  console.log('='.repeat(60));
  console.log('🚀 WARDAH EXCEL CATALOG IMPORTER');
  console.log('='.repeat(60));
  console.log('📁 Membaca file:', filePath);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File tidak ditemukan: ${filePath}`);
    process.exit(1);
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

  console.log(`📊 Ditemukan lembar kerja "${sheetName}" dengan ${rawRows.length} baris.`);

  // Find header row
  let headerIndex = -1;
  for (let i = 0; i < Math.min(20, rawRows.length); i++) {
    const rowStr = (rawRows[i] || []).map((c) => String(c || '').toUpperCase()).join(' ');
    if (
      (rowStr.includes('KODE ODOO') || rowStr.includes('ODOO')) &&
      (rowStr.includes('NAMA PRODUK') || rowStr.includes('HARGA') || rowStr.includes('SAP CODE'))
    ) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) headerIndex = 6;

  let currentMainCategory = 'FACE CARE';
  let currentSeries = '';
  const categoriesMap = new Map();
  const products = [];
  const seenKeys = new Set();
  const knownMainCategories = ['FACE CARE', 'DECORATIVE', 'PERSONAL CARE'];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i] || [];
    const c0 = row[0] != null ? String(row[0]).trim() : '';
    const c1 = row[1] != null ? String(row[1]).trim() : '';
    const c2 = row[2] != null ? String(row[2]).trim() : '';
    const c4 = row[4] != null ? String(row[4]).trim() : '';
    const c5 = row[5] != null ? row[5] : null;

    if (c0 && !c1 && !c2 && !c4 && c5 == null) {
      const upper = c0.toUpperCase();
      if (knownMainCategories.includes(upper)) {
        currentMainCategory = upper;
        currentSeries = '';
      } else {
        currentSeries = c0;
      }
      continue;
    }

    if (c4 && c5 != null) {
      const rawPrice = typeof c5 === 'number' ? c5 : parseFloat(String(c5).replace(/[^0-9.]/g, '')) || 0;
      const price = Math.round(rawPrice);
      const odooCode = c0;
      const sapCode = c1;
      const barcode = c2;
      const name = c4;

      const uniqueKey = sapCode || odooCode || `${barcode}-${name}`;
      if (seenKeys.has(uniqueKey)) continue;
      seenKeys.add(uniqueKey);

      const categoryName = currentSeries ? currentSeries : currentMainCategory;
      const categorySlug = slugify(categoryName);
      const categoryId = categorySlug;
      const icon = getWardahCategoryIcon(categoryName, currentMainCategory);

      if (!categoriesMap.has(categoryId)) {
        categoriesMap.set(categoryId, {
          id: categoryId,
          name: categoryName,
          slug: categorySlug,
          icon,
          mainCategory: currentMainCategory,
          productCount: 0,
        });
      }
      categoriesMap.get(categoryId).productCount++;

      const prodId = sapCode ? `PRD-${sapCode}` : odooCode ? `PRD-${odooCode}` : `PRD-${barcode || Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const sku = sapCode || odooCode || barcode || prodId;

      products.push({
        id: prodId,
        sku,
        name,
        odooCode,
        sapCode,
        barcode,
        defaultPrice: price,
        mainCategory: currentMainCategory,
        series: currentSeries,
        categoryId,
        routineStep: inferRoutineStep(name),
        suitableSkinTypes: inferSkinTypes(name, currentSeries),
        suitableConcerns: inferSkinConcerns(name, currentSeries),
      });
    }
  }

  const categories = Array.from(categoriesMap.values());
  console.log(`✅ Berhasil mem-parse: ${products.length} produk dan ${categories.length} kategori.`);

  // Initialize Firebase Admin
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (!process.env.FIREBASE_ADMIN_PROJECT_ID) {
    console.error('❌ FIREBASE_ADMIN_PROJECT_ID belum diset di .env.local!');
    process.exit(1);
  }

  const app = getApps().length > 0 ? getApps()[0] : initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });

  const db = getFirestore(app);

  // 1. Sinkronisasi Kategori
  console.log('\n📂 Menyinkronkan kategori ke Firestore...');
  const catBatch = db.batch();
  for (const cat of categories) {
    const ref = db.collection('productCategories').doc(cat.id);
    catBatch.set(
      ref,
      {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        mainCategory: cat.mainCategory,
        description: `Katalog resmi ${cat.name} Wardah`,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await catBatch.commit();
  console.log(`✅ ${categories.length} kategori tersinkronisasi.`);

  // 2. Sinkronisasi Produk dalam chunk max 400
  console.log(`\n📦 Menyinkronkan ${products.length} produk ke Firestore (Smart Upsert)...`);
  const chunkSize = 400;
  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    const prodBatch = db.batch();

    for (const prod of chunk) {
      const ref = db.collection('products').doc(prod.id);
      const data = {
        id: prod.id,
        sku: prod.sku,
        name: prod.name,
        defaultPrice: prod.defaultPrice,
        categoryId: prod.categoryId,
        odooCode: prod.odooCode,
        sapCode: prod.sapCode,
        barcode: prod.barcode,
        series: prod.series,
        mainCategory: prod.mainCategory,
        isActive: true,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (prod.routineStep) data.routineStep = prod.routineStep;
      if (prod.suitableSkinTypes?.length) data.suitableSkinTypes = prod.suitableSkinTypes;
      if (prod.suitableConcerns?.length) data.suitableConcerns = prod.suitableConcerns;

      prodBatch.set(ref, data, { merge: true });
    }

    await prodBatch.commit();
    console.log(`   -> Batch ${Math.floor(i / chunkSize) + 1}: ${chunk.length} produk tersimpan (Index ${i + 1} s/d ${Math.min(i + chunkSize, products.length)})`);
  }

  console.log('\n🎉 Selesai! Semua data produk dan kategori Wardah berhasil masuk ke sistem.');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('❌ Terjadi kesalahan saat import produk:', err);
  process.exit(1);
});
