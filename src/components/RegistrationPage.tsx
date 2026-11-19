import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowDown,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { DeviceCheckResponse, PublicRegistration } from '../../shared/types';
import { ApiError, recoverDeviceAccess, registerDevice } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { MediaCover } from './MediaCover';

const OFFICIAL_CODE_DISPLAY = 'PRE-REWORD';
const HERO_IMAGE = '/src/assets/images/maxagram_hero_vault_1795098370592.jpg';

interface RegistrationPageProps {
  deviceStatus: DeviceCheckResponse;
  onRegistered: (registration: PublicRegistration) => void;
  onRecovered: (registration: PublicRegistration) => void;
  onOpenAdmin: () => void;
}

export function RegistrationPage({
  deviceStatus,
  onRegistered,
  onRecovered,
  onOpenAdmin,
}: RegistrationPageProps) {
  const defaultTab =
    deviceStatus.status === 'SESSION_CLEARED_DEVICE_BOUND' ||
    deviceStatus.status === 'DEVICE_MISMATCH'
      ? 'recover'
      : 'register';

  const [activeTab, setActiveTab] = useState<'register' | 'recover'>(defaultTab);
  const [preRegUnlocked, setPreRegUnlocked] = useState(false);

  // Registration form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [registrationCode, setRegistrationCode] = useState('');

  // Recovery form fields
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');

  // Feedback states
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const formPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (
      deviceStatus.status === 'SESSION_CLEARED_DEVICE_BOUND' ||
      deviceStatus.status === 'DEVICE_MISMATCH'
    ) {
      setActiveTab('recover');
    }
  }, [deviceStatus.status]);

  async function copyOfficialCode(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(OFFICIAL_CODE_DISPLAY);
      return true;
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = OFFICIAL_CODE_DISPLAY;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        return true;
      } catch {
        return false;
      }
    }
  }

  async function handleCopyCode() {
    const ok = await copyOfficialCode();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handlePreRegistrationClick() {
    setPreRegUnlocked(true);
    setActiveTab('register');
    setErrorMessage(null);
    setRegistrationCode(OFFICIAL_CODE_DISPLAY);
    const ok = await copyOfficialCode();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
    setSuccessMessage(
      `Pre-registration code ${OFFICIAL_CODE_DISPLAY} applied and copied. Enter your name and email below to finish registering this device.`
    );
    window.setTimeout(() => {
      formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nameInputRef.current?.focus();
    }, 80);
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const response = await registerDevice({
        fullName,
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
        setErrorMessage('Unable to complete registration. Please check your connection and try again.');
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
      case 'SESSION_CLEARED_DEVICE_BOUND':
        return {
          label: 'Device Previously Registered',
          tone: 'text-amber-400',
          detail:
            deviceStatus.message ||
            'This device already completed one-time registration. Restore your session under Device Recovery.',
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
            ? 'Pending One-Time Registration'
            : 'Registrations Temporarily Paused',
          tone: deviceStatus.registrationsEnabled ? 'text-fuchsia-400' : 'text-amber-400',
          detail: deviceStatus.registrationsEnabled
            ? 'Complete one-time registration with the official code to unlock the MAXAGRAM catalog.'
            : 'New device registrations are currently paused by the administrator.',
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

      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col justify-center px-6 py-10 lg:py-12 space-y-10">
        {/* Centered Welcome & Pre Registration Focal Action */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto flex w-full max-w-3xl flex-col items-center text-center"
        >
          <p className="text-xs font-medium tracking-wide text-fuchsia-400">
            Official One-Device Access Portal
          </p>
          <h1 className="mt-2.5 font-display text-3xl sm:text-5xl font-bold leading-[1.08] tracking-[-0.025em] text-white">
            Welcome to MAXAGRAM
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-300">
            Access verified desktop software, creative suites, and security utilities sealed with
            SHA-256 manifests. Click Pre Registration below to claim your official code and bind
            your device.
          </p>

          {/* Centered Pre Registration Button + Official Code (PRE-REWORD) */}
          <div className="mt-7 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={handlePreRegistrationClick}
              disabled={!deviceStatus.registrationsEnabled}
              className="inline-flex items-center justify-center gap-3 rounded-xl bg-fuchsia-600 px-8 py-4 text-base font-semibold text-white shadow-[0_8px_30px_rgba(192,38,211,0.32)] hover:bg-fuchsia-500 active:scale-[0.99] transition-all whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Pre Registration</span>
              <span aria-hidden="true" className="text-fuchsia-200/70">
                |
              </span>
              <span className="font-mono tracking-[0.08em] text-fuchsia-50">
                {OFFICIAL_CODE_DISPLAY}
              </span>
              <ArrowDown className="h-4 w-4 text-fuchsia-100" />
            </button>

            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-300">
              <span className="text-slate-400">Official Registration Code:</span>
              <code
                data-testid="official-registration-code"
                className="font-mono text-sm font-semibold tracking-[0.08em] text-fuchsia-300 tabular-nums"
              >
                {OFFICIAL_CODE_DISPLAY}
              </code>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 font-medium text-fuchsia-300 hover:text-fuchsia-200 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Code Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>

            {preRegUnlocked ? (
              <p className="text-xs font-medium text-emerald-400">
                Code {OFFICIAL_CODE_DISPLAY} loaded into the registration form below.
              </p>
            ) : null}
          </div>
        </motion.section>

        {/* Architectural 2-Column Showcase + Verification Form */}
        <div className="grid w-full grid-cols-1 items-stretch gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Left Visual & Security Overview Column */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col justify-between rounded-xl border border-fuchsia-200/[0.09] bg-[#130F1B] p-7 sm:p-8 lg:col-span-7"
          >
            <div>
              <div className="overflow-hidden rounded-lg border border-fuchsia-200/[0.08] relative">
                <MediaCover
                  src={HERO_IMAGE}
                  alt="MAXAGRAM Obsidian Vault Architecture"
                  aspect="16/9"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B0810]/90 via-[#1E0A26]/25 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200">
                  <span className="font-medium">One-Device Hardware Verification</span>
                  <span className="font-mono text-fuchsia-300 tabular-nums">
                    SHA-256 Signed Archives
                  </span>
                </div>
              </div>

              {/* Official Code Strip with Dedicated Copy Button */}
              <div className="mt-6 flex flex-col gap-4 border-t border-fuchsia-200/[0.08] pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    Official Pre-Registration Access Code
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <code className="font-mono text-2xl font-semibold tracking-[0.08em] text-white tabular-nums">
                      {OFFICIAL_CODE_DISPLAY}
                    </code>
                    <span className="text-xs text-fuchsia-300/90">One-time per device</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-fuchsia-400/30 bg-[#1E142C] px-4 py-2.5 text-sm font-medium text-fuchsia-100 hover:bg-[#2A1B3D] active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span>Code Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-fuchsia-400" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-fuchsia-200/[0.07] pt-5 text-xs text-slate-400 sm:grid-cols-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>Server-verified registration code enforcement</span>
              </div>
              <div className="flex items-start gap-2">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>Bound permanently to this device signature</span>
              </div>
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-fuchsia-400" />
                <span>Admin-controlled device recovery support</span>
              </div>
            </div>
          </motion.section>

          {/* Right Registration / Recovery Panel */}
          <motion.section
            ref={formPanelRef}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
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
                aria-label="Registration mode"
                className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-[#0B0810] p-1 border border-fuchsia-200/[0.07]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'register'}
                  onClick={() => {
                    setActiveTab('register');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === 'register'
                      ? 'bg-[#261738] text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  New Registration
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

              {/* New Registration Form */}
              {activeTab === 'register' ? (
                <form onSubmit={handleRegisterSubmit} className="mt-6 space-y-4">
                  <div>
                    <label
                      htmlFor="reg-fullname"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      ref={nameInputRef}
                      id="reg-fullname"
                      type="text"
                      required
                      minLength={2}
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
                      Account Email
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
                        Registration Code
                      </label>
                      <span className="font-mono text-[11px] text-fuchsia-300/80">
                        Exact code required
                      </span>
                    </div>
                    <input
                      id="reg-code"
                      type="text"
                      required
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Enter PRE-REWORD"
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
                    {submitting ? 'Verifying & Binding Device...' : 'Register Now'}
                  </button>
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
