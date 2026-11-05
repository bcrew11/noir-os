// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_CATALOG } from '@noir/core';
import { BrandMark } from './BrandTile.tsx';

const netflix = APP_CATALOG.find((a) => a.id === 'netflix')!;

describe('BrandMark', () => {
  it('renders a typographic wordmark when no official logo file exists', () => {
    render(<BrandMark app={netflix} />);
    expect(screen.getByLabelText('Netflix')).toHaveTextContent('NETFLIX');
  });
  it('prefers an official logo from assets/icons when provided', () => {
    render(<BrandMark app={netflix} logoUrl="/assets/icons/netflix.svg" />);
    expect(screen.getByRole('img', { name: 'Netflix' })).toHaveAttribute('src', '/assets/icons/netflix.svg');
  });
});
