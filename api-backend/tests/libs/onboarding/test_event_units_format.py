"""Client event text shows unit counts without the multiplier column's 10-dp padding."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.libs.onboarding.service import _units


@pytest.mark.parametrize(
    "value, expected",
    [
        (Decimal("1.0000000000"), "1"),
        (Decimal("2.5000000000"), "2.5"),
        (Decimal("10.0000000000"), "10"),  # normalize() alone would give 1E+1
        (Decimal("0.0000000001"), "0.0000000001"),
        (3, "3"),
    ],
)
def test_units_strips_trailing_zeros_without_scientific_notation(value, expected):
    assert _units(value) == expected
