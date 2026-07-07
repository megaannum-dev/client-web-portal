"""BE-1 unit test: edit_model bulk-symbols diff deactivates dropped symbols
and logs the audit trail (never hard-deletes).

`list_symbol_audit` is BE-2's method (not yet implemented on this branch), so
this test reads `ModelSymbolAudit` rows directly via the session — same
behavior, no BE-2 dependency.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/trade_models/test_service_symbol_audit.py
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.libs.trade_models.schemas import SymbolIn
from app.libs.trade_models.service import ModelService
from app.models.pc import ModelSymbolAudit


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def service(session):
    return ModelService(session, storage=None)


@pytest.fixture
def actor():
    return "uid-123"


def test_edit_drop_symbol_deactivates_and_logs(service, actor):
    m = service.create_model(name="M", symbols=[SymbolIn(symbol="AAPL")], actor=actor)
    service.edit_model(m.id, symbols=[], actor=actor)

    row = next(s for s in service.get_model(m.id).symbols if s.symbol == "AAPL")
    assert row.active is False  # deactivated, not deleted

    audit = service.db.query(ModelSymbolAudit).filter_by(model_id=m.id).all()
    assert any(a.op.value == "deactivated" and a.symbol == "AAPL" for a in audit)


def test_add_activate_remove_ops(service, actor):
    m = service.create_model(name="M", symbols=[], actor=actor)
    service.add_symbol(m.id, "nvda", actor=actor)  # lowercased in -> NVDA
    assert any(s.symbol == "NVDA" and s.active for s in service.get_model(m.id).symbols)

    service.set_symbol_active(m.id, "NVDA", False, actor=actor)
    service.remove_symbol(m.id, "NVDA", actor=actor)
    assert all(s.symbol != "NVDA" for s in service.get_model(m.id).symbols)  # row gone

    ops = [a.op.value for a in service.list_symbol_audit(m.id) if a.symbol == "NVDA"]
    assert ops == ["removed", "deactivated", "added"]  # newest-first


if __name__ == "__main__":
    from sqlalchemy import create_engine as _ce
    from sqlalchemy.orm import sessionmaker as _sm

    _engine = _ce("sqlite:///:memory:")
    Base.metadata.create_all(_engine)
    _db = _sm(bind=_engine)()
    _service = ModelService(_db, storage=None)
    test_edit_drop_symbol_deactivates_and_logs(_service, "uid-123")
    print("ok")
