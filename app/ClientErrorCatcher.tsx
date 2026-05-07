'use client';
import { useEffect, useState } from 'react';

export function ClientErrorCatcher({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleWindowError = (e: ErrorEvent) => {
      console.error('Caught via window.onerror:', e.error);
      setError(e.error ? e.error.stack || e.error.message : e.message);
    };
    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      console.error('Caught via unhandledrejection:', e.reason);
      setError(e.reason ? e.reason.stack || e.reason.message : 'Promise Rejection');
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: '20px', background: 'red', color: 'white', zIndex: 9999, position: 'relative' }}>
        <h1>Client Crash Caught</h1>
        <pre>{error}</pre>
      </div>
    );
  }

  return <>{children}</>;
}
