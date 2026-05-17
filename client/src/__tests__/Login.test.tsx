import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../pages/Login';

describe('Login page', () => {
  it('renders a "Continue with Google" sign-in button', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    const buttons = screen.getAllByRole('button', { name: /continue with google/i });
    expect(buttons.length).toBeGreaterThan(0);
  });
});
