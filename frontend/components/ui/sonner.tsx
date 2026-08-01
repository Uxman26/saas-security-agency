'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import type { CSSProperties } from 'react';

/**
 * Single bottom-left toaster for every notification — never blocks the page.
 *
 * Untyped toasts (snack / confirm) are themed through Sonner's --normal-* variables
 * rather than !important classes, so richColors can still tint success / error /
 * warning / info and keep the types visually distinct in one shared stack.
 */
export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-left"
      offset={20}
      gap={10}
      visibleToasts={4}
      closeButton
      richColors
      className="toaster group !z-[99999]"
      style={
        {
          '--normal-bg': 'var(--card)',
          '--normal-text': 'var(--card-foreground)',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
      toastOptions={{
        duration: 2500,
        classNames: {
          toast: 'group toast !rounded-lg !shadow-lg',
          title: 'group-[.toast]:text-sm group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-xs group-[.toast]:opacity-80',
          actionButton:
            'group-[.toast]:!bg-primary group-[.toast]:!text-primary-foreground group-[.toast]:!rounded-md',
          cancelButton:
            'group-[.toast]:!bg-muted group-[.toast]:!text-muted-foreground group-[.toast]:!rounded-md',
        },
      }}
      {...props}
    />
  );
}
