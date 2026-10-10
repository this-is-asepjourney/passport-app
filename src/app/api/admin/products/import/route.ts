import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { parseWardahOrderExcel } from '@/lib/products/excel-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/products/import
 * Impor atau sinkronisasi data produk Wardah dari file Excel Form Order Modern Trade (.xlsx)
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verifikasi Akses Admin
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Token otentikasi tidak valid atau kadaluarsa' }, { status: 401 });
    }

    const db = adminDb();

    let role = (decodedToken.role || '').toString();
    if (!role || (!['super_admin', 'admin_region'].includes(role) && !role.includes('admin'))) {
      // Fallback: check users collection
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      role = (userDoc.data()?.role || '').toString();
    }

    if (role !== 'super_admin' && role !== 'admin_region' && !role.includes('admin')) {
      return NextResponse.json({ error: 'Akses ditolak. Fitur ini khusus untuk Administrator.' }, { status: 403 });
    }

    // 2. Ambil File dari FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'File Excel (.xlsx) wajib disertakan' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 3. Parse File Excel Menggunakan Engine Parser
    const parseResult = parseWardahOrderExcel(buffer);
    const { categories, products, summary } = parseResult;

    if (!products || products.length === 0) {
      return NextResponse.json({ error: 'Tidak ditemukan produk yang valid dalam file Excel.' }, { status: 400 });
    }

    // 4. Batch Upsert Kategori (productCategories)
    const categoryBatches = [];
    let currentCatBatch = db.batch();
    let catOpCount = 0;

    for (const cat of categories) {
      const catRef = db.collection('productCategories').doc(cat.id);
      currentCatBatch.set(
        catRef,
        {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon,
          mainCategory: cat.mainCategory,
          description: `Katalog resmi ${cat.name} Wardah`,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      catOpCount++;
      if (catOpCount >= 400) {
        categoryBatches.push(currentCatBatch);
        currentCatBatch = db.batch();
        catOpCount = 0;
      }
    }
    if (catOpCount > 0) {
      categoryBatches.push(currentCatBatch);
    }

    for (const b of categoryBatches) {
      await b.commit();
    }

    // 5. Batch Upsert Produk (products) dalam Chunk Max 400 Docs per Commit
    const productBatches = [];
    let currentProdBatch = db.batch();
    let prodOpCount = 0;

    for (const prod of products) {
      const prodRef = db.collection('products').doc(prod.id);
      const prodData: Record<string, unknown> = {
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
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (prod.routineStep) {
        prodData.routineStep = prod.routineStep;
      }
      if (prod.suitableSkinTypes && prod.suitableSkinTypes.length > 0) {
        prodData.suitableSkinTypes = prod.suitableSkinTypes;
      }
      if (prod.suitableConcerns && prod.suitableConcerns.length > 0) {
        prodData.suitableConcerns = prod.suitableConcerns;
      }

      currentProdBatch.set(prodRef, prodData, { merge: true });
      prodOpCount++;

      if (prodOpCount >= 400) {
        productBatches.push(currentProdBatch);
        currentProdBatch = db.batch();
        prodOpCount = 0;
      }
    }
    if (prodOpCount > 0) {
      productBatches.push(currentProdBatch);
    }

    for (const b of productBatches) {
      await b.commit();
    }

    // 6. Catat Audit Log
    try {
      await db.collection('auditLogs').add({
        action: 'IMPORT_PRODUCTS_EXCEL',
        actorId: decodedToken.uid || 'admin',
        actorRole: role,
        details: {
          fileName: file.name,
          totalProducts: products.length,
          totalCategories: categories.length,
        },
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (auditErr) {
      console.warn('Gagal mencatat audit log import produk:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: `Berhasil menyinkronkan ${products.length} produk dan ${categories.length} kategori Wardah!`,
      summary: {
        totalProducts: products.length,
        totalCategories: categories.length,
        mainCategories: summary.mainCategories,
        fileName: file.name,
      },
    });
  } catch (error: unknown) {
    console.error('[POST /api/admin/products/import]', error);
    const message = error instanceof Error ? error.message : 'Gagal memproses import data produk';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
