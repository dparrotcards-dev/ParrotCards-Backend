import bcrypt from 'bcrypt';
import { User } from '../models/User';

export const ADMIN_CREDENTIALS = {
  email: 'dparrotcards@gmail.com',
  password: 'hemant123',
  name: 'Hemant Paliwal',
  role: 'superadmin' as const,
};

export async function seedAdminUser(): Promise<void> {
  try {
    const existing = await User.findOne({ email: ADMIN_CREDENTIALS.email.toLowerCase() });
    const passwordHash = await bcrypt.hash(ADMIN_CREDENTIALS.password, 10);

    if (!existing) {
      await User.create({
        email: ADMIN_CREDENTIALS.email.toLowerCase(),
        passwordHash,
        name: ADMIN_CREDENTIALS.name,
        role: ADMIN_CREDENTIALS.role,
      });
      console.log(`👑 Super Admin user initialized: ${ADMIN_CREDENTIALS.email} (role: superadmin)`);
    } else {
      // Ensure superadmin role and updated password hash
      existing.role = 'superadmin';
      existing.passwordHash = passwordHash;
      if (!existing.name) existing.name = ADMIN_CREDENTIALS.name;
      await existing.save();
      console.log(`👑 Super Admin user verified: ${ADMIN_CREDENTIALS.email} (role: superadmin)`);
    }
  } catch (err: any) {
    console.error('⚠️ Failed to seed/verify admin user:', err.message);
  }
}
