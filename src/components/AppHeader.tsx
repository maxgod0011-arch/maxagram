import { useState } from 'react';
import { motion } from 'motion/react';
import { LogOut, ShieldCheck, Smartphone, User, X } from 'lucide-react';
import type { PublicRegistration, SocialProfile } from '../../shared/types';
import { Avatar } from './Avatar';
import { BrandLogo } from './BrandLogo';

export type ActiveNavSection = 'feed' | 'messages' | 'profiles' | 'downloads';

interface AppHeaderProps {
  activeSection: ActiveNavSection;
  registration: PublicRegistration;
  myProfile: SocialProfile | null;
  unreadMessages: number;
  onNavigateFeed: () => void;
  onNavigateMessages: () => void;
  onNavigateProfiles: () => void;
  onNavigateDownloads: () => void;
  onOpenAdmin: () => void;
  onLogout: () => Promise<void>;
}

export function AppHeader({
  activeSection,
  registration,
  myProfile,
  unreadMessages,
  onNavigateFeed,
  onNavigateMessages,
  onNavigateProfiles,
  onNavigateDownloads,
  onOpenAdmin,
  onLogout,
}: AppHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navItems: Array<{
    id: ActiveNavSection | 'admin';
    label: string;
    badge?: number;
    onClick: () => void;
  }> = [
    { id: 'feed', label: 'Feed', onClick: onNavigateFeed },
    { id: 'messages', label: 'Messages', badge: unreadMessages, onClick: onNavigateMessages },
    { id: 'profiles', label: 'Profiles', onClick: onNavigateProfiles },
    { id: 'downloads', label: 'Downloads', onClick: onNavigateDownloads },
    { id: 'admin', label: 'Admin', onClick: onOpenAdmin },
  ];

  return (
    <>
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-fuchsia-200/[0.08] bg-[#0B0810]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Brand Wordmark */}
          <BrandLogo size="md" onClick={onNavigateFeed} />

          {/* Zone 2: 5 concise single-line nav links */}
          <nav
            aria-label="Primary"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const isActive = item.id === activeSection;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`relative inline-flex items-center gap-1.5 py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="font-mono text-[11px] font-semibold text-fuchsia-400 tabular-nums">
                      ({item.badge > 99 ? '99+' : item.badge})
                    </span>
                  ) : null}
                  {isActive ? (
                    <span className="absolute -bottom-[15px] left-0 right-0 h-[2px] bg-fuchsia-500" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single primary account & device button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2.5 rounded-lg border border-fuchsia-300/[0.16] bg-[#161021] pl-2 pr-3.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-[#201630] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Avatar
              src={myProfile?.avatarUrl}
              name={myProfile?.displayName || registration.fullName}
              size="xs"
            />
            <span className="max-w-[120px] truncate">
              {myProfile ? `@${myProfile.username}` : registration.deviceShortId}
            </span>
          </button>
        </div>

        {/* Compact Mobile Navigation Row */}
        <nav
          aria-label="Mobile navigation"
          className="flex md:hidden items-center justify-around border-t border-fuchsia-200/[0.06] px-2 py-2 text-xs font-medium"
        >
          {navItems.map((item) => {
            const isActive = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  isActive ? 'text-fuchsia-300 bg-fuchsia-500/10' : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
                {item.badge && item.badge > 0 ? (
                  <span className="ml-1 font-mono text-[10px] text-fuchsia-400 tabular-nums">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Account & Registered Device Slide-Over Drawer */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-xs"
          onClick={() => setDrawerOpen(false)}
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
                  Account & Device
                </h2>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close panel"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 flex items-center gap-3.5">
                <Avatar
                  src={myProfile?.avatarUrl}
                  name={myProfile?.displayName || registration.fullName}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold text-white truncate">
                    {myProfile?.displayName || registration.fullName}
                  </p>
                  {myProfile ? (
                    <p className="font-mono text-xs text-fuchsia-400 truncate">
                      @{myProfile.username}
                    </p>
                  ) : null}
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>One-Device Verified</span>
                  </div>
                </div>
              </div>

              <dl className="mt-5 divide-y divide-fuchsia-200/[0.08] border-y border-fuchsia-200/[0.09] text-xs">
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

              <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
                <Smartphone className="h-4 w-4 shrink-0 text-fuchsia-400 mt-0.5" />
                <span>
                  Signing out clears your active browser session while keeping your device binding
                  recorded on the server.
                </span>
              </p>
            </div>

            <div className="space-y-2.5 border-t border-fuchsia-200/[0.08] pt-4">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onNavigateProfiles();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors cursor-pointer"
              >
                <User className="h-3.5 w-3.5" />
                <span>View & Edit My Profile</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onOpenAdmin();
                }}
                className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#1C142B] px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-[#261A3B] transition-colors cursor-pointer"
              >
                Open Admin Dashboard
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDrawerOpen(false);
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
    </>
  );
}
