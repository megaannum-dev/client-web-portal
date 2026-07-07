"""BE-3 unit test: symbol audit DTOs (schema-only; no ORM/DB).

Full integration coverage (GET .../include=symbol_audit) lands with BE-5's
routes + service; this test only proves the DTOs themselves are correct.
Run: .venv/Scripts/python.exe -m pytest -q app/libs/trade_models/test_schemas.py
"""

from datetime import datetime

from app.libs.trade_models.schemas import (
    ModelDetailOut,
    SymbolAddIn,
    SymbolAuditOut,
    SymbolOut,
    SymbolPatchIn,
)


def test_symbol_out_has_active():
    # default
    assert SymbolOut(symbol="AAPL").active is True
    # explicit, and from_attributes round-trip (mirrors ORM row access)
    class Row:
        symbol = "MSFT"
        weight = None
        active = False

    out = SymbolOut.model_validate(Row())
    assert out.active is False
    assert out.symbol == "MSFT"


def test_symbol_audit_out_round_trip():
    class Row:
        symbol = "NVDA"
        op = "added"
        note = "Initial universe"
        actor = "uid-123"
        version = "v1"
        created_at = datetime(2026, 7, 7)

    audit = SymbolAuditOut.model_validate(Row())
    assert audit.op == "added"
    assert audit.symbol == "NVDA"


def test_model_detail_out_symbol_audit_field():
    audit = SymbolAuditOut(
        symbol="NVDA", op="added", note=None, actor=None, version=None,
        created_at=datetime(2026, 7, 7),
    )
    detail = ModelDetailOut(
        id="00000000-0000-0000-0000-000000000000",
        name="M",
        subscription_redemption=None,
        model_size=None,
        status="draft",
        version=None,
        created_at=datetime(2026, 7, 7),
        updated_at=datetime(2026, 7, 7),
        symbol_audit=[audit],
    )
    assert detail.symbol_audit == [audit]

    # default is None when not requested (not attached via `include`)
    detail_no_audit = ModelDetailOut(
        id="00000000-0000-0000-0000-000000000000",
        name="M",
        subscription_redemption=None,
        model_size=None,
        status="draft",
        version=None,
        created_at=datetime(2026, 7, 7),
        updated_at=datetime(2026, 7, 7),
    )
    assert detail_no_audit.symbol_audit is None


def test_symbol_add_and_patch_in_bodies():
    assert SymbolAddIn(symbol="qqq").symbol == "qqq"
    assert SymbolPatchIn(active=False).active is False


if __name__ == "__main__":
    test_symbol_out_has_active()
    test_symbol_audit_out_round_trip()
    test_model_detail_out_symbol_audit_field()
    test_symbol_add_and_patch_in_bodies()
    print("ok")
