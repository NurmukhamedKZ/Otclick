"""Human-like throttling: log-normal per-apply delay + session clusters."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

# Per-apply delay distribution.
DELAY_MEAN_S = 8.0
DELAY_SIGMA = 0.5
DELAY_MIN_S = 3.0
DELAY_MAX_S = 30.0

# Session cluster: N applies then a long break.
CLUSTER_MIN = 15
CLUSTER_MAX = 30
BREAK_MIN_S = 60 * 60       # 1h
BREAK_MAX_S = 2 * 60 * 60   # 2h


def next_delay(rng: random.Random | None = None) -> float:
    """Sample log-normal delay clamped to [DELAY_MIN_S, DELAY_MAX_S]."""
    r = rng or random
    # lognorm(mean=8s, sigma=0.5) — `mean` here = median (exp(mu)).
    mu = math.log(DELAY_MEAN_S)
    raw = r.lognormvariate(mu, DELAY_SIGMA)
    return max(DELAY_MIN_S, min(DELAY_MAX_S, raw))


@dataclass
class SessionCluster:
    """Tracks current cluster: trigger long break after `target` applies."""

    rng: random.Random = field(default_factory=random.Random)
    target: int = 0
    count: int = 0

    def __post_init__(self) -> None:
        if self.target == 0:
            self.target = self.rng.randint(CLUSTER_MIN, CLUSTER_MAX)

    def record_apply(self) -> None:
        self.count += 1

    def should_break(self) -> bool:
        return self.count >= self.target

    def next_break_seconds(self) -> float:
        delay = self.rng.uniform(BREAK_MIN_S, BREAK_MAX_S)
        self.count = 0
        self.target = self.rng.randint(CLUSTER_MIN, CLUSTER_MAX)
        return delay
