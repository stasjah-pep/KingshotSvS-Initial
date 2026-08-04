// Lightweight, non-blocking toast notifications — a drop-in replacement for alert().
// Rendered by <ToastHost /> (mounted once in the app Layout).

import { create } from 'zustand';

export type ToastKind = 'error' | 'info' | 'success';

export interface Toast {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: Toast[];
  notify: (message: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 4500;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  notify: (message, kind = 'info') => {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, AUTO_DISMISS_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper so any module (including the socket store) can raise a toast. */
export const notify = (message: string, kind: ToastKind = 'info') =>
  useToasts.getState().notify(message, kind);
