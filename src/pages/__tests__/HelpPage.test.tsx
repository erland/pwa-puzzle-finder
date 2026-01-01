import { render, screen } from '@testing-library/react';
import HelpPage from '../HelpPage';

describe('HelpPage', () => {
  it('renders usage guidance', () => {
    render(<HelpPage />);
    expect(screen.getByText(/How to use Puzzle Finder/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended setup/i)).toBeInTheDocument();
  });
});
