import { app } from './app';
import { ENV } from './config/env';
import { connectDB } from './config/database';
import { seedCardDefinitions } from './utils/seedCards';
import { seedAdminUser } from './utils/seedAdmin';

async function bootstrap() {
  try {
    await connectDB();
    await seedCardDefinitions();
    await seedAdminUser();

    const server = app.listen(ENV.PORT, () => {
      console.log(`🌌 Parrot Cards API server listening on http://localhost:${ENV.PORT}`);
      console.log(`📡 Connected Astronomy Provider: ${ENV.ASTRONOMY_PROVIDER}`);
      console.log(`✨ Environment: ${ENV.NODE_ENV}`);
    });

    const shutdown = async () => {
      console.log('\n🌙 Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('❌ Failed to bootstrap Parrot Cards server:', err);
    process.exit(1);
  }
}

bootstrap();
