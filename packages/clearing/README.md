# @cashflow/clearing

A multilateral obligation-clearing engine.

Given a network of "who owes whom", it removes as much outstanding obligation
as possible **without changing anybody's net position** — and it lets the caller
decide how much counterparty risk that is allowed to cost. It can also say who
fails when someone cannot pay, and choose what to cancel so that fewer do.

No dependencies. Runs in a browser tab or in Node.

| | |
| --- | --- |
| [`clear`](#the-two-modes-and-why-the-difference-matters) | Cancel loops, or loops and chains, and report what it cost |
| [`verifyClearing`](#certificates) | Check a clearing is maximal without running a solver |
| [`cascade`](#when-someone-cannot-pay) | Who fails, in what order, and who collects what |
| [`rescue`](#clearing-for-who-survives) | The clearing that leaves the fewest parties unable to pay |

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

## How cycle clearing is solved

Cycle-restricted clearing is a **maximum-circulation** problem. A flow that
respects each obligation as a capacity and conserves value at every party
cannot change anyone's net position — conservation *is* the guarantee — so
maximising total flow maximises the obligation value that simply cancels. That
is a minimum-cost circulation with a cost of −1 per unit on every obligation.

There are three solvers. They reach the same optimum by unrelated routes, and
the tests hold them to that on hundreds of randomised networks each.

```ts
clear(obligations, { mode: "cycles" });                     // cycle cancelling
clear(obligations, { mode: "cycles", solver: "routing" });  // built for scale
clear(obligations, { mode: "cycles", solver: "simplex" });  // general min-cost flow
```

**Cycle cancelling** (`circulation.ts`) is the reference method and the default.

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

**Routing** (`routing.ts`) turns the problem inside out. The most that can
cancel is the total minus the least that has to stay, and what stays must still
carry every party's net position through obligations that already exist. So
the residue of an optimal clearing is the cheapest way to route net debt along
existing obligations, at a cost of one per obligation crossed: a net debtor's
shortfall has to reach net creditors by the shortest chains available.

That is a transport problem with unit costs, and unit costs are what make it
fast. Route lengths are small whole numbers, so the solver works through them
in order — find the shortest remaining length, saturate every route of that
length at once with a blocking flow, move on to the next. This is the
primal-dual method. On the largest benchmark network it is over a hundred
times faster than cycle cancelling.

**Network simplex** (`simplex.ts`) is a general minimum-cost flow solver:
supplies, arbitrary integer costs and unbounded arcs are all allowed. The basis
is kept strongly feasible, which is what stops degenerate pivots from cycling,
and a pure circulation starts out as almost nothing but degenerate pivots. It
is given a head start for clearing — parties are ranked by the longest chain of
obligations below them and hung from the creditor ranked just beneath, so only
loop-closing arcs are left to price.

Before either large-network solver runs, the network is cut into strongly
connected components (`components.ts`). A cycle never leaves its component, and
most of a supply chain is not circular at all, so obligations that cross
between components are set aside and never priced.

Path-enabled compensation then repeatedly lifts a party out from between an
inflow and an outflow. Repeated until no party sits in the middle, this drives
the total down to the **floor**: the sum of all positive net positions, which is
the least any net-preserving method can leave outstanding.

Amounts are integer minor units throughout. Clearing adds and subtracts these
values thousands of times, so anything less exact would let rounding error
accumulate into the settlement instructions themselves.

### Certificates

A cycle clearing from `routing` or `simplex` comes back with a certificate: one
number per party.

```ts
import { clear, verifyClearing } from "@cashflow/clearing";

const round = clear(obligations, { mode: "cycles", solver: "routing" });

verifyClearing(obligations, round.remaining, round.certificate!);
// { valid: true }
```

`verifyClearing` takes what was owed, what is left and the certificate, and
confirms three things without running a solver: nothing was created or
increased, no party's net position moved, and no further loop could have been
cancelled. The last part is linear-programming duality — the clearing is
maximal exactly when every obligation with value still on it runs "downhill"
by at least one in the certificate's numbers, and every partly cleared one by
exactly one. It is one pass over the obligations.

The certificate covers the whole network, including the obligations that were
set aside before solving, so it does not depend on trusting that step. It
survives a round trip through JSON. An operator can publish the obligations,
the result and the certificate and let every participant check the round.

Path compensation needs no certificate: reaching `metrics.grossFloor` is its
own proof.

## When someone cannot pay

```ts
import { cascade } from "@cashflow/clearing";

const outcome = cascade(obligations, cash, { receivableRecovery: 0.8 });

outcome.waves;     // [["Dara"], ["Asha"]] — who fails, in the order they fail
outcome.shortfall; // obligation value that is never paid
outcome.parties;   // per party: owes, pays, owed, collects, wave
```

`cash` is a map from party to what it can put toward its debts besides what it
collects. A party that cannot cover what it owes pays its creditors pro rata
out of what it has, and the shortfall carries on to them.

The answer is a fixed point: payments under which every solvent party pays in
full and every failed party pays exactly what it has. This is the
Eisenberg–Noe clearing vector, with the Rogers–Veraart extension for value
destroyed in failure (`cashRecovery`, `receivableRecovery`). It is found by the
fictitious default method — assume everyone pays, see who cannot, solve for
what those parties can pay, see who that brings down — so each round is one
wave of the cascade. A tight ring of failed parties paying mostly each other
converges slowly by iteration and is solved outright as a linear system
instead.

The first wave could not have paid even if paid in full. Every later wave was
solvent on paper. `walkedAway` marks parties that pay nothing at all, whatever
they hold.

## Clearing for who survives

Cancelling a loop is neutral while everyone in it can pay. Once someone in it
cannot, it is a priority jump: the loop's members are settled against each
other in full, and the failing party's other creditors share a smaller estate.
The tests carry a five-obligation example in which leaving a loop alone sinks
one party, cancelling all of it sinks a different one, and cancelling between
23 and 54 of its 100 sinks neither.

```ts
import { rescue } from "@cashflow/clearing";

const plan = rescue(obligations, cash);

plan.remaining;       // what is left outstanding
plan.outcome.failed;  // who fails under this plan
plan.asOwed.failed;   // who fails if nothing is cleared
plan.maximum.failed;  // who fails if everything that can be is cleared
plan.unavoidable;     // who fails under any clearing at all
plan.provablyBest;    // true when the plan loses nobody else
```

The plan is a cycle clearing like any other: it only reduces obligations, moves
no net position and creates no counterparty.

Finding the clearing with the fewest failures is NP-hard, and remains NP-hard
when the question is only whether one named party can be saved
([Csáji, Mateiu, Popa and Schlotter, 2026](https://arxiv.org/abs/2603.27155)).
`rescue` is therefore a search:

- Every failure that is not inevitable comes from claims on a failed party
  being worth less than face. The only thing clearing can do about that is
  cancel those claims at face value, by routing them round a loop back to the
  failed debtor. That is the main move.
- It tries the smallest amount that works first. Whatever is cancelled for one
  creditor comes out of the estate the rest share.
- A move that saves its target and sinks someone else is still taken if less
  goes unpaid overall. Unpaid value strictly falls each time, so trades cannot
  go round in circles.
- Where failure destroys value, loops through a failed party are cancelled too
  once nobody else can be shielded, so less money passes through it to be
  lost. Done earlier, that uses up the obligations shielding needs to route
  through and saves fewer parties.
- Every candidate is checked by resolving the whole network again. The search
  never acts on its own estimate of what a move does.
- Loops among parties that all end up solvent change nobody's outcome, so they
  are cancelled last, to the maximum.

It is held to account by a bound. Some parties fail under every clearing: those
that could not pay even if paid in full, and then anyone whose best case still
falls short — where the best case cancels as much of each claim on a failed
debtor as the maximum flow from creditor back to debtor allows. That set is
`unavoidable`. It is a floor on the answer, it is proven, and the distance
between it and what the search found is the most the search can be wrong by.

## Benchmarks

All seeded and reproducible. Run from the repo root.

### What clears — `npm run bench:clearing`

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

### How far it scales — `npm run bench:scale`

Sizes are taken from published figures for real systems. The networks
themselves are synthetic.

```
regional supply chain  —  the largest network in bench/run.ts
  1,840 firms, 13,935 obligations
  routing              83 ms   certificate verified in 1 ms
  network simplex     122 ms   certificate verified in 0 ms
  cycle cancelling   14.32 s   173x the routing time
  cleared 22.88% of gross, every solver agreeing

national monthly round  —  AJPES, Slovenia: 5,880,447 obligations over 111 rounds
  18,831 firms, 51,375 obligations
  routing             1.26 s   certificate verified in 3 ms
  network simplex     2.59 s   certificate verified in 1 ms
  cleared 7.85% of gross, every solver agreeing

published invoice corpus  —  arXiv 2606.26126: 133,191 invoices
  33,540 firms, 122,456 obligations
  routing             4.88 s   certificate verified in 3 ms
  network simplex    31.75 s   certificate verified in 4 ms
  cleared 10.98% of gross, every solver agreeing
```

`npm run bench:scale register` adds a network at the size of the Italian
invoice data used in the Cycles whitepaper: 1.18 million obligations among
554,000 firms. That one took a little over six minutes. It is correct, and its
certificate verifies in 63 ms, but it is not fast. Most of the time goes into
repeated blocking-flow searches within each route length.

Timings vary by machine. The optima do not.

### Who survives — `npm run bench:rescue`

Against ground truth, on networks of four to six parties where every
whole-number clearing can be enumerated:

| | Nothing lost in failure | Failure destroys value |
| --- | --- | --- |
| Networks | 2,993 | 2,993 |
| Search finds the optimum | 99.73% | 99.77% |
| When it misses, off by | 1 party | 1 party |
| Maximum clearing is the optimum | 98.63% | 98.73% |
| Doing nothing is the optimum | 80.65% | 69.16% |
| The floor alone proves the optimum | 89.24% | 87.80% |

At a size the published exact method does not reach. Parties that fail, mean
of ten seeds, lower is better:

```
nothing lost in failure

network                          as owed  maximum  rescue  floor  gap to floor  fewer than max  time
-------------------------------  -------  -------  ------  -----  ------------  --------------  -------
273 firms, 1,687 obligations     26.9     25.5     22.1    20.2   8.6%          13.3%           30 ms
911 firms, 6,510 obligations     98.5     93.1     80.3    76.0   5.4%          13.7%           515 ms
829 firms, 2,828 obligations     81.7     79.3     74.2    71.0   4.3%          6.4%            195 ms
2,733 firms, 18,939 obligations  280.6    269.2    230.0   213.7  7.1%          14.6%           8.9 s

failure destroys value (60% of cash, 80% of receivables recovered)

273 firms, 1,687 obligations     48.4     31.9     26.1    21.2   18.8%         18.2%           81 ms
911 firms, 6,510 obligations     235.4    138.4    104.9   81.9   21.9%         24.2%           1.3 s
829 firms, 2,828 obligations     118.9    105.8    92.3    80.7   12.6%         12.8%           324 ms
2,733 firms, 18,939 obligations  645.3    405.6    303.8   229.1  24.6%         25.1%           17.9 s
```

Healthy firms hold 5% of what they owe as spare cash, and 12% of net-debtor
firms are short of working capital (`balance.ts`).

## Limits

- **`rescue` is a search, not an exact method.** Where it meets the floor the
  result is proven optimal. Elsewhere the only guarantee is the gap shown, and
  where failure destroys value some of that gap is the floor being loose.
- **The balance sheets are synthetic.** Invoice data records who owes whom and
  nothing about who can pay. The benchmark shows the effect exists and roughly
  how large it is under stated assumptions. It is not a forecast.
- **The default model is one period and pro rata.** No secured creditors, no
  order in which payments fall due, and no insolvency court unwinding a set-off
  made shortly before a failure.
- **The largest networks are slow.** A million obligations clears exactly, in
  minutes rather than seconds.
- **Cycle cancelling has an iteration budget** and reports `optimal: false`
  rather than pretending when it hits it. The other two solvers do not need one.
