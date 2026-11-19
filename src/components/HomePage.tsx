import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  LogOut,
  Search,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { DOWNLOAD_CATEGORIES } from '../../shared/types';
import type { DownloadCategory, DownloadItem, PublicRegistration } from '../../shared/types';
import { ApiError, downloadVerifiedPackage } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { MediaCover } from './MediaCover';

const HERO_IMAGE = '/src/assets/images/maxagram_hero_vault_1795098370592.jpg';

interface HomePageProps {
  items: DownloadItem[];
  registration: PublicRegistration;
  loading: boolean;
  onSelectFile: (item: DownloadItem) => void;
  onOpenAdmin: () => void;
  onDownloadCountUpdated: (fileId: string, newCount: number) => void;
  onLogout: () => Promise<void>;
  onAuthExpired: () => void;
}

export function HomePage({
  items,
  registration,
  loading,
  onSelectFile,
  onOpenAdmin,
  onDownloadCountUpdated,
  onLogout,
  onAuthExpired,
}: HomePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | DownloadCategory>('All');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

  const isFiltering = searchQuery.trim().length > 0 || selectedCategory !== 'All';

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.shortDescription.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.version.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery, selectedCategory]);

  const featuredItems = useMemo(
    () => items.filter((item) => item.featured).slice(0, 3),
    [items]
  );

  const popularItems = useMemo(
    () => [...items].sort((a, b) => b.downloadsCount - a.downloadsCount).slice(0, 6),
    [items]
  );

  const latestItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime())
        .slice(0, 6),
    [items]
  );

  function showToast(type: 'success' | 'error', text: string) {
    setToast({ type, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  }

  async function handleQuickDownload(item: DownloadItem) {
    setDownloadingId(item.id);
    try {
      const nextCount = await downloadVerifiedPackage(item);
      onDownloadCountUpdated(item.id, nextCount);
      showToast('success', `Downloading ${item.fileName} (v${item.version})`);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthExpired();
        return;
      }
      showToast(
        'error',
        err instanceof Error ? err.message : 'Unable to start download. Please try again.'
      );
    } finally {
      setDownloadingId(null);
    }
  }

  function scrollToSection(id: string) {
    if (isFiltering) {
      setSearchQuery('');
      setSelectedCategory('All');
      window.setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <div
      className="min-h-screen bg-[#0B0810] text-slate-100 flex flex-col"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 75% 32% at 50% -8%, rgba(217, 70, 239, 0.12), transparent 65%)',
      }}
    >
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-fuchsia-200/[0.08] bg-[#0B0810]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single-line Brand Wordmark */}
          <BrandLogo
            size="md"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />

          {/* Zone 2: 5 concise single-line text links */}
          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400"
          >
            <button
              type="button"
              onClick={() => scrollToSection('featured')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Featured
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('popular')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Popular
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('latest')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Latest
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('categories')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Categories
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin
            </button>
          </nav>

          {/* Zone 3: Single primary action */}
          <button
            type="button"
            onClick={() => setAccountDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-300/[0.16] bg-[#161021] px-4 py-2 text-xs font-medium text-slate-100 hover:bg-[#201630] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-fuchsia-400" />
            <span>{registration.deviceShortId}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6">
        {/* Hero & Search Banner */}
        <section className="py-10 lg:py-12 border-b border-fuchsia-200/[0.08]">
          <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
            <div className="flex flex-col justify-center lg:col-span-7">
              <p className="text-xs font-medium text-fuchsia-400 mb-2.5">
                Verified Member Access · {registration.fullName}
              </p>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.85rem] font-bold leading-[1.1] tracking-[-0.025em] text-white max-w-2xl">
                Precision software releases, verified for your workstation.
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300">
                Browse curated desktop applications, developer utilities, security tools, and studio
                suites. Every package includes a sealed manifest and SHA-256 checksum.
              </p>

              {/* Prominent Search Input */}
              <div className="mt-7 max-w-xl">
                <label htmlFor="catalog-search" className="sr-only">
                  Search downloads
                </label>
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
                  <input
                    id="catalog-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search downloads by name, category, or version..."
                    className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#130F1B] py-3 pl-11 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 rounded p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Balanced Hero Media Frame */}
            <div className="lg:col-span-5">
              <div className="relative h-full min-h-[220px] overflow-hidden rounded-xl border border-fuchsia-200/[0.1]">
                <MediaCover
                  src={HERO_IMAGE}
                  alt="MAXAGRAM Distribution Vault"
                  aspect="fill"
                  className="lg:h-full"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0810]/90 via-[#1E0A26]/25 to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-300">Active Catalog</p>
                    <p className="font-mono text-lg font-semibold text-white tabular-nums">
                      {items.length} Verified Packages
                    </p>
                  </div>
                  <span className="font-mono text-xs text-fuchsia-300 tabular-nums">
                    {items
                      .reduce((sum, item) => sum + item.downloadsCount, 0)
                      .toLocaleString()}{' '}
                    downloads
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Download Categories Filter Bar */}
          <div id="categories" className="mt-8 scroll-mt-24">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('All')}
                className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === 'All'
                    ? 'bg-fuchsia-600 text-white'
                    : 'border border-fuchsia-200/[0.09] bg-[#130F1B] text-slate-300 hover:bg-[#1D152B] hover:text-white'
                }`}
              >
                All Categories
              </button>
              {DOWNLOAD_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedCategory === category
                      ? 'bg-fuchsia-600 text-white'
                      : 'border border-fuchsia-200/[0.09] bg-[#130F1B] text-slate-300 hover:bg-[#1D152B] hover:text-white'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Loading Skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 py-12 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-[360px] animate-pulse rounded-xl border border-fuchsia-200/[0.07] bg-[#130F1B]"
              />
            ))}
          </div>
        ) : isFiltering ? (
          /* Filtered Search / Category Results */
          <section className="py-10">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">
                  {selectedCategory === 'All' ? 'Search Results' : selectedCategory}
                </h2>
                <p className="mt-1 text-xs text-slate-400 tabular-nums">
                  Showing {filteredItems.length}{' '}
                  {filteredItems.length === 1 ? 'package' : 'packages'}
                  {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="rounded-lg border border-fuchsia-200/[0.14] px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-[#1B1427] transition-colors whitespace-nowrap cursor-pointer"
              >
                Clear Filters
              </button>
            </div>

            {filteredItems.length === 0 ? (
              <div className="rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] px-6 py-14 text-center">
                <p className="font-display text-lg font-semibold text-white">
                  No matching downloads found
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Try another search term or browse across all MAXAGRAM categories.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All');
                  }}
                  className="mt-5 rounded-lg bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors cursor-pointer"
                >
                  Show All Downloads
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredItems.map((item) => (
                  <DownloadCard
                    key={item.id}
                    item={item}
                    isDownloading={downloadingId === item.id}
                    onSelect={onSelectFile}
                    onDownload={handleQuickDownload}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Curated Homepage Sections: Featured -> Popular -> Latest */
          <div className="divide-y divide-fuchsia-200/[0.07]">
            {/* 1. Featured Downloads */}
            <section id="featured" className="py-12 scroll-mt-20">
              <div className="mb-7 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-white">
                    Featured Downloads
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Flagship workstation software vetted for performance and integrity.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {featuredItems.map((item) => (
                  <DownloadCard
                    key={item.id}
                    item={item}
                    isDownloading={downloadingId === item.id}
                    onSelect={onSelectFile}
                    onDownload={handleQuickDownload}
                  />
                ))}
              </div>
            </section>

            {/* 2. Popular Downloads */}
            <section id="popular" className="py-12 scroll-mt-20">
              <div className="mb-7 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-white">
                    Popular Downloads
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Most downloaded tools across registered MAXAGRAM devices.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {popularItems.map((item, idx) => (
                  <article
                    key={item.id}
                    className="group flex flex-col justify-between gap-4 rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-5 hover:border-fuchsia-400/30 transition-colors sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="font-mono text-fuchsia-400 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">v{item.version}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{item.fileSize}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectFile(item)}
                        className="mt-1.5 block text-left font-display text-lg font-semibold text-white group-hover:text-fuchsia-300 transition-colors cursor-pointer"
                      >
                        {item.title}
                      </button>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400 line-clamp-2">
                        {item.shortDescription}
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums">
                        {item.downloadsCount.toLocaleString()} verified downloads
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                      <button
                        type="button"
                        onClick={() => handleQuickDownload(item)}
                        disabled={downloadingId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{downloadingId === item.id ? 'Preparing...' : 'Download Now'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectFile(item)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-fuchsia-300 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <span>Details</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* 3. Latest Downloads */}
            <section id="latest" className="py-12 scroll-mt-20">
              <div className="mb-7 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-white">
                    Latest Downloads
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Newly published software releases and version updates.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {latestItems.map((item) => (
                  <DownloadCard
                    key={item.id}
                    item={item}
                    isDownloading={downloadingId === item.id}
                    onSelect={onSelectFile}
                    onDownload={handleQuickDownload}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="mt-12 border-t border-fuchsia-200/[0.08] bg-[#0B0810]">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo size="sm" />
            <span className="text-xs text-slate-500">
              © {new Date().getFullYear()} MAXAGRAM Distribution
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
            <span className="font-mono text-slate-500">Device: {registration.deviceShortId}</span>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="hover:text-fuchsia-300 transition-colors cursor-pointer"
            >
              Admin Dashboard
            </button>
          </div>
        </div>
      </footer>

      {/* Verified Account & Device Slide-Over Drawer */}
      {accountDrawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
          onClick={() => setAccountDrawerOpen(false)}
        >
          <motion.div
            initial={{ x: 320, opacity: 0.7 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-sm flex-col justify-between border-l border-fuchsia-200/[0.12] bg-[#130F1B] p-6"
          >
            <div>
              <div className="flex items-center justify-between border-b border-fuchsia-200/[0.08] pb-4">
                <h2 className="font-display text-lg font-semibold text-white">
                  Registered Device
                </h2>
                <button
                  type="button"
                  onClick={() => setAccountDrawerOpen(false)}
                  aria-label="Close panel"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 flex items-center gap-2.5 text-emerald-400">
                <Smartphone className="h-5 w-5 shrink-0" />
                <span className="text-sm font-semibold">Active · One-Device Verified</span>
              </div>

              <dl className="mt-5 divide-y divide-fuchsia-200/[0.08] border-y border-fuchsia-200/[0.09] text-xs">
                <div className="py-3 flex justify-between gap-3">
                  <dt className="text-slate-400">Account</dt>
                  <dd className="font-medium text-white text-right">{registration.fullName}</dd>
                </div>
                <div className="py-3 flex justify-between gap-3">
                  <dt className="text-slate-400">Email</dt>
                  <dd className="font-mono text-slate-200 text-right truncate">
                    {registration.email}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-3">
                  <dt className="text-slate-400">Bound Device ID</dt>
                  <dd className="font-mono text-fuchsia-400 text-right tabular-nums">
                    {registration.deviceShortId}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-3">
                  <dt className="text-slate-400">Platform</dt>
                  <dd className="text-slate-200 text-right">
                    {registration.devicePlatform} · {registration.deviceBrowser}
                  </dd>
                </div>
                <div className="py-3 flex justify-between gap-3">
                  <dt className="text-slate-400">Code Redeemed</dt>
                  <dd className="font-mono text-slate-200 text-right">{registration.codeUsed}</dd>
                </div>
                <div className="py-3 flex justify-between gap-3">
                  <dt className="text-slate-400">Registered</dt>
                  <dd className="font-mono text-slate-300 text-right tabular-nums">
                    {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(
                      new Date(registration.registeredAt)
                    )}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-xs leading-relaxed text-slate-400">
                Signing out clears your active browser session while keeping your device binding
                recorded on the server. Duplicate registrations remain blocked.
              </p>
            </div>

            <div className="space-y-2.5 border-t border-fuchsia-200/[0.08] pt-4">
              <button
                type="button"
                onClick={() => {
                  setAccountDrawerOpen(false);
                  onOpenAdmin();
                }}
                className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#1C142B] px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-[#261A3B] transition-colors cursor-pointer"
              >
                Open Admin Dashboard
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAccountDrawerOpen(false);
                  await onLogout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20 transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out Session</span>
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}

      {/* Non-intrusive Download Status Toast */}
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-lg border px-4 py-3 text-xs font-medium shadow-lg ${
            toast.type === 'success'
              ? 'border-emerald-500/30 bg-[#101820] text-emerald-200'
              : 'border-red-500/30 bg-[#1C1216] text-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          )}
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
  );
}

interface DownloadCardProps {
  item: DownloadItem;
  isDownloading: boolean;
  onSelect: (item: DownloadItem) => void;
  onDownload: (item: DownloadItem) => void;
}

function DownloadCard({ item, isDownloading, onSelect, onDownload }: DownloadCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] hover:border-fuchsia-400/30 transition-all duration-200 hover:-translate-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="block w-full text-left cursor-pointer"
        aria-label={`View details for ${item.title}`}
      >
        <MediaCover src={item.coverImage} alt={item.title} title={item.title} aspect="4/3" />
      </button>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          {/* Clean Unboxed Metadata */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span>{item.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-fuchsia-400 tabular-nums">v{item.version}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{item.fileSize}</span>
          </div>

          <button
            type="button"
            onClick={() => onSelect(item)}
            className="mt-2 block text-left font-display text-lg font-semibold text-white group-hover:text-fuchsia-300 transition-colors cursor-pointer"
          >
            {item.title}
          </button>

          <p className="mt-2 text-xs leading-relaxed text-slate-400 line-clamp-2">
            {item.shortDescription}
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-fuchsia-200/[0.07] pt-4">
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {item.downloadsCount.toLocaleString()} downloads
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="rounded-lg border border-fuchsia-200/[0.12] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.05] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => onDownload(item)}
              disabled={isDownloading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{isDownloading ? 'Saving...' : 'Download Now'}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
