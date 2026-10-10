/* eslint-disable @next/next/no-img-element */
import { useState, useRef, useEffect } from 'react';
import { useImageUpload } from '@/hooks/useImageUpload';
import { resolveMediaUrl } from '@/lib/media';
import { Camera, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ImageUploadProps {
  onUploadSuccess: (url: string) => void;
  folder: string;
  currentImage?: string;
  className?: string;
  label?: string;
  shape?: 'rounded' | 'circle';
  showBadge?: boolean;
}

export function ImageUpload({
  onUploadSuccess,
  folder,
  currentImage,
  className = '',
  label = 'Upload Image',
  shape = 'rounded',
  showBadge = false,
}: ImageUploadProps) {
  const { uploadImage, uploading, progress, error } = useImageUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(resolveMediaUrl(currentImage) || null);
  const [justUploaded, setJustUploaded] = useState(false);

  useEffect(() => {
    if (currentImage) {
      setPreview(resolveMediaUrl(currentImage));
    }
  }, [currentImage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Instant optimistic preview from memory blob
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setJustUploaded(false);

    // Fast R2 Upload
    const result = await uploadImage(file, folder);
    if (result) {
      setPreview(result.url);
      setJustUploaded(true);
      onUploadSuccess(result.url);
      setTimeout(() => setJustUploaded(false), 2500);
    } else {
      // Revert preview on failure
      setPreview(resolveMediaUrl(currentImage) || null);
    }
  };

  const isCircle = shape === 'circle';

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`w-full h-full relative cursor-pointer overflow-hidden transition-all group ${
          isCircle ? 'rounded-full' : 'rounded-2xl'
        } ${
          error
            ? 'border-2 border-red-400 bg-red-50'
            : preview
            ? 'border-2 border-[#6DB9B2]/40 hover:border-[#277A73]'
            : 'border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-[#277A73]'
        } flex flex-col items-center justify-center`}
      >
        {preview ? (
          <img
            src={preview}
            alt="Preview"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="text-center p-3">
            <span className="block text-2xl mb-1">📸</span>
            <span className="text-xs font-semibold text-gray-600">{label}</span>
          </div>
        )}

        {/* Hover / Overlay on Avatar */}
        <div className={`absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-white transition-opacity ${
          uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          {uploading ? (
            <div className="flex flex-col items-center gap-1.5 p-2 text-center">
              <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span className="text-[10px] font-bold tracking-tight">
                {progress > 0 ? `${progress}%` : 'Mengunggah...'}
              </span>
            </div>
          ) : justUploaded ? (
            <div className="flex items-center gap-1 text-emerald-300">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-[11px] font-bold">Tersimpan</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Camera className="w-5 h-5 text-white/90" />
              <span className="text-[10px] font-bold">Ubah Foto</span>
            </div>
          )}
        </div>
      </div>

      {/* Floating Badge Camera Icon for Mobile Touch Usability */}
      {showBadge && !uploading && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#277A73] hover:bg-[#1E6560] text-white shadow-md flex items-center justify-center border-2 border-white transition-transform active:scale-90"
          title="Ubah Foto Profil"
        >
          <Camera className="w-3.5 h-3.5" />
        </button>
      )}

      {error && (
        <div className="flex items-center gap-1 text-rose-500 text-[11px] mt-1.5 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg, image/png, image/webp"
        className="hidden"
      />
    </div>
  );
}
