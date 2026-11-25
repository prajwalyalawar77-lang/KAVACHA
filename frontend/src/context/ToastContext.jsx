import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cx } from '../utils/format';

const ToastContext = createContext(null);

const TONES = {
  success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  error: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  warning: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  info: 'border-accent-400/30 bg-accent-400/10 text-accent-100',
};

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message, tone = 'info', duration = 4200) => {
      const id = ++counter;
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      if (duration) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      push,
      success: (message) => push(message, 'success'),
      error: (message) => push(message, 'error', 6000),
      warning: (message) => push(message, 'warning'),
      info: (message) => push(message, 'info'),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cx(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-card backdrop-blur-xl animate-fadeUp',
              TONES[toast.tone] || TONES.info,
            )}
          >
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-current" />
            <p className="flex-1 leading-relaxed">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="opacity-70 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
