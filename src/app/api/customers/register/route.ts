import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { normalizePhone } from '@/lib/utils';
import { nanoid } from 'nanoid';

// Generate ULID-like ID
function generateId() {
  return nanoid(26).toUpperCase();
}

function generateMemberNo() {
  const prefix = 'WRD';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

function isNameMatch(inputName: string, storedName: string): boolean {
  if (!inputName || !storedName) return false;
  const cleanInput = inputName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const cleanStored = storedName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

  if (cleanInput === cleanStored) return true;
  if (cleanInput.length >= 3 && cleanStored.includes(cleanInput)) return true;
  if (cleanStored.length >= 3 && cleanInput.includes(cleanStored)) return true;

  const inputTokens = cleanInput.split(/\s+/).filter((t) => t.length >= 2);
  const storedTokens = cleanStored.split(/\s+/).filter((t) => t.length >= 2);

  return inputTokens.some((it) =>
    storedTokens.some(
      (st) =>
        it === st ||
        (it.length >= 4 && st.startsWith(it)) ||
        (st.length >= 4 && it.startsWith(st))
    )
  );
}

/**
 * POST /api/customers/register
 * Self-registration for customer:
 * ONLY requires: fullName (nama lengkap), phone (nomor hp), and city (kota).
 * Does NOT require password, birthDate, or gender.
 * Directly mints a signed Firebase Auth custom token so customer can log in instantly.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, phone, city } = body;

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Nama lengkap wajib diisi minimal 2 karakter' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 8) {
      return NextResponse.json(
        { error: 'Nomor HP wajib diisi minimal 8 digit' },
        { status: 400 }
      );
    }

    if (!city || typeof city !== 'string' || city.trim().length < 2) {
      return NextResponse.json(
        { error: 'Kota wajib diisi minimal 2 karakter' },
        { status: 400 }
      );
    }

    const trimmedName = fullName.trim();
    const trimmedCity = city.trim();
    const rawPhone = phone.trim();
    const normalizedPhone = normalizePhone(rawPhone);
    const localPhone = normalizedPhone.replace(/^\+62/, '0');
    const dummyEmail = `${normalizedPhone.replace('+', '')}@wardah.id`;

    const db = adminDb();

    // Check if customer with this phone number already exists
    let existingDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    const snap1 = await db
      .collection('customers')
      .where('phone', '==', normalizedPhone)
      .limit(1)
      .get();
    if (!snap1.empty) {
      existingDoc = snap1.docs[0];
    }

    if (!existingDoc) {
      const snap2 = await db
        .collection('customers')
        .where('phone', '==', localPhone)
        .limit(1)
        .get();
      if (!snap2.empty) {
        existingDoc = snap2.docs[0];
      }
    }

    if (!existingDoc) {
      const snap3 = await db
        .collection('customers')
        .where('phone', '==', rawPhone)
        .limit(1)
        .get();
      if (!snap3.empty) {
        existingDoc = snap3.docs[0];
      }
    }

    // 1. If an unclaimed customer exists (registered quickly by BA at counter)
    if (existingDoc && existingDoc.data().status === 'unclaimed') {
      const customerId = existingDoc.id;
      let uid = customerId;

      // Ensure Firebase Auth user exists
      try {
        await adminAuth().getUser(uid);
      } catch {
        try {
          await adminAuth().createUser({
            uid,
            displayName: trimmedName,
            email: dummyEmail,
          });
        } catch (userErr: any) {
          if (userErr.code === 'auth/email-already-in-use') {
            const existingAuth = await adminAuth().getUserByEmail(dummyEmail);
            uid = existingAuth.uid;
          } else {
            await adminAuth().createUser({
              uid,
              displayName: trimmedName,
            });
          }
        }
      }

      await adminAuth().setCustomUserClaims(uid, { role: 'customer' });

      // Update customer doc to active
      await existingDoc.ref.update({
        uid,
        fullName: trimmedName,
        city: trimmedCity,
        status: 'active',
        claimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Record consent
      await db.collection('customerConsents').add({
        customerId,
        type: 'data_processing',
        version: '1.0',
        grantedAt: FieldValue.serverTimestamp(),
        channel: 'self_register',
      });

      const customToken = await adminAuth().createCustomToken(uid, { role: 'customer' });

      return NextResponse.json({
        success: true,
        customerId,
        action: 'claimed',
        customToken,
        message: 'Akun Anda berhasil diaktifkan!',
      });
    }

    // 2. If customer is already active
    if (existingDoc && existingDoc.data().status === 'active') {
      const storedName = existingDoc.data().fullName || '';
      // If the name is roughly the same person, allow direct login
      if (isNameMatch(trimmedName, storedName)) {
        let uid = existingDoc.data().uid || existingDoc.id;

        try {
          await adminAuth().getUser(uid);
        } catch {
          try {
            await adminAuth().createUser({
              uid,
              displayName: storedName,
              email: dummyEmail,
            });
          } catch (userErr: any) {
            if (userErr.code === 'auth/email-already-in-use') {
              const existingAuth = await adminAuth().getUserByEmail(dummyEmail);
              uid = existingAuth.uid;
            } else {
              await adminAuth().createUser({
                uid,
                displayName: storedName,
              });
            }
          }
        }

        await adminAuth().setCustomUserClaims(uid, { role: 'customer' });

        const customToken = await adminAuth().createCustomToken(uid, { role: 'customer' });

        return NextResponse.json({
          success: true,
          customerId: existingDoc.id,
          action: 'already_registered',
          customToken,
          message: 'Nomor HP sudah terdaftar. Mengalihkan ke Beauty Passport Anda...',
        });
      }

      return NextResponse.json(
        {
          error:
            'Nomor HP ini sudah terdaftar atas nama lain. Silakan periksa kembali atau langsung Masuk di menu Login.',
          code: 'PHONE_ALREADY_REGISTERED',
        },
        { status: 409 }
      );
    }

    // 3. New Customer Registration
    const customerId = generateId();
    const qrToken = nanoid(32);
    const memberNo = generateMemberNo();
    let uid = customerId;

    // Ensure Firebase Auth user exists
    try {
      await adminAuth().getUser(uid);
    } catch {
      try {
        await adminAuth().createUser({
          uid,
          displayName: trimmedName,
          email: dummyEmail,
        });
      } catch (userErr: any) {
        if (userErr.code === 'auth/email-already-in-use') {
          const existingAuth = await adminAuth().getUserByEmail(dummyEmail);
          uid = existingAuth.uid;
        } else {
          await adminAuth().createUser({
            uid,
            displayName: trimmedName,
          });
        }
      }
    }

    await adminAuth().setCustomUserClaims(uid, { role: 'customer' });

    await db.runTransaction(async (tx) => {
      const customerRef = db.collection('customers').doc(customerId);
      tx.set(customerRef, {
        id: customerId,
        publicId: customerId.slice(0, 8).toLowerCase(),
        uid,
        fullName: trimmedName,
        phone: normalizedPhone,
        city: trimmedCity,
        birthDate: null,
        gender: null,
        regionId: null,
        memberNo,
        registeredByBaId: null,
        registeredStoreId: null,
        status: 'active',
        claimedAt: FieldValue.serverTimestamp(),
        qrTokenId: qrToken,
        lastPurchaseAt: null,
        purchaseCount: 0,
        totalSpent: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const tokenRef = db.collection('qrTokens').doc(qrToken);
      tx.set(tokenRef, {
        customerId,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
        revokedAt: null,
      });

      const consentRef = db.collection('customerConsents').doc();
      tx.set(consentRef, {
        customerId,
        type: 'data_processing',
        version: '1.0',
        grantedAt: FieldValue.serverTimestamp(),
        channel: 'self_register',
      });
    });

    // Mint custom token
    const customToken = await adminAuth().createCustomToken(uid, { role: 'customer' });

    return NextResponse.json({
      success: true,
      customerId,
      action: 'created',
      customToken,
      message: 'Pendaftaran berhasil! Selamat datang di Wardah Beauty Passport.',
    });
  } catch (error: any) {
    console.error('[POST /api/customers/register]', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal mendaftarkan customer' },
      { status: 500 }
    );
  }
}
