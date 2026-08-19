import type { Obligation } from "./types.js";

/**
 * Synthetic invoice networks for benchmarking.
 *
 * Real trade networks are not uniform random graphs: a few firms trade with
 * very many counterparties while most trade with a handful, and pairs of firms
 * frequently invoice each other in both directions. Both properties matter
 * here, because cycle-restricted clearing lives or dies on how much circular
 * structure exists. The generator therefore uses preferential attachment for
 * degree and an explicit reciprocity knob for mutual trade.
 */

/** Deterministic PRNG so every reported figure can be reproduced exactly. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4_294_967_296;
  };
}

export interface NetworkSpec {
  name: string;
  firms: number;
  invoices: number;
  /** Chance an invoice is issued back along an existing trading relationship. */
  reciprocity: number;
  seed: number;
  /**
   * Supply-chain depth. Real trade is largely hierarchical — a retailer owes a
   * wholesaler owes a manufacturer — which is acyclic, and an acyclic network
   * has nothing for cycle-restricted netting to cancel. Setting this models
   * that structure; leaving it undefined produces an unstructured network with
   * far more circular flow than trade data actually exhibits.
   */
  tiers?: number;
  /**
   * Chance an invoice runs against the supply chain (a manufacturer buying
   * services from a firm downstream of it, or same-tier trade). This is where
   * genuine cycles come from in a hierarchical network.
   */
  backflow?: number;
}

export function generateNetwork(spec: NetworkSpec): Obligation[] {
  const random = makeRandom(spec.seed);
  const obligations: Obligation[] = [];

  // Preferential attachment: repeatedly drawing from this list favours firms
  // that already trade a lot, which is what produces hubs.
  const draw: number[] = [];
  for (let firm = 0; firm < spec.firms; firm += 1) draw.push(firm);

  const existing: Array<[number, number]> = [];

  const pick = (): number => {
    const index = Math.floor(random() * draw.length);
    return draw[Math.min(index, draw.length - 1)]!;
  };

  // Tier 0 sits closest to the end customer; higher tiers are further upstream.
  const tiers = spec.tiers ?? 0;
  const tierOf = new Int32Array(spec.firms);
  if (tiers > 1) {
    for (let firm = 0; firm < spec.firms; firm += 1) {
      tierOf[firm] = Math.floor(random() * tiers);
    }
  }

  const pickInTier = (tier: number): number => {
    // Preferential attachment restricted to one tier, with a bounded search so
    // a sparse tier cannot stall the generator.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const candidate = pick();
      if (tierOf[candidate] === tier) return candidate;
    }
    return -1;
  };

  for (let i = 0; i < spec.invoices; i += 1) {
    let supplier: number;
    let buyer: number;

    if (existing.length > 0 && random() < spec.reciprocity) {
      // Invoice back along a relationship that already exists.
      const [a, b] = existing[Math.floor(random() * existing.length)]!;
      supplier = b;
      buyer = a;
    } else if (tiers > 1) {
      const buyerTier = Math.floor(random() * tiers);
      const againstTheChain = random() < (spec.backflow ?? 0);
      // Money owed normally runs downstream to upstream: buyer -> supplier.
      const supplierTier = againstTheChain
        ? Math.max(0, buyerTier - 1)
        : Math.min(tiers - 1, buyerTier + 1);

      buyer = pickInTier(buyerTier);
      supplier = pickInTier(supplierTier);
      if (buyer < 0 || supplier < 0 || buyer === supplier) continue;
      existing.push([supplier, buyer]);
    } else {
      supplier = pick();
      buyer = pick();
      let guard = 0;
      while (buyer === supplier && guard < 8) {
        buyer = pick();
        guard += 1;
      }
      if (buyer === supplier) continue;
      existing.push([supplier, buyer]);
    }

    // Log-normal-ish invoice values in minor units, roughly 100 to 5,000,000.
    const magnitude = Math.exp(random() * 7 + 4);
    const amount = Math.max(100, Math.round(magnitude * 100));

    obligations.push({ from: `firm-${buyer}`, to: `firm-${supplier}`, amount });

    // Busy firms get drawn more often from here on.
    draw.push(supplier, buyer);
  }

  return obligations;
}
