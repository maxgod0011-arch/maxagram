import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { PublicRegistration } from '../../shared/types';
import { BrandLogo } from './BrandLogo';

interface RegistrationSuccessPageProps {
  registration: PublicRegistration;
  onContinue: () => void;
}

export function RegistrationSuccessPage({
  registration,
  onContinue,
}: RegistrationSuccessPageProps) {
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(registration.registeredAt));

  return (
    <div
      className="min-h-screen bg-[#0B0810] text-slate-100 flex flex-col"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 75% 40% at 50% -10%, rgba(217, 70, 239, 0.14), transparent 65%)',
      }}
    >
      <header className="w-full border-b border-fuchsia-200/[0.08]">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4">
          <BrandLogo size="md" />
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {registration.deviceShortId}
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[680px] flex-1 items-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-xl border border-fuchsia-200/[0.1] bg-[#130F1B] p-8 sm:p-10"
        >
          <div className="flex items-center gap-3 text-emerald-400">
            <CheckCircle2 className="h-6 w-6 shrink-0" />
            <span className="text-sm font-semibold">Registration Status: Active &amp; Verified</span>
          </div>

          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-bold tracking-[-0.02em] text-white">
            Registration Successful
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
            Your one-time MAXAGRAM registration is complete and securely associated with this
            device. You now have full access to browse and download all verified packages.
          </p>

          {/* Clean Hairline Key-Value Summary */}
          <dl className="mt-7 divide-y divide-fuchsia-200/[0.08] border-y border-fuchsia-200/[0.09] text-sm">
            <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-slate-400">Registered Account</dt>
              <dd className="font-medium text-white">
                {registration.fullName}{' '}
                <span className="text-slate-400">({registration.email})</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-slate-400">Registration Status</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Active · One-Device Bound</span>
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-slate-400">Bound Device ID</dt>
              <dd className="font-mono text-slate-100 tabular-nums">
                {registration.deviceShortId} · {registration.devicePlatform} ({registration.deviceBrowser})
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-slate-400">Code Redeemed</dt>
              <dd className="font-mono text-fuchsia-400">{registration.codeUsed}</dd>
            </div>
            <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <dt className="text-slate-400">Verified On</dt>
              <dd className="font-mono text-slate-300 tabular-nums">{formattedDate}</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Keep your registered email safe for admin-assisted device recovery.
            </p>
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-6 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Continue to Website</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
