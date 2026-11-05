import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z
  .object({
    PORT: z.string().default('5000').transform(Number),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    FRONTEND_URL: z.string().default('http://localhost:5173'),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/parrot-cards'),
    MONGODB_TEST_URI: z.string().default('mongodb://127.0.0.1:27017/parrotcards_test_isolated'),
    JWT_SECRET: z.string().min(16).default('parrot_cards_cosmic_jwt_secret_dev_key_2026_xyz'),
    GEMINI_API_KEY: z.string().optional().default(''),
    GEMINI_MODEL: z.string().optional().default('gemini-3.5-flash-lite'),
    ALLOW_GEMINI_FALLBACK: z.string().optional().default('false').transform((v) => v === 'true' || v === '1'),
    RAZORPAY_KEY_ID: z.string().default('rzp_test_ParrotCardsKey'),
    RAZORPAY_KEY_SECRET: z.string().default('rzp_test_ParrotCardsSecret'),
    RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_test_webhook_secret'),
    ASTRONOMY_PROVIDER: z.string().default('jagannatha_hora'),
    JAGANNATHA_HORA_API_URL: z.string().default('https://jagannatha-hora-359167915530.europe-west1.run.app'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      // 1. Reject default localhost or unconfigured database in production
      if (
        !data.MONGODB_URI ||
        data.MONGODB_URI.includes('127.0.0.1') ||
        data.MONGODB_URI.includes('localhost')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MONGODB_URI'],
          message:
            'Production requires a valid remote MongoDB connection URI (e.g. MongoDB Atlas). Localhost is prohibited in production.',
        });
      }

      // 2. Reject known placeholder / insecure dev JWT secret in production
      const knownInsecureSecrets = [
        'parrot_cards_cosmic_jwt_secret_dev_key_2026_xyz',
        'secret',
        'changeme',
        'jwt_secret',
        'development_secret',
      ];
      if (
        !data.JWT_SECRET ||
        data.JWT_SECRET.length < 32 ||
        knownInsecureSecrets.includes(data.JWT_SECRET.toLowerCase()) ||
        data.JWT_SECRET.toLowerCase().includes('dev')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message:
            'Production requires a cryptographically strong, non-default JWT_SECRET (minimum 32 characters, no dev placeholders).',
        });
      }

      // 3. Reject placeholder / test Razorpay credentials in production
      if (
        !data.RAZORPAY_KEY_ID ||
        data.RAZORPAY_KEY_ID === 'rzp_test_ParrotCardsKey' ||
        data.RAZORPAY_KEY_ID.startsWith('rzp_test_')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_ID'],
          message:
            'Production requires live Razorpay credentials (must begin with rzp_live_). Test key IDs are prohibited in production.',
        });
      }

      if (
        !data.RAZORPAY_KEY_SECRET ||
        data.RAZORPAY_KEY_SECRET === 'rzp_test_ParrotCardsSecret' ||
        data.RAZORPAY_KEY_SECRET.length < 16 ||
        data.RAZORPAY_KEY_SECRET.toLowerCase().includes('test')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_SECRET'],
          message:
            'Production requires real Razorpay live key secret (minimum 16 characters, no test placeholders).',
        });
      }

      // 4. Validate Razorpay Webhook Secret in production
      if (
        !data.RAZORPAY_WEBHOOK_SECRET ||
        data.RAZORPAY_WEBHOOK_SECRET === 'rzp_test_webhook_secret' ||
        data.RAZORPAY_WEBHOOK_SECRET.length < 16 ||
        data.RAZORPAY_WEBHOOK_SECRET.toLowerCase().includes('test')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_WEBHOOK_SECRET'],
          message:
            'Production requires a dedicated, cryptographically strong RAZORPAY_WEBHOOK_SECRET (minimum 16 characters, no test placeholders).',
        });
      }

      // 5. Reject mock astronomy provider in production
      if (data.ASTRONOMY_PROVIDER === 'mock' || data.ASTRONOMY_PROVIDER === 'local') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ASTRONOMY_PROVIDER'],
          message: 'Production cannot use mock or local astronomy provider.',
        });
      }

      // 6. Explicit Gemini Generative AI Policy:
      // If Gemini is required for production, fail startup when missing or placeholder.
      // If fallback mode is explicitly allowed via ALLOW_GEMINI_FALLBACK=true, allow startup and log clearly.
      const hasGeminiKey =
        Boolean(data.GEMINI_API_KEY) &&
        data.GEMINI_API_KEY.trim().length > 0 &&
        !data.GEMINI_API_KEY.toLowerCase().includes('placeholder');

      if (!hasGeminiKey) {
        if (!data.ALLOW_GEMINI_FALLBACK) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['GEMINI_API_KEY'],
            message:
              'Production requires a valid GEMINI_API_KEY for live AI interpretations. To intentionally run production in deterministic offline fallback mode, set ALLOW_GEMINI_FALLBACK=true.',
          });
        } else {
          console.warn(
            '⚠️ Environment Limitation: GEMINI_API_KEY is not configured in production, but ALLOW_GEMINI_FALLBACK=true. AI interpretations will operate in deterministic Vedic astrological fallback mode.'
          );
        }
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  // Format validation errors cleanly without leaking secret values
  const issues = parsedEnv.error.issues.map((i) => ({
    field: i.path.join('.'),
    message: i.message,
  }));
  console.error('❌ Insecure / Invalid environment configuration:');
  issues.forEach((issue) => console.error(`   - [${issue.field}]: ${issue.message}`));
  process.exit(1);
}

export const ENV = parsedEnv.data;
