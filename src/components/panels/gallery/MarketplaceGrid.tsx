import React from 'react';
import type { MarketplaceTheme } from '../../../types/editor';
import { ThemeCard } from './ThemeCard';

interface MarketplaceGridProps {
  themes: MarketplaceTheme[];
  onApply: (theme: MarketplaceTheme['theme']) => void;
}

export function MarketplaceGrid({ themes, onApply }: MarketplaceGridProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
      {themes.map((theme) => (
        <ThemeCard
          key={theme.id}
          theme={theme}
          onApply={onApply}
        />
      ))}
    </div>
  );
}