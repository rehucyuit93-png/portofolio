import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { BOOTSTRAP_ADMIN_EMAIL, db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';
import type {
  Achievement,
  Activity,
  AuditLog,
  Certificate,
  GalleryItem,
  LogAction,
  PortfolioDocument,
  PublicPortfolioDoc,
  UserAccount,
  UserProfile,
  UserRole,
  UserSettings,
} from '../types/portfolio';

export function sanitizeUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned.length >= 3 ? cleaned : `user-${cleaned || 'portofolio'}`;
}

export function generateDefaultUsername(displayName: string, uid: string): string {
  const base = sanitizeUsername(displayName || 'pengguna').slice(0, 32);
  const suffix = uid.slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  return `${base}-${suffix}`;
}

export function clampStr(value: string | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

export function computeProfileCompleteness(profile: UserProfile | null): number {
  if (!profile) return 0;
  const fields: Array<string | undefined> = [
    profile.photoURL,
    profile.fullName,
    profile.nipNisn,
    profile.jabatanKelas,
    profile.birthPlace,
    profile.birthDate,
    profile.address,
    profile.phone,
    profile.email,
    profile.education,
    profile.expertise,
    profile.bio,
  ];
  const filled = fields.filter((f) => Boolean(f && f.trim().length > 0)).length;
  return Math.round((filled / fields.length) * 100);
}

export async function writeAuditLog(params: {
  uid: string;
  userEmail?: string;
  userName?: string;
  action: LogAction;
  module: string;
  detail: string;
}): Promise<void> {
  const path = 'logs';
  try {
    await addDoc(collection(db, path), {
      uid: params.uid,
      userEmail: clampStr(params.userEmail, 200),
      userName: clampStr(params.userName, 120),
      action: params.action,
      module: clampStr(params.module, 80) || 'Sistem',
      detail: clampStr(params.detail, 500) || 'Aktivitas sistem',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function ensureUserInitialized(params: {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  preferredRole?: 'guru' | 'siswa';
  nipNisn?: string;
  jabatanKelas?: string;
}): Promise<{ account: UserAccount; profile: UserProfile; settings: UserSettings }> {
  const userRef = doc(db, 'users', params.uid);
  const profileRef = doc(db, 'profiles', params.uid);
  const settingsRef = doc(db, 'settings', params.uid);

  let accountSnap;
  try {
    accountSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${params.uid}`);
  }

  const isBootstrapAdmin = params.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const defaultUsername = generateDefaultUsername(params.displayName || params.email.split('@')[0], params.uid);

  let account: UserAccount;
  if (!accountSnap.exists()) {
    const assignedRole: UserRole = isBootstrapAdmin ? 'admin' : params.preferredRole || 'guru';
    const newAccount: UserAccount = {
      uid: params.uid,
      username: defaultUsername,
      email: clampStr(params.email, 200),
      displayName: clampStr(params.displayName || params.email.split('@')[0], 120),
      role: assignedRole,
      nipNisn: clampStr(params.nipNisn, 40),
      jabatanKelas: clampStr(
        params.jabatanKelas || (assignedRole === 'siswa' ? 'Siswa' : assignedRole === 'admin' ? 'Administrator Sistem' : 'Guru'),
        100
      ),
      photoURL: clampStr(params.photoURL, 1000),
      isActive: true,
    };
    try {
      await setDoc(userRef, {
        ...newAccount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${params.uid}`);
    }
    account = newAccount;
  } else {
    account = accountSnap.data() as UserAccount;
  }

  let profileSnap;
  try {
    profileSnap = await getDoc(profileRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `profiles/${params.uid}`);
  }

  let profile: UserProfile;
  if (!profileSnap.exists()) {
    const newProfile: UserProfile = {
      uid: params.uid,
      username: account.username,
      fullName: account.displayName,
      nipNisn: account.nipNisn || '',
      jabatanKelas: account.jabatanKelas || '',
      birthPlace: '',
      birthDate: '',
      address: '',
      phone: '',
      email: account.email,
      education: '',
      expertise: '',
      bio: '',
      photoURL: account.photoURL || '',
      isPublished: true,
    };
    try {
      await setDoc(profileRef, {
        ...newProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `profiles/${params.uid}`);
    }
    profile = newProfile;
  } else {
    profile = profileSnap.data() as UserProfile;
  }

  let settingsSnap;
  try {
    settingsSnap = await getDoc(settingsRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `settings/${params.uid}`);
  }

  let settings: UserSettings;
  if (!settingsSnap.exists()) {
    const newSettings: UserSettings = {
      uid: params.uid,
      theme: 'light',
      emailNotifications: true,
      activityAlerts: true,
      publicPortfolioEnabled: true,
      cvTemplate: 'modern',
    };
    try {
      await setDoc(settingsRef, {
        ...newSettings,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `settings/${params.uid}`);
    }
    settings = newSettings;
  } else {
    settings = settingsSnap.data() as UserSettings;
  }

  // Ensure initial public portfolio document exists so public URL works right away
  try {
    const pubRef = doc(db, 'publicPortfolios', profile.username);
    const pubSnap = await getDoc(pubRef);
    if (!pubSnap.exists()) {
      await setDoc(pubRef, {
        uid: params.uid,
        username: profile.username,
        fullName: profile.fullName,
        role: account.role,
        nipNisn: profile.nipNisn || '',
        jabatanKelas: profile.jabatanKelas || '',
        education: profile.education || '',
        expertise: profile.expertise || '',
        bio: profile.bio || '',
        photoURL: profile.photoURL || '',
        isPublished: profile.isPublished,
        featuredDocuments: [],
        featuredCertificates: [],
        featuredAchievements: [],
        featuredGalleries: [],
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `publicPortfolios/${profile.username}`);
  }

  return { account, profile, settings };
}

export async function saveProfile(
  uid: string,
  previousUsername: string,
  data: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>,
  role: UserRole,
  docs: PortfolioDocument[],
  certs: Certificate[],
  achs: Achievement[],
  gals: GalleryItem[]
): Promise<UserProfile> {
  const cleanUsername = sanitizeUsername(data.username);
  const payload = {
    username: cleanUsername,
    fullName: clampStr(data.fullName, 120) || 'Pengguna',
    nipNisn: clampStr(data.nipNisn, 40),
    jabatanKelas: clampStr(data.jabatanKelas, 100),
    birthPlace: clampStr(data.birthPlace, 100),
    birthDate: clampStr(data.birthDate, 20),
    address: clampStr(data.address, 300),
    phone: clampStr(data.phone, 30),
    email: clampStr(data.email, 200),
    education: clampStr(data.education, 150),
    expertise: clampStr(data.expertise, 250),
    bio: clampStr(data.bio, 1500),
    photoURL: clampStr(data.photoURL, 1000),
    isPublished: Boolean(data.isPublished),
  };

  try {
    await updateDoc(doc(db, 'profiles', uid), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', uid), {
      username: payload.username,
      displayName: payload.fullName,
      nipNisn: payload.nipNisn,
      jabatanKelas: payload.jabatanKelas,
      photoURL: payload.photoURL,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `profiles/${uid}`);
  }

  if (previousUsername && previousUsername !== cleanUsername) {
    try {
      await deleteDoc(doc(db, 'publicPortfolios', previousUsername));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `publicPortfolios/${previousUsername}`);
    }
  }

  const updatedProfile: UserProfile = {
    uid,
    ...payload,
  };

  await syncPublicPortfolio(updatedProfile, role, docs, certs, achs, gals);
  return updatedProfile;
}

export async function syncPublicPortfolio(
  profile: UserProfile,
  role: UserRole,
  docs: PortfolioDocument[],
  certs: Certificate[],
  achs: Achievement[],
  gals: GalleryItem[]
): Promise<void> {
  const username = sanitizeUsername(profile.username);
  const path = `publicPortfolios/${username}`;
  const pubRef = doc(db, 'publicPortfolios', username);

  const payload = {
    uid: profile.uid,
    username,
    fullName: clampStr(profile.fullName, 120),
    role,
    nipNisn: clampStr(profile.nipNisn, 40),
    jabatanKelas: clampStr(profile.jabatanKelas, 100),
    education: clampStr(profile.education, 150),
    expertise: clampStr(profile.expertise, 250),
    bio: clampStr(profile.bio, 1500),
    photoURL: clampStr(profile.photoURL, 1000),
    isPublished: Boolean(profile.isPublished),
    featuredDocuments: docs
      .filter((d) => d.isPublic)
      .slice(0, 20)
      .map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        year: d.year,
        fileType: d.fileType,
        fileUrl: d.fileUrl,
        description: d.description || '',
      })),
    featuredCertificates: certs
      .filter((c) => c.isPublic)
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        eventName: c.eventName,
        organizer: c.organizer,
        year: c.year,
        fileUrl: c.fileUrl,
        description: c.description || '',
      })),
    featuredAchievements: achs
      .filter((a) => a.isPublic)
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        title: a.title,
        level: a.level,
        year: a.year,
        photoUrl: a.photoUrl || '',
        description: a.description || '',
      })),
    featuredGalleries: gals
      .filter((g) => g.isPublic)
      .slice(0, 24)
      .map((g) => ({
        id: g.id,
        title: g.title,
        album: g.album,
        year: g.year,
        imageUrl: g.imageUrl,
        caption: g.caption || '',
      })),
    updatedAt: serverTimestamp(),
  };

  try {
    const existingSnap = await getDoc(pubRef);
    if (!existingSnap.exists()) {
      await setDoc(pubRef, payload);
    } else {
      await updateDoc(pubRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchPublicPortfolio(username: string): Promise<PublicPortfolioDoc | null> {
  const clean = sanitizeUsername(username);
  const path = `publicPortfolios/${clean}`;
  try {
    const snap = await getDoc(doc(db, 'publicPortfolios', clean));
    if (!snap.exists()) return null;
    return snap.data() as PublicPortfolioDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeUserCollection<T extends { id: string }>(
  collectionName: string,
  uid: string,
  onData: (items: T[]) => void
): Unsubscribe {
  const q = query(collection(db, collectionName), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<T, 'id'>),
      })) as T[];
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}

export function subscribeUserLogs(uid: string, onData: (logs: AuditLog[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'logs'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const logs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuditLog, 'id'>),
      }));
      onData(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
    }
  );
}

export async function createCollectionItem<T extends Record<string, unknown>>(
  collectionName: string,
  data: T,
  hasUpdatedAt = true
): Promise<string> {
  try {
    const payload = hasUpdatedAt
      ? { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
      : { ...data, createdAt: serverTimestamp() };
    const docRef = await addDoc(collection(db, collectionName), payload);
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionName);
  }
}

export async function updateCollectionItem<T extends Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: T,
  hasUpdatedAt = true
): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    const payload = hasUpdatedAt ? { ...data, updatedAt: serverTimestamp() } : data;
    await updateDoc(doc(db, collectionName, id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCollectionItem(collectionName: string, id: string): Promise<void> {
  const path = `${collectionName}/${id}`;
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateSettingsDoc(
  uid: string,
  patch: Partial<Omit<UserSettings, 'uid' | 'updatedAt'>>
): Promise<void> {
  const path = `settings/${uid}`;
  try {
    await updateDoc(doc(db, 'settings', uid), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Admin data access
export async function fetchAllAdminCollections(): Promise<{
  users: UserAccount[];
  documents: PortfolioDocument[];
  certificates: Certificate[];
  achievements: Achievement[];
  logs: AuditLog[];
}> {
  const [usersSnap, docsSnap, certsSnap, achsSnap, logsSnap] = await Promise.all([
    getDocs(collection(db, 'users')).catch((e) => handleFirestoreError(e, OperationType.LIST, 'users')),
    getDocs(collection(db, 'documents')).catch((e) => handleFirestoreError(e, OperationType.LIST, 'documents')),
    getDocs(collection(db, 'certificates')).catch((e) => handleFirestoreError(e, OperationType.LIST, 'certificates')),
    getDocs(collection(db, 'achievements')).catch((e) => handleFirestoreError(e, OperationType.LIST, 'achievements')),
    getDocs(query(collection(db, 'logs'), orderBy('createdAt', 'desc'), limit(200))).catch((e) =>
      handleFirestoreError(e, OperationType.LIST, 'logs')
    ),
  ]);

  return {
    users: usersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<UserAccount, 'id'>) })),
    documents: docsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PortfolioDocument, 'id'>) })),
    certificates: certsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Certificate, 'id'>) })),
    achievements: achsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Achievement, 'id'>) })),
    logs: logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) })),
  };
}

export async function adminCreateUserRecord(params: {
  displayName: string;
  email: string;
  role: UserRole;
  nipNisn: string;
  jabatanKelas: string;
  adminUid: string;
}): Promise<string> {
  const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const username = generateDefaultUsername(params.displayName, newId);
  const path = `users/${newId}`;
  try {
    await setDoc(doc(db, 'users', newId), {
      uid: newId,
      username,
      email: clampStr(params.email, 200),
      displayName: clampStr(params.displayName, 120),
      role: params.role,
      nipNisn: clampStr(params.nipNisn, 40),
      jabatanKelas: clampStr(params.jabatanKelas, 100),
      photoURL: '',
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (params.role === 'admin') {
      await setDoc(doc(db, 'admins', newId), {
        uid: newId,
        grantedBy: params.adminUid,
        createdAt: serverTimestamp(),
      });
    }
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function adminUpdateUserRoleOrStatus(
  targetUid: string,
  updates: { role?: UserRole; isActive?: boolean },
  adminUid: string
): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    if (updates.role === 'admin') {
      await setDoc(doc(db, 'admins', targetUid), {
        uid: targetUid,
        grantedBy: adminUid,
        createdAt: serverTimestamp(),
      });
    } else if (updates.role && (updates.role === 'guru' || updates.role === 'siswa')) {
      await deleteDoc(doc(db, 'admins', targetUid)).catch(() => undefined);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function adminDeleteUserRecord(targetUid: string): Promise<void> {
  const path = `users/${targetUid}`;
  try {
    await deleteDoc(doc(db, 'users', targetUid));
    await deleteDoc(doc(db, 'profiles', targetUid)).catch(() => undefined);
    await deleteDoc(doc(db, 'admins', targetUid)).catch(() => undefined);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
