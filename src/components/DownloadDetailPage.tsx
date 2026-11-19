import { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  ShieldCheck,
} from 'lucide-react';
import type { DownloadItem, PublicRegistration } from '../../shared/types';
import { ApiError, downloadVerifiedPackage } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { MediaCover } from './MediaCover';

interface DownloadDetailPageProps {
  item: DownloadItem;
  registration: PublicRegistration;
  onBack: () => void;
  onOpenAdmin: () => void;
  onDownloadCountUpdated: (fileId: string, newCount: number) => void;
  onAuthExpired: () => void;
}

export function DownloadDetailPage({
  item,
  registration,
  onBack,
  onOpenAdmin,
  onDownloadCountUpdated,
  onAuthExpired,
}: DownloadDetailPageProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadedNotice, setDownloadedNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  const formattedRelease = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(item.releasedAt));

  async function handleDownload() {
    setDownloading(true);
    setErrorMessage(null);
    setDownloadedNotice(null);
    try {
      const nextCount = await downloadVerifiedPackage(item);
      onDownloadCountUpdated(item.id, nextCount);
      setDownloadedNotice(
        `Verified archive "${item.fileName}" has started downloading for device ${registration.deviceShortId}.`
      );
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : 'Download failed. Please try again.'
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleCopyChecksum() {
    try {
      await navigator.clipboard.writeText(item.sha256);
      setCopiedHash(true);
      window.setTimeout(() => setCopiedHash(false), 1800);
    } catch {
      setCopiedHash(false);
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
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-fuchsia-200/[0.08] bg-[#0B0810]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
          <BrandLogo size="md" onClick={onBack} />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={onBack}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              All Downloads
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin
            </button>
          </nav>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-200/[0.14] bg-[#161021] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-[#201630] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Catalog</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-10">
        {/* Quiet Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={onBack}
            className="hover:text-fuchsia-300 transition-colors cursor-pointer"
          >
            MAXAGRAM
          </button>
          <span aria-hidden="true">/</span>
          <span>{item.category}</span>
          <span aria-hidden="true">/</span>
          <span className="text-slate-200">{item.title}</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 gap-10 lg:grid-cols-12"
        >
          {/* Left Content Column */}
          <div className="lg:col-span-7 space-y-8">
            <div className="overflow-hidden rounded-xl border border-fuchsia-200/[0.09]">
              <MediaCover src={item.coverImage} alt={item.title} title={item.title} aspect="4/3" />
            </div>

            <section className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-white">Overview</h2>
              <p className="text-[15px] leading-relaxed text-slate-300">{item.description}</p>
            </section>

            <section className="border-t border-fuchsia-200/[0.08] pt-6 space-y-3">
              <h2 className="font-display text-xl font-semibold text-white">
                Release Notes — v{item.version}
              </h2>
              <p className="text-sm leading-relaxed text-slate-300">{item.releaseNotes}</p>
            </section>

            <section className="border-t border-fuchsia-200/[0.08] pt-6 space-y-3">
              <h2 className="font-display text-xl font-semibold text-white">System Requirements</h2>
              <p className="text-sm leading-relaxed text-slate-300">{item.requirements}</p>
            </section>
          </div>

          {/* Right Contiguous Download Module */}
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24 rounded-xl border border-fuchsia-200/[0.1] bg-[#130F1B] p-7">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{item.category}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-fuchsia-400">v{item.version}</span>
                {item.featured ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-fuchsia-200">Featured Release</span>
                  </>
                ) : null}
              </div>

              <h1 className="mt-2.5 font-display text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-white">
                {item.title}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{item.shortDescription}</p>

              {/* Feedback */}
              {errorMessage ? (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              {downloadedNotice ? (
                <div
                  role="status"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-200"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{downloadedNotice}</span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg bg-fuchsia-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-fuchsia-500 active:scale-[0.99] transition-all disabled:opacity-60 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>{downloading ? 'Preparing Verified Archive...' : 'Download Now'}</span>
              </button>

              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-fuchsia-400" />
                <span>Authorized for device {registration.deviceShortId}</span>
              </p>

              {/* Package Technical Specifications */}
              <dl className="mt-6 divide-y divide-fuchsia-200/[0.08] border-t border-fuchsia-200/[0.09] text-xs">
                <div className="flex items-center justify-between py-3">
                  <dt className="text-slate-400">Package Filename</dt>
                  <dd className="flex items-center gap-1.5 font-mono text-slate-200 truncate max-w-[220px]">
                    <FileArchive className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{item.fileName}</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-slate-400">Version</dt>
                  <dd className="font-mono text-slate-200 tabular-nums">v{item.version}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-slate-400">File Size</dt>
                  <dd className="font-mono text-slate-200 tabular-nums">{item.fileSize}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-slate-400">Release Date</dt>
                  <dd className="font-mono text-slate-200 tabular-nums">{formattedRelease}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-slate-400">Total Downloads</dt>
                  <dd className="font-mono text-slate-200 tabular-nums">
                    {item.downloadsCount.toLocaleString()}
                  </dd>
                </div>
                <div className="py-3">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-400">SHA-256 Checksum</dt>
                    <button
                      type="button"
                      onClick={handleCopyChecksum}
                      className="inline-flex items-center gap-1 text-fuchsia-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
                    >
                      {copiedHash ? (
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
                  <dd className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-slate-400">
                    {item.sha256}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </motion.div>
      </main>
    </div>
  );
}
