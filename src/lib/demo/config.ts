import type { DemoConfig } from 'stellar-drive';
import { seedDemoData } from './mockData';

/**
 * Demo mode configuration.
 *
 * Pass this to `initEngine({ demo: demoConfig })` to enable the demo system.
 * Customize the mock profile and seed data to match your app.
 */
export const demoConfig: DemoConfig = {
  seedData: seedDemoData,
  mockProfile: {
    email: 'alex@notes.demo',
    firstName: 'Alex',
    lastName: 'Writer'
  }
};
