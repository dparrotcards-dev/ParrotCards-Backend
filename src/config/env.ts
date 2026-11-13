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
    ASTRONOMY_PROVIDER: z.string().default('pyjhora'),
    PYJHORA_API_URL: z.string().default('http://127.0.0.1:8000'),
    JAGANNATHA_HORA_API_URL: z.string().optional().default('http://127.0.0.1:8000'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      const isVercel = Boolean(process.env.VERCEL);

      // 1. Reject default localhost or unconfigured database in production (strict on non-Vercel, warn on Vercel to allow startup)
      if (
        !data.MONGODB_URI ||
        data.MONGODB_URI.includes('127.0.0.1') ||
        data.MONGODB_URI.includes('localhost')
      ) {
        if (!isVercel) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['MONGODB_URI'],
            message:
              'Production requires a valid remote MongoDB connection URI (e.g. MongoDB Atlas). Localhost is prohibited in production.',
          });
        } else {
          console.warn(
            '⚠️ [MONGODB_URI]: Production requires remote MongoDB Atlas URI. Please configure MONGODB_URI in Vercel Project Settings > Environment Variables.'
          );
        }
      }

      // 2. Reject known placeholder / insecure dev JWT secret in strict production
      const knownInsecureSecrets = [
        'secret',
        'changeme',
        'jwt_secret',
        'development_secret',
      ];
      if (
        !data.JWT_SECRET ||
        data.JWT_SECRET.length < 16 ||
        (!isVercel && (data.JWT_SECRET.length < 32 || knownInsecureSecrets.includes(data.JWT_SECRET.toLowerCase()) || data.JWT_SECRET.toLowerCase().includes('dev')))
      ) {
        if (!isVercel) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['JWT_SECRET'],
            message:
              'Production requires a cryptographically strong, non-default JWT_SECRET (minimum 32 characters, no dev placeholders).',
          });
        }
      }

      // 3. Reject placeholder / test Razorpay credentials in production (allow test mode if intentionally testing on Vercel)
      if (
        !isVercel &&
        (!data.RAZORPAY_KEY_ID ||
        data.RAZORPAY_KEY_ID === 'rzp_test_ParrotCardsKey')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_ID'],
          message:
            'Production requires valid Razorpay credentials.',
        });
      }

      if (
        !isVercel &&
        (!data.RAZORPAY_KEY_SECRET ||
        data.RAZORPAY_KEY_SECRET === 'rzp_test_ParrotCardsSecret' ||
        data.RAZORPAY_KEY_SECRET.length < 8)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RAZORPAY_KEY_SECRET'],
          message:
            'Production requires real Razorpay key secret.',
        });
      }

      // 4. Validate Razorpay Webhook Secret in strict non-serverless production
      if (
        !isVercel &&
        (!data.RAZORPAY_WEBHOOK_SECRET ||
        data.RAZORPAY_WEBHOOK_SECRET === 'rzp_test_webhook_secret' ||
        data.RAZORPAY_WEBHOOK_SECRET.length < 16 ||
        data.RAZORPAY_WEBHOOK_SECRET.toLowerCase().includes('test'))
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
        if (!data.ALLOW_GEMINI_FALLBACK && !isVercel) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['GEMINI_API_KEY'],
            message:
              'Production requires a valid GEMINI_API_KEY for live AI interpretations. To intentionally run production in deterministic offline fallback mode, set ALLOW_GEMINI_FALLBACK=true.',
          });
        } else {
          console.warn(
            '⚠️ Environment Limitation: GEMINI_API_KEY is not configured in production, but ALLOW_GEMINI_FALLBACK is enabled. AI interpretations will operate in deterministic Vedic astrological fallback mode.'
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
  if (!process.env.VERCEL) {
    process.exit(1);
    throw new Error(`Environment validation failed: ${issues.map((i) => `${i.field}: ${i.message}`).join(', ')}`);
  } else {
    console.warn('⚠️ Running in Vercel serverless mode with partial environment. Ensure required secrets are set in Vercel Project Settings.');
  }
}

export const ENV = parsedEnv.success
  ? parsedEnv.data
  : ({
      PORT: Number(process.env.PORT || 5000),
      NODE_ENV: 'production' as const,
      FRONTEND_URL: process.env.FRONTEND_URL || 'https://parrot-cards.vercel.app',
      MONGODB_URI: process.env.MONGODB_URI || '',
      MONGODB_TEST_URI: '',
      JWT_SECRET: process.env.JWT_SECRET || 'parrot_cards_cosmic_jwt_secret_dev_key_2026_xyz',
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      ALLOW_GEMINI_FALLBACK: true,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_ParrotCardsKey',
      RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_ParrotCardsSecret',
      RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || '',
      ASTRONOMY_PROVIDER: 'pyjhora',
      PYJHORA_API_URL: process.env.PYJHORA_API_URL || 'http://127.0.0.1:8000',
      JAGANNATHA_HORA_API_URL: process.env.PYJHORA_API_URL || 'http://127.0.0.1:8000',
    } as z.infer<typeof envSchema>);
