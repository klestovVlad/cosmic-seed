import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FpsOverlay } from '../src/ui/FpsOverlay';

describe('FpsOverlay', () => {
  it('renders with placeholder before the first frame sample', () => {
    render(<FpsOverlay />);
    expect(screen.getByTestId('fps-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('fps-value')).toHaveTextContent('—');
  });
});
