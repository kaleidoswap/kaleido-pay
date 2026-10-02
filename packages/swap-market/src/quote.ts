import { claimFee } from './htlc';
import { reverseQuote, reverseOnchainAmount } from './nostr';
import type { SwapOffer, SwapNetwork } from './types';

export interface FeeBreakdown {
  /** Provider's percentage fee, in sats. */
  provider: number;
  /** Provider's lockup mining fee, deducted from the on-chain amount. Part of it is paid up front as the prepayment invoice. */
  lockupMining: number;
  /** Our claim transaction's fee. Estimated from the current fee rate. */
  claimMining: number;
  claimMiningIsEstimate: true;
}

export interface SwapQuote {
  kind: 'reverse';
  network: SwapNetwork;
  provider: string;
  /** What lands at the destination, after the estimated claim fee. */
  recipientSat: number;
  /** Total the payer sends over Lightning, prepayment included. */
  payerSat: number;
  /** What the provider locks on-chain. */
  onchainSat: number;
  fees: FeeBreakdown;
  feeRate: number;
  /** Unix seconds. Offers move with the fee market; requote after this. */
  expiresAt: number;
}

const QUOTE_TTL_S = 120;

/** Quote for `recipientSat` to arrive at an address, paying `offer` over Lightning. */
export function quoteReverse(offer: SwapOffer, network: SwapNetwork, recipientSat: number, feeRate: number): SwapQuote | null {
  const claim = claimFee(feeRate);
  const payerSat = reverseQuote(offer, recipientSat + claim);
  if (payerSat < offer.minAmount || payerSat > offer.maxForward) return null;
  const onchainSat = reverseOnchainAmount(offer, payerSat);
  return {
    kind: 'reverse',
    network,
    provider: offer.pubkey,
    recipientSat: onchainSat - claim,
    payerSat,
    onchainSat,
    fees: {
      provider: payerSat - Math.floor(payerSat * (1 - offer.percentageFee / 100)),
      lockupMining: offer.miningFee,
      claimMining: claim,
      claimMiningIsEstimate: true,
    },
    feeRate,
    expiresAt: Math.floor(Date.now() / 1000) + QUOTE_TTL_S,
  };
}

/** Quotes from every offer that fits, cheapest first. Many providers never answer, so try them in order. */
export function rankedReverseQuotes(offers: SwapOffer[], network: SwapNetwork, recipientSat: number, feeRate: number): SwapQuote[] {
  const quotes = offers.map(o => quoteReverse(o, network, recipientSat, feeRate)).filter((q): q is SwapQuote => !!q);
  return quotes.sort((a, b) => a.payerSat - b.payerSat);
}

export function bestReverseQuote(offers: SwapOffer[], network: SwapNetwork, recipientSat: number, feeRate: number): SwapQuote | null {
  return rankedReverseQuotes(offers, network, recipientSat, feeRate)[0] ?? null;
}
