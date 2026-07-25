import { toast as sonner, type ExternalToast } from 'sonner';

export const SNACK_TOASTER_ID = 'snack';

type ConfirmOpts = {
  description?: string;
  label?: string;
  duration?: number;
};

export const toast = {
  success: (message: string, opts?: ExternalToast) =>
    sonner.success(message, { duration: 1000, ...opts }),
  error: (message: string, opts?: ExternalToast) =>
    sonner.error(message, { duration: 2500, ...opts }),
  warning: (message: string, opts?: ExternalToast) =>
    sonner.warning(message, { duration: 2000, ...opts }),
  info: (message: string, opts?: ExternalToast) =>
    sonner.info(message, { duration: 1000, ...opts }),
  loading: (message: string, opts?: ExternalToast) => sonner.loading(message, opts),
  dismiss: (id?: string | number) => sonner.dismiss(id),
  promise: sonner.promise,
  /** Bottom-left quick feedback (BrightHR-style). Use for rota actions — not confirmations/errors. */
  snack: (message: string, opts?: ExternalToast) => {
    const id = sonner(message, {
      toasterId: SNACK_TOASTER_ID,
      duration: opts?.duration ?? 4000,
      ...opts,
      action: opts?.action ?? {
        label: 'Dismiss',
        onClick: () => sonner.dismiss(id),
      },
    });
    return id;
  },
  confirm: (message: string, onConfirm: () => void | Promise<void>, opts?: ConfirmOpts) => {
    const id = sonner(message, {
      description: opts?.description,
      duration: opts?.duration ?? 12000,
      action: {
        label: opts?.label ?? 'Confirm',
        onClick: () => {
          sonner.dismiss(id);
          void onConfirm();
        },
      },
      cancel: {
        label: 'Cancel',
        onClick: () => sonner.dismiss(id),
      },
    });
    return id;
  },
};

export function toastMutationError(err: unknown, fallback = 'Something went wrong') {
  const msg = err instanceof Error ? err.message : fallback;
  toast.error(msg || fallback);
}
