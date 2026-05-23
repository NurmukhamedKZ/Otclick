import os
import random

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service")
os.environ.setdefault("FERNET_KEY", "kPpDeJjFqDppkMm6QHzqFkkSgFwsKtGzh4WeZ5dKZHc=")


def test_next_delay_within_bounds():
    from app.worker.throttle import DELAY_MAX_S, DELAY_MIN_S, next_delay

    rng = random.Random(42)
    for _ in range(500):
        d = next_delay(rng)
        assert DELAY_MIN_S <= d <= DELAY_MAX_S


def test_next_delay_clamps_extremes():
    from app.worker import throttle

    class HighRng:
        def lognormvariate(self, mu, sigma):
            return 10_000.0

    class LowRng:
        def lognormvariate(self, mu, sigma):
            return 0.001

    assert throttle.next_delay(HighRng()) == throttle.DELAY_MAX_S
    assert throttle.next_delay(LowRng()) == throttle.DELAY_MIN_S


def test_session_cluster_target_in_range():
    from app.worker.throttle import CLUSTER_MAX, CLUSTER_MIN, SessionCluster

    for seed in range(20):
        c = SessionCluster(rng=random.Random(seed))
        assert CLUSTER_MIN <= c.target <= CLUSTER_MAX


def test_session_cluster_triggers_break_after_target():
    from app.worker.throttle import BREAK_MAX_S, BREAK_MIN_S, SessionCluster

    c = SessionCluster(rng=random.Random(1))
    target = c.target
    for _ in range(target - 1):
        c.record_apply()
        assert not c.should_break()
    c.record_apply()
    assert c.should_break()

    delay = c.next_break_seconds()
    assert BREAK_MIN_S <= delay <= BREAK_MAX_S
    # counters reset to next cluster.
    assert c.count == 0
    assert c.target > 0
