"""Scan-to-fill parsing: text of a report -> a draft. Pure functions, no database or OCR needed.

The contract these tests pin down: values are copied from the text, never guessed; a range is taken
only when printed beside the value; identifiers are never extracted; unknown stays None.
"""

from datetime import date

import pytest

from app.records.parse import find_date, parse_lab_line, parse_report

TODAY = date(2026, 11, 17)

REPORT = """
SUNRISE DIAGNOSTICS & PATHOLOGY LAB
Plot 12, Saheed Nagar  Ph: 9876543210
Patient Name: Test Person      Age/Sex: 34 / F
Sample Collected: 12/11/2026     Reported: 13/11/2026
COMPLETE BLOOD COUNT (CBC)
Test Name        Result     Unit      Reference Range
Hemoglobin       11.2       g/dL      12.0 - 15.5
Total WBC Count  7,500      /cumm     4000-11000
HbAlc            6.8        %         4.0-5.6
Total Cholesterol 210 H mg/dL (Ref: < 200)
Vitamin D, 25 Hydroxy 24    ng/mL     30 - 100
HDL Cholesterol  38 mg/dL > 40
HIV 1 & 2        Non-reactive
Page 1 of 2
Hemoglobin       11.2       g/dL      12.0 - 15.5
"""


def rows():
    return {r.test_name: r for r in parse_report(REPORT, TODAY).labs}


def test_numeric_rows_carry_value_unit_and_printed_range():
    hb = rows()["Hemoglobin"]
    got = (hb.result, hb.unit, hb.ref_low, hb.ref_high, hb.confidence)
    assert got == ("11.2", "g/dL", 12.0, 15.5, "high")
    wbc = rows()["Total WBC Count"]
    assert (wbc.result, wbc.unit, wbc.ref_low, wbc.ref_high) == ("7500", "/cumm", 4000.0, 11000.0)


def test_one_sided_ranges_and_ocr_noise_in_hba1c():
    r = rows()
    assert (r["Total Cholesterol"].ref_low, r["Total Cholesterol"].ref_high) == (None, 200.0)
    assert (r["HDL Cholesterol"].ref_low, r["HDL Cholesterol"].ref_high) == (40.0, None)
    assert "HbA1c" in r  # "HbAlc" (letter l) is how OCR often reads it


def test_a_number_inside_the_test_name_is_not_the_result():
    row = rows()["Vitamin D, 25 Hydroxy"]
    assert (row.result, row.unit) == ("24", "ng/mL")


def test_text_results_are_kept_as_words():
    row = rows()["HIV 1 & 2"]
    assert row.result == "Non-reactive" and row.unit is None and row.ref_low is None


def test_headers_demographics_and_repeats_are_not_results():
    names = [r.test_name for r in parse_report(REPORT, TODAY).labs]
    banned = ("page", "age", "patient", "plot", "test name")
    assert not any(n.lower().startswith(banned) for n in names)
    assert names.count("Hemoglobin") == 1  # the same row repeated on page 2 is dropped


def test_comparator_values_stay_text_not_numbers():
    row = parse_lab_line("CRP < 0.5 mg/L 0 - 5")
    assert row is not None and row.result == "<0.5"  # a limit, not a measurement


@pytest.mark.parametrize(
    "line",
    [
        "Hemoglobin",
        "Page 2 of 3",
        "Age 34 years",
        "Dr. A. Sharma MD 12345",
        "Result 5",
        "random words only",
    ],
)
def test_lines_that_are_not_results_are_ignored(line):
    assert parse_lab_line(line) is None


def test_nothing_is_invented_for_an_empty_or_unreadable_page():
    out = parse_report("", TODAY)
    assert out.labs == [] and out.record.record_date is None and out.record.title is None
    assert out.record.record_type is None and out.record.provider_name is None


def test_record_draft_fields():
    rec = parse_report(REPORT, TODAY).record
    assert rec.record_type == "lab_report"
    assert rec.title == "COMPLETE BLOOD COUNT"
    assert rec.provider_name == "SUNRISE DIAGNOSTICS & PATHOLOGY LAB"
    assert "Test Person" not in str(rec) and "9876543210" not in str(rec)  # no identifiers


def test_dates_are_day_first_and_ambiguity_is_flagged():
    assert find_date("Collected: 12/11/2026", TODAY) == (date(2026, 11, 12), True)
    assert find_date("Collected: 25/11/2026", date(2026, 12, 1)) == (date(2026, 11, 25), False)
    assert find_date("Reported 3 Nov 2026", TODAY) == (date(2026, 11, 3), False)
    assert find_date("Date: 2026-11-03", TODAY) == (date(2026, 11, 3), False)


def test_collection_date_wins_and_birth_date_is_ignored():
    text = "DOB: 01/02/1990\nReported: 15/11/2026\nSample Collected: 12/11/2026"
    assert find_date(text, TODAY)[0] == date(2026, 11, 12)


def test_future_and_missing_dates_are_never_guessed():
    assert find_date("Collected: 01/01/2030", TODAY) == (None, False)
    assert find_date("no dates here", TODAY) == (None, False)


@pytest.mark.parametrize(
    "text,kind",
    [
        ("DISCHARGE SUMMARY\nDate of discharge 3/11/2026", "discharge_summary"),
        ("X-RAY CHEST PA VIEW\nImpression: clear", "imaging"),
        ("Rx\nTab Metformin 500 mg", "prescription"),
        ("COVID vaccination certificate", "vaccination"),
    ],
)
def test_record_type_is_guessed_from_the_wording(text, kind):
    assert parse_report(text, TODAY).record.record_type == kind
