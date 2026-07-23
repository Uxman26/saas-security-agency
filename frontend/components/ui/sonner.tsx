'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast, type ToasterProps } from 'sonner';

function useActiveToastCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const read = () => {
      const n = document.querySelectorAll('[data-sonner-toaster] [data-sonner-toast]').length;
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

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();
  const activeCount = useActiveToastCount();

  return (
    <>
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
    </>
  );
}
