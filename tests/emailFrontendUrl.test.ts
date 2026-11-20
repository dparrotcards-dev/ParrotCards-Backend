import { describe, expect, it } from 'vitest';
import { resolveFrontendBaseUrl } from '../src/services/emailService';

describe('password reset email frontend URL', () => {
  it('uses the live website when production is configured with localhost', () => {
    expect(resolveFrontendBaseUrl('http://localhost:5173', true)).toBe(
      'https://parrot-cards.vercel.app'
    );
  });

  it('keeps localhost for local development', () => {
    expect(resolveFrontendBaseUrl('http://localhost:5173', false)).toBe(
      'http://localhost:5173'
    );
  });

  it('keeps a configured public production domain', () => {
    expect(resolveFrontendBaseUrl('https://parrot-cards.vercel.app/', true)).toBe(
      'https://parrot-cards.vercel.app'
    );
  });
});
