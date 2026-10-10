import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * GET /api/admin/ba
 * Ambil daftar lengkap Beauty Advisor beserta data counter
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth().verifyIdToken(idToken);

    if (decodedToken.role !== 'super_admin' && decodedToken.role !== 'admin_region') {
      return NextResponse.json({ error: 'Akses ditolak. Khusus admin.' }, { status: 403 });
    }

    const db = adminDb();
    const [baProfilesSnap, usersSnap, storesSnap] = await Promise.all([
      db.collection('baProfiles').get(),
      db.collection('users').where('role', '==', 'ba').get(),
      db.collection('stores').get(),
    ]);

    const storeMap = new Map<string, any>();
    storesSnap.docs.forEach((doc) => {
      storeMap.set(doc.id, { id: doc.id, ...doc.data() });
    });

    const userMap = new Map<string, any>();
    usersSnap.docs.forEach((doc) => {
      userMap.set(doc.id, { uid: doc.id, ...doc.data() });
    });

    const baMap = new Map<string, any>();

    // Gabungkan dari baProfiles
    baProfilesSnap.docs.forEach((doc) => {
      const data = doc.data();
      const uData = userMap.get(doc.id) || {};
      const sData = storeMap.get(data.storeId || uData.storeId) || {};

      baMap.set(doc.id, {
        uid: doc.id,
        fullName: data.fullName || data.name || uData.displayName || uData.name || 'Beauty Advisor',
        email: data.email || uData.email || '',
        phone: data.phone || uData.phone || uData.phoneNumber || '',
        photoUrl: data.photoUrl || uData.photoUrl || uData.photoURL || '',
        employeeCode: data.employeeCode || uData.employeeCode || `WRD-BA-${doc.id.slice(0, 4).toUpperCase()}`,
        storeId: data.storeId || uData.storeId || '',
        storeName: sData.name || data.storeName || 'Counter Wardah',
        storeCity: sData.city || 'Nasional',
        isActive: data.isActive !== false && uData.isActive !== false,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || uData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      });
    });

    // Tambahkan pengguna role 'ba' di collection users yang belum ada di baProfiles
    usersSnap.docs.forEach((doc) => {
      if (!baMap.has(doc.id)) {
        const uData = doc.data();
        const sData = storeMap.get(uData.storeId) || {};
        baMap.set(doc.id, {
          uid: doc.id,
          fullName: uData.displayName || uData.name || 'Beauty Advisor',
          email: uData.email || '',
          phone: uData.phone || uData.phoneNumber || '',
          photoUrl: uData.photoUrl || uData.photoURL || '',
          employeeCode: uData.employeeCode || `WRD-BA-${doc.id.slice(0, 4).toUpperCase()}`,
          storeId: uData.storeId || '',
          storeName: sData.name || 'Counter Wardah',
          storeCity: sData.city || 'Nasional',
          isActive: uData.isActive !== false,
          createdAt: uData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        });
      }
    });

    const bas = Array.from(baMap.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'id', { sensitivity: 'base' })
    );

    return NextResponse.json({ success: true, bas });
  } catch (error: any) {
    console.error('[GET /api/admin/ba]', error);
    return NextResponse.json({ error: error.message || 'Gagal memuat daftar BA' }, { status: 500 });
  }
}

/**
 * POST /api/admin/ba
 * Buat akun Beauty Advisor baru secara otomatis (Auth + Firestore + Custom Claims)
 */
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const idToken = authorization.split('Bearer ')[1];
    const decodedToken = await adminAuth().verifyIdToken(idToken);

    if (decodedToken.role !== 'super_admin' && decodedToken.role !== 'admin_region') {
      return NextResponse.json({ error: 'Hanya admin yang berhak membuat akun Beauty Advisor' }, { status: 403 });
    }

    const body = await request.json();
    const { fullName, email, password, phone, employeeCode, storeId, isActive } = body;

    // Validasi input
    if (!fullName || !fullName.trim()) {
      return NextResponse.json({ error: 'Nama Lengkap Beauty Advisor wajib diisi' }, { status: 400 });
    }

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email akun wajib diisi' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 });
    }

    const db = adminDb();

    // Pastikan storeId terisi atau validasi
    let targetStoreId = storeId?.trim() || '';
    let targetStoreName = 'Counter Wardah';

    if (targetStoreId) {
      const storeDoc = await db.collection('stores').doc(targetStoreId).get();
      if (storeDoc.exists) {
        targetStoreName = storeDoc.data()?.name || 'Counter Wardah';
      }
    } else {
      // Ambil counter pertama jika kosong atau auto-provision
      const storesSnap = await db.collection('stores').limit(1).get();
      if (!storesSnap.empty) {
        targetStoreId = storesSnap.docs[0].id;
        targetStoreName = storesSnap.docs[0].data()?.name || 'Counter Wardah';
      } else {
        const defaultRef = db.collection('stores').doc('store_wardah_flagship');
        await defaultRef.set({
          id: 'store_wardah_flagship',
          name: 'Wardah Flagship Counter',
          code: 'WRD-JKT-01',
          city: 'Jakarta Selatan',
          regionId: 'dki_jakarta',
          address: 'Mall Grand Indonesia, Lantai UG',
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
        });
        targetStoreId = defaultRef.id;
        targetStoreName = 'Wardah Flagship Counter';
      }
    }

    const finalEmployeeCode =
      employeeCode?.trim() || `WRD-BA-${Date.now().toString().slice(-4).toUpperCase()}`;

    // 1. Buat User di Firebase Auth menggunakan Admin SDK
    let userRecord;
    try {
      userRecord = await adminAuth().createUser({
        email: normalizedEmail,
        password,
        displayName: fullName.trim(),
        disabled: isActive === false,
      });
    } catch (authErr: any) {
      if (authErr.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { error: `Email ${normalizedEmail} sudah terdaftar di sistem. Gunakan email lain.` },
          { status: 409 }
        );
      }
      throw authErr;
    }

    const uid = userRecord.uid;

    // 2. Set Custom Claims role 'ba' dan storeId
    await adminAuth().setCustomUserClaims(uid, {
      role: 'ba',
      storeId: targetStoreId,
      employeeCode: finalEmployeeCode,
    });

    const now = FieldValue.serverTimestamp();
    const cleanPhone = phone ? phone.trim() : '';

    // 3. Simpan data di Firestore baProfiles
    await db.collection('baProfiles').doc(uid).set({
      uid,
      fullName: fullName.trim(),
      name: fullName.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      employeeCode: finalEmployeeCode,
      storeId: targetStoreId,
      storeNameSnapshot: targetStoreName,
      isActive: isActive !== false,
      createdBy: decodedToken.uid || 'admin',
      createdAt: now,
      updatedAt: now,
    });

    // 4. Simpan data di Firestore users
    await db.collection('users').doc(uid).set({
      uid,
      displayName: fullName.trim(),
      name: fullName.trim(),
      email: normalizedEmail,
      role: 'ba',
      phone: cleanPhone,
      phoneNumber: cleanPhone,
      employeeCode: finalEmployeeCode,
      storeId: targetStoreId,
      storeName: targetStoreName,
      isActive: isActive !== false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // 5. Catat ke audit log
    try {
      await db.collection('auditLogs').add({
        action: 'create_beauty_advisor',
        actorUid: decodedToken.uid,
        actorEmail: decodedToken.email || 'admin',
        targetUid: uid,
        targetEmail: normalizedEmail,
        targetName: fullName.trim(),
        details: {
          storeId: targetStoreId,
          storeName: targetStoreName,
          employeeCode: finalEmployeeCode,
        },
        createdAt: now,
      });
    } catch (auditErr) {
      console.warn('Audit log write error:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: `Akun Beauty Advisor ${fullName.trim()} berhasil dibuat!`,
      ba: {
        uid,
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: cleanPhone,
        employeeCode: finalEmployeeCode,
        storeId: targetStoreId,
        storeName: targetStoreName,
        isActive: isActive !== false,
      },
      rawPassword: password, // Dikembalikan sekali agar admin dapat langsung menyalin kredensial ke BA
    });
  } catch (error: any) {
    console.error('[POST /api/admin/ba]', error);
    return NextResponse.json(
      { error: error.message || 'Gagal membuat akun Beauty Advisor' },
      { status: 500 }
    );
  }
}
