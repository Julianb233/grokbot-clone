import { createOrgoProvider, type OrgoConfig } from './orgo.js';
import type { ComputeProvider } from './types.js';

export interface ComputeConfig { orgo: OrgoConfig }

/**
 * Registry of computer providers. To add one: implement ComputeProvider in a file next
 * to orgo.ts, add its config to ComputeConfig, and add a line here.
 */
const registry: Record<string, (cfg: ComputeConfig) => ComputeProvider> = {
  orgo: (cfg) => createOrgoProvider(cfg.orgo),
};

export const providerNames = () => Object.keys(registry);

export function createProvider(name: string, cfg: ComputeConfig): ComputeProvider {
  const make = registry[name.trim().toLowerCase()];
  if (!make) throw new Error(`Unknown COMPUTE_PROVIDER "${name}". Available: ${providerNames().join(', ')}`);
  return make(cfg);
}
