import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { r2, R2_BUCKET } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/upload
 * Direct server-to-R2 upload endpoint.
 * Accepts multipart/form-data with `file` and optional `folder`.
 * Bypasses browser CORS restrictions to R2 and delivers sub-second response times.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Verify Authentication
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const idToken = authorization.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Sesi token tidak valid atau kadaluarsa' }, { status: 401 });
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'profiles';

    if (!file) {
      return NextResponse.json({ error: 'File gambar wajib diunggah' }, { status: 400 });
    }

    const contentType = file.type || 'image/jpeg';
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 3. Generate Clean Unique Key
    const ext = contentType.includes('/') ? contentType.split('/')[1].replace('+xml', '') : 'jpg';
    const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
    const key = `${folder}/${decodedToken.uid}-${Date.now()}.${safeExt}`;

    // 4. Upload to Cloudflare R2 via S3 Client
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await r2.send(command);

    // 5. Build accessible media URL (served via our proxy to bypass Indonesian ISP blocking of *.r2.dev)
    const mediaUrl = `/api/media/${key}`;

    return NextResponse.json({
      success: true,
      url: mediaUrl,
      publicUrl: mediaUrl,
      key,
    });
  } catch (error: unknown) {
    console.error('[POST /api/upload] Error uploading to R2:', error);
    const message = error instanceof Error ? error.message : 'Gagal mengunggah gambar ke R2';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
