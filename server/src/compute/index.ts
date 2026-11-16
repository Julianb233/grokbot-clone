import { env } from '../env.js';
import { createProvider } from './providers.js';

export { ComputeError } from './types.js';
export type { Computer, ComputeProvider, Screen } from './types.js';

/** The computer provider this server runs on, chosen by COMPUTE_PROVIDER (default: orgo). */
export const compute = createProvider(env.computeProvider, {
  orgo: { apiKey: env.orgoKey, baseUrl: env.orgoBaseUrl, wsBaseUrl: env.orgoWsBaseUrl, ramGb: env.orgoRamGb, cpu: env.orgoCpu, resolution: env.orgoResolution },
});
