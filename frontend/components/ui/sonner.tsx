'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position="bottom-right"
      closeButton
      richColors
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
  );
}
