"""Dose-time arithmetic: time zones, DST gaps and overlaps, cycles, window edges.

Pure functions, so these need no database or HTTP.
"""

from datetime import UTC, date, datetime

import pytest

from app.medications.schedule import (
    ScheduleSpec,
    doses_per_day,
    load_zone,
    local_to_utc,
    occurrences,
    parse_hhmm,
)


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def shown(tz: str, instants) -> list[str]:
    zone = load_zone(tz)
    return [i.astimezone(zone).strftime("%Y-%m-%d %H:%M %Z") for i in instants]


def test_fixed_offset_zone_maps_wall_clock_to_utc():
    spec = ScheduleSpec("Asia/Kolkata", ("08:00", "20:00"), date(2026, 11, 1))
    got = occurrences(spec, utc(2026, 11, 15, 0, 0), utc(2026, 11, 17, 0, 0))
    assert shown("Asia/Kolkata", got) == [
        "2026-11-15 08:00 IST",
        "2026-11-15 20:00 IST",
        "2026-11-16 08:00 IST",
        "2026-11-16 20:00 IST",
    ]
    assert got[0] == utc(2026, 11, 15, 2, 30)


def test_window_start_is_inclusive_and_end_is_exclusive():
    spec = ScheduleSpec("Asia/Kolkata", ("08:00",), date(2026, 11, 1))
    slot = utc(2026, 11, 15, 2, 30)
    assert occurrences(spec, slot, utc(2026, 11, 15, 2, 31)) == [slot]
    assert occurrences(spec, utc(2026, 11, 15, 2, 0), slot) == []
    assert occurrences(spec, utc(2026, 11, 15, 2, 31), utc(2026, 11, 15, 12, 0)) == []


def test_spring_forward_gap_does_not_skip_the_dose():
    # 2026-03-08 in New York: 02:00 jumps to 03:00, so 02:30 never happens locally.
    spec = ScheduleSpec("America/New_York", ("02:30",), date(2026, 3, 1))
    got = occurrences(spec, utc(2026, 3, 8, 0, 0), utc(2026, 3, 9, 12, 0))
    assert shown("America/New_York", got) == ["2026-03-08 03:30 EDT", "2026-03-09 02:30 EDT"]


def test_fall_back_overlap_gives_one_dose_not_two():
    # 2026-11-01 in New York: 01:30 happens twice. The patient is reminded once, at the first.
    spec = ScheduleSpec("America/New_York", ("01:30",), date(2026, 10, 25))
    got = occurrences(spec, utc(2026, 11, 1, 0, 0), utc(2026, 11, 2, 12, 0))
    assert shown("America/New_York", got) == ["2026-11-01 01:30 EDT", "2026-11-02 01:30 EST"]


def test_times_that_collapse_into_one_instant_give_one_dose():
    spec = ScheduleSpec("America/New_York", ("02:30", "03:30"), date(2026, 3, 1))
    assert len(occurrences(spec, utc(2026, 3, 8, 0, 0), utc(2026, 3, 8, 23, 59))) == 1


def test_wall_clock_time_is_stable_across_a_dst_change():
    spec = ScheduleSpec("Europe/London", ("09:00",), date(2026, 10, 1))
    got = occurrences(spec, utc(2026, 10, 24, 0, 0), utc(2026, 10, 28, 0, 0))
    assert shown("Europe/London", got) == [
        "2026-10-24 09:00 BST",
        "2026-10-25 09:00 GMT",
        "2026-10-26 09:00 GMT",
        "2026-10-27 09:00 GMT",
    ]


def test_half_hour_dst_zone():
    spec = ScheduleSpec("Australia/Lord_Howe", ("12:00",), date(2026, 10, 1))
    got = occurrences(spec, utc(2026, 10, 3, 0, 0), utc(2026, 10, 6, 0, 0))
    assert shown("Australia/Lord_Howe", got) == [
        "2026-10-03 12:00 +1030",
        "2026-10-04 12:00 +11",
        "2026-10-05 12:00 +11",
    ]


def test_every_n_days_counts_local_dates_from_the_start_date():
    spec = ScheduleSpec("Asia/Kolkata", ("09:00",), date(2026, 11, 1), every_n_days=2)
    got = occurrences(spec, utc(2026, 11, 1, 0, 0), utc(2026, 11, 8, 0, 0))
    assert [d.day for d in got] == [1, 3, 5, 7]


def test_specific_weekdays():
    spec = ScheduleSpec("Asia/Kolkata", ("09:00",), date(2026, 11, 1), days_of_week=(0, 3))
    got = occurrences(spec, utc(2026, 11, 1, 0, 0), utc(2026, 11, 15, 0, 0))
    assert shown("Asia/Kolkata", got) == [
        "2026-11-02 09:00 IST",  # Monday
        "2026-11-05 09:00 IST",  # Thursday
        "2026-11-09 09:00 IST",
        "2026-11-12 09:00 IST",
    ]


def test_start_and_end_dates_are_inclusive_local_dates():
    spec = ScheduleSpec("Asia/Kolkata", ("09:00",), date(2026, 11, 3), date(2026, 11, 4))
    got = occurrences(spec, utc(2026, 11, 1, 0, 0), utc(2026, 11, 10, 0, 0))
    assert [d.day for d in got] == [3, 4]


def test_local_date_can_differ_from_the_utc_date():
    # 00:30 IST on 3 Nov is 19:00 UTC on 2 Nov.
    spec = ScheduleSpec("Asia/Kolkata", ("00:30",), date(2026, 11, 3), date(2026, 11, 3))
    assert occurrences(spec, utc(2026, 11, 2, 0, 0), utc(2026, 11, 4, 0, 0)) == [
        utc(2026, 11, 2, 19, 0)
    ]


def test_local_to_utc_matches_the_documented_rules():
    ny = load_zone("America/New_York")
    assert local_to_utc(date(2026, 3, 8), parse_hhmm("02:30"), ny) == utc(2026, 3, 8, 7, 30)
    assert local_to_utc(date(2026, 11, 1), parse_hhmm("01:30"), ny) == utc(2026, 11, 1, 5, 30)


@pytest.mark.parametrize(
    "call",
    [
        lambda: occurrences(
            ScheduleSpec("UTC", ("08:00",), date(2026, 1, 1)),
            datetime(2026, 1, 1),
            utc(2026, 1, 2),
        ),
        lambda: load_zone("Mars/Base"),
        lambda: parse_hhmm("8:00"),
        lambda: parse_hhmm("25:00"),
        lambda: parse_hhmm("08:60"),
        lambda: occurrences(
            ScheduleSpec("UTC", ("08:00",), date(2026, 1, 1)), utc(2026, 1, 1), utc(2026, 6, 1)
        ),
    ],
)
def test_bad_input_is_rejected(call):
    with pytest.raises(ValueError):
        call()


def test_doses_per_day_for_supply_estimates():
    base = {"timezone": "Asia/Kolkata", "start_date": date(2026, 1, 1)}
    assert doses_per_day(ScheduleSpec(times=("08:00", "20:00", "08:00"), **base)) == 2
    assert doses_per_day(ScheduleSpec(times=("08:00",), every_n_days=2, **base)) == 0.5
    weekly = doses_per_day(ScheduleSpec(times=("08:00",), days_of_week=(0, 3), **base))
    assert weekly == pytest.approx(2 / 7)
