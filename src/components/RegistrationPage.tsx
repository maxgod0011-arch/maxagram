import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { DeviceCheckResponse, PublicRegistration } from '../../shared/types';
import { ApiError, recoverDeviceAccess, registerDevice } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { MediaCover } from './MediaCover';

const HERO_IMAGE = '/assets/aistudio/file_0000000017d48210b5817b5a0f83d9c5_0436fea8.png';

interface RegistrationPageProps {
  deviceStatus: DeviceCheckResponse;
  prefilledEmail?: string;
  onRegistered: (registration: PublicRegistration) => void;
  onRecovered: (registration: PublicRegistration) => void;
  onOpenPreRegistration: () => void;
  onOpenAdmin: () => void;
}

export function RegistrationPage({
  deviceStatus,
  prefilledEmail,
  onRegistered,
  onRecovered,
  onOpenPreRegistration,
  onOpenAdmin,
}: RegistrationPageProps) {
  const defaultTab =
    deviceStatus.status === 'SESSION_CLEARED_DEVICE_BOUND' ||
    deviceStatus.status === 'DEVICE_MISMATCH'
      ? 'recover'
      : 'activate';

  const [activeTab, setActiveTab] = useState<'activate' | 'recover'>(defaultTab);

  // Code activation form fields (no code is shown beforehand)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(prefilledEmail || '');
  const [registrationCode, setRegistrationCode] = useState('');

  // Recovery form fields
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');

  // Feedback states
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (prefilledEmail) {
      setEmail(prefilledEmail);
      setActiveTab('activate');
    }
  }, [prefilledEmail]);

  useEffect(() => {
    if (
      deviceStatus.status === 'SESSION_CLEARED_DEVICE_BOUND' ||
      deviceStatus.status === 'DEVICE_MISMATCH'
    ) {
      setActiveTab('recover');
    } else if (deviceStatus.status === 'PRE_REGISTERED') {
      setActiveTab('activate');
    }
  }, [deviceStatus.status]);

  async function handleActivateSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const response = await registerDevice({
        fullName: fullName.trim() || undefined,
        email,
        registrationCode,
      });
      setSuccessMessage(response.message);
      onRegistered(response.registration);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        if (err.code === 'DUPLICATE_DEVICE') {
          setActiveTab('recover');
        }
      } else {
        setErrorMessage('Unable to verify your unique code. Please check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecoverySubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const response = await recoverDeviceAccess({
        email: recoveryEmail,
        recoveryKey: recoveryKey.trim() || undefined,
      });
      setSuccessMessage(response.message);
      onRecovered(response.registration);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Device recovery failed. Please verify your details and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canStartPreRegistration = deviceStatus.registrationsEnabled;

  const statusMeta = (() => {
    switch (deviceStatus.status) {
      case 'DISABLED':
        return {
          label: 'Registration Disabled',
          tone: 'text-rose-400',
          detail:
            deviceStatus.message ||
            'Access for this device has been disabled by an administrator.',
        };
      case 'PRE_REGISTERED':
        return {
          label: 'Code Ready · Enter Code to Unlock',
          tone: 'text-emerald-400',
          detail:
            deviceStatus.message ||
            'Paste your copied Pre-Registration code below to enter MAXAGRAM, or click Pre-Registration anytime to view and copy the official code.',
        };
      case 'SESSION_CLEARED_DEVICE_BOUND':
        return {
          label: 'Device Previously Registered',
          tone: 'text-amber-400',
          detail:
            deviceStatus.message ||
            'Restore your session under Device Recovery, or click Pre-Registration to retrieve the official registration code.',
        };
      case 'DEVICE_MISMATCH':
        return {
          label: 'Recovery Authorization Required',
          tone: 'text-amber-400',
          detail:
            deviceStatus.message ||
            'Enter your admin-issued recovery key to transfer access to this device.',
        };
      default:
        return {
          label: deviceStatus.registrationsEnabled
            ? 'Ready for Pre-Registration'
            : 'Registrations Temporarily Paused',
          tone: deviceStatus.registrationsEnabled ? 'text-fuchsia-400' : 'text-amber-400',
          detail: deviceStatus.registrationsEnabled
            ? 'Click Pre-Registration to immediately receive and copy your access code, then paste it below to enter MAXAGRAM.'
            : 'New registrations are currently paused by the administrator.',
        };
    }
  })();

  return (
    <div
      className="min-h-screen bg-[#0B0810] text-slate-100 flex flex-col"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 42% at 50% -10%, rgba(217, 70, 239, 0.16), transparent 65%)',
      }}
    >
      {/* Minimal Gate Header */}
      <header className="w-full border-b border-fuchsia-200/[0.08] bg-[#0B0810]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-4">
          <BrandLogo size="md" />
          <div className="flex items-center gap-6">
            <span className="hidden sm:inline text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
              Device ID: {deviceStatus.deviceIdPreview}
            </span>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-sm font-medium text-slate-300 hover:text-fuchsia-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin Portal
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-6 py-10 lg:py-12 space-y-8">
        {/* Centered Welcome Header */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto flex w-full max-w-3xl flex-col items-center text-center"
        >
          <p className="text-xs font-medium tracking-wide text-fuchsia-400">
            Official MAXAGRAM Access Portal
          </p>
          <h1 className="mt-2.5 font-display text-3xl sm:text-5xl font-bold leading-[1.08] tracking-[-0.025em] text-white text-balance">
            Welcome to MAXAGRAM
          </h1>
          <p className="mt-3.5 max-w-2xl text-[15px] leading-relaxed text-slate-300">
            Click Pre-Registration below to instantly get your access code with a one-click Copy
            option, then enter it to unlock MAXAGRAM Feed, Stories, Messages, Profiles, and
            Verified Downloads.
          </p>
        </motion.section>

        {/* Architectural 2-Column Showcase + Verification Form */}
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left Visual & Pre-Registration Column */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-between rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-7 sm:p-8 lg:col-span-7"
          >
            <div>
              <div className="overflow-hidden rounded-lg border border-fuchsia-200/[0.12] bg-[#0B0810]">
                <MediaCover
                  src={HERO_IMAGE}
                  alt="MAXAGRAM App Preview"
                  aspect="16/9"
                />
              </div>

              {/* Centered Pre-Registration Button Directly Below Image */}
              <div className="mt-7 flex flex-col items-center text-center">
                <button
                  type="button"
                  onClick={onOpenPreRegistration}
                  disabled={!canStartPreRegistration}
                  className="inline-flex items-center justify-center gap-2.5 rounded-lg bg-fuchsia-600 px-8 py-3.5 text-sm sm:text-base font-semibold text-white shadow-[0_8px_28px_rgba(192,38,211,0.3)] hover:bg-fuchsia-500 active:scale-[0.99] transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span>Pre-Registration</span>
                  <ArrowRight className="h-4 w-4 text-fuchsia-100" />
                </button>
                <p className="mt-2.5 max-w-md text-xs leading-relaxed text-slate-400">
                  Click Pre-Registration anytime to immediately receive your access code with a
                  one-click Copy option.
                </p>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 border-t border-fuchsia-200/[0.08] pt-6 text-xs text-slate-400 sm:grid-cols-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>Instant code with one-click copy after Pre-Registration</span>
              </div>
              <div className="flex items-start gap-2">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>Pre-register as many times as needed anytime</span>
              </div>
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>Admin-controlled device recovery support</span>
              </div>
            </div>
          </motion.section>

          {/* Right Code Activation / Device Recovery Panel */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-between rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-7 sm:p-8 lg:col-span-5"
          >
            <div>
              {/* Live Registration Status Block */}
              <div className="border-b border-fuchsia-200/[0.08] pb-5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-slate-400">Registration Status</span>
                  <span className="font-mono text-xs text-slate-400 tabular-nums">
                    {deviceStatus.deviceIdPreview}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Lock className={`h-4 w-4 shrink-0 ${statusMeta.tone}`} />
                  <span className={`text-sm font-semibold ${statusMeta.tone}`}>
                    {statusMeta.label}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {statusMeta.detail}
                </p>
              </div>

              {/* Segmented Mode Control */}
              <div
                role="tablist"
                aria-label="Access verification mode"
                className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-[#0B0810] p-1 border border-fuchsia-200/[0.07]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'activate'}
                  onClick={() => {
                    setActiveTab('activate');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'activate'
                      ? 'bg-[#261738] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Activate with Code
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'recover'}
                  onClick={() => {
                    setActiveTab('recover');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'recover'
                      ? 'bg-[#261738] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Device Recovery
                </button>
              </div>

              {/* Feedback Banners */}
              {errorMessage ? (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              {successMessage ? (
                <div
                  role="status"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-200"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              ) : null}

              {/* Unique Code Activation Form */}
              {activeTab === 'activate' ? (
                <form onSubmit={handleActivateSubmit} className="mt-6 space-y-4">
                  {deviceStatus.status === 'PRE_REGISTERED' && deviceStatus.maskedEmail ? (
                    <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
                      Pre-registration verified for{' '}
                      <span className="font-mono text-white">{deviceStatus.maskedEmail}</span>.
                      Paste your unique code below to enter MAXAGRAM.
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="reg-fullname"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Full Name (optional)
                    </label>
                    <input
                      id="reg-fullname"
                      type="text"
                      maxLength={80}
                      autoComplete="name"
                      placeholder="Alex Morgan"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={submitting || !deviceStatus.registrationsEnabled}
                      className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-email"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      maxLength={120}
                      autoComplete="email"
                      placeholder="you@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={submitting || !deviceStatus.registrationsEnabled}
                      className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="reg-code"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Pre-Registration Code
                      </label>
                      <span className="text-[11px] text-slate-500">Paste copied code</span>
                    </div>
                    <input
                      id="reg-code"
                      type="text"
                      required
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Paste your copied code"
                      value={registrationCode}
                      onChange={(e) => setRegistrationCode(e.target.value)}
                      disabled={submitting || !deviceStatus.registrationsEnabled}
                      className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 font-mono text-sm tracking-wider text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !deviceStatus.registrationsEnabled}
                    className="mt-2 w-full rounded-lg bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500 active:scale-[0.99] transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Verifying Unique Code...' : 'Verify & Enter MAXAGRAM'}
                  </button>

                  {canStartPreRegistration ? (
                    <p className="pt-1 text-center text-xs text-slate-400">
                      Don&rsquo;t have a code yet?{' '}
                      <button
                        type="button"
                        onClick={onOpenPreRegistration}
                        className="font-medium text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2 cursor-pointer"
                      >
                        Complete Pre-Registration
                      </button>
                    </p>
                  ) : null}
                </form>
              ) : (
                /* Admin-Controlled Device Recovery Form */
                <form onSubmit={handleRecoverySubmit} className="mt-6 space-y-4">
                  <p className="text-xs leading-relaxed text-slate-400">
                    Cleared your browser data on your registered device? Verify your account email
                    below. Switching to a new device or restoring after an admin reset requires an
                    admin-issued Device Recovery Key.
                  </p>

                  {deviceStatus.maskedEmail ? (
                    <div className="rounded-lg border border-fuchsia-200/[0.09] bg-[#0B0810] px-3.5 py-2.5 text-xs text-slate-300">
                      Detected registration on this device:{' '}
                      <span className="font-mono text-fuchsia-300">
                        {deviceStatus.maskedEmail}
                      </span>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="rec-email"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Registered Email
                    </label>
                    <input
                      id="rec-email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="you@domain.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="rec-key"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Admin Recovery Key
                      </label>
                      <span className="text-[11px] text-slate-500">
                        {deviceStatus.status === 'SESSION_CLEARED_DEVICE_BOUND' &&
                        !deviceStatus.recoveryPending
                          ? 'Optional on same device'
                          : 'Required for new device'}
                      </span>
                    </div>
                    <input
                      id="rec-key"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="REC-XXXX-XXXX-XXXX"
                      value={recoveryKey}
                      onChange={(e) => setRecoveryKey(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-fuchsia-200/[0.14] bg-[#0B0810] px-3.5 py-2.5 font-mono text-sm tracking-wider text-white placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-500 focus:border-fuchsia-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 w-full rounded-lg bg-fuchsia-600 px-5 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500 active:scale-[0.99] transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'Verifying Device Access...' : 'Restore Verified Access'}
                  </button>
                </form>
              )}
            </div>

            <div className="mt-8 border-t border-fuchsia-200/[0.07] pt-4 text-xs text-slate-500 flex items-center justify-between gap-4">
              <span>Server-side verification active</span>
              <span>One device per account</span>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
