import { useCallback, useEffect, useState } from 'react';
import type {
  DeviceCheckResponse,
  DownloadItem,
  PublicRegistration,
} from '../shared/types';
import {
  ApiError,
  checkDeviceRegistration,
  fetchCatalog,
  fetchDownloadById,
  logoutUserSession,
} from './lib/api';
import { AdminDashboard } from './components/AdminDashboard';
import { BrandLogo } from './components/BrandLogo';
import { DownloadDetailPage } from './components/DownloadDetailPage';
import { HomePage } from './components/HomePage';
import { RegistrationPage } from './components/RegistrationPage';
import { RegistrationSuccessPage } from './components/RegistrationSuccessPage';

type RouteView =
  | { name: 'register' }
  | { name: 'success' }
  | { name: 'home' }
  | { name: 'detail'; fileId: string }
  | { name: 'admin' };

function parseLocationRoute(): RouteView {
  const pathname = window.location.pathname;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return { name: 'admin' };
  }
  if (pathname === '/success') {
    return { name: 'success' };
  }
  if (pathname === '/home') {
    return { name: 'home' };
  }
  const detailMatch = pathname.match(/^\/download\/([^/]+)$/);
  if (detailMatch) {
    return { name: 'detail', fileId: decodeURIComponent(detailMatch[1]) };
  }
  return { name: 'register' };
}

function routeToPath(route: RouteView): string {
  switch (route.name) {
    case 'admin':
      return '/admin';
    case 'success':
      return '/success';
    case 'home':
      return '/home';
    case 'detail':
      return `/download/${encodeURIComponent(route.fileId)}`;
    default:
      return '/';
  }
}

export default function App() {
  const [route, setRoute] = useState<RouteView>(() => parseLocationRoute());
  const [verifying, setVerifying] = useState(true);
  const [deviceStatus, setDeviceStatus] = useState<DeviceCheckResponse | null>(null);
  const [registration, setRegistration] = useState<PublicRegistration | null>(null);
  const [catalog, setCatalog] = useState<DownloadItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [activeDetailItem, setActiveDetailItem] = useState<DownloadItem | null>(null);

  const navigate = useCallback((next: RouteView, replace = false) => {
    const nextPath = routeToPath(next);
    if (window.location.pathname !== nextPath) {
      if (replace) {
        window.history.replaceState({}, '', nextPath);
      } else {
        window.history.pushState({}, '', nextPath);
      }
    }
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const res = await fetchCatalog();
      setCatalog(res.items);
      if (res.registration) {
        setRegistration(res.registration);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setRegistration(null);
        const freshCheck = await checkDeviceRegistration().catch(() => null);
        if (freshCheck) setDeviceStatus(freshCheck);
        navigate({ name: 'register' }, true);
      }
    } finally {
      setCatalogLoading(false);
    }
  }, [navigate]);

  const verifyDeviceAccess = useCallback(async (): Promise<PublicRegistration | null> => {
    setVerifying(true);
    try {
      const check = await checkDeviceRegistration();
      setDeviceStatus(check);
      if (check.registered && check.registration) {
        setRegistration(check.registration);
        const current = parseLocationRoute();
        if (current.name === 'register') {
          navigate({ name: 'home' }, true);
        }
        return check.registration;
      } else {
        setRegistration(null);
        const current = parseLocationRoute();
        if (current.name !== 'admin') {
          navigate({ name: 'register' }, true);
        }
        return null;
      }
    } catch {
      setDeviceStatus({
        registered: false,
        status: 'UNREGISTERED',
        registrationsEnabled: true,
        deviceIdPreview: 'VERIFYING',
        deviceAlreadyRegistered: false,
        message: 'Unable to reach verification server. Please retry shortly.',
      });
      return null;
    } finally {
      setVerifying(false);
    }
  }, [navigate]);

  useEffect(() => {
    verifyDeviceAccess();
  }, [verifyDeviceAccess]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseLocationRoute());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Load protected catalog whenever an active registered user enters home or detail views
  useEffect(() => {
    if (!registration) return;
    if (route.name === 'home' || route.name === 'detail') {
      if (catalog.length === 0) {
        loadCatalog();
      }
    }
  }, [registration, route.name, catalog.length, loadCatalog]);

  // Resolve detail view item from catalog or server
  useEffect(() => {
    if (route.name !== 'detail' || !registration) {
      setActiveDetailItem(null);
      return;
    }
    const found = catalog.find((c) => c.id === route.fileId || c.slug === route.fileId);
    if (found) {
      setActiveDetailItem(found);
      return;
    }
    let active = true;
    fetchDownloadById(route.fileId)
      .then((res) => {
        if (active) setActiveDetailItem(res.item);
      })
      .catch(() => {
        if (active) navigate({ name: 'home' }, true);
      });
    return () => {
      active = false;
    };
  }, [route, registration, catalog, navigate]);

  function handleDownloadCountUpdated(fileId: string, newCount: number) {
    setCatalog((prev) =>
      prev.map((item) => (item.id === fileId ? { ...item, downloadsCount: newCount } : item))
    );
    setActiveDetailItem((prev) =>
      prev && prev.id === fileId ? { ...prev, downloadsCount: newCount } : prev
    );
  }

  async function handleUserLogout() {
    await logoutUserSession();
    setRegistration(null);
    setCatalog([]);
    await verifyDeviceAccess();
    navigate({ name: 'register' }, true);
  }

  // Admin portal is always independently accessible via /admin with its own auth gate
  if (route.name === 'admin') {
    return (
      <AdminDashboard
        onExitAdmin={async () => {
          const verified = await verifyDeviceAccess();
          if (verified) {
            navigate({ name: 'home' });
          } else {
            navigate({ name: 'register' });
          }
        }}
        onCatalogMutated={() => {
          if (registration) {
            loadCatalog();
          }
        }}
      />
    );
  }

  // Initial server-side device verification gate loader
  if (verifying || !deviceStatus) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B0810] px-6 text-slate-300">
        <BrandLogo size="lg" />
        <p className="text-xs font-medium text-slate-400">
          Verifying device registration status...
        </p>
      </div>
    );
  }

  // Strictly enforce mandatory registration before any website content or download routes
  if (!registration) {
    return (
      <RegistrationPage
        deviceStatus={deviceStatus}
        onRegistered={(created) => {
          setRegistration(created);
          setDeviceStatus({
            registered: true,
            status: 'ACTIVE',
            registrationsEnabled: deviceStatus.registrationsEnabled,
            deviceIdPreview: created.deviceShortId,
            deviceAlreadyRegistered: true,
            registration: created,
          });
          navigate({ name: 'success' });
        }}
        onRecovered={(restored) => {
          setRegistration(restored);
          setDeviceStatus({
            registered: true,
            status: 'ACTIVE',
            registrationsEnabled: deviceStatus.registrationsEnabled,
            deviceIdPreview: restored.deviceShortId,
            deviceAlreadyRegistered: true,
            registration: restored,
          });
          navigate({ name: 'home' });
        }}
        onOpenAdmin={() => navigate({ name: 'admin' })}
      />
    );
  }

  // Dedicated Registration Success Screen right after completing registration
  if (route.name === 'success') {
    return (
      <RegistrationSuccessPage
        registration={registration}
        onContinue={() => {
          loadCatalog();
          navigate({ name: 'home' });
        }}
      />
    );
  }

  // Dedicated File Details & Verified Download Screen
  if (route.name === 'detail' && activeDetailItem) {
    return (
      <DownloadDetailPage
        item={activeDetailItem}
        registration={registration}
        onBack={() => navigate({ name: 'home' })}
        onOpenAdmin={() => navigate({ name: 'admin' })}
        onDownloadCountUpdated={handleDownloadCountUpdated}
        onAuthExpired={() => verifyDeviceAccess()}
      />
    );
  }

  // MAXAGRAM Main Downloading Website
  return (
    <HomePage
      items={catalog}
      registration={registration}
      loading={catalogLoading}
      onSelectFile={(item) => {
        setActiveDetailItem(item);
        navigate({ name: 'detail', fileId: item.id });
      }}
      onOpenAdmin={() => navigate({ name: 'admin' })}
      onDownloadCountUpdated={handleDownloadCountUpdated}
      onLogout={handleUserLogout}
      onAuthExpired={() => verifyDeviceAccess()}
    />
  );
}
