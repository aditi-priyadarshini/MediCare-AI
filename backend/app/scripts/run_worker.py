"""Run the reminder worker.

    python -m app.scripts.run_worker            # loop forever (one tick per interval)
    python -m app.scripts.run_worker --once     # a single tick, for cron or debugging

A PostgreSQL advisory lock keeps two workers from ticking at once; even without it a tick is
idempotent, so the lock only saves duplicate work.
"""

import argparse
import logging
import signal
import time
from datetime import UTC, datetime

from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import make_engine, make_sessionmaker
from app.core.logging import configure_logging
from app.identity.providers import MemoryEmailProvider, SmtpEmailProvider
from app.medications.worker import tick

log = logging.getLogger("app.worker")
LOCK_KEY = 727_001
_stop = False


def _request_stop(*_):
    global _stop
    _stop = True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    configure_logging(settings.log_level)
    engine = make_engine(settings.database_url)
    sessions = make_sessionmaker(engine)
    email = (
        MemoryEmailProvider()
        if settings.email_backend == "memory"
        else SmtpEmailProvider(settings.smtp_host, settings.smtp_port, settings.smtp_from)
    )
    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)

    while not _stop:
        # The lock is held by this connection for the duration of the tick.
        with engine.connect() as lock_conn:
            got = lock_conn.execute(
                text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY}
            ).scalar()
            if got:
                try:
                    with sessions() as db:
                        stats = tick(db, datetime.now(UTC), email, settings)
                    summary = (
                        f"doses={stats.doses_created} notifications={stats.notifications_created} "
                        f"delivered={stats.delivered} emails={stats.emails_sent}"
                    )
                    log.info("worker_tick", extra={"event": summary})
                except Exception as exc:  # keep the loop alive
                    log.error("worker_tick_failed", extra={"event": type(exc).__name__})
                finally:
                    lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
                    lock_conn.commit()
            else:
                lock_conn.rollback()
        if args.once:
            break
        for _ in range(settings.worker_interval_seconds):
            if _stop:
                break
            time.sleep(1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
