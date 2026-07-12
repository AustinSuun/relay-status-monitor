'use client';

import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === 'light' ? '切换到深色' : '切换到浅色'}
      title={theme === 'light' ? '切换到深色' : '切换到浅色'}
    >
      {theme === 'light' ? <Moon /> : <Sun />}
    </Button>
  );
}
