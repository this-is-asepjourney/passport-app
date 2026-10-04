import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { CustomerNotification } from '@/types';

// GET: Ambil daftar notifikasi untuk customer yang sedang login
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Token tidak ditemukan' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth().verifyIdToken(token);
    const db = adminDb();

    // Dapatkan customerId dari parameter atau dari profile customer
    const url = new URL(request.url);
    let customerId = url.searchParams.get('customerId');

    if (!customerId) {
      const custQuery = await db.collection('customers')
        .where('uid', '==', decodedToken.uid)
        .limit(1)
        .get();

      if (!custQuery.empty) {
        customerId = custQuery.docs[0].id;
      }
    }

    if (!customerId) {
      return NextResponse.json({ notifications: [] });
    }

    // Ambil notifikasi untuk customerId ini dengan fallback sorting
    let notifDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    try {
      const notifSnap = await db.collection('notifications')
        .where('customerId', '==', customerId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      notifDocs = notifSnap.docs;
    } catch {
      const notifSnap = await db.collection('notifications')
        .where('customerId', '==', customerId)
        .limit(100)
        .get();
      notifDocs = notifSnap.docs.sort((a, b) => {
        const tA = a.data().createdAt?.toMillis?.() ?? new Date(a.data().createdAt || 0).getTime();
        const tB = b.data().createdAt?.toMillis?.() ?? new Date(b.data().createdAt || 0).getTime();
        return tB - tA;
      });
    }

    const notifications: CustomerNotification[] = notifDocs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? (typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString()),
      } as CustomerNotification;
    });

    return NextResponse.json({ notifications });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: error.message || 'Gagal mengambil notifikasi' }, { status: 500 });
  }
}

// POST: Buat notifikasi baru untuk customer (dikirim oleh BA atau Admin)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth().verifyIdToken(token);
    const db = adminDb();

    let role = (decodedToken.role as string) || '';
    let senderProfileName = decodedToken.name || decodedToken.displayName || '';
    let userStoreId = (decodedToken.storeId as string) || '';

    if (!role) {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        const udata = userDoc.data();
        role = udata?.role || '';
        senderProfileName = senderProfileName || udata?.name || '';
        userStoreId = userStoreId || udata?.storeId || '';
      }
    }

    const isBA = role === 'ba';
    const isAdmin = ['admin_region', 'super_admin'].includes(role);

    if (!isBA && !isAdmin) {
      return NextResponse.json({ error: 'Hanya Beauty Advisor atau Admin yang dapat mengirim pesan' }, { status: 403 });
    }

    const body = await request.json();
    const { customerId, title, message, type = 'ba_message', actionUrl } = body;

    if (!customerId || !title || !message) {
      return NextResponse.json({ error: 'customerId, title, dan message wajib diisi' }, { status: 400 });
    }

    // Dapatkan data customer penerima
    const customerDoc = await db.collection('customers').doc(customerId).get();
    const customerData = customerDoc.data();

    // Dapatkan profil pengirim
    let senderName = senderProfileName || (isBA ? 'Beauty Advisor Wardah' : 'Admin Resmi Wardah');
    let storeName = '';

    if (userStoreId) {
      try {
        const storeDoc = await db.collection('stores').doc(userStoreId).get();
        if (storeDoc.exists) {
          storeName = storeDoc.data()?.name || '';
        }
      } catch {
        // Abaikan jika store tidak ditemukan
      }
    }

    const newNotification = {
      customerId,
      customerUid: customerData?.uid || null,
      customerName: customerData?.fullName || 'Pelanggan',
      senderId: decodedToken.uid,
      senderName,
      senderRole: isBA ? 'ba' : 'admin',
      storeId: decodedToken.storeId || null,
      storeName: storeName || null,
      title: title.trim(),
      message: message.trim(),
      type,
      isRead: false,
      actionUrl: actionUrl || null,
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection('notifications').add(newNotification);

    return NextResponse.json({
      success: true,
      notificationId: docRef.id,
      notification: { id: docRef.id, ...newNotification },
    });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return NextResponse.json({ error: error.message || 'Gagal mengirim notifikasi' }, { status: 500 });
  }
}

// PATCH: Tandai notifikasi telah dibaca (isRead = true)
export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    await adminAuth().verifyIdToken(token);
    const db = adminDb();

    const body = await request.json();
    const { notificationId, customerId, markAll } = body;

    if (markAll && customerId) {
      // Tandai semua notifikasi customer ini sebagai dibaca
      const unreadSnap = await db.collection('notifications')
        .where('customerId', '==', customerId)
        .where('isRead', '==', false)
        .get();

      const batch = db.batch();
      unreadSnap.docs.forEach(doc => {
        batch.update(doc.ref, { isRead: true });
      });
      await batch.commit();

      return NextResponse.json({ success: true, count: unreadSnap.size });
    }

    if (notificationId) {
      await db.collection('notifications').doc(notificationId).update({
        isRead: true,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'notificationId atau markAll + customerId wajib disertakan' }, { status: 400 });
  } catch (error: any) {
    console.error('Error updating notification status:', error);
    return NextResponse.json({ error: error.message || 'Gagal mengubah status notifikasi' }, { status: 500 });
  }
}
