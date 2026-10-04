import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { normalizePhone } from '@/lib/utils';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Helper to match name with tolerance for minor formatting, case, and prefixes.
 */
function isNameMatch(inputName: string, storedName: string): boolean {
  if (!inputName || !storedName) return false;
  const cleanInput = inputName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const cleanStored = storedName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

  // 1. Exact match
  if (cleanInput === cleanStored) return true;

  // 2. Substring match
  if (cleanInput.length >= 3 && cleanStored.includes(cleanInput)) return true;
  if (cleanStored.length >= 3 && cleanInput.includes(cleanStored)) return true;

  // 3. Token match
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
 * POST /api/customers/login
 * Log in a customer using Full Name and Phone Number (no password needed).
 * Generates a signed Firebase Auth custom token.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fullName, phone } = body;

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

    const trimmedName = fullName.trim();
    const rawPhone = phone.trim();
    const normalizedPhone = normalizePhone(rawPhone);
    const localPhone = normalizedPhone.replace(/^\+62/, '0');
    const digitsOnly = rawPhone.replace(/\D/g, '');

    const db = adminDb();

    // Find customer by phone in various formats
    let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    // Try normalized +62 format
    const snap1 = await db
      .collection('customers')
      .where('phone', '==', normalizedPhone)
      .limit(5)
      .get();
    if (!snap1.empty) {
      matchedDoc = snap1.docs[0];
    }

    // Try 08 format
    if (!matchedDoc) {
      const snap2 = await db
        .collection('customers')
        .where('phone', '==', localPhone)
        .limit(5)
        .get();
      if (!snap2.empty) {
        matchedDoc = snap2.docs[0];
      }
    }

    // Try raw input phone
    if (!matchedDoc) {
      const snap3 = await db
        .collection('customers')
        .where('phone', '==', rawPhone)
        .limit(5)
        .get();
      if (!snap3.empty) {
        matchedDoc = snap3.docs[0];
      }
    }

    // Fallback: search pool to match digits
    if (!matchedDoc && digitsOnly.length >= 8) {
      const pool = await db.collection('customers').limit(150).get();
      for (const d of pool.docs) {
        const dPhone = (d.data().phone || '').toString().replace(/\D/g, '');
        if (
          dPhone &&
          (dPhone === digitsOnly ||
            dPhone.endsWith(digitsOnly) ||
            digitsOnly.endsWith(dPhone))
        ) {
          matchedDoc = d;
          break;
        }
      }
    }

    // Customer not found by phone
    if (!matchedDoc) {
      return NextResponse.json(
        {
          error:
            'Nomor HP belum terdaftar di Wardah Beauty Passport. Silakan klik Daftar untuk membuat akun baru.',
          notFound: true,
        },
        { status: 404 }
      );
    }

    const customerData = matchedDoc.data();

    // Check account status
    if (customerData.status === 'blocked') {
      return NextResponse.json(
        {
          error:
            'Akun Anda dinonaktifkan. Silakan hubungi customer service atau counter Wardah.',
        },
        { status: 403 }
      );
    }

    // Verify Name
    const storedName = (customerData.fullName || '').toString();
    if (!isNameMatch(trimmedName, storedName)) {
      return NextResponse.json(
        {
          error:
            'Nama tidak sesuai dengan nomor HP yang terdaftar. Mohon pastikan nama lengkap sesuai saat pendaftaran.',
          nameMismatch: true,
        },
        { status: 400 }
      );
    }

    // Resolve UID
    let uid = customerData.uid || matchedDoc.id;

    // Ensure Firebase Auth user exists
    const dummyEmail = `${normalizedPhone.replace('+', '')}@wardah.id`;
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

    // Set custom claim
    await adminAuth().setCustomUserClaims(uid, { role: 'customer' });

    // Update customer doc in firestore if needed
    const updates: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (customerData.status === 'unclaimed') {
      updates.status = 'active';
      updates.claimedAt = FieldValue.serverTimestamp();
      updates.uid = uid;
    } else if (customerData.uid !== uid) {
      updates.uid = uid;
    }

    await matchedDoc.ref.update(updates);

    // Mint custom token
    const customToken = await adminAuth().createCustomToken(uid, { role: 'customer' });

    return NextResponse.json({
      success: true,
      customToken,
      customerId: matchedDoc.id,
      customer: {
        id: matchedDoc.id,
        fullName: customerData.fullName,
        phone: customerData.phone,
        city: customerData.city,
        status: 'active',
      },
    });
  } catch (error: any) {
    console.error('[POST /api/customers/login]', error);
    return NextResponse.json(
      { error: error?.message || 'Gagal masuk ke Beauty Passport' },
      { status: 500 }
    );
  }
}
