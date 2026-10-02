import { decodeOffer, encodeOffer } from './offer';
import type { Network } from './plan';

/** Provisional KaleidoPay experiment; not a registered BOLT or SSPS allocation. */
export const KALEIDOPAY_DESTINATIONS = 1000000387n;
export type Destination =
  | { type: 'arkade' | 'bark'; address: string; server: string }
  | { type: 'lightning'; source: 'bolt12_offer' };
export interface DestinationMetadata { version: 1; network: Network; destinations: Destination[] }
const utf8 = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const MAX_BYTES = 8192;

function keys(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== expected.sort().join(',')) throw new Error('Invalid destination fields');
}

/** Shape validation only. The native SDK must verify address, network and server identity. */
export function validateDestinations(value: unknown): asserts value is DestinationMetadata {
  keys(value, ['version', 'network', 'destinations']);
  if (value.version !== 1) throw new Error('Unsupported destination version');
  if (!['mainnet', 'signet', 'mutinynet', 'testnet'].includes(value.network as string)) throw new Error('Invalid destination network');
  if (!Array.isArray(value.destinations) || !value.destinations.length || value.destinations.length > 16) throw new Error('Invalid destination list');
  const seen = new Set<string>();
  for (const destination of value.destinations) {
    if (destination?.type === 'lightning') {
      keys(destination, ['type', 'source']);
      if (destination.source !== 'bolt12_offer') throw new Error('Invalid Lightning destination');
    } else {
      keys(destination, ['type', 'address', 'server']);
      if (destination.type !== 'arkade' && destination.type !== 'bark') throw new Error('Unsupported destination type');
      if (typeof destination.address !== 'string' || !/^[\x21-\x7e]{1,2048}$/.test(destination.address)) throw new Error('Invalid destination address');
      if (typeof destination.server !== 'string' || destination.server.length > 512) throw new Error('Invalid destination server');
      const url = new URL(destination.server);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== destination.server) throw new Error('Use a canonical HTTPS server URL without credentials, query or fragment');
    }
    const identity = destination.type === 'lightning' ? 'lightning' : JSON.stringify([destination.type, destination.server, destination.address]);
    if (seen.has(identity)) throw new Error('Duplicate destination');
    seen.add(identity);
  }
  if (encoder.encode(JSON.stringify(value)).length > MAX_BYTES) throw new Error('Destination metadata too large');
}

/** Stable object-key ordering; preference order in arrays is preserved. */
export function encodeDestinations(value: DestinationMetadata): Uint8Array {
  validateDestinations(value);
  return encoder.encode(JSON.stringify({
    destinations: value.destinations.map(d => d.type === 'lightning'
      ? { source: d.source, type: d.type }
      : { address: d.address, server: d.server, type: d.type }),
    network: value.network, version: value.version,
  }));
}

export function decodeDestinations(bytes: Uint8Array): DestinationMetadata {
  if (bytes.length > MAX_BYTES) throw new Error('Destination metadata too large');
  const value: unknown = JSON.parse(utf8.decode(bytes));
  validateDestinations(value);
  // Reject ambiguous JSON (duplicate keys), whitespace and noncanonical encodings.
  if (utf8.decode(encodeDestinations(value)) !== utf8.decode(bytes)) throw new Error('Noncanonical destination metadata');
  return value;
}

export function offerDestinations(offer: string, expectedNetwork: Network): DestinationMetadata | undefined {
  const field = decodeOffer(offer).find(f => f.type === KALEIDOPAY_DESTINATIONS);
  if (!field) return undefined;
  const metadata = decodeDestinations(field.value);
  if (metadata.network !== expectedNetwork) throw new Error('Destination network conflicts with request');
  return metadata;
}

/** LN is implicit fallback when not explicitly positioned by the receiver. */
export function orderedDestinations(metadata: DestinationMetadata): Destination[] {
  validateDestinations(metadata);
  const result = metadata.destinations.map(d => ({ ...d }));
  return result.some(d => d.type === 'lightning') ? result : [...result, { type: 'lightning', source: 'bolt12_offer' }];
}

/** Issuer construction only: never modify an already issued offer. */
export function withDestinations(offer: string, metadata: DestinationMetadata): string {
  return encodeOffer([...decodeOffer(offer).filter(f => f.type !== KALEIDOPAY_DESTINATIONS), {
    type: KALEIDOPAY_DESTINATIONS, value: encodeDestinations(metadata),
  }]);
}
