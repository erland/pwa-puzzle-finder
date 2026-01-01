import { render, screen } from '@testing-library/react';
import HomePage from '../HomePage';

describe('HomePage', () => {
  it('renders the MVP scope section', () => {
    render(<HomePage />);
    expect(screen.getByText(/MVP scope/i)).toBeInTheDocument();
    expect(screen.getByText(/corner/i)).toBeInTheDocument();
    expect(screen.getByText(/edge/i)).toBeInTheDocument();
  });
});
