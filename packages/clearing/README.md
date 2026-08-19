# @cashflow/clearing

A multilateral obligation-clearing engine.

Given a network of "who owes whom", it removes as much outstanding obligation
as possible **without changing anybody's net position** — and it lets the caller
decide how much counterparty risk that is allowed to cost.

## The two modes, and why the difference matters

Every mainstream expense app offers one button, usually called *simplify
debts*. It rewrites the obligation graph to reduce the number of payments, and
in doing so it can leave you owing money to someone you have never transacted
with. Splitwise's own documentation is explicit that simplification "makes
changes not only to your account, but also to the accounts of your friends —
including balances that you can't see."

That is one point on a spectrum, not the only option:

| Mode | What it does | New counterparties |
| --- | --- | --- |
| `cycles` | Cancels obligations only where they form a closed loop | **Never any** |
| `paths` | Also lifts intermediaries out of open chains | Yes — and it reports exactly which |

Both preserve every party's net position exactly. The engine asserts this
invariant on every run and throws rather than return a result that violates it.

```ts
import { clear } from "@cashflow/clearing";

const result = clear(
  [
    { from: "A", to: "B", amount: 10_000 }, // minor units, always integers
    { from: "B", to: "C", amount: 10_000 },
  ],
  { mode: "cycles" }
);

result.metrics.noNewCounterparties; // true
result.remaining;                   // unchanged: nothing here forms a loop
```

Switch to `{ mode: "paths" }` and the same input collapses to a single
`A -> C` obligation for 10,000, with `metrics.newPairs` reporting `["A|C"]`.

A party can also refuse a specific exposure without opting out of clearing:

```ts
clear(obligations, { mode: "paths", forbiddenPairs: new Set(["A|C"]) });
```

`preferExistingPairs` (on by default) further biases path compensation toward
reductions that reuse a pair which already exists, which costs nothing in
cleared value and keeps new exposure down.

## How it works

Cycle-restricted clearing is a **maximum-circulation** problem. A flow that
respects each obligation as a capacity and conserves value at every party
cannot change anyone's net position — conservation *is* the safety guarantee —
so maximising total flow maximises the obligation value that simply cancels.

That is a minimum-cost circulation with a cost of −1 per unit on every
obligation, solved in two phases:

1. **Saturate plain directed cycles** by depth-first search. Cheap, and it
   recovers most of the value on realistic graphs.
2. **Cancel negative-cost cycles** in the residual network until none remain.
   A circulation is optimal exactly when its residual has no negative cycle, so
   this is what makes the answer provably maximal.

Phase 2 is queue-driven Bellman-Ford that detects a cycle the moment it forms,
by checking whether a relaxation would close a loop in the predecessor tree.
The textbook SPFA test — waiting for a relaxation counter to exceed the node
count — measured about 25× slower on these networks, because it lets the queue
churn long after the cycle exists.

Path-enabled compensation then repeatedly lifts a party out from between an
inflow and an outflow. Repeated until no party sits in the middle, this drives
the total down to the **floor**: the sum of all positive net positions, which is
the least any net-preserving method can leave outstanding.

Amounts are integer minor units throughout. Clearing adds and subtracts these
values thousands of times, so anything less exact would let rounding error
accumulate into the settlement instructions themselves.

## Benchmark

`npm run bench:clearing` from the repo root. Synthetic networks, seeded and
reproducible.

```
network                      pairs  gross        cycles  paths   new pairs (cyc/path)
---------------------------  -----  -----------  ------  ------  --------------------
friends group                15     198,854      23.77%  45.12%  0 / 0
unstructured cluster         2756   26,555,348   57.33%  71.24%  0 / 509
supply chain (5 tiers)       2598   24,763,077   27.76%  63.42%  0 / 882
supply chain (8 tiers)       4966   46,821,748   20.41%  62.87%  0 / 2151
supply chain, thin backflow  4884   46,430,124   12.85%  63.46%  0 / 2330
regional supply chain        13935  122,584,346  22.88%  64.02%  0 / 6703
```

Two things worth reading carefully.

**Topology dominates the cycle figure.** Real trade is largely hierarchical — a
retailer owes a wholesaler owes a manufacturer — and a purely hierarchical
network is acyclic, leaving cycle-restricted netting nothing to cancel. The
unstructured network clears 57% and is *not* representative; the supply-chain
networks clear 13–28% and are. For reference, [arXiv 2606.26126](https://arxiv.org/abs/2606.26126)
reports **20.99%** for cycle-restricted netting on a real corpus of 133,191
invoices worth €19.67bn. The 8-tier network here independently lands at 20.41%.

**The extra relief is bought with exposure.** On the regional network, moving
from `cycles` to `paths` clears an additional 41% of outstanding obligation —
and creates **6,703 counterparty relationships that did not previously exist**.
That is the trade every other tool makes silently, on your behalf.

## Scale

Exact clearing of ~14,000 obligations takes roughly 15 seconds. Everything
below a few thousand obligations is well under a second. National-scale corpora
(the paper's 133,191 invoices) would need a cost-scaling min-cost-flow
implementation rather than cycle cancellation; the current engine is not that,
and reports `optimal: false` rather than pretending when it hits its iteration
budget.
