import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  return {
    verifyIdToken: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
  };
});

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = mocks.verifyIdToken;
  },
}));

vi.mock('../src/models/User', () => ({
  User: {
    findOne: mocks.findOne,
    create: mocks.create,
  },
}));

import { AuthService } from '../src/services/authService';

const makeUser = (fields: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'user-123' },
  email: 'person@example.com',
  name: 'Google Person',
  role: 'user',
  googleId: undefined,
  save: vi.fn(),
  ...fields,
});

const googlePayload = {
  sub: 'google-subject-123',
  email: 'person@example.com',
  email_verified: true,
  name: 'Google Person',
};

describe('Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...googlePayload }),
    });
    mocks.findOne.mockResolvedValue(null);
  });

  it('creates a customer account from a verified Google identity', async () => {
    mocks.create.mockImplementation(async (fields) => makeUser(fields));

    const result = await new AuthService().loginWithGoogle({ idToken: 'signed-google-id-token' });

    expect(mocks.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'signed-google-id-token',
      audience: 'test-google-client-id',
    });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.com',
      googleId: 'google-subject-123',
      role: 'user',
    }));
    expect(result.user).toMatchObject({ id: 'user-123', email: 'person@example.com', role: 'user' });
    expect(result.token).toEqual(expect.any(String));
  });

  it('links a verified Google identity to an existing customer with the same email', async () => {
    const existingUser = makeUser();
    mocks.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingUser);

    await new AuthService().loginWithGoogle({ idToken: 'signed-google-id-token' });

    expect(existingUser.googleId).toBe('google-subject-123');
    expect(existingUser.save).toHaveBeenCalledOnce();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects identities whose Google email is not verified', async () => {
    mocks.verifyIdToken.mockResolvedValue({
      getPayload: () => ({ ...googlePayload, email_verified: false }),
    });

    await expect(
      new AuthService().loginWithGoogle({ idToken: 'signed-google-id-token' })
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});
