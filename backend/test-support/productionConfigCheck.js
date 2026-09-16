import { productionEnvironment } from './productionEnvironment.js';

// No infrastructure contact: exercise the real config-only CLI in CI.
Object.assign(process.env, productionEnvironment());
process.argv.push('--config-only');
await import('../src/scripts/productionPreflight.js');
