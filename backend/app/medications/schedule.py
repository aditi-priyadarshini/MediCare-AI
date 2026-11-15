"""Dose-time arithmetic. Pure standard library so it can be tested without a database.

A schedule is a set of *local wall-clock* times in an IANA time zone. Each occurrence is
resolved to a UTC instant with these rules, which the tests pin down:

* Normal day: the wall-clock time maps to exactly one instant.
* Spring-forward gap (the local time does not exist, e.g. 02:30 on the day clocks jump from
  02:00 to 03:00): the dose happens at the same elapsed time as if the clock had not jumped,
  which displays as the first valid minute after the gap (03:30 local in that example). It is
  never skipped.
* Fall-back overlap (the local time happens twice): the dose happens once, at the first
  occurrence. A patient is never reminded twice for one scheduled dose.
* Two times that collapse to the same instant (gap collisions) yield one dose, not two.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

MAX_WINDOW_DAYS = 60


@dataclass(frozen=True)
class ScheduleSpec:
    timezone: str
    times: tuple[str, ...]  # "HH:MM", 24-hour local wall-clock
    start_date: date  # local date, inclusive
    end_date: date | None = None  # local date, inclusive
    days_of_week: tuple[int, ...] | None = None  # Monday=0 .. Sunday=6; None = every day
    every_n_days: int = 1  # 1 = daily; n counts local dates from start_date


def load_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError) as exc:
        raise ValueError("Unknown timezone.") from exc


def parse_hhmm(value: str) -> time:
    try:
        hh, mm = value.split(":")
        if len(hh) != 2 or len(mm) != 2:
            raise ValueError
        return time(int(hh), int(mm))
    except (ValueError, AttributeError):
        raise ValueError(f"Invalid time '{value}'. Use HH:MM.") from None


def local_to_utc(day: date, at: time, zone: ZoneInfo) -> datetime:
    """Resolve a local date and wall-clock time to a UTC instant (see module rules).

    fold=0 selects the first occurrence in an overlap and, for a time inside a gap, applies
    the offset that was in force before the transition (PEP 495).
    """
    return datetime.combine(day, at, tzinfo=zone).astimezone(UTC)


def occurrences(spec: ScheduleSpec, start_utc: datetime, end_utc: datetime) -> list[datetime]:
    """UTC dose instants with start_utc <= instant < end_utc, sorted and de-duplicated."""
    if start_utc.tzinfo is None or end_utc.tzinfo is None:
        raise ValueError("Window bounds must be timezone-aware.")
    if end_utc <= start_utc:
        return []
    if end_utc - start_utc > timedelta(days=MAX_WINDOW_DAYS):
        raise ValueError("Window is too large.")
    zone = load_zone(spec.timezone)
    times = sorted({parse_hhmm(t) for t in spec.times})
    # One local day of slack each side covers every UTC offset change inside the window.
    first = start_utc.astimezone(zone).date() - timedelta(days=1)
    last = end_utc.astimezone(zone).date() + timedelta(days=1)
    day = max(first, spec.start_date)
    if spec.end_date is not None:
        last = min(last, spec.end_date)
    found: set[datetime] = set()
    while day <= last:
        in_cycle = (day - spec.start_date).days % max(spec.every_n_days, 1) == 0
        on_weekday = spec.days_of_week is None or day.weekday() in spec.days_of_week
        if in_cycle and on_weekday:
            for at in times:
                instant = local_to_utc(day, at, zone)
                if start_utc <= instant < end_utc:
                    found.add(instant)
        day += timedelta(days=1)
    return sorted(found)


def doses_per_day(spec: ScheduleSpec) -> float:
    """Average doses per day, used to estimate how long a supply lasts."""
    distinct = len({parse_hhmm(t) for t in spec.times})
    weekday_share = (len(set(spec.days_of_week)) / 7) if spec.days_of_week else 1.0
    return distinct * weekday_share / max(spec.every_n_days, 1)
