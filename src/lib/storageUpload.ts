import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { firebaseConfig, storage } from './firebase';

export type StorageFolder =
  | 'profile-photo'
  | 'documents'
  | 'certificates'
  | 'achievements'
  | 'activities'
  | 'gallery';

export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  storedInline?: boolean;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

let cachedBucketAvailable: boolean | null = null;

async function isStorageBucketAvailable(): Promise<boolean> {
  if (cachedBucketAvailable !== null) return cachedBucketAvailable;
  if (!firebaseConfig.storageBucket) {
    cachedBucketAvailable = false;
    return false;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 2500);
  try {
    const resp = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(firebaseConfig.storageBucket)}/o`,
      { method: 'GET', signal: controller.signal }
    );
    // 404 means the Storage bucket does not exist / has not been initialized
    cachedBucketAvailable = resp.status !== 404;
    return cachedBucketAvailable;
  } catch {
    cachedBucketAvailable = false;
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

function isImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca berkas.'));
      }
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas lokal.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Format gambar tidak dapat diproses browser.'));
    img.src = src;
  });
}

async function compressImageToDataUrl(
  file: File,
  maxDimension: number,
  maxCharLength: number
): Promise<string> {
  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);

  let dim = maxDimension;
  const qualities = [0.82, 0.68, 0.55, 0.42, 0.3];

  for (let pass = 0; pass < 3; pass++) {
    const scale = Math.min(1, dim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || dim) * scale));
    const height = Math.max(1, Math.round((img.height || dim) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return rawDataUrl.slice(0, maxCharLength);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of qualities) {
      const candidate = canvas.toDataURL('image/jpeg', q);
      if (candidate.length <= maxCharLength) {
        return candidate;
      }
    }
    dim = Math.round(dim * 0.72);
  }

  throw new Error(
    'Ukuran foto terlalu besar setelah dikompresi. Gunakan foto beresolusi lebih kecil.'
  );
}

async function createInlineFallback(
  folder: StorageFolder,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  onProgress?.(35);
  if (isImageFile(file)) {
    const maxDim = folder === 'profile-photo' ? 360 : 880;
    const maxChars = folder === 'profile-photo' ? 90000 : 145000;
    const dataUrl = await compressImageToDataUrl(file, maxDim, maxChars);
    onProgress?.(100);
    return {
      downloadUrl: dataUrl,
      storagePath: '',
      fileName: file.name,
      fileSize: Math.round((dataUrl.length * 3) / 4),
      storedInline: true,
    };
  }

  // Non-image documents/certificates (PDF, DOCX, PPT, XLSX)
  const MAX_INLINE_DOC_BYTES = 450 * 1024;
  if (file.size > MAX_INLINE_DOC_BYTES) {
    throw new Error(
      `Bucket Firebase Storage belum aktif sehingga unggah langsung non-gambar dibatasi maksimal 450 KB (file Anda ${(file.size / 1024).toFixed(0)} KB). Kompres file di bawah 450 KB atau tempel URL Google Drive/HTTPS.`
    );
  }

  const dataUrl = await readFileAsDataUrl(file);
  if (dataUrl.length > 680000) {
    throw new Error(
      'Ukuran berkas setelah encoding melebihi batas 680 KB. Kompres berkas atau tempel URL HTTPS.'
    );
  }
  onProgress?.(100);
  return {
    downloadUrl: dataUrl,
    storagePath: '',
    fileName: file.name,
    fileSize: file.size,
    storedInline: true,
  };
}

function mapStorageError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message : String(error);

  if (code === 'storage/unauthorized') {
    return 'Izin unggah Firebase Storage ditolak. Pastikan storage.rules sudah diterapkan.';
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
    return `Bucket Firebase Storage (${firebaseConfig.storageBucket}) belum diaktifkan di Firebase Console -> Storage.`;
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'Koneksi unggah ke Firebase Storage terputus (timeout).';
  }
  return msg || 'Gagal mengunggah berkas ke Firebase Storage.';
}

export async function uploadFileToStorage(
  folder: StorageFolder,
  uid: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const bucketReady = await isStorageBucketAvailable();
  if (!bucketReady) {
    return createInlineFallback(folder, file, onProgress);
  }

  const safeName = `${Date.now()}_${sanitizeFileName(file.name)}`;
  const storagePath = `${folder}/${uid}/${safeName}`;
  const storageRef = ref(storage, storagePath);

  try {
    const result = await new Promise<UploadResult>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, {
        contentType: file.type || 'application/octet-stream',
      });

      const hardTimeout = window.setTimeout(() => {
        try {
          task.cancel();
        } catch {
          // ignore
        }
        reject(new Error('storage/retry-limit-exceeded'));
      }, 7000);

      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress && snapshot.totalBytes > 0) {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
          }
        },
        (error) => {
          window.clearTimeout(hardTimeout);
          reject(error);
        },
        async () => {
          window.clearTimeout(hardTimeout);
          try {
            const downloadUrl = await getDownloadURL(task.snapshot.ref);
            resolve({
              downloadUrl,
              storagePath,
              fileName: file.name,
              fileSize: file.size,
              storedInline: false,
            });
          } catch (err) {
            reject(err);
          }
        }
      );
    });
    return result;
  } catch (err) {
    const msg = mapStorageError(err);
    console.warn('Storage upload unavailable, switching to inline compression fallback:', msg);
    // If bucket rejected or timed out, fallback seamlessly for images & <=450KB docs
    return createInlineFallback(folder, file, onProgress);
  }
}

export async function deleteStorageFile(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    console.warn('Storage delete warning:', err);
  }
}

export function dataUrlToBlobUrl(dataUrl: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const parts = dataUrl.split(',');
  if (parts.length < 2) return dataUrl;
  const header = parts[0];
  const base64 = parts[1];
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

export function openOrDownloadFile(
  url: string,
  fileName = 'berkas',
  mode: 'open' | 'download' = 'open'
): void {
  if (!url) return;
  const isData = url.startsWith('data:');
  const resolvedUrl = isData ? dataUrlToBlobUrl(url) : url;

  const a = document.createElement('a');
  a.href = resolvedUrl;
  if (mode === 'download') {
    a.download = fileName;
  }
  if (!isData || mode === 'open') {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (isData) {
    window.setTimeout(() => URL.revokeObjectURL(resolvedUrl), 60000);
  }
}
