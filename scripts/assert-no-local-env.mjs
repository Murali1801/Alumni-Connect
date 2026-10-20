// Guards `npm run deploy`. The OpenNext build copies every .env file it finds
// into the Worker bundle, so deploying from a machine with .env.local would
// ship the service-role key, API keys and a localhost NEXT_PUBLIC_APP_URL.
// Deploys build in CI instead, where values come from CI variables and
// Worker secrets.
import { existsSync } from 'node:fs';

const found = ['.env', '.env.local', '.env.production', '.env.production.local'].filter((file) => existsSync(file));

if (found.length > 0) {
  console.error(`Refusing to deploy: ${found.join(', ')} would be baked into the Worker bundle.`);
  console.error('Deploy from CI, or use `npm run preview` to test locally.');
  process.exit(1);
}
