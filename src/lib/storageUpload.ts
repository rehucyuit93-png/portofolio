import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';

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
        reject(
          new Error(
            error?.message ||
              'Gagal mengunggah berkas ke Firebase Storage. Pastikan bucket Storage aktif dan aturan storage.rules telah diterapkan.'
          )
        );
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
          reject(err);
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
