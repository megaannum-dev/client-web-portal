"""Self-check for fix_mojibake_filename (contact-log / KYC doc uploads).

Run: .venv/Scripts/python.exe -m pytest -q app/libs/onboarding/test_service_mojibake.py
"""

from app.libs.onboarding.service import fix_mojibake_filename


def test_repairs_utf8_filename_decoded_as_latin1():
    mangled = "見士報告_0818.m4a".encode("utf-8").decode("latin-1")
    assert fix_mojibake_filename(mangled) == "見士報告_0818.m4a"


def test_leaves_ascii_filename_unchanged():
    assert fix_mojibake_filename("report_0818.pdf") == "report_0818.pdf"


def test_passes_none_through():
    assert fix_mojibake_filename(None) is None
