import { validateRails } from './offer';

export type Network = 'mainnet' | 'signet' | 'mutinynet' | 'testnet';
export interface PaymentRequest {
  id: string;
  network: Network;
  amountSat: number;
  acceptedRails: string[];
  expiresAt?: number;
  preference?: 'direct-first' | 'recipient-first';
}
export interface WalletSource { id: string; rail: string; network: Network }
export interface SwapCapability { id: string; from: string; to: string; network: Network }
export type Route = { kind: 'direct' | 'swap'; sourceId: string; from: string; to: string; providerId?: string };
export type Plan = { status: 'ready'; requestId: string; route: Route; alternatives: Route[] }
  | { status: 'unsupported'; requestId: string; reason: string };

export function validateRequest(request: PaymentRequest, now = Math.floor(Date.now() / 1000)): void {
  if (!request || typeof request.id !== 'string' || !request.id.trim() || request.id.length > 128) throw new Error('Invalid request ID');
  if (!['mainnet', 'signet', 'mutinynet', 'testnet'].includes(request.network)) throw new Error('Invalid network');
  if (!Number.isSafeInteger(request.amountSat) || request.amountSat <= 0 || request.amountSat > 2100000000000000) throw new Error('Invalid satoshi amount');
  if (request.preference !== undefined && !['direct-first', 'recipient-first'].includes(request.preference)) throw new Error('Invalid routing preference');
  validateRails(request.acceptedRails);
  if (!request.acceptedRails.length) throw new Error('No accepted rails');
  if (request.expiresAt !== undefined && (!Number.isSafeInteger(request.expiresAt) || request.expiresAt <= now)) throw new Error('Request expired or expiry invalid');
  for (const rail of request.acceptedRails) resolveRail(rail, request.network);
}

function resolveRail(rail: string, network: Network): string {
  validateRails([rail]);
  if (rail === 'ln') return `ln:${network}`;
  const match = /^(btc|ln|liquid|rgb-ln):([^/]+)/.exec(rail);
  if (match && match[2] !== network) throw new Error('Rail network conflicts with request');
  return rail;
}

/** Capability planning only: no liquidity, quote, balance or invoice verification is implied. */
export function planPayment(request: PaymentRequest, sources: WalletSource[], swaps: SwapCapability[] = [], now?: number): Plan {
  validateRequest(request, now);
  const direct: Route[] = [], routed: Route[] = [];
  const available = sources.filter(s => s.network === request.network);
  for (const rail of request.acceptedRails) {
    const to = resolveRail(rail, request.network);
    for (const source of available) {
      const from = resolveRail(source.rail, request.network);
      if (from === to) direct.push({ kind: 'direct', sourceId: source.id, from, to });
      else for (const swap of swaps.filter(s => s.network === request.network)) {
        if (resolveRail(swap.from, request.network) === from && resolveRail(swap.to, request.network) === to) {
          routed.push({ kind: 'swap', sourceId: source.id, from, to, providerId: swap.id });
        }
      }
    }
  }
  const candidates = [...direct, ...routed];
  if (request.preference === 'recipient-first') {
    const ranks = request.acceptedRails.map(r => resolveRail(r, request.network));
    candidates.sort((a, b) => ranks.indexOf(a.to) - ranks.indexOf(b.to));
  }
  const routes = candidates.filter((r, i, all) => all.findIndex(x => JSON.stringify(x) === JSON.stringify(r)) === i);
  return routes.length ? { status: 'ready', requestId: request.id, route: routes[0], alternatives: routes.slice(1) }
    : { status: 'unsupported', requestId: request.id, reason: 'No explicitly supported direct or single-swap route on this network' };
}
