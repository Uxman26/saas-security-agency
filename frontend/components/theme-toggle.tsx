'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" className="shrink-0 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary" aria-label="Toggle theme">
        <Sun className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="shrink-0 transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
