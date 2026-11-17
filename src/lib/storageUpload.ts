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
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function mapStorageError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message : String(error);

  if (code === 'storage/unauthorized') {
    return 'Izin unggah Firebase Storage ditolak. Pastikan email terverifikasi, ukuran file sesuai batas, dan storage.rules sudah diterapkan.';
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
    return `Bucket Firebase Storage (${firebaseConfig.storageBucket}) belum diaktifkan di Firebase Console -> Storage.`;
  }
  if (code === 'storage/retry-limit-exceeded') {
    return 'Koneksi unggah ke Firebase Storage terputus (timeout). Silakan coba lagi atau tempel URL berkas HTTPS.';
  }
  return (
    msg ||
    'Gagal mengunggah berkas ke Firebase Storage. Pastikan bucket Storage aktif di Firebase Console atau tempel URL berkas HTTPS.'
  );
}

export async function uploadFileToStorage(
  folder: StorageFolder,
  uid: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const safeName = `${Date.now()}_${sanitizeFileName(file.name)}`;
  const storagePath = `${folder}/${uid}/${safeName}`;
  const storageRef = ref(storage, storagePath);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'application/octet-stream',
    });

    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error) => {
        reject(new Error(mapStorageError(error)));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(task.snapshot.ref);
          resolve({
            downloadUrl,
            storagePath,
            fileName: file.name,
            fileSize: file.size,
          });
        } catch (err) {
          reject(new Error(mapStorageError(err)));
        }
      }
    );
  });
}

export async function deleteStorageFile(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);
  } catch (err) {
    // Ignore not-found errors during cleanup
    console.warn('Storage delete warning:', err);
  }
}
