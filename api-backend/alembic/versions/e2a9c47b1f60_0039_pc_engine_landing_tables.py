"""0039_pc_engine_landing_tables

Revision ID: e2a9c47b1f60
Revises: 3f8a2c17d940
Create Date: 2026-09-11 00:00:00.000000

Brings a local/dev DB up to PRODUCTION's shape for four tables that already
exist there: pc_engine_runs, pc_orders, pc_order_events, pc_trades.

These are a LANDING ZONE, not portal-owned business entities. An external
extraction pipeline writes them -- the rows carry their own provenance
(logical_origin 'lean/PostgresResultsStore', extraction_instance
'amd-db/frozen-precutover', load_batch_id, source_snapshot_utc, loaded_at_utc)
and every key is a SOURCE key (source_run_id, lean_order_id, source_event_id),
never a portal UUID. Same species as ib_activity (0006): the portal reads them,
it does not author them. That is why they break three house conventions on
purpose -- no UUID surrogate PK, no created_at/updated_at, and the naming is
whatever production already calls them.

PRODUCTION-SAFE BY CONSTRUCTION. Production created these tables outside
Alembic, so on production this revision must be a no-op: upgrade() inspects the
live table list and SKIPS any table already present, emitting zero DDL. There is
no ALTER, no DROP, no INSERT, and no CREATE INDEX anywhere in this revision, so
it cannot touch a pre-existing table's schema or rows. The check is per-table
rather than all-or-nothing so a partially-populated dev DB converges too.

DDL transcribed verbatim from production's SHOW CREATE TABLE output, not
inferred from the data export. Type mapping: bigint(20) -> BigInteger,
int(11) -> Integer, int(10) unsigned -> mysql.INTEGER(unsigned=True),
decimal(65,30) -> Numeric(65, 30), decimal(20,8) -> Numeric(20, 8),
datetime(6) -> mysql.DATETIME(fsp=6), char(n) -> CHAR(n), longtext ->
mysql.LONGTEXT. Column order within each table follows production's listing,
and the ENGINE/CHARSET/COLLATE footer is pinned explicitly (see _TABLE_OPTS)
rather than left to the server defaults.

Notes on specific choices, all of them "because production says so":
  - datetime(6), never bare DATETIME. MySQL DATETIME defaults to fsp=0 and every
    *_utc value carries 6 fractional digits; all 391 exported
    pc_engine_runs.started_at_utc values are distinct, so truncating to seconds
    would collide them. (app/models/chat.py:58 flags the same fsp=6 hazard.)
  - decimal(65,30) is MySQL's maximum and far wider than the data needs (max
    observed: 4 integer digits, 6 decimals). Copied as-is; narrowing it would be
    a schema change to production, which is out of scope.
  - NO secondary indexes and NO foreign keys, because production has neither.
    Adding either locally would recreate the exact local/prod divergence this
    revision exists to close, and FKs would additionally reject a partial or
    out-of-order pipeline load. The data does satisfy referential integrity
    (every child run-key resolves to pc_engine_runs, every order-key to
    pc_orders, every pc_trades.source_event_id and
    pc_orders.last_source_event_id to pc_order_events) -- it is just not
    enforced in the DB. If a read path later needs an index, that is its own
    revision, applied to BOTH sides.
  - Everything outside a PK is nullable; production declares no NOT NULL beyond
    what the PK forces. Note end_source is '' (empty string) for most rows, not
    NULL -- loaders must preserve that distinction.
  - pc_order_events is keyed on the row hash source_event_id ALONE. The obvious
    composite (scope_key, source_run_id, lean_order_id, lean_order_event_id,
    identical_ordinal) is NOT unique: lean_order_event_id is always 0 and
    identical_ordinal always 1 in the current batch, giving 110 distinct tuples
    for 249 rows.
  - pc_orders (plural, 4-column PK including symbol) despite the export file
    being named pc_order.json. The table name is what production has.

Data is deliberately NOT loaded here -- see scripts/load_pc_exports.py. Keeping
~871 rows of export out of the version history means the load is re-runnable and
the revision stays reviewable.

downgrade() is a DELIBERATE NO-OP. On production these four tables predate this
revision and hold the live extraction data, so dropping them on a downgrade
would destroy data this revision never created -- the one thing the
production-safety requirement forbids. Same non-reversibility contract as
d5b1e93c7a42 (0037), which documents the limit rather than faking a reversal.
To tear them down on a dev box, drop them by hand.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import mysql

from alembic import op

revision: str = "e2a9c47b1f60"
down_revision: Union[str, Sequence[str], None] = "3f8a2c17d940"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def _dt6() -> mysql.DATETIME:
    """datetime(6) -- microsecond precision is load-bearing, see docstring."""
    return mysql.DATETIME(fsp=6)


def _dec() -> sa.Numeric:
    """decimal(65,30) -- production's width for every quantity/price/fee/cash column."""
    return sa.Numeric(65, 30)


def _uint() -> mysql.INTEGER:
    """int(10) unsigned."""
    return mysql.INTEGER(unsigned=True)


def _instrument() -> list[sa.Column]:
    """The 9-column instrument block, identical on pc_orders/pc_order_events/pc_trades."""
    return [
        sa.Column("security_type", sa.String(32)),
        sa.Column("underlying_symbol", sa.String(32)),
        sa.Column("option_expiry", sa.Date()),
        sa.Column("option_right", sa.CHAR(1)),
        sa.Column("strike_price", sa.Numeric(20, 8)),
        sa.Column("contract_multiplier", sa.Numeric(20, 8)),
        sa.Column("contract_multiplier_source", sa.String(64)),
        sa.Column("quote_currency", sa.CHAR(3)),
        sa.Column("instrument_derivation", sa.String(64)),
    ]


def _provenance() -> list[sa.Column]:
    """The 3-column extraction-provenance tail, on all four tables."""
    return [
        sa.Column("load_batch_id", sa.CHAR(32)),
        sa.Column("source_snapshot_utc", _dt6()),
        sa.Column("loaded_at_utc", _dt6()),
    ]


def _cash() -> list[sa.Column]:
    """The 4 modeled-cash columns shared by pc_orders and pc_trades."""
    return [
        sa.Column(name, _dec())
        for name in (
            "signed_premium_usd",
            "gross_premium_usd",
            "modeled_cash_flow_before_fees_usd",
            "modeled_cash_flow_after_fees_usd",
        )
    ]


def _pc_engine_runs() -> list[sa.Column]:
    return [
        sa.Column("scope_key", sa.String(64), primary_key=True),
        sa.Column("source_run_id", sa.BigInteger(), primary_key=True),
        sa.Column("logical_origin", sa.String(128)),
        sa.Column("extraction_instance", sa.String(128)),
        sa.Column("algorithm_name", sa.String(128)),
        sa.Column("engine_mode", sa.String(16)),
        sa.Column("account_id", sa.String(64)),
        sa.Column("started_at_utc", _dt6()),
        sa.Column("ended_at_utc", _dt6()),
        sa.Column("run_status", sa.String(32)),
        sa.Column("end_source", sa.String(32)),
        *_provenance(),
    ]


def _pc_orders() -> list[sa.Column]:
    return [
        sa.Column("scope_key", sa.String(64), primary_key=True),
        sa.Column("source_run_id", sa.BigInteger(), primary_key=True),
        sa.Column("lean_order_id", sa.BigInteger(), primary_key=True),
        sa.Column("symbol", sa.String(64), primary_key=True),
        sa.Column("account_id", sa.String(64)),
        sa.Column("first_event_utc", _dt6()),
        sa.Column("last_event_utc", _dt6()),
        sa.Column("latest_status", sa.String(32)),
        sa.Column("latest_row_ambiguous", mysql.TINYINT(display_width=1)),
        sa.Column("last_source_event_id", sa.CHAR(64)),
        sa.Column("event_count", _uint()),
        sa.Column("fill_event_count", _uint()),
        sa.Column("net_fill_quantity", _dec()),
        sa.Column("gross_fill_quantity", _dec()),
        sa.Column("gross_fill_price_point_value", _dec()),
        sa.Column("signed_fill_price_point_value", _dec()),
        sa.Column("weighted_average_fill_price", _dec()),
        sa.Column("total_fee_usd", _dec()),
        *_instrument(),
        *_cash(),
        sa.Column("ib_brokerage_ids", sa.Text()),
        sa.Column("strategy_tag", mysql.LONGTEXT()),
        sa.Column("latest_message", mysql.LONGTEXT()),
        *_provenance(),
    ]


def _pc_order_events() -> list[sa.Column]:
    return [
        sa.Column("source_event_id", sa.CHAR(64), primary_key=True),
        sa.Column("identity_method", sa.String(32)),
        sa.Column("lean_order_event_id", sa.Integer()),
        sa.Column("identical_ordinal", _uint()),
        sa.Column("scope_key", sa.String(64)),
        sa.Column("source_run_id", sa.BigInteger()),
        sa.Column("lean_order_id", sa.BigInteger()),
        sa.Column("account_id", sa.String(64)),
        sa.Column("event_utc", _dt6()),
        sa.Column("trade_date_et", sa.Date()),
        sa.Column("symbol", sa.String(64)),
        sa.Column("event_status", sa.String(32)),
        sa.Column("fill_quantity", _dec()),
        sa.Column("fill_price", _dec()),
        sa.Column("fee_usd", _dec()),
        sa.Column("ib_brokerage_ids", sa.Text()),
        sa.Column("strategy_tag", mysql.LONGTEXT()),
        sa.Column("message", mysql.LONGTEXT()),
        *_instrument(),
        *_provenance(),
    ]


def _pc_trades() -> list[sa.Column]:
    return [
        sa.Column("source_event_id", sa.CHAR(64), primary_key=True),
        sa.Column("scope_key", sa.String(64)),
        sa.Column("source_run_id", sa.BigInteger()),
        sa.Column("lean_order_id", sa.BigInteger()),
        sa.Column("symbol", sa.String(64)),
        sa.Column("account_id", sa.String(64)),
        sa.Column("trade_date_et", sa.Date()),
        sa.Column("executed_at_utc", _dt6()),
        sa.Column("fill_status", sa.String(32)),
        sa.Column("side", sa.String(4)),
        sa.Column("execution_class", sa.String(32)),
        sa.Column("fill_quantity_signed", _dec()),
        sa.Column("fill_quantity_abs", _dec()),
        sa.Column("fill_price", _dec()),
        sa.Column("signed_price_point_value", _dec()),
        sa.Column("fee_usd", _dec()),
        *_instrument(),
        *_cash(),
        sa.Column("ib_brokerage_ids", sa.Text()),
        sa.Column("strategy_tag", mysql.LONGTEXT()),
        sa.Column("message", mysql.LONGTEXT()),
        *_provenance(),
    ]


_TABLES = (
    ("pc_engine_runs", _pc_engine_runs),
    ("pc_orders", _pc_orders),
    ("pc_order_events", _pc_order_events),
    ("pc_trades", _pc_trades),
)

# Pinned from production's SHOW CREATE TABLE footer, identical on all four:
#   ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
# Stated explicitly rather than inherited from the server defaults. The dev
# container happens to be configured utf8mb4 / utf8mb4_unicode_ci
# (docker-compose.yml passes --character-set-server / --collation-server), so
# omitting these produces the right result HERE by luck -- on a server with
# different defaults it would silently create a table that does not match
# production, which is the one failure mode this revision exists to prevent.
# Collation is not cosmetic on these tables: scope_key / symbol /
# source_event_id are primary-key columns, so their collation decides row
# identity and join semantics.
_TABLE_OPTS = {
    "mysql_engine": "InnoDB",
    "mysql_charset": "utf8mb4",
    "mysql_collate": "utf8mb4_unicode_ci",
}


def upgrade() -> None:
    # Per-table existence check: on production all four already exist, so this
    # loop emits no DDL at all and the revision only advances alembic_version.
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for name, builder in _TABLES:
        if name in existing:
            logger.info("[0039] %s already exists -- skipping (production path)", name)
            continue
        logger.info("[0039] creating %s", name)
        op.create_table(name, *builder(), **_TABLE_OPTS)


def downgrade() -> None:
    # NOT REVERSIBLE BY DESIGN -- see the docstring. On production these tables
    # predate this revision and hold the live extraction landing data; dropping
    # them here would destroy data upgrade() never created. Drop them by hand on
    # a dev box if you need to.
    logger.warning(
        "[0039] downgrade is a deliberate no-op; drop the pc_* tables by hand on dev if needed"
    )
