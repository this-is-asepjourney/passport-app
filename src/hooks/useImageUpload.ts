import { useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { getAuth } from 'firebase/auth';

interface UploadResult {
  url: string;
  key: string;
}

/**
 * Fast client-side image compression using HTML5 Canvas.
 * Reduces 5MB-10MB mobile camera photos to ~100-200KB in ~50ms,
 * ensuring uploads are responsive, snappy, and light on bandwidth.
 */
async function compressImage(file: File, maxDimension = 1024, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/') || typeof window === 'undefined') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(blob || file);
          },
          'image/webp',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export function useImageUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const uploadImage = async (file: File, folder = 'profiles'): Promise<UploadResult | null> => {
    if (!user) {
      setError('User not authenticated');
      return null;
    }

    setUploading(true);
    setProgress(15);
    setError(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesi otentikasi tidak ditemukan');

      // 1. Client-side instant compression (down to ~100KB)
      const compressedBlob = await compressImage(file, 1024, 0.85);
      setProgress(40);

      // 2. Direct upload via server proxy (bypasses ISP & R2 CORS blockages)
      const formData = new FormData();
      const uploadFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '')}.webp`;
      formData.append('file', compressedBlob, uploadFileName);
      formData.append('folder', folder);

      setProgress(60);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });

      if (!res.ok) {
        // Fallback: try presigned URL method if direct upload returned error
        const fallbackRes = await fetch('/api/upload/url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            contentType: compressedBlob.type || 'image/webp',
            folder,
            filename: uploadFileName,
          }),
        });

        if (!fallbackRes.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Gagal mengunggah gambar ke Cloudflare R2');
        }

        const { uploadUrl, key, publicUrl } = await fallbackRes.json();
        const putRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': compressedBlob.type || 'image/webp' },
          body: compressedBlob,
        });

        if (!putRes.ok) {
          throw new Error('Gagal mengirimkan file ke penyimpanan R2');
        }

        setProgress(100);
        return { url: `/api/media/${key}`, key };
      }

      const data = await res.json();
      setProgress(100);
      return { url: data.url, key: data.key };
    } catch (err: unknown) {
      console.error('[useImageUpload] error:', err);
      const msg = err instanceof Error ? err.message : 'Upload gagal';
      setError(msg);
      return null;
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  return { uploadImage, uploading, progress, error };
}
