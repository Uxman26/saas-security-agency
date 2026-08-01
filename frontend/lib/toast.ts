import { toast as sonner, type ExternalToast } from 'sonner';

/** Quick feedback — short-lived */
const SNACK_DURATION_MS = 1800;
/** Errors and warnings stay readable a little longer */
const ERROR_DURATION_MS = 4000;
const WARNING_DURATION_MS = 3500;

type ConfirmOpts = {
  description?: string;
  label?: string;
  duration?: number;
};

export const toast = {
  success: (message: string, opts?: ExternalToast) =>
    sonner.success(message, { duration: SNACK_DURATION_MS, ...opts }),
  error: (message: string, opts?: ExternalToast) =>
    sonner.error(message, { duration: ERROR_DURATION_MS, ...opts }),
  warning: (message: string, opts?: ExternalToast) =>
    sonner.warning(message, { duration: WARNING_DURATION_MS, ...opts }),
  info: (message: string, opts?: ExternalToast) =>
    sonner.info(message, { duration: SNACK_DURATION_MS, ...opts }),
  loading: (message: string, opts?: ExternalToast) => sonner.loading(message, opts),
  dismiss: (id?: string | number) => sonner.dismiss(id),
  promise: sonner.promise,
  /** Quick feedback with a Dismiss action. Use for rota actions — not confirmations/errors. */
  snack: (message: string, opts?: ExternalToast) => {
    const id = sonner(message, {
      duration: opts?.duration ?? SNACK_DURATION_MS,
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
