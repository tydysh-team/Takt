import hashlib
import hmac
import math
import time
from asyncio import Lock
from collections import defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class RateLimitResult:
    allowed: bool
    retry_after: int = 0


class RateLimiter(Protocol):
    async def check(
        self,
        *,
        scope: str,
        subject_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitResult: ...


class InMemoryRateLimiter:
    """Single-process baseline that stores only keyed hashes, replaceable by Redis."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    async def check(
        self,
        *,
        scope: str,
        subject_key: str,
        limit: int,
        window_seconds: int,
    ) -> RateLimitResult:
        now = self._clock()
        bucket_key = f"{scope}:{subject_key}"
        cutoff = now - window_seconds

        async with self._lock:
            events = self._events[bucket_key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, math.ceil(window_seconds - (now - events[0])))
                return RateLimitResult(allowed=False, retry_after=retry_after)
            events.append(now)
            return RateLimitResult(allowed=True)


class RateLimitKeyFactory:
    def __init__(self, hmac_key: str) -> None:
        self._key = hmac_key.encode()

    def for_ip(self, ip_address: str) -> str:
        return hmac.new(self._key, ip_address.encode(), hashlib.sha256).hexdigest()

