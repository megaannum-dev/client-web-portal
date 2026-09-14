"""ORM models for the pc_* landing tables (migration 0039).

These four tables (pc_engine_runs, pc_orders, pc_order_events, pc_trades) are
authored by an external extraction pipeline, not by the portal. The portal
only READS them -- migration 0039's upgrade() skips creating any of these
tables that already exist (production has them), and its downgrade() is a
deliberate no-op (dropping them would destroy live extraction data upgrade()
never created). Nothing in this app should INSERT/UPDATE/DELETE against these
models; read-only intent is enforced by convention, not by hiding the tables
from Base.metadata -- doing that would make `alembic revision --autogenerate`
emit `op.drop_table()` for real, populated production tables.

Column set, types, and PKs are mirrored exactly from
alembic/versions/e2a9c47b1f60_0039_pc_engine_landing_tables.py. See that
migration's docstring for the full provenance/rationale. As there, everything
outside a PK is nullable, there are no FKs, and there is no created_at /
updated_at -- these break house conventions on purpose because the rows
themselves are external.
"""

from sqlalchemy import CHAR, BigInteger, Boolean, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# decimal(65,30) -- production's width for every quantity/price/fee/cash column.
_DEC = Numeric(65, 30)
# datetime(6) -- microsecond precision is load-bearing (see migration docstring).
_DT6 = DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
# int(10) unsigned.
_UINT = Integer().with_variant(mysql.INTEGER(unsigned=True), "mysql")
# longtext -- MySQL-only widening of Text.
_LONGTEXT = Text().with_variant(mysql.LONGTEXT(), "mysql")
# tinyint(1) -- MySQL's boolean representation for latest_row_ambiguous.
_BOOL = Boolean().with_variant(mysql.TINYINT(display_width=1), "mysql")


class PcEngineRun(Base):
    """pc_engine_runs -- PK (scope_key, source_run_id)."""

    __tablename__ = "pc_engine_runs"

    scope_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_run_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    logical_origin: Mapped[str | None] = mapped_column(String(128))
    extraction_instance: Mapped[str | None] = mapped_column(String(128))
    algorithm_name: Mapped[str | None] = mapped_column(String(128))
    engine_mode: Mapped[str | None] = mapped_column(String(16))
    account_id: Mapped[str | None] = mapped_column(String(64))
    started_at_utc: Mapped[object | None] = mapped_column(_DT6)
    ended_at_utc: Mapped[object | None] = mapped_column(_DT6)
    run_status: Mapped[str | None] = mapped_column(String(32))
    end_source: Mapped[str | None] = mapped_column(String(32))
    load_batch_id: Mapped[str | None] = mapped_column(CHAR(32))
    source_snapshot_utc: Mapped[object | None] = mapped_column(_DT6)
    loaded_at_utc: Mapped[object | None] = mapped_column(_DT6)


class PcOrder(Base):
    """pc_orders -- PK (scope_key, source_run_id, lean_order_id, symbol)."""

    __tablename__ = "pc_orders"

    scope_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_run_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lean_order_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    symbol: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str | None] = mapped_column(String(64))
    first_event_utc: Mapped[object | None] = mapped_column(_DT6)
    last_event_utc: Mapped[object | None] = mapped_column(_DT6)
    latest_status: Mapped[str | None] = mapped_column(String(32))
    latest_row_ambiguous: Mapped[bool | None] = mapped_column(_BOOL)
    last_source_event_id: Mapped[str | None] = mapped_column(CHAR(64))
    event_count: Mapped[int | None] = mapped_column(_UINT)
    fill_event_count: Mapped[int | None] = mapped_column(_UINT)
    net_fill_quantity: Mapped[object | None] = mapped_column(_DEC)
    gross_fill_quantity: Mapped[object | None] = mapped_column(_DEC)
    gross_fill_price_point_value: Mapped[object | None] = mapped_column(_DEC)
    signed_fill_price_point_value: Mapped[object | None] = mapped_column(_DEC)
    weighted_average_fill_price: Mapped[object | None] = mapped_column(_DEC)
    total_fee_usd: Mapped[object | None] = mapped_column(_DEC)
    # -- instrument block --
    security_type: Mapped[str | None] = mapped_column(String(32))
    underlying_symbol: Mapped[str | None] = mapped_column(String(32))
    option_expiry: Mapped[object | None] = mapped_column(Date)
    option_right: Mapped[str | None] = mapped_column(CHAR(1))
    strike_price: Mapped[object | None] = mapped_column(Numeric(20, 8))
    contract_multiplier: Mapped[object | None] = mapped_column(Numeric(20, 8))
    contract_multiplier_source: Mapped[str | None] = mapped_column(String(64))
    quote_currency: Mapped[str | None] = mapped_column(CHAR(3))
    instrument_derivation: Mapped[str | None] = mapped_column(String(64))
    # -- cash block --
    signed_premium_usd: Mapped[object | None] = mapped_column(_DEC)
    gross_premium_usd: Mapped[object | None] = mapped_column(_DEC)
    modeled_cash_flow_before_fees_usd: Mapped[object | None] = mapped_column(_DEC)
    modeled_cash_flow_after_fees_usd: Mapped[object | None] = mapped_column(_DEC)
    ib_brokerage_ids: Mapped[str | None] = mapped_column(Text)
    strategy_tag: Mapped[str | None] = mapped_column(_LONGTEXT)
    latest_message: Mapped[str | None] = mapped_column(_LONGTEXT)
    # -- provenance block --
    load_batch_id: Mapped[str | None] = mapped_column(CHAR(32))
    source_snapshot_utc: Mapped[object | None] = mapped_column(_DT6)
    loaded_at_utc: Mapped[object | None] = mapped_column(_DT6)


class PcOrderEvent(Base):
    """pc_order_events -- PK source_event_id (row hash; see migration docstring
    for why the obvious composite key is NOT unique)."""

    __tablename__ = "pc_order_events"

    source_event_id: Mapped[str] = mapped_column(CHAR(64), primary_key=True)
    identity_method: Mapped[str | None] = mapped_column(String(32))
    lean_order_event_id: Mapped[int | None] = mapped_column(Integer)
    identical_ordinal: Mapped[int | None] = mapped_column(_UINT)
    scope_key: Mapped[str | None] = mapped_column(String(64))
    source_run_id: Mapped[int | None] = mapped_column(BigInteger)
    lean_order_id: Mapped[int | None] = mapped_column(BigInteger)
    account_id: Mapped[str | None] = mapped_column(String(64))
    event_utc: Mapped[object | None] = mapped_column(_DT6)
    trade_date_et: Mapped[object | None] = mapped_column(Date)
    symbol: Mapped[str | None] = mapped_column(String(64))
    event_status: Mapped[str | None] = mapped_column(String(32))
    fill_quantity: Mapped[object | None] = mapped_column(_DEC)
    fill_price: Mapped[object | None] = mapped_column(_DEC)
    fee_usd: Mapped[object | None] = mapped_column(_DEC)
    ib_brokerage_ids: Mapped[str | None] = mapped_column(Text)
    strategy_tag: Mapped[str | None] = mapped_column(_LONGTEXT)
    message: Mapped[str | None] = mapped_column(_LONGTEXT)
    # -- instrument block --
    security_type: Mapped[str | None] = mapped_column(String(32))
    underlying_symbol: Mapped[str | None] = mapped_column(String(32))
    option_expiry: Mapped[object | None] = mapped_column(Date)
    option_right: Mapped[str | None] = mapped_column(CHAR(1))
    strike_price: Mapped[object | None] = mapped_column(Numeric(20, 8))
    contract_multiplier: Mapped[object | None] = mapped_column(Numeric(20, 8))
    contract_multiplier_source: Mapped[str | None] = mapped_column(String(64))
    quote_currency: Mapped[str | None] = mapped_column(CHAR(3))
    instrument_derivation: Mapped[str | None] = mapped_column(String(64))
    # -- provenance block --
    load_batch_id: Mapped[str | None] = mapped_column(CHAR(32))
    source_snapshot_utc: Mapped[object | None] = mapped_column(_DT6)
    loaded_at_utc: Mapped[object | None] = mapped_column(_DT6)


class PcTrade(Base):
    """pc_trades -- PK source_event_id."""

    __tablename__ = "pc_trades"

    source_event_id: Mapped[str] = mapped_column(CHAR(64), primary_key=True)
    scope_key: Mapped[str | None] = mapped_column(String(64))
    source_run_id: Mapped[int | None] = mapped_column(BigInteger)
    lean_order_id: Mapped[int | None] = mapped_column(BigInteger)
    symbol: Mapped[str | None] = mapped_column(String(64))
    account_id: Mapped[str | None] = mapped_column(String(64))
    trade_date_et: Mapped[object | None] = mapped_column(Date)
    executed_at_utc: Mapped[object | None] = mapped_column(_DT6)
    fill_status: Mapped[str | None] = mapped_column(String(32))
    side: Mapped[str | None] = mapped_column(String(4))
    execution_class: Mapped[str | None] = mapped_column(String(32))
    fill_quantity_signed: Mapped[object | None] = mapped_column(_DEC)
    fill_quantity_abs: Mapped[object | None] = mapped_column(_DEC)
    fill_price: Mapped[object | None] = mapped_column(_DEC)
    signed_price_point_value: Mapped[object | None] = mapped_column(_DEC)
    fee_usd: Mapped[object | None] = mapped_column(_DEC)
    # -- instrument block --
    security_type: Mapped[str | None] = mapped_column(String(32))
    underlying_symbol: Mapped[str | None] = mapped_column(String(32))
    option_expiry: Mapped[object | None] = mapped_column(Date)
    option_right: Mapped[str | None] = mapped_column(CHAR(1))
    strike_price: Mapped[object | None] = mapped_column(Numeric(20, 8))
    contract_multiplier: Mapped[object | None] = mapped_column(Numeric(20, 8))
    contract_multiplier_source: Mapped[str | None] = mapped_column(String(64))
    quote_currency: Mapped[str | None] = mapped_column(CHAR(3))
    instrument_derivation: Mapped[str | None] = mapped_column(String(64))
    # -- cash block --
    signed_premium_usd: Mapped[object | None] = mapped_column(_DEC)
    gross_premium_usd: Mapped[object | None] = mapped_column(_DEC)
    modeled_cash_flow_before_fees_usd: Mapped[object | None] = mapped_column(_DEC)
    modeled_cash_flow_after_fees_usd: Mapped[object | None] = mapped_column(_DEC)
    ib_brokerage_ids: Mapped[str | None] = mapped_column(Text)
    strategy_tag: Mapped[str | None] = mapped_column(_LONGTEXT)
    message: Mapped[str | None] = mapped_column(_LONGTEXT)
    # -- provenance block --
    load_batch_id: Mapped[str | None] = mapped_column(CHAR(32))
    source_snapshot_utc: Mapped[object | None] = mapped_column(_DT6)
    loaded_at_utc: Mapped[object | None] = mapped_column(_DT6)
