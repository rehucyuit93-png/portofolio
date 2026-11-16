import React, { useState } from 'react';
import { motion } from 'motion/react';
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
} from '../types/portfolio';
import { PWAInstallButton } from './PWAInstallButton';
import { DashboardOverviewSection } from './sections/DashboardOverviewSection';
import { ProfileSection } from './sections/ProfileSection';
import { DocumentsSection } from './sections/DocumentsSection';
import { CertificatesSection } from './sections/CertificatesSection';
import { AchievementsSection, ActivitiesSection } from './sections/AchievementsActivitiesSection';
import { GallerySection } from './sections/GallerySection';
import { CVGeneratorSection } from './sections/CVGeneratorSection';
import { ActivityLogsSection } from './sections/ActivityLogsSection';
import { SettingsSection } from './sections/SettingsSection';
import { AdminDashboardSection } from './sections/AdminDashboardSection';

interface DashboardShellProps {
  account: UserAccount;
  profile: UserProfile;
  settings: UserSettings;
  documents: PortfolioDocument[];
  certificates: Certificate[];
  achievements: Achievement[];
  activities: Activity[];
  galleries: GalleryItem[];
  logs: AuditLog[];
  activeSection: DashboardSection;
  onSelectSection: (section: DashboardSection) => void;
  onSaveProfile: (data: Omit<UserProfile, 'uid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCreateDocument: (data: Omit<PortfolioDocument, 'id' | 'uid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateDocument: (id: string, data: Partial<PortfolioDocument>) => Promise<void>;
  onDeleteDocument: (item: PortfolioDocument) => Promise<void>;
  onCreateCertificate: (data: Omit<Certificate, 'id' | 'uid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateCertificate: (id: string, data: Partial<Certificate>) => Promise<void>;
  onDeleteCertificate: (item: Certificate) => Promise<void>;
  onCreateAchievement: (data: Omit<Achievement, 'id' | 'uid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateAchievement: (id: string, data: Partial<Achievement>) => Promise<void>;
  onDeleteAchievement: (item: Achievement) => Promise<void>;
  onCreateActivity: (data: Omit<Activity, 'id' | 'uid' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdateActivity: (id: string, data: Partial<Activity>) => Promise<void>;
  onDeleteActivity: (item: Activity) => Promise<void>;
  onCreateGallery: (data: Omit<GalleryItem, 'id' | 'uid' | 'createdAt'>) => Promise<void>;
  onDeleteGallery: (item: GalleryItem) => Promise<void>;
  onUpdateSettings: (patch: Partial<Omit<UserSettings, 'uid' | 'updatedAt'>>) => Promise<void>;
  onOpenPublicPortfolio: () => void;
  onSeedSampleData: () => Promise<void>;
  onLogout: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const MENU_ITEMS: Array<{ id: DashboardSection; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-grid-2' },
  { id: 'profile', label: 'Profil Saya', icon: 'fa-solid fa-user' },
  { id: 'documents', label: 'Dokumen Portofolio', icon: 'fa-solid fa-folder-open' },
  { id: 'certificates', label: 'Sertifikat', icon: 'fa-solid fa-certificate' },
  { id: 'achievements', label: 'Prestasi', icon: 'fa-solid fa-trophy' },
  { id: 'activities', label: 'Kegiatan', icon: 'fa-solid fa-calendar-check' },
  { id: 'gallery', label: 'Galeri Foto', icon: 'fa-solid fa-images' },
  { id: 'cv', label: 'CV Otomatis', icon: 'fa-solid fa-file-invoice' },
  { id: 'logs', label: 'Riwayat Aktivitas', icon: 'fa-solid fa-clock-rotate-left' },
  { id: 'settings', label: 'Pengaturan', icon: 'fa-solid fa-gear' },
];

export const DashboardShell: React.FC<DashboardShellProps> = (props) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeLabel =
    props.activeSection === 'admin'
      ? 'Dashboard Admin'
      : MENU_ITEMS.find((m) => m.id === props.activeSection)?.label || 'Dashboard';

  const handleNav = (section: DashboardSection) => {
    props.onSelectSection(section);
    setSidebarOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="no-print fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-[264px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white">
              <i className="fa-solid fa-layer-group text-xs" aria-hidden="true" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              KaryaLoka
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
            aria-label="Tutup menu"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {MENU_ITEMS.map((item) => {
            const active = props.activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <i
                  className={`${item.icon === 'fa-solid fa-grid-2' ? 'fa-solid fa-table-columns' : item.icon} w-4 text-center`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}

          {props.account.role === 'admin' && (
            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handleNav('admin')}
                className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors whitespace-nowrap ${
                  props.activeSection === 'admin'
                    ? 'bg-violet-600 text-white'
                    : 'text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/50'
                }`}
              >
                <i className="fa-solid fa-shield-halved w-4 text-center" aria-hidden="true" />
                <span>Dashboard Admin</span>
              </button>
            </div>
          )}
        </nav>

        <div className="border-t border-slate-200 p-3 space-y-2 dark:border-slate-800">
          <button
            type="button"
            onClick={props.onOpenPublicPortfolio}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <i className="fa-solid fa-globe" aria-hidden="true" />
            <span>Portofolio Publik</span>
          </button>
          <button
            type="button"
            onClick={props.onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="no-print glass-surface sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
                aria-label="Buka menu navigasi"
              >
                <i className="fa-solid fa-bars" aria-hidden="true" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="hidden text-slate-400 sm:inline">KaryaLoka</span>
                <span className="hidden text-slate-300 sm:inline dark:text-slate-600">/</span>
                <h2 className="truncate font-bold text-slate-900 dark:text-white">{activeLabel}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <PWAInstallButton compact />

              <button
                type="button"
                onClick={() =>
                  props.onUpdateSettings({
                    theme: props.settings.theme === 'dark' ? 'light' : 'dark',
                  })
                }
                title={props.settings.theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-label="Ganti tema"
              >
                <i
                  className={props.settings.theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon'}
                  aria-hidden="true"
                />
              </button>

              <button
                type="button"
                onClick={() => handleNav('profile')}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white py-1 pr-3 pl-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                <img
                  src={
                    props.profile.photoURL ||
                    props.account.photoURL ||
                    '/src/assets/images/avatar_educator_default_1794813989923.jpg'
                  }
                  alt={props.profile.fullName}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 rounded-lg object-cover"
                />
                <span className="hidden max-w-[130px] truncate sm:inline">
                  {props.profile.fullName}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* Viewport */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <motion.div
            key={props.activeSection}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {props.activeSection === 'dashboard' && (
              <DashboardOverviewSection
                account={props.account}
                profile={props.profile}
                documents={props.documents}
                certificates={props.certificates}
                achievements={props.achievements}
                activities={props.activities}
                galleries={props.galleries}
                logs={props.logs}
                onNavigate={handleNav}
                onOpenPublicPortfolio={props.onOpenPublicPortfolio}
                onSeedSampleData={props.onSeedSampleData}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'profile' && (
              <ProfileSection
                uid={props.account.uid}
                profile={props.profile}
                onSaveProfile={props.onSaveProfile}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'documents' && (
              <DocumentsSection
                uid={props.account.uid}
                documents={props.documents}
                onCreate={props.onCreateDocument}
                onUpdate={props.onUpdateDocument}
                onDelete={props.onDeleteDocument}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'certificates' && (
              <CertificatesSection
                uid={props.account.uid}
                certificates={props.certificates}
                onCreate={props.onCreateCertificate}
                onUpdate={props.onUpdateCertificate}
                onDelete={props.onDeleteCertificate}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'achievements' && (
              <AchievementsSection
                uid={props.account.uid}
                achievements={props.achievements}
                onCreate={props.onCreateAchievement}
                onUpdate={props.onUpdateAchievement}
                onDelete={props.onDeleteAchievement}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'activities' && (
              <ActivitiesSection
                uid={props.account.uid}
                activities={props.activities}
                onCreate={props.onCreateActivity}
                onUpdate={props.onUpdateActivity}
                onDelete={props.onDeleteActivity}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'gallery' && (
              <GallerySection
                uid={props.account.uid}
                galleries={props.galleries}
                onCreate={props.onCreateGallery}
                onDelete={props.onDeleteGallery}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'cv' && (
              <CVGeneratorSection
                profile={props.profile}
                documents={props.documents}
                certificates={props.certificates}
                achievements={props.achievements}
                activities={props.activities}
                defaultTemplate={props.settings.cvTemplate}
                onSaveTemplatePreference={(cvTemplate) =>
                  props.onUpdateSettings({ cvTemplate })
                }
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'logs' && <ActivityLogsSection logs={props.logs} />}

            {props.activeSection === 'settings' && (
              <SettingsSection
                settings={props.settings}
                profile={props.profile}
                documents={props.documents}
                certificates={props.certificates}
                achievements={props.achievements}
                activities={props.activities}
                galleries={props.galleries}
                logs={props.logs}
                onUpdateSettings={props.onUpdateSettings}
                onNotify={props.onNotify}
              />
            )}

            {props.activeSection === 'admin' && props.account.role === 'admin' && (
              <AdminDashboardSection
                adminAccount={props.account}
                onNotify={props.onNotify}
              />
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
};
