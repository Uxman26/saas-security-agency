import { toast as sonner, type ExternalToast } from 'sonner';

type ConfirmOpts = {
  description?: string;
  label?: string;
  duration?: number;
};

export const toast = {
  success: (message: string, opts?: ExternalToast) => sonner.success(message, opts),
  error: (message: string, opts?: ExternalToast) => sonner.error(message, opts),
  warning: (message: string, opts?: ExternalToast) => sonner.warning(message, opts),
  info: (message: string, opts?: ExternalToast) => sonner.info(message, opts),
  loading: (message: string, opts?: ExternalToast) => sonner.loading(message, opts),
  dismiss: (id?: string | number) => sonner.dismiss(id),
  promise: sonner.promise,
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
