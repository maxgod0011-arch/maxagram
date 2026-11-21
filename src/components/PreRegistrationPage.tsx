import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { DeviceCheckResponse, PublicPreRegistration } from '../../shared/types';
import { ApiError, preRegisterDevice } from '../lib/api';
import { BrandLogo } from './BrandLogo';

interface PreRegistrationPageProps {
  deviceStatus: DeviceCheckResponse;
  onPreRegistered: (preReg: PublicPreRegistration) => void;
  onProceedToUnlock: (email?: string) => void;
  onBack: () => void;
  onOpenAdmin: () => void;
}

export function PreRegistrationPage({
  deviceStatus,
  onPreRegistered,
  onProceedToUnlock,
  onBack,
  onOpenAdmin,
}: PreRegistrationPageProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [completedPreReg, setCompletedPreReg] = useState<PublicPreRegistration | null>(null);
  const [copied, setCopied] = useState(false);
  const initializedRef = useRef(false);

  const runPreRegistration = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    setCopied(false);

    try {
      const response = await preRegisterDevice();
      setIssuedCode(response.uniqueCode);
      setCompletedPreReg(response.preRegistration);
      onPreRegistered(response.preRegistration);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unable to complete pre-registration right now. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [onPreRegistered]);

  // Trigger instant Pre-Registration immediately upon clicking the Pre-Registration button
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    runPreRegistration();
  }, [runPreRegistration]);

  async function handleCopyCode() {
    if (!issuedCode) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(issuedCode);
      ok = true;
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = issuedCode;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        ok = true;
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    }
  }

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
          <BrandLogo size="md" onClick={onBack} />
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

      <main className="mx-auto flex w-full max-w-[660px] flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-5">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-fuchsia-300 transition-colors whitespace-nowrap cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to MAXAGRAM</span>
          </button>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="w-full rounded-xl border border-fuchsia-200/[0.1] bg-[#130F1B] p-8 sm:p-10"
        >
          {loading && !issuedCode ? (
            <div className="py-10 text-center space-y-3">
              <p className="font-display text-lg font-semibold text-white">
                Completing Pre-Registration...
              </p>
              <p className="text-xs text-slate-400">
                Generating your access code from MAXAGRAM servers.
              </p>
            </div>
          ) : errorMessage && !issuedCode ? (
            <div className="space-y-5">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={runPreRegistration}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-6 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Try Pre-Registration Again</span>
              </button>
            </div>
          ) : issuedCode ? (
            <>
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span className="text-sm font-semibold">Pre-Registration Confirmed</span>
              </div>

              <h1 className="mt-4 font-display text-2xl sm:text-4xl font-bold leading-[1.15] tracking-[-0.02em] text-white text-balance">
                Successfully Pre-registration! Copy this code
              </h1>

              <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
                Copy the official code below and enter it on the MAXAGRAM portal to unlock access.
              </p>

              {errorMessage ? (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              {/* Copyable Code Display */}
              <div className="mt-8 border-y border-fuchsia-200/[0.09] py-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-slate-400">Official Registration Code</p>
                </div>

                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <code
                    data-testid="prereg-unique-code"
                    className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.1em] text-fuchsia-300 tabular-nums select-all"
                  >
                    {issuedCode}
                  </code>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-fuchsia-600 px-6 py-3 text-sm font-semibold text-white hover:bg-fuchsia-500 active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-200" />
                        <span>Code Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                {copied ? (
                  <p role="status" className="mt-3 text-xs font-medium text-emerald-400">
                    Code copied to your clipboard.
                  </p>
                ) : null}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={runPreRegistration}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-fuchsia-200/[0.14] bg-[#1A1328] px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-[#241A36] hover:text-white transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-fuchsia-400 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Confirming...' : 'Pre-Register Again'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onProceedToUnlock(completedPreReg?.email || undefined)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-fuchsia-600/90 hover:bg-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Enter Code &amp; Unlock Website</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {completedPreReg ? (
                <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-fuchsia-400/80" />
                  <span>Verified for device {completedPreReg.deviceShortId} · Official code ready to copy</span>
                </div>
              ) : null}
            </>
          ) : null}
        </motion.section>
      </main>
    </div>
  );
}
