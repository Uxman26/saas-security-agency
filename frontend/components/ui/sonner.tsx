'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';
import { SNACK_TOASTER_ID } from '@/lib/toast';

function useActiveToastCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const read = () => {
      // Only count modal toasts — snack bar toasts must not block the page
      const n = document.querySelectorAll(
        '[data-sonner-toaster]:not(.snack-toaster) [data-sonner-toast]'
      ).length;
      setCount(n);
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    const interval = window.setInterval(read, 250);
    return () => {
      obs.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  return count;
}

function ToastBackdrop({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active) return null;

  return (
    <button
      type="button"
      aria-label="Dismiss alert"
      className="fixed inset-0 z-[99998] cursor-default border-0 bg-black/50 p-0 backdrop-blur-[1px] transition-opacity"
      onClick={() => toast.dismiss()}
    />
  );
}

/** Bottom-left snack — success / quick feedback (non-blocking) */
function SnackToaster() {
  return (
    <Sonner
      id={SNACK_TOASTER_ID}
      position="bottom-left"
      offset={20}
      gap={10}
      visibleToasts={3}
      duration={1500}
      className="toaster snack-toaster !z-[99990]"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(360px,calc(100vw-2.5rem))] items-center justify-between gap-3 rounded-md bg-[#9a4d28] px-4 py-3 text-white shadow-md',
          title: 'text-sm font-medium leading-snug text-white',
          description: 'text-xs text-white/85',
          actionButton:
            'shrink-0 rounded border border-white/80 bg-transparent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10',
          success: 'bg-emerald-700',
          info: 'bg-[#9a4d28]',
        },
      }}
    />
  );
}

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();
  const activeCount = useActiveToastCount();

  return (
    <>
      {/* Backdrop only for center modal toasts (confirm / error / warning) */}
      <ToastBackdrop active={activeCount > 0} />
      <Sonner
        theme={theme as ToasterProps['theme']}
        position="top-center"
        offset={0}
        closeButton
        richColors
        className="toaster group !z-[99999]"
        style={
          {
            top: '50%',
            '--offset-top': '0px',
            transform: 'translate(-50%, -50%)',
          } as CSSProperties
        }
        toastOptions={{
          duration: 2500,
          classNames: {
            toast:
              'group toast !bg-card !text-card-foreground !border-border !shadow-lg !rounded-lg',
            title: 'group-[.toast]:text-sm group-[.toast]:font-semibold',
            description: 'group-[.toast]:text-muted-foreground group-[.toast]:text-xs',
            actionButton:
              'group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:!rounded-md',
            cancelButton:
              'group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground group-[.toast]:!rounded-md',
            closeButton: 'group-[.toast]:!bg-transparent group-[.toast]:!text-muted-foreground',
          },
        }}
        {...props}
      />
      <SnackToaster />
    </>
  );
}
