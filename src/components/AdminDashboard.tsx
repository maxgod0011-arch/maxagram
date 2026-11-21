import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  FileArchive,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { DOWNLOAD_CATEGORIES } from '../../shared/types';
import type {
  AdminOverview,
  AdminRegistrationView,
  DownloadCategory,
  DownloadFormPayload,
  DownloadItem,
} from '../../shared/types';
import {
  ApiError,
  checkAdminSession,
  createAdminDownload,
  deleteAdminDownload,
  deleteAdminRegistration,
  fetchAdminDownloads,
  fetchAdminOverview,
  fetchAdminRegistrations,
  issueAdminDeviceRecovery,
  loginAdmin,
  logoutAdmin,
  updateAdminDownload,
  updateAdminRegistrationSetting,
  updateRegistrationStatus,
} from '../lib/api';
import { BrandLogo } from './BrandLogo';

const COVER_PRESETS: Array<{ label: string; url: string }> = [
  { label: 'Creative Dial (Studio)', url: '/src/assets/images/cover_creative_suite_1795098371414.jpg' },
  { label: 'Security Vault (Titanium)', url: '/src/assets/images/cover_security_vault_1795098371647.jpg' },
  { label: 'Audio Console (Hardware)', url: '/src/assets/images/cover_audio_studio_1795098371788.jpg' },
  { label: 'Developer Stack (Glass)', url: '/src/assets/images/cover_dev_tools_1795098371181.jpg' },
];

type AdminTab = 'overview' | 'registrations' | 'downloads' | 'activity';

interface AdminDashboardProps {
  onExitAdmin: () => void;
  onCatalogMutated: () => void;
}

export function AdminDashboard({ onExitAdmin, onCatalogMutated }: AdminDashboardProps) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; name: string } | null>(
    null
  );

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [registrations, setRegistrations] = useState<AdminRegistrationView[]>([]);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Registration search & filter
  const [regQuery, setRegQuery] = useState('');
  const [regStatusFilter, setRegStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED' | 'RECOVERY'>(
    'ALL'
  );

  // Device recovery modal
  const [recoveryTarget, setRecoveryTarget] = useState<AdminRegistrationView | null>(null);
  const [unbindOnRecovery, setUnbindOnRecovery] = useState(true);
  const [issuedRecoveryKey, setIssuedRecoveryKey] = useState<string | null>(null);
  const [copiedRecoveryKey, setCopiedRecoveryKey] = useState(false);
  const [issuingRecovery, setIssuingRecovery] = useState(false);

  // Download add/edit modal
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<DownloadItem | null>(null);
  const [savingFile, setSavingFile] = useState(false);
  const [fileForm, setFileForm] = useState<DownloadFormPayload>({
    title: '',
    category: 'Developer Tools',
    version: '1.0.0',
    fileSize: '64 MB',
    fileName: '',
    shortDescription: '',
    description: '',
    releaseNotes: '',
    requirements: 'Windows 10+ / macOS 13+ / Linux x64',
    coverImage: COVER_PRESETS[3].url,
    featured: false,
  });

  function showBanner(type: 'success' | 'error', text: string) {
    setBanner({ type, text });
    window.setTimeout(() => {
      setBanner((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }

  const loadDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [ov, regRes, dlRes] = await Promise.all([
        fetchAdminOverview(),
        fetchAdminRegistrations({ q: regQuery, status: regStatusFilter }),
        fetchAdminDownloads(),
      ]);
      setOverview(ov);
      setRegistrations(regRes.registrations);
      setDownloads(dlRes.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAdminUser(null);
        return;
      }
      showBanner('error', err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoadingData(false);
    }
  }, [regQuery, regStatusFilter]);

  useEffect(() => {
    let active = true;
    checkAdminSession()
      .then((res) => {
        if (!active) return;
        if (res.authenticated && res.admin) {
          setAdminUser(res.admin);
        }
      })
      .catch(() => {
        // Stay on login screen
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (adminUser) {
      loadDashboardData();
    }
  }, [adminUser, loadDashboardData]);

  async function handleAdminLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await loginAdmin(loginEmail, loginPassword);
      setAdminUser(res.admin);
      setLoginPassword('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleAdminLogout() {
    await logoutAdmin();
    setAdminUser(null);
    setOverview(null);
    setRegistrations([]);
    setDownloads([]);
  }

  async function handleToggleGlobalRegistration() {
    if (!overview) return;
    const nextValue = !overview.registrationsEnabled;
    try {
      await updateAdminRegistrationSetting(nextValue);
      setOverview({ ...overview, registrationsEnabled: nextValue });
      showBanner(
        'success',
        nextValue
          ? 'New device registrations are now enabled.'
          : 'New device registrations have been paused.'
      );
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to update setting.');
    }
  }

  async function handleToggleUserStatus(reg: AdminRegistrationView) {
    const nextStatus = reg.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      await updateRegistrationStatus(reg.id, nextStatus);
      await loadDashboardData();
      showBanner(
        'success',
        nextStatus === 'ACTIVE'
          ? `Restored registration access for ${reg.email}.`
          : `Disabled registration access for ${reg.email}.`
      );
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to update status.');
    }
  }

  async function handleDeleteRegistration(reg: AdminRegistrationView) {
    try {
      await deleteAdminRegistration(reg.id);
      await loadDashboardData();
      showBanner('success', `Removed registration record for ${reg.email}.`);
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to delete registration.');
    }
  }

  async function handleIssueRecoveryKey() {
    if (!recoveryTarget) return;
    setIssuingRecovery(true);
    try {
      const res = await issueAdminDeviceRecovery(recoveryTarget.id, unbindOnRecovery);
      setIssuedRecoveryKey(res.recoveryKey);
      await loadDashboardData();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to issue recovery key.');
    } finally {
      setIssuingRecovery(false);
    }
  }

  async function handleCopyRecoveryKey() {
    if (!issuedRecoveryKey) return;
    try {
      await navigator.clipboard.writeText(issuedRecoveryKey);
      setCopiedRecoveryKey(true);
      window.setTimeout(() => setCopiedRecoveryKey(false), 1800);
    } catch {
      setCopiedRecoveryKey(false);
    }
  }

  function openAddFileModal() {
    setEditingFile(null);
    setFileForm({
      title: '',
      category: 'Developer Tools',
      version: '1.0.0',
      fileSize: '64 MB',
      fileName: '',
      shortDescription: '',
      description: '',
      releaseNotes: '',
      requirements: 'Windows 10+ / macOS 13+ / Linux x64',
      coverImage: COVER_PRESETS[3].url,
      featured: false,
    });
    setFileModalOpen(true);
  }

  function openEditFileModal(item: DownloadItem) {
    setEditingFile(item);
    setFileForm({
      title: item.title,
      category: item.category,
      version: item.version,
      fileSize: item.fileSize,
      fileName: item.fileName,
      shortDescription: item.shortDescription,
      description: item.description,
      releaseNotes: item.releaseNotes,
      requirements: item.requirements,
      coverImage: item.coverImage,
      featured: item.featured,
    });
    setFileModalOpen(true);
  }

  async function handleSaveFile(e: FormEvent) {
    e.preventDefault();
    setSavingFile(true);
    try {
      if (editingFile) {
        await updateAdminDownload(editingFile.id, fileForm);
        showBanner('success', `Updated "${fileForm.title}" (v${fileForm.version}).`);
      } else {
        await createAdminDownload(fileForm);
        showBanner('success', `Published new download "${fileForm.title}".`);
      }
      setFileModalOpen(false);
      await loadDashboardData();
      onCatalogMutated();
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to save file.');
    } finally {
      setSavingFile(false);
    }
  }

  async function handleDeleteFile(item: DownloadItem) {
    try {
      await deleteAdminDownload(item.id);
      await loadDashboardData();
      onCatalogMutated();
      showBanner('success', `Deleted "${item.title}" from the catalog.`);
    } catch (err) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to delete file.');
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0810] text-slate-400">
        <span className="text-sm">Verifying administrator session...</span>
      </div>
    );
  }

  // Dedicated Admin Login Screen
  if (!adminUser) {
    return (
      <div
        className="min-h-screen bg-[#0B0810] text-slate-100 flex flex-col"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 75% 40% at 50% -10%, rgba(217, 70, 239, 0.14), transparent 65%)',
        }}
      >
        <header className="border-b border-fuchsia-200/[0.08]">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
            <BrandLogo size="md" onClick={onExitAdmin} />
            <button
              type="button"
              onClick={onExitAdmin}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to MAXAGRAM</span>
            </button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-12">
          <div className="w-full rounded-xl border border-fuchsia-200/[0.1] bg-[#130F1B] p-8">
            <div className="flex items-center gap-2 text-fuchsia-400">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-medium">Restricted Administrator Access</span>
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold text-white">
              MAXAGRAM Admin Sign In
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Sign in with your authorized administrator credentials to manage registered devices,
              recovery keys, and downloadable software packages.
            </p>

            {loginError ? (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{loginError}</span>
              </div>
            ) : null}

            <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Administrator Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="admin@maxagram.io"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Enter administrator password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loggingIn}
                className="mt-2 w-full rounded-lg bg-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 transition-colors disabled:opacity-60 cursor-pointer"
              >
                {loggingIn ? 'Authenticating...' : 'Sign In to Dashboard'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // Authenticated SaaS Admin Workspace (Sidebar + Header + Content Viewport)
  const tabTitle: Record<AdminTab, string> = {
    overview: 'Overview',
    registrations: 'Registrations & Devices',
    downloads: 'Download Catalog',
    activity: 'Download Activity',
  };

  return (
    <div className="min-h-screen bg-[#0B0810] text-slate-100 flex flex-col lg:flex-row">
      {/* Sidebar Navigation (256px desktop) */}
      <aside className="w-full border-b border-fuchsia-200/[0.08] bg-[#100C17] lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] px-5 py-4">
            <BrandLogo size="sm" onClick={onExitAdmin} />
            <span className="text-[11px] font-mono text-fuchsia-400">ADMIN</span>
          </div>

          <nav aria-label="Admin Navigation" className="flex gap-1 overflow-x-auto p-3 lg:flex-col">
            <SidebarButton
              active={activeTab === 'overview'}
              icon={<LayoutDashboard className="h-4 w-4" />}
              label="Overview"
              onClick={() => setActiveTab('overview')}
            />
            <SidebarButton
              active={activeTab === 'registrations'}
              icon={<Users className="h-4 w-4" />}
              label="Registrations"
              count={overview?.totalUsers}
              onClick={() => setActiveTab('registrations')}
            />
            <SidebarButton
              active={activeTab === 'downloads'}
              icon={<FileArchive className="h-4 w-4" />}
              label="Downloads"
              count={overview?.totalFiles}
              onClick={() => setActiveTab('downloads')}
            />
            <SidebarButton
              active={activeTab === 'activity'}
              icon={<Activity className="h-4 w-4" />}
              label="Activity Log"
              onClick={() => setActiveTab('activity')}
            />
          </nav>
        </div>

        <div className="hidden lg:block border-t border-white/[0.08] p-4 space-y-2">
          <div className="px-2 py-1">
            <p className="text-xs font-medium text-white truncate">{adminUser.name}</p>
            <p className="font-mono text-[11px] text-slate-500 truncate">{adminUser.email}</p>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Website</span>
          </button>
          <button
            type="button"
            onClick={handleAdminLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Contextual Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-fuchsia-200/[0.08] bg-[#0B0810] px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">MAXAGRAM Admin</span>
            <span className="text-slate-600">/</span>
            <h1 className="font-display font-semibold text-white">{tabTitle[activeTab]}</h1>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'downloads' ? (
              <button
                type="button"
                onClick={openAddFileModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add New File</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleToggleGlobalRegistration}
              disabled={!overview}
              className={`rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                overview?.registrationsEnabled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              }`}
            >
              {overview?.registrationsEnabled
                ? 'Registrations: Enabled'
                : 'Registrations: Disabled'}
            </button>

            <button
              type="button"
              onClick={handleAdminLogout}
              className="lg:hidden rounded-lg border border-fuchsia-200/[0.14] px-3 py-2 text-xs text-slate-300 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 space-y-6 max-w-[1240px] w-full">
          {/* Status Banner */}
          {banner ? (
            <div
              role="status"
              className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs font-medium ${
                banner.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              <span className="flex items-center gap-2">
                {banner.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <span>{banner.text}</span>
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && overview ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Total Registered Users"
                  value={overview.totalUsers.toLocaleString()}
                  detail={`${overview.activeUsers} active · ${overview.disabledUsers} disabled`}
                />
                <KpiCard
                  label="Total Downloads"
                  value={overview.totalDownloads.toLocaleString()}
                  detail="Verified archive deliveries"
                />
                <KpiCard
                  label="Published Files"
                  value={overview.totalFiles.toLocaleString()}
                  detail="Active packages in catalog"
                />
                <KpiCard
                  label="Unique Code Mode"
                  value="1-Time Unique"
                  monoValue
                  detail={
                    overview.registrationsEnabled
                      ? `Gate open · ${overview.pendingPreRegistrations} pending activation`
                      : 'Registration gate paused'
                  }
                />
              </div>

              {/* Global Registration Policy Control */}
              <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-white">
                    Global Registration Gate Control
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 max-w-xl">
                    Pause or re-open new one-device Pre-Registrations and unique code issuance.
                    Existing active users remain verified while paused.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleGlobalRegistration}
                  className={`rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    overview.registrationsEnabled
                      ? 'border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                      : 'bg-fuchsia-600 text-white hover:bg-fuchsia-500'
                  }`}
                >
                  {overview.registrationsEnabled
                    ? 'Disable New Registrations'
                    : 'Enable New Registrations'}
                </button>
              </section>

              {/* Recent Downloads Summary */}
              <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] overflow-hidden">
                <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] px-6 py-4">
                  <h2 className="font-display text-base font-semibold text-white">
                    Recent Verified Downloads
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('activity')}
                    className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
                  >
                    View Full Log
                  </button>
                </div>
                <ActivityTable logs={overview.recentLogs.slice(0, 6)} />
              </section>
            </>
          ) : null}

          {/* REGISTRATIONS & DEVICES TAB */}
          {activeTab === 'registrations' ? (
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="search"
                    value={regQuery}
                    onChange={(e) => setRegQuery(e.target.value)}
                    placeholder="Search user name, email, unique code, device ID, or platform..."
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#130F1B] py-2 pl-10 pr-3.5 text-xs text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-fuchsia-200/[0.09] bg-[#130F1B] p-1">
                  {(
                    [
                      { key: 'ALL', label: 'All' },
                      { key: 'ACTIVE', label: 'Active' },
                      { key: 'DISABLED', label: 'Disabled' },
                      { key: 'RECOVERY', label: 'Recovery Pending' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setRegStatusFilter(f.key)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        regStatusFilter === f.key
                          ? 'bg-fuchsia-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400">
                      <th className="px-5 py-3.5 font-medium">User</th>
                      <th className="px-4 py-3.5 font-medium">Status</th>
                      <th className="px-4 py-3.5 font-medium">Device Association</th>
                      <th className="px-4 py-3.5 font-medium">Registered</th>
                      <th className="px-4 py-3.5 font-medium text-right">Downloads</th>
                      <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {loadingData && registrations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                          Loading registered users...
                        </td>
                      </tr>
                    ) : registrations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                          No registrations match the current search or filter.
                        </td>
                      </tr>
                    ) : (
                      registrations.map((reg) => (
                        <tr key={reg.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-medium text-white">{reg.fullName}</p>
                            <p className="font-mono text-[11px] text-slate-400">{reg.email}</p>
                            <p className="mt-0.5 font-mono text-[11px] text-fuchsia-300/90 tabular-nums">
                              Code: {reg.codeUsed}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {reg.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span>Active</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 font-medium text-red-400">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                <span>Disabled</span>
                              </span>
                            )}
                            {reg.recoveryPending ? (
                              <p className="mt-0.5 text-[11px] text-amber-400">
                                Recovery key active
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-mono text-slate-200 tabular-nums">
                              {reg.deviceShortId}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {reg.devicePlatform} · {reg.deviceBrowser} ·{' '}
                              <span className="font-mono">{reg.ipAddress}</span>
                            </p>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-300 tabular-nums whitespace-nowrap">
                            {new Intl.DateTimeFormat('en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            }).format(new Date(reg.registeredAt))}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-slate-200 tabular-nums">
                            {reg.downloadCount}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setRecoveryTarget(reg);
                                  setIssuedRecoveryKey(null);
                                  setUnbindOnRecovery(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-fuchsia-300/[0.16] bg-[#1E142D] px-2.5 py-1.5 text-[11px] font-medium text-fuchsia-300 hover:bg-[#2A1B3F] cursor-pointer"
                              >
                                <KeyRound className="h-3 w-3" />
                                <span>Recover</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(reg)}
                                className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium cursor-pointer ${
                                  reg.status === 'ACTIVE'
                                    ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                                    : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                                }`}
                              >
                                {reg.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRegistration(reg)}
                                aria-label={`Delete registration for ${reg.email}`}
                                className="rounded-md border border-rose-500/25 p-1.5 text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* DOWNLOAD CATALOG MANAGEMENT TAB */}
          {activeTab === 'downloads' ? (
            <section className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-fuchsia-200/[0.08] text-slate-400">
                      <th className="px-5 py-3.5 font-medium">File Package</th>
                      <th className="px-4 py-3.5 font-medium">Category</th>
                      <th className="px-4 py-3.5 font-medium">Version</th>
                      <th className="px-4 py-3.5 font-medium">Size</th>
                      <th className="px-4 py-3.5 font-medium text-right">Downloads</th>
                      <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-fuchsia-200/[0.06]">
                    {downloads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-slate-400">
                          No files published yet. Click &ldquo;Add New File&rdquo; to publish a
                          package.
                        </td>
                      </tr>
                    ) : (
                      downloads.map((file) => (
                        <tr key={file.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{file.title}</span>
                              {file.featured ? (
                                <span className="text-[11px] text-fuchsia-400">· Featured</span>
                              ) : null}
                            </div>
                            <p className="font-mono text-[11px] text-slate-500">{file.fileName}</p>
                          </td>
                          <td className="px-4 py-3.5 text-slate-300 whitespace-nowrap">
                            {file.category}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-fuchsia-400 tabular-nums whitespace-nowrap">
                            v{file.version}
                          </td>
                          <td className="px-4 py-3.5 font-mono text-slate-300 tabular-nums whitespace-nowrap">
                            {file.fileSize}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono text-slate-200 tabular-nums">
                            {file.downloadsCount.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditFileModal(file)}
                                className="inline-flex items-center gap-1 rounded-md border border-fuchsia-200/[0.12] bg-[#1C142B] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-[#261B3B] cursor-pointer"
                              >
                                <Edit3 className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file)}
                                aria-label={`Delete ${file.title}`}
                                className="rounded-md border border-rose-500/25 p-1.5 text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/* DOWNLOAD ACTIVITY LOG TAB */}
          {activeTab === 'activity' && overview ? (
            <section className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] overflow-hidden">
              <div className="border-b border-fuchsia-200/[0.08] px-6 py-4">
                <h2 className="font-display text-base font-semibold text-white">
                  Verified Download History
                </h2>
              </div>
              <ActivityTable logs={overview.recentLogs} />
            </section>
          ) : null}
        </main>
      </div>

      {/* ADMIN-CONTROLLED DEVICE RECOVERY MODAL */}
      {recoveryTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
          onClick={() => setRecoveryTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-fuchsia-200/[0.14] bg-[#130F1B] p-6"
          >
            <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] pb-4">
              <h2 className="font-display text-lg font-semibold text-white">
                Admin Device Recovery
              </h2>
              <button
                type="button"
                onClick={() => setRecoveryTarget(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Issue a one-time recovery key for{' '}
                <span className="font-semibold text-white">{recoveryTarget.fullName}</span> (
                <span className="font-mono text-slate-200">{recoveryTarget.email}</span>).
              </p>

              {!issuedRecoveryKey ? (
                <>
                  <label className="flex items-start gap-2.5 rounded-lg border border-fuchsia-200/[0.09] bg-[#0B0810] p-3.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unbindOnRecovery}
                      onChange={(e) => setUnbindOnRecovery(e.target.checked)}
                      className="mt-0.5 accent-fuchsia-600"
                    />
                    <span className="text-slate-300 leading-relaxed">
                      <strong className="text-white block">
                        Reset &amp; unbind current device ({recoveryTarget.deviceShortId})
                      </strong>
                      Revokes the old device immediately and allows the user to bind a replacement
                      device with this one-time key.
                    </span>
                  </label>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRecoveryTarget(null)}
                      className="rounded-lg border border-fuchsia-200/[0.14] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={issuingRecovery}
                      onClick={handleIssueRecoveryKey}
                      className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 cursor-pointer disabled:opacity-60"
                    >
                      {issuingRecovery ? 'Generating...' : 'Generate Recovery Key'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <p className="text-emerald-300 font-medium">
                      One-Time Device Recovery Key Generated
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md bg-[#0B0810] px-3.5 py-2.5 border border-fuchsia-200/[0.09]">
                      <code className="font-mono text-sm font-semibold text-white tracking-wider">
                        {issuedRecoveryKey}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyRecoveryKey}
                        className="inline-flex items-center gap-1 text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 cursor-pointer"
                      >
                        {copiedRecoveryKey ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-300">
                      Share this key securely with the user. They can redeem it under the Device
                      Recovery tab on the MAXAGRAM registration page. This key is hashed on the
                      server and cannot be viewed again after closing.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setRecoveryTarget(null)}
                      className="rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ADD / EDIT DOWNLOADABLE FILE MODAL */}
      {fileModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs overflow-y-auto"
          onClick={() => setFileModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-8 w-full max-w-xl rounded-xl border border-fuchsia-200/[0.14] bg-[#130F1B] p-6"
          >
            <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] pb-4">
              <h2 className="font-display text-lg font-semibold text-white">
                {editingFile ? `Edit ${editingFile.title}` : 'Publish New Downloadable File'}
              </h2>
              <button
                type="button"
                onClick={() => setFileModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFile} className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">File Title</label>
                  <input
                    type="text"
                    required
                    value={fileForm.title}
                    onChange={(e) => setFileForm({ ...fileForm, title: e.target.value })}
                    placeholder="e.g. Prism Render Engine"
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">Category</label>
                  <select
                    value={fileForm.category}
                    onChange={(e) =>
                      setFileForm({ ...fileForm, category: e.target.value as DownloadCategory })
                    }
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  >
                    {DOWNLOAD_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">Version</label>
                  <input
                    type="text"
                    required
                    value={fileForm.version}
                    onChange={(e) => setFileForm({ ...fileForm, version: e.target.value })}
                    placeholder="2.4.0"
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 font-mono text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">File Size</label>
                  <input
                    type="text"
                    required
                    value={fileForm.fileSize}
                    onChange={(e) => setFileForm({ ...fileForm, fileSize: e.target.value })}
                    placeholder="142 MB"
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 font-mono text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">Archive Filename</label>
                  <input
                    type="text"
                    value={fileForm.fileName}
                    onChange={(e) => setFileForm({ ...fileForm, fileName: e.target.value })}
                    placeholder="Auto-generated.zip"
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 font-mono text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1.5">Short Summary</label>
                <input
                  type="text"
                  required
                  value={fileForm.shortDescription}
                  onChange={(e) => setFileForm({ ...fileForm, shortDescription: e.target.value })}
                  placeholder="Concise one-line overview displayed on download cards."
                  className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1.5">Full Description</label>
                <textarea
                  rows={3}
                  value={fileForm.description}
                  onChange={(e) => setFileForm({ ...fileForm, description: e.target.value })}
                  placeholder="Detailed capabilities, architecture, and workflow notes..."
                  className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">Release Notes</label>
                  <input
                    type="text"
                    value={fileForm.releaseNotes}
                    onChange={(e) => setFileForm({ ...fileForm, releaseNotes: e.target.value })}
                    placeholder="What changed in this release?"
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">
                    System Requirements
                  </label>
                  <input
                    type="text"
                    value={fileForm.requirements}
                    onChange={(e) => setFileForm({ ...fileForm, requirements: e.target.value })}
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-center">
                <div>
                  <label className="block font-medium text-slate-300 mb-1.5">Cover Artwork</label>
                  <select
                    value={fileForm.coverImage}
                    onChange={(e) => setFileForm({ ...fileForm, coverImage: e.target.value })}
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
                  >
                    {COVER_PRESETS.map((preset) => (
                      <option key={preset.url} value={preset.url}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2.5 pt-5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fileForm.featured}
                    onChange={(e) => setFileForm({ ...fileForm, featured: e.target.checked })}
                    className="accent-fuchsia-600"
                  />
                  <span className="text-slate-200 font-medium">
                    Feature on MAXAGRAM Homepage
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-fuchsia-200/[0.08] pt-4">
                <button
                  type="button"
                  onClick={() => setFileModalOpen(false)}
                  className="rounded-lg border border-fuchsia-200/[0.14] px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.05] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFile}
                  className="rounded-lg bg-fuchsia-600 px-5 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 cursor-pointer disabled:opacity-60"
                >
                  {savingFile ? 'Saving...' : editingFile ? 'Save Changes' : 'Publish Package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SidebarButton({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
        active
          ? 'bg-[#221433] text-white'
          : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span className={active ? 'text-fuchsia-400' : 'text-slate-500'}>{icon}</span>
        <span>{label}</span>
      </span>
      {typeof count === 'number' ? (
        <span className="font-mono text-[11px] text-slate-500 tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}

function KpiCard({
  label,
  value,
  detail,
  monoValue = false,
}: {
  label: string;
  value: string;
  detail: string;
  monoValue?: boolean;
}) {
  return (
    <div className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold text-white tabular-nums ${
          monoValue ? 'font-mono tracking-wide text-fuchsia-400' : 'font-display'
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function ActivityTable({ logs }: { logs: AdminOverview['recentLogs'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-fuchsia-200/[0.08] text-slate-400">
            <th className="px-6 py-3 font-medium">Package</th>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Device ID</th>
            <th className="px-6 py-3 font-medium text-right">Downloaded At</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-fuchsia-200/[0.06]">
          {logs.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                No download activity recorded yet.
              </td>
            </tr>
          ) : (
            logs.map((log) => (
              <tr key={log.id} className="hover:bg-white/[0.02]">
                <td className="px-6 py-3">
                  <span className="font-medium text-white">{log.fileTitle}</span>{' '}
                  <span className="font-mono text-slate-500">v{log.fileVersion}</span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-300">{log.userEmail}</td>
                <td className="px-4 py-3 font-mono text-fuchsia-400 tabular-nums">
                  {log.deviceShortId}
                </td>
                <td className="px-6 py-3 text-right font-mono text-slate-400 tabular-nums whitespace-nowrap">
                  {new Intl.DateTimeFormat('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(log.downloadedAt))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
