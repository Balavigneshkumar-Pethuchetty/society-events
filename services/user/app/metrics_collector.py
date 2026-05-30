"""
Background asyncio task that reads host CPU + memory from /proc every 60 s
and ships to Splunk (society_metrics index).  Runs inside the user-service
container so the numbers reflect the host WSL2 system.
"""
import asyncio
import logging
import time as _time

from app.splunk_logger import _payload, _ship

logger = logging.getLogger(__name__)

_INTERVAL = 60  # seconds


def _cpu_snapshot() -> tuple[int, int]:
    """Return (total_jiffies, idle_jiffies) from /proc/stat cpu line."""
    try:
        with open("/proc/stat") as f:
            parts = f.readline().split()
        vals = list(map(int, parts[1:]))
        return sum(vals), vals[3] + (vals[4] if len(vals) > 4 else 0)  # idle + iowait
    except Exception:
        return 0, 0


def _memory_stats() -> dict:
    mem: dict[str, int] = {}
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                k, *rest = line.split()
                if rest:
                    mem[k.rstrip(":")] = int(rest[0])
    except Exception:
        pass
    total     = mem.get("MemTotal", 0)
    available = mem.get("MemAvailable", 0)
    used      = total - available
    return {
        "memory_total_mb":     round(total / 1024),
        "memory_used_mb":      round(used / 1024),
        "memory_available_mb": round(available / 1024),
        "memory_percent":      round(used / total * 100, 1) if total else 0,
    }


async def collect_metrics() -> None:
    """Runs forever; safe to cancel on shutdown."""
    while True:
        try:
            t1_total, t1_idle = _cpu_snapshot()
            await asyncio.sleep(_INTERVAL)
            t2_total, t2_idle = _cpu_snapshot()

            d_total = t2_total - t1_total
            d_idle  = t2_idle  - t1_idle
            cpu_pct = round((1 - d_idle / d_total) * 100, 1) if d_total else 0.0

            event = {
                "metric_type":   "system",
                "cpu_percent":   cpu_pct,
                **_memory_stats(),
            }
            await _ship(_payload(event, "society_metrics"))
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.debug("metrics_collector error: %s", exc)
            await asyncio.sleep(_INTERVAL)
