import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, testFirestoreConnection } from './lib/firebase';
import {
  createCollectionItem,
  deleteCollectionItem,
  ensureUserInitialized,
  saveProfile,
  subscribeUserCollection,
  subscribeUserLogs,
  syncPublicPortfolio,
  updateCollectionItem,
  updateSettingsDoc,
  writeAuditLog,
} from './lib/portfolioService';
import type {
  Achievement,
  Activity,
  AuditLog,
  Certificate,
  DashboardSection,
  GalleryItem,
  PortfolioDocument,
  UserAccount,
  UserProfile,
  UserSettings,
} from './types/portfolio';
import { AuthView } from './components/AuthView';
import { DashboardShell } from './components/DashboardShell';
import { PublicPortfolioView } from './components/PublicPortfolioView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ToastContainer, type ToastItem } from './components/Toast';

function parsePublicPortfolioSlug(pathname: string): string | null {
  const match = pathname.match(/^\/portfolio\/([a-zA-Z0-9-]+)\/?$/);
  return match ? match[1].toLowerCase() : null;
}

export default function App() {
  const [publicSlug, setPublicSlug] = useState<string | null>(() =>
    parsePublicPortfolioSlug(window.location.pathname)
  );
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('karyaloka_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);

  const [account, setAccount] = useState<UserAccount | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  const [documents, setDocuments] = useState<PortfolioDocument[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [galleries, setGalleries] = useState<GalleryItem[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const [activeSection, setActiveSection] = useState<DashboardSection>('dashboard');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('karyaloka_theme', theme);
  }, [theme]);

  // Listen to browser history navigation
  useEffect(() => {
    const handlePop = () => {
      setPublicSlug(parsePublicPortfolioSlug(window.location.pathname));
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Boot Firestore server check
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  const hydrateUserSession = useCallback(
    async (user: User) => {
      const pendingRaw = localStorage.getItem(`pending_reg_${user.uid}`);
      let pending: {
        fullName?: string;
        role?: 'guru' | 'siswa';
        nipNisn?: string;
        jabatanKelas?: string;
      } = {};
      if (pendingRaw) {
        try {
          pending = JSON.parse(pendingRaw);
        } catch {
          pending = {};
        }
        localStorage.removeItem(`pending_reg_${user.uid}`);
      }

      const init = await ensureUserInitialized({
        uid: user.uid,
        email: user.email || '',
        displayName: pending.fullName || user.displayName || user.email?.split('@')[0] || 'Pengguna',
        photoURL: user.photoURL || '',
        preferredRole: pending.role,
        nipNisn: pending.nipNisn,
        jabatanKelas: pending.jabatanKelas,
      });

      setAccount(init.account);
      setProfile(init.profile);
      setSettings(init.settings);
      setTheme(init.settings.theme);
    },
    []
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFirebaseUser(null);
        setUnverifiedUser(null);
        setAccount(null);
        setProfile(null);
        setSettings(null);
        setDocuments([]);
        setCertificates([]);
        setAchievements([]);
        setActivities([]);
        setGalleries([]);
        setLogs([]);
        setAuthReady(true);
        return;
      }

      if (!user.emailVerified) {
        setUnverifiedUser(user);
        setFirebaseUser(null);
        setAuthReady(true);
        return;
      }

      setUnverifiedUser(null);
      setFirebaseUser(user);
      try {
        await hydrateUserSession(user);
      } catch (err: unknown) {
        notify('error', err instanceof Error ? err.message : 'Gagal memuat profil pengguna.');
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [hydrateUserSession, notify]);

  // Attach Firestore real-time listeners once authenticated & verified
  useEffect(() => {
    if (!authReady || !firebaseUser) return;
    const uid = firebaseUser.uid;

    const unsubDocs = subscribeUserCollection<PortfolioDocument>('documents', uid, setDocuments);
    const unsubCerts = subscribeUserCollection<Certificate>('certificates', uid, setCertificates);
    const unsubAchs = subscribeUserCollection<Achievement>('achievements', uid, setAchievements);
    const unsubActs = subscribeUserCollection<Activity>('activities', uid, setActivities);
    const unsubGals = subscribeUserCollection<GalleryItem>('galleries', uid, setGalleries);
    const unsubLogs = subscribeUserLogs(uid, setLogs);

    return () => {
      unsubDocs();
      unsubCerts();
      unsubAchs();
      unsubActs();
      unsubGals();
      unsubLogs();
    };
  }, [authReady, firebaseUser]);

  const navigatePublicPortfolio = (username: string) => {
    const path = `/portfolio/${encodeURIComponent(username)}`;
    window.history.pushState({}, '', path);
    setPublicSlug(username);
  };

  const navigateBackHome = () => {
    window.history.pushState({}, '', '/');
    setPublicSlug(null);
  };

  // Sync helper after content CRUD
  const resyncPublic = async (
    nextDocs = documents,
    nextCerts = certificates,
    nextAchs = achievements,
    nextGals = galleries
  ) => {
    if (!profile || !account) return;
    await syncPublicPortfolio(profile, account.role, nextDocs, nextCerts, nextAchs, nextGals);
  };

  if (publicSlug) {
    return (
      <>
        <PublicPortfolioView
          username={publicSlug}
          onBackHome={navigateBackHome}
          onNotify={notify}
        />
        <OfflineIndicator />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Menyiapkan ruang portofolio KaryaLoka...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !account || !profile || !settings) {
    return (
      <>
        <AuthView
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          unverifiedUser={unverifiedUser}
          onVerificationRefreshed={async () => {
            if (!auth.currentUser) return;
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              setUnverifiedUser(null);
              setFirebaseUser(auth.currentUser);
              await hydrateUserSession(auth.currentUser);
              notify('success', 'Email berhasil diverifikasi!');
            } else {
              notify('info', 'Email belum terverifikasi. Periksa kotak masuk atau folder spam Anda.');
            }
          }}
          onSignOutUnverified={async () => {
            await signOut(auth);
            setUnverifiedUser(null);
          }}
          onOpenSamplePortfolio={(slug) => navigatePublicPortfolio(slug)}
          onNotify={notify}
        />
        <OfflineIndicator />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        />
      </>
    );
  }

  return (
    <>
      <DashboardShell
        account={account}
        profile={profile}
        settings={settings}
        documents={documents}
        certificates={certificates}
        achievements={achievements}
        activities={activities}
        galleries={galleries}
        logs={logs}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onSaveProfile={async (data) => {
          const updated = await saveProfile(
            account.uid,
            profile.username,
            data,
            account.role,
            documents,
            certificates,
            achievements,
            galleries
          );
          setProfile(updated);
          setAccount((prev) =>
            prev
              ? {
                  ...prev,
                  username: updated.username,
                  displayName: updated.fullName,
                  nipNisn: updated.nipNisn,
                  jabatanKelas: updated.jabatanKelas,
                  photoURL: updated.photoURL,
                }
              : prev
          );
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: updated.fullName,
            action: 'EDIT_DATA',
            module: 'Profil Saya',
            detail: `Memperbarui profil & tautan publik /portfolio/${updated.username}`,
          });
        }}
        onCreateDocument={async (data) => {
          const id = await createCollectionItem('documents', { ...data, uid: account.uid });
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'UPLOAD_FILE',
            module: 'Dokumen Portofolio',
            detail: `Mengunggah dokumen "${data.title}" (${data.fileType})`,
          });
          await resyncPublic([{ id, uid: account.uid, ...data }, ...documents]);
        }}
        onUpdateDocument={async (id, data) => {
          await updateCollectionItem('documents', id, data);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'EDIT_DATA',
            module: 'Dokumen Portofolio',
            detail: `Memperbarui dokumen "${data.title || id}"`,
          });
          const next = documents.map((d) => (d.id === id ? { ...d, ...data } : d));
          await resyncPublic(next);
        }}
        onDeleteDocument={async (item) => {
          await deleteCollectionItem('documents', item.id);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'DELETE_DATA',
            module: 'Dokumen Portofolio',
            detail: `Menghapus dokumen "${item.title}"`,
          });
          notify('success', 'Dokumen berhasil dihapus.');
          await resyncPublic(documents.filter((d) => d.id !== item.id));
        }}
        onCreateCertificate={async (data) => {
          const id = await createCollectionItem('certificates', { ...data, uid: account.uid });
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'UPLOAD_FILE',
            module: 'Sertifikat',
            detail: `Menambahkan sertifikat "${data.eventName}"`,
          });
          await resyncPublic(documents, [{ id, uid: account.uid, ...data }, ...certificates]);
        }}
        onUpdateCertificate={async (id, data) => {
          await updateCollectionItem('certificates', id, data);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'EDIT_DATA',
            module: 'Sertifikat',
            detail: `Memperbarui sertifikat "${data.eventName || id}"`,
          });
          const next = certificates.map((c) => (c.id === id ? { ...c, ...data } : c));
          await resyncPublic(documents, next);
        }}
        onDeleteCertificate={async (item) => {
          await deleteCollectionItem('certificates', item.id);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'DELETE_DATA',
            module: 'Sertifikat',
            detail: `Menghapus sertifikat "${item.eventName}"`,
          });
          notify('success', 'Sertifikat berhasil dihapus.');
          await resyncPublic(
            documents,
            certificates.filter((c) => c.id !== item.id)
          );
        }}
        onCreateAchievement={async (data) => {
          const id = await createCollectionItem('achievements', { ...data, uid: account.uid });
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'UPLOAD_FILE',
            module: 'Prestasi',
            detail: `Menambahkan prestasi "${data.title}" (${data.level})`,
          });
          await resyncPublic(
            documents,
            certificates,
            [{ id, uid: account.uid, ...data }, ...achievements]
          );
        }}
        onUpdateAchievement={async (id, data) => {
          await updateCollectionItem('achievements', id, data);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'EDIT_DATA',
            module: 'Prestasi',
            detail: `Memperbarui prestasi "${data.title || id}"`,
          });
          const next = achievements.map((a) => (a.id === id ? { ...a, ...data } : a));
          await resyncPublic(documents, certificates, next);
        }}
        onDeleteAchievement={async (item) => {
          await deleteCollectionItem('achievements', item.id);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'DELETE_DATA',
            module: 'Prestasi',
            detail: `Menghapus prestasi "${item.title}"`,
          });
          notify('success', 'Prestasi berhasil dihapus.');
          await resyncPublic(
            documents,
            certificates,
            achievements.filter((a) => a.id !== item.id)
          );
        }}
        onCreateActivity={async (data) => {
          await createCollectionItem('activities', { ...data, uid: account.uid });
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'UPLOAD_FILE',
            module: 'Kegiatan',
            detail: `Menambahkan kegiatan "${data.title}"`,
          });
        }}
        onUpdateActivity={async (id, data) => {
          await updateCollectionItem('activities', id, data);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'EDIT_DATA',
            module: 'Kegiatan',
            detail: `Memperbarui kegiatan "${data.title || id}"`,
          });
        }}
        onDeleteActivity={async (item) => {
          await deleteCollectionItem('activities', item.id);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'DELETE_DATA',
            module: 'Kegiatan',
            detail: `Menghapus kegiatan "${item.title}"`,
          });
          notify('success', 'Kegiatan berhasil dihapus.');
        }}
        onCreateGallery={async (data) => {
          const id = await createCollectionItem('galleries', { ...data, uid: account.uid }, false);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'UPLOAD_FILE',
            module: 'Galeri Foto',
            detail: `Menambahkan foto "${data.title}" ke album ${data.album}`,
          });
          await resyncPublic(
            documents,
            certificates,
            achievements,
            [{ id, uid: account.uid, ...data }, ...galleries]
          );
        }}
        onDeleteGallery={async (item) => {
          await deleteCollectionItem('galleries', item.id);
          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'DELETE_DATA',
            module: 'Galeri Foto',
            detail: `Menghapus foto "${item.title}"`,
          });
          notify('success', 'Foto galeri berhasil dihapus.');
          await resyncPublic(
            documents,
            certificates,
            achievements,
            galleries.filter((g) => g.id !== item.id)
          );
        }}
        onUpdateSettings={async (patch) => {
          const nextSettings = { ...settings, ...patch };
          setSettings(nextSettings);
          if (patch.theme) {
            setTheme(patch.theme);
          }
          await updateSettingsDoc(account.uid, patch);
          notify('success', 'Pengaturan berhasil disimpan.');
        }}
        onOpenPublicPortfolio={() => navigatePublicPortfolio(profile.username)}
        onSeedSampleData={async () => {
          const yearNow = new Date().getFullYear();
          const docId = await createCollectionItem('documents', {
            uid: account.uid,
            title: 'Modul Ajar Pembelajaran Berbasis Proyek (PjBL)',
            category: 'RPP / Modul Ajar',
            year: yearNow,
            description: 'Perangkat ajar terstruktur dengan asesmen formatif dan rubrik penilaian proyek.',
            fileName: 'modul-ajar-pjbl.pdf',
            fileType: 'PDF',
            fileSize: 420000,
            fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
            storagePath: '',
            isPublic: true,
          });
          const certId = await createCollectionItem('certificates', {
            uid: account.uid,
            eventName: 'Seminar Nasional Transformasi Pendidikan Digital',
            organizer: 'Kemendikbudristek & Komunitas Penggerak',
            year: yearNow,
            description: 'Peserta aktif pelatihan integrasi portofolio digital dan asesmen autentik.',
            fileName: 'sertifikat-seminar.jpg',
            fileUrl: '/src/assets/images/gallery_seminar_event_1794813993737.jpg',
            storagePath: '',
            isPublic: true,
          });
          const achId = await createCollectionItem('achievements', {
            uid: account.uid,
            title: 'Penghargaan Inovasi Pembelajaran Digital Terbaik',
            level: 'Nasional',
            year: yearNow,
            description: 'Meraih apresiasi tingkat nasional atas pengembangan media belajar interaktif.',
            photoUrl: '/src/assets/images/gallery_award_ceremony_1794813992181.jpg',
            storagePath: '',
            isPublic: true,
          });
          await createCollectionItem('activities', {
            uid: account.uid,
            title: 'Pameran Karya Proyek STEM & Robotika Sekolah',
            date: `${yearNow}-10-14`,
            year: yearNow,
            description: 'Pendampingan tim siswa mempresentasikan prototipe otomasi berbasis sensor.',
            photoUrl: '/src/assets/images/gallery_student_project_1794813993139.jpg',
            storagePath: '',
            isPublic: true,
          });
          const galId1 = await createCollectionItem(
            'galleries',
            {
              uid: account.uid,
              title: 'Seminar Pendidikan Nasional',
              album: 'Seminar & Pelatihan',
              year: yearNow,
              caption: 'Sesi pemaparan praktik baik transformasi digital.',
              imageUrl: '/src/assets/images/gallery_seminar_event_1794813993737.jpg',
              storagePath: '',
              isPublic: true,
            },
            false
          );
          const galId2 = await createCollectionItem(
            'galleries',
            {
              uid: account.uid,
              title: 'Showcase Inovasi STEM',
              album: 'Karya Siswa',
              year: yearNow,
              caption: 'Demonstrasi prototipe robotik di laboratorium sekolah.',
              imageUrl: '/src/assets/images/gallery_student_project_1794813993139.jpg',
              storagePath: '',
              isPublic: true,
            },
            false
          );

          await syncPublicPortfolio(
            profile,
            account.role,
            [
              {
                id: docId,
                uid: account.uid,
                title: 'Modul Ajar Pembelajaran Berbasis Proyek (PjBL)',
                category: 'RPP / Modul Ajar',
                year: yearNow,
                description: 'Perangkat ajar terstruktur dengan asesmen formatif dan rubrik penilaian proyek.',
                fileName: 'modul-ajar-pjbl.pdf',
                fileType: 'PDF',
                fileSize: 420000,
                fileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                isPublic: true,
              },
            ],
            [
              {
                id: certId,
                uid: account.uid,
                eventName: 'Seminar Nasional Transformasi Pendidikan Digital',
                organizer: 'Kemendikbudristek & Komunitas Penggerak',
                year: yearNow,
                description: 'Peserta aktif pelatihan integrasi portofolio digital dan asesmen autentik.',
                fileUrl: '/src/assets/images/gallery_seminar_event_1794813993737.jpg',
                isPublic: true,
              },
            ],
            [
              {
                id: achId,
                uid: account.uid,
                title: 'Penghargaan Inovasi Pembelajaran Digital Terbaik',
                level: 'Nasional',
                year: yearNow,
                description: 'Meraih apresiasi tingkat nasional atas pengembangan media belajar interaktif.',
                photoUrl: '/src/assets/images/gallery_award_ceremony_1794813992181.jpg',
                isPublic: true,
              },
            ],
            [
              {
                id: galId1,
                uid: account.uid,
                title: 'Seminar Pendidikan Nasional',
                album: 'Seminar & Pelatihan',
                year: yearNow,
                caption: 'Sesi pemaparan praktik baik transformasi digital.',
                imageUrl: '/src/assets/images/gallery_seminar_event_1794813993737.jpg',
                isPublic: true,
              },
              {
                id: galId2,
                uid: account.uid,
                title: 'Showcase Inovasi STEM',
                album: 'Karya Siswa',
                year: yearNow,
                caption: 'Demonstrasi prototipe robotik di laboratorium sekolah.',
                imageUrl: '/src/assets/images/gallery_student_project_1794813993139.jpg',
                isPublic: true,
              },
            ]
          );

          await writeAuditLog({
            uid: account.uid,
            userEmail: account.email,
            userName: profile.fullName,
            action: 'UPLOAD_FILE',
            module: 'Portofolio',
            detail: 'Mengisi contoh portofolio awal untuk dokumen, sertifikat, prestasi, dan galeri',
          });
          notify('success', 'Contoh data portofolio berhasil ditambahkan.');
        }}
        onLogout={async () => {
          await signOut(auth);
          notify('info', 'Anda telah keluar dari akun.');
        }}
        onNotify={notify}
      />
      <OfflineIndicator />
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
