"""trades dedup keys on tradeID alone, so a missing tradeID must raise.

Every row without one keys to the same None, which would make _dedupe_fresh
keep the first and silently discard the rest. MySQL allows many NULLs in a
unique index, so uq_trades_tradeID is not a backstop for this either. The
guard runs before engine.begin(), so these cases need no database.
"""

import pytest

from app.core import flex_import


def _trade(trade_id):
    return {"tradeID": trade_id, "orderID": "1", "symbol": "SPY"}


@pytest.mark.parametrize("missing", [None, ""])
def test_trade_row_without_a_trade_id_raises_before_any_db_work(missing):
    with pytest.raises(ValueError, match="tradeID"):
        flex_import.load(
            [], [_trade("897816102"), _trade(missing)], [], mode="append", batch_size=10
        )


def test_absent_key_counts_as_missing():
    with pytest.raises(ValueError, match="tradeID"):
        flex_import.load([], [{"orderID": "1"}], [], mode="append", batch_size=10)

