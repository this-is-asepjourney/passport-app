import { NextRequest, NextResponse } from 'next/server';
import { r2, R2_BUCKET } from '@/lib/r2';
import { GetObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/[...path]
 * Proxies and serves R2 stored assets directly to bypass ISP blockages (e.g. *.r2.dev in Indonesia)
 * and provides high-performance HTTP edge caching.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    if (!path || path.length === 0) {
      return new NextResponse('Bad Request', { status: 400 });
    }

    const key = path.map(decodeURIComponent).join('/');

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    const response = await r2.send(command);

    if (!response.Body) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const contentType = response.ContentType || 'image/jpeg';
    const bytes = await response.Body.transformToByteArray();

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': bytes.length.toString(),
      },
    });
  } catch (error) {
    console.warn('[GET /api/media] Object not found or error:', error);
    return new NextResponse('Media Not Found', { status: 404 });
  }
}
