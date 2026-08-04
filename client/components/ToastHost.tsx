'use client';
import { useToasts } from '../lib/toast';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export default function ToastHost() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-[300] flex flex-col gap-2 pointer-events-none max-w-[90vw]">
      {toasts.map((t) => {
        const styles =
          t.kind === 'error'
            ? 'border-red-500/70 bg-red-950/90 text-red-100'
            : t.kind === 'success'
            ? 'border-green-500/60 bg-green-950/90 text-green-100'
            : 'border-cyan-500/60 bg-cyan-950/90 text-cyan-100';
        const Icon = t.kind === 'error' ? AlertTriangle : t.kind === 'success' ? CheckCircle : Info;

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2 w-80 max-w-full px-3 py-2 rounded-lg border backdrop-blur-md shadow-xl animate-in fade-in slide-in-from-right-4 ${styles}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="text-xs leading-snug flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
