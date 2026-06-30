"""0009 pc workspace db refactor — IB staging split, models prospectus fields,
materials versioning, model symbols, allocation period models, precision types,
composite indexes.

Revision ID: f0e1d2c3b4a5
Revises: e5f6a7b8c9d0
Create Date: 2026-06-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "f0e1d2c3b4a5"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # B-1 step 1 — CREATE orders, trades, symbol_summaries
    # -------------------------------------------------------------------------
    _trade_row_cols = [
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        # Numeric(28,10) columns
        sa.Column("accruedInt", sa.Numeric(28, 10), nullable=True),
        sa.Column("amount", sa.Numeric(28, 10), nullable=True),
        sa.Column("brokerClearingCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("brokerExecutionCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("commission", sa.Numeric(28, 10), nullable=True),
        sa.Column("fineness", sa.Numeric(28, 10), nullable=True),
        sa.Column("multiplier", sa.Numeric(28, 10), nullable=True),
        sa.Column("netCash", sa.Numeric(28, 10), nullable=True),
        sa.Column("netCashWithBillable", sa.Numeric(28, 10), nullable=True),
        sa.Column("origTradePrice", sa.Numeric(28, 10), nullable=True),
        sa.Column("otherCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("otherTax", sa.Numeric(28, 10), nullable=True),
        sa.Column("price", sa.Numeric(28, 10), nullable=True),
        sa.Column("principalAdjustFactor", sa.Numeric(28, 10), nullable=True),
        sa.Column("proceeds", sa.Numeric(28, 10), nullable=True),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=True),
        sa.Column("salesTax", sa.Numeric(28, 10), nullable=True),
        sa.Column("strike", sa.Numeric(28, 10), nullable=True),
        sa.Column("tax", sa.Numeric(28, 10), nullable=True),
        sa.Column("thirdPartyClearingCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("thirdPartyExecutionCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("thirdPartyRegulatoryCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("tradeCharge", sa.Numeric(28, 10), nullable=True),
        sa.Column("weight", sa.Numeric(28, 10), nullable=True),
        # Date String(8) columns
        sa.Column("fromDate", sa.String(8), nullable=True),
        sa.Column("toDate", sa.String(8), nullable=True),
        sa.Column("expiry", sa.String(8), nullable=True),
        sa.Column("origTradeDate", sa.String(8), nullable=True),
        sa.Column("reportDate", sa.String(8), nullable=True),
        sa.Column("settleDate", sa.String(8), nullable=True),
        sa.Column("tradeDate", sa.String(8), nullable=True),
        # Datetime String(20) columns
        sa.Column("whenGenerated", sa.String(20), nullable=True),
        sa.Column("dateTime", sa.String(20), nullable=True),
        sa.Column("orderTime", sa.String(20), nullable=True),
        # Text columns
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("issuer", sa.Text(), nullable=True),
        # String(255) columns
        sa.Column("accountId", sa.String(255), nullable=True),
        sa.Column("acctAlias", sa.String(255), nullable=True),
        sa.Column("allocatedTo", sa.String(255), nullable=True),
        sa.Column("assetCategory", sa.String(255), nullable=True),
        sa.Column("blockID", sa.String(255), nullable=True),
        sa.Column("brokerageOrderID", sa.String(255), nullable=True),
        sa.Column("buySell", sa.String(255), nullable=True),
        sa.Column("clearingFirmID", sa.String(255), nullable=True),
        sa.Column("code", sa.String(255), nullable=True),
        sa.Column("commissionCurrency", sa.String(255), nullable=True),
        sa.Column("commodityType", sa.String(255), nullable=True),
        sa.Column("conid", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(255), nullable=True),
        sa.Column("cusip", sa.String(255), nullable=True),
        sa.Column("deliveryType", sa.String(255), nullable=True),
        sa.Column("execID", sa.String(255), nullable=True),
        sa.Column("exchange", sa.String(255), nullable=True),
        sa.Column("extExecID", sa.String(255), nullable=True),
        sa.Column("figi", sa.String(255), nullable=True),
        sa.Column("isAPIOrder", sa.String(255), nullable=True),
        sa.Column("isin", sa.String(255), nullable=True),
        sa.Column("issuerCountryCode", sa.String(255), nullable=True),
        sa.Column("levelOfDetail", sa.String(255), nullable=True),
        sa.Column("listingExchange", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("orderID", sa.String(255), nullable=True),
        sa.Column("orderReference", sa.String(255), nullable=True),
        sa.Column("orderType", sa.String(255), nullable=True),
        sa.Column("origTradeID", sa.String(255), nullable=True),
        sa.Column("period", sa.String(255), nullable=True),
        sa.Column("positionActionID", sa.String(255), nullable=True),
        sa.Column("putCall", sa.String(255), nullable=True),
        sa.Column("rfqID", sa.String(255), nullable=True),
        sa.Column("securityID", sa.String(255), nullable=True),
        sa.Column("securityIDType", sa.String(255), nullable=True),
        sa.Column("serialNumber", sa.String(255), nullable=True),
        sa.Column("subCategory", sa.String(255), nullable=True),
        sa.Column("symbol", sa.String(255), nullable=True),
        sa.Column("tradeID", sa.String(255), nullable=True),
        sa.Column("traderID", sa.String(255), nullable=True),
        sa.Column("transactionType", sa.String(255), nullable=True),
        sa.Column("underlyingConid", sa.String(255), nullable=True),
        sa.Column("underlyingListingExchange", sa.String(255), nullable=True),
        sa.Column("underlyingSecurityID", sa.String(255), nullable=True),
        sa.Column("underlyingSymbol", sa.String(255), nullable=True),
        sa.Column("volatilityOrderLink", sa.String(255), nullable=True),
        # Ingestion metadata
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]

    import copy

    op.create_table("orders", *copy.deepcopy(_trade_row_cols))
    op.create_index("uq_orders_orderID", "orders", ["orderID"], unique=True)

    op.create_table("trades", *copy.deepcopy(_trade_row_cols))
    op.create_index("ix_trades_orderID", "trades", ["orderID"])
    op.create_index("uq_trades_execID", "trades", ["execID"], unique=True)

    op.create_table("symbol_summaries", *copy.deepcopy(_trade_row_cols))
    op.create_index("ix_symbol_summaries_symbol", "symbol_summaries", ["symbol"])
    op.create_index(
        "uq_symbol_summaries_symbol_date",
        "symbol_summaries",
        ["symbol", "tradeDate"],
        unique=True,
    )

    # -------------------------------------------------------------------------
    # B-1 step 2-5 — Backfill data from ib_trades and ib_activity
    # -------------------------------------------------------------------------
    _shared = (
        "accountId", "acctAlias", "assetCategory", "brokerageOrderID", "buySell",
        "clearingFirmID", "commodityType", "conid", "currency", "cusip",
        "deliveryType", "exchange", "extExecID", "figi", "isAPIOrder", "isin",
        "issuerCountryCode", "levelOfDetail", "listingExchange", "model",
        "orderReference", "orderType", "origTradeDate", "origTradeID", "period",
        "putCall", "securityID", "securityIDType", "serialNumber", "subCategory",
        "symbol", "tradeDate", "transactionType", "underlyingConid",
        "underlyingListingExchange", "underlyingSecurityID", "underlyingSymbol",
        "volatilityOrderLink", "accruedInt", "fineness", "multiplier", "netCash",
        "origTradePrice", "principalAdjustFactor", "proceeds", "quantity", "strike",
        "weight", "description", "issuer", "fromDate", "toDate", "expiry",
        "reportDate", "whenGenerated", "dateTime", "orderTime", "ingested_at",
    )
    # TCF-only cols absent from AF, filled with NULL for AF rows
    _tcf_only_null = (
        "brokerClearingCommission", "brokerExecutionCommission", "otherCommission",
        "otherTax", "salesTax", "thirdPartyClearingCommission",
        "thirdPartyExecutionCommission", "thirdPartyRegulatoryCommission",
        "tradeCharge", "netCashWithBillable", "allocatedTo", "blockID", "code",
        "rfqID",
    )

    _shared_col_list = ", ".join(f'`{c}`' for c in _shared)
    _tcf_null_list   = ", ".join("NULL" for _ in _tcf_only_null)
    _tcf_null_names  = ", ".join(f'`{c}`' for c in _tcf_only_null)

    # Direct TCF cols (ib_trades uses TCF schema already)
    _tcf_direct = (
        "id", "orderID", "execID", "price", "amount", "commission",
        "commissionCurrency", "settleDate", "tax", "tradeID",
        "brokerClearingCommission", "brokerExecutionCommission", "otherCommission",
        "otherTax", "salesTax", "thirdPartyClearingCommission",
        "thirdPartyExecutionCommission", "thirdPartyRegulatoryCommission",
        "tradeCharge", "netCashWithBillable", "allocatedTo", "blockID", "code",
        "rfqID",
    )
    _tcf_direct_list = ", ".join(f'`{c}`' for c in _tcf_direct)
    _all_tcf_cols = _tcf_direct + _shared
    _all_tcf_col_list = ", ".join(f'`{c}`' for c in _all_tcf_cols)

    # From ib_trades (TCF schema) — direct copy
    op.execute(
        f'INSERT INTO trades ({_all_tcf_col_list}) '
        f'SELECT {_all_tcf_col_list} FROM ib_trades WHERE `levelOfDetail` = \'EXECUTION\''
    )
    op.execute(
        f'INSERT INTO orders ({_all_tcf_col_list}) '
        f'SELECT {_all_tcf_col_list} FROM ib_trades WHERE `levelOfDetail` = \'ORDER\''
    )

    # AF alias cols: AF name -> TCF name
    _af_alias_select = (
        '`id`, `ibOrderID`, `ibExecID`, `tradePrice`, `tradeMoney`, `ibCommission`, '
        '`ibCommissionCurrency`, `settleDateTarget`, `taxes`, `transactionID`, '
        + _tcf_null_list + ", "
        + _shared_col_list
    )
    _af_alias_target = (
        '`id`, `orderID`, `execID`, `price`, `amount`, `commission`, '
        '`commissionCurrency`, `settleDate`, `tax`, `tradeID`, '
        + _tcf_null_names + ", "
        + _shared_col_list
    )
    # INSERT IGNORE to skip AF rows whose execID/orderID already came from ib_trades
    op.execute(
        f'INSERT IGNORE INTO trades ({_af_alias_target}) '
        f'SELECT {_af_alias_select} FROM ib_activity WHERE `levelOfDetail` = \'EXECUTION\''
    )
    op.execute(
        f'INSERT IGNORE INTO orders ({_af_alias_target}) '
        f'SELECT {_af_alias_select} FROM ib_activity WHERE `levelOfDetail` = \'ORDER\''
    )

    # -------------------------------------------------------------------------
    # B-1 step 6 — Drop old tables
    # -------------------------------------------------------------------------
    op.drop_table("ib_activity")
    op.drop_table("ib_trades")

    # -------------------------------------------------------------------------
    # B-1b — ADD 8 prospectus/fee columns to models
    # -------------------------------------------------------------------------
    op.add_column("models", sa.Column("description", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("underlyings", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("risk", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("liquidity", sa.String(255), nullable=True))
    op.add_column("models", sa.Column("reporting", sa.String(255), nullable=True))
    op.add_column("models", sa.Column("nav_perf", sa.String(255), nullable=True))
    op.add_column("models", sa.Column("mgmt_fee", sa.Numeric(9, 6), nullable=True))
    op.add_column("models", sa.Column("incentive_fee", sa.Numeric(9, 6), nullable=True))

    # -------------------------------------------------------------------------
    # B-2 — ADD version_no to model_materials and backfill
    # -------------------------------------------------------------------------
    op.add_column(
        "model_materials",
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="0"),
    )
    # Dialect note: CAST(... AS UNSIGNED) is MySQL/MariaDB; use CAST(... AS INTEGER) for SQLite
    op.execute(
        "UPDATE model_materials "
        "SET version_no = COALESCE(CAST(SUBSTR(version, 2) AS UNSIGNED), 0)"
    )

    # -------------------------------------------------------------------------
    # B-3 — CREATE model_symbols
    # -------------------------------------------------------------------------
    op.create_table(
        "model_symbols",
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("symbol", sa.String(32), nullable=False, primary_key=True),
        sa.Column("weight", sa.Numeric(28, 10), nullable=True),
    )

    # -------------------------------------------------------------------------
    # B-4 — CREATE allocation_period_models, backfill, DROP model_size
    # -------------------------------------------------------------------------
    op.create_table(
        "allocation_period_models",
        sa.Column(
            "period_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("allocation_periods.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("model_size", sa.Numeric(28, 10), nullable=False),
    )
    op.execute(
        "INSERT INTO allocation_period_models (period_id, model_id, model_name, model_size) "
        "SELECT DISTINCT ams.period_id, ams.model_id, m.name, ams.model_size "
        "FROM allocation_model_snapshots ams "
        "JOIN models m ON m.id = ams.model_id "
        "WHERE ams.model_size IS NOT NULL"
    )
    op.drop_column("allocation_model_snapshots", "model_size")

    # -------------------------------------------------------------------------
    # B-9 — Composite indexes
    # -------------------------------------------------------------------------
    op.create_index(
        "ix_allocation_model_snapshots_user_period",
        "allocation_model_snapshots",
        ["user_id", "period_id"],
    )
    op.create_index(
        "ix_model_changes_model_id_created_at",
        "model_changes",
        ["model_id", "created_at"],
    )


def downgrade() -> None:
    # -------------------------------------------------------------------------
    # Reverse B-9 — Drop composite indexes
    # Use raw SQL with IF EXISTS to tolerate partial prior runs (MariaDB DDL is
    # non-transactional, so a failed downgrade may have already dropped some).
    # -------------------------------------------------------------------------
    op.execute("DROP INDEX IF EXISTS `ix_model_changes_model_id_created_at` ON model_changes")

    # ix_allocation_model_snapshots_user_period covers (user_id, period_id).
    # MariaDB requires every FK column to have an index where it is leftmost.
    # user_id is only leftmost in this composite, not in the PRIMARY KEY
    # (period_id, user_id, model_id).  Dropping the composite directly fails
    # with ER_DROP_INDEX_FK.  Workaround: create a plain single-column index on
    # user_id first, then drop the composite, then clean up the temp index.
    op.execute(
        "CREATE INDEX IF NOT EXISTS `ix_allocation_model_snapshots_user_id` "
        "ON allocation_model_snapshots (user_id)"
    )
    op.execute(
        "DROP INDEX IF EXISTS `ix_allocation_model_snapshots_user_period` "
        "ON allocation_model_snapshots"
    )
    # NOTE: ix_allocation_model_snapshots_user_id is intentionally left in place.
    # MariaDB cannot drop the last index covering a FK column (user_id -> users.id),
    # so we leave this single-column index as a replacement for the composite.
    # Pre-0009 MariaDB created an implicit FK index; this explicit one is equivalent.

    # -------------------------------------------------------------------------
    # Reverse B-4 — Restore model_size on allocation_model_snapshots
    # -------------------------------------------------------------------------
    op.add_column(
        "allocation_model_snapshots",
        sa.Column("model_size", sa.Numeric(28, 10), nullable=True),
    )
    op.execute(
        "UPDATE allocation_model_snapshots ams "
        "JOIN allocation_period_models apm "
        "  ON apm.period_id = ams.period_id AND apm.model_id = ams.model_id "
        "SET ams.model_size = apm.model_size"
    )
    op.drop_table("allocation_period_models")

    # -------------------------------------------------------------------------
    # Reverse B-3 — Drop model_symbols
    # -------------------------------------------------------------------------
    op.drop_table("model_symbols")

    # -------------------------------------------------------------------------
    # Reverse B-2 — Drop version_no from model_materials
    # -------------------------------------------------------------------------
    op.drop_column("model_materials", "version_no")

    # -------------------------------------------------------------------------
    # Reverse B-1b — Drop 8 prospectus/fee columns from models
    # -------------------------------------------------------------------------
    op.drop_column("models", "incentive_fee")
    op.drop_column("models", "mgmt_fee")
    op.drop_column("models", "nav_perf")
    op.drop_column("models", "reporting")
    op.drop_column("models", "liquidity")
    op.drop_column("models", "risk")
    op.drop_column("models", "underlyings")
    op.drop_column("models", "description")

    # -------------------------------------------------------------------------
    # Reverse B-1 — Re-CREATE ib_activity and ib_trades, backfill, drop new tables
    # -------------------------------------------------------------------------
    # _ActivityRow (AF) schema
    _af_cols = [
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("accountId", sa.String(255), nullable=True),
        sa.Column("acctAlias", sa.String(255), nullable=True),
        sa.Column("assetCategory", sa.String(255), nullable=True),
        sa.Column("buySell", sa.String(255), nullable=True),
        sa.Column("ibOrderID", sa.String(255), nullable=True),
        sa.Column("ibExecID", sa.String(255), nullable=True),
        sa.Column("tradePrice", sa.Numeric(28, 10), nullable=True),
        sa.Column("tradeMoney", sa.Numeric(28, 10), nullable=True),
        sa.Column("ibCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("ibCommissionCurrency", sa.String(255), nullable=True),
        sa.Column("settleDateTarget", sa.String(8), nullable=True),
        sa.Column("taxes", sa.Numeric(28, 10), nullable=True),
        sa.Column("transactionID", sa.String(255), nullable=True),
        sa.Column("brokerageOrderID", sa.String(255), nullable=True),
        sa.Column("clearingFirmID", sa.String(255), nullable=True),
        sa.Column("commodityType", sa.String(255), nullable=True),
        sa.Column("conid", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(255), nullable=True),
        sa.Column("cusip", sa.String(255), nullable=True),
        sa.Column("deliveryType", sa.String(255), nullable=True),
        sa.Column("exchange", sa.String(255), nullable=True),
        sa.Column("extExecID", sa.String(255), nullable=True),
        sa.Column("figi", sa.String(255), nullable=True),
        sa.Column("isAPIOrder", sa.String(255), nullable=True),
        sa.Column("isin", sa.String(255), nullable=True),
        sa.Column("issuerCountryCode", sa.String(255), nullable=True),
        sa.Column("levelOfDetail", sa.String(255), nullable=True),
        sa.Column("listingExchange", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("orderReference", sa.String(255), nullable=True),
        sa.Column("orderType", sa.String(255), nullable=True),
        sa.Column("origTradeDate", sa.String(8), nullable=True),
        sa.Column("origTradeID", sa.String(255), nullable=True),
        sa.Column("period", sa.String(255), nullable=True),
        sa.Column("putCall", sa.String(255), nullable=True),
        sa.Column("securityID", sa.String(255), nullable=True),
        sa.Column("securityIDType", sa.String(255), nullable=True),
        sa.Column("serialNumber", sa.String(255), nullable=True),
        sa.Column("subCategory", sa.String(255), nullable=True),
        sa.Column("symbol", sa.String(255), nullable=True),
        sa.Column("tradeDate", sa.String(8), nullable=True),
        sa.Column("transactionType", sa.String(255), nullable=True),
        sa.Column("underlyingConid", sa.String(255), nullable=True),
        sa.Column("underlyingListingExchange", sa.String(255), nullable=True),
        sa.Column("underlyingSecurityID", sa.String(255), nullable=True),
        sa.Column("underlyingSymbol", sa.String(255), nullable=True),
        sa.Column("volatilityOrderLink", sa.String(255), nullable=True),
        sa.Column("accruedInt", sa.Numeric(28, 10), nullable=True),
        sa.Column("fineness", sa.Numeric(28, 10), nullable=True),
        sa.Column("multiplier", sa.Numeric(28, 10), nullable=True),
        sa.Column("netCash", sa.Numeric(28, 10), nullable=True),
        sa.Column("origTradePrice", sa.Numeric(28, 10), nullable=True),
        sa.Column("principalAdjustFactor", sa.Numeric(28, 10), nullable=True),
        sa.Column("proceeds", sa.Numeric(28, 10), nullable=True),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=True),
        sa.Column("strike", sa.Numeric(28, 10), nullable=True),
        sa.Column("weight", sa.Numeric(28, 10), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("issuer", sa.Text(), nullable=True),
        sa.Column("fromDate", sa.String(8), nullable=True),
        sa.Column("toDate", sa.String(8), nullable=True),
        sa.Column("expiry", sa.String(8), nullable=True),
        sa.Column("reportDate", sa.String(8), nullable=True),
        sa.Column("whenGenerated", sa.String(20), nullable=True),
        sa.Column("dateTime", sa.String(20), nullable=True),
        sa.Column("orderTime", sa.String(20), nullable=True),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]

    import copy as _copy

    op.create_table("ib_activity", *_copy.deepcopy(_af_cols))
    op.create_index("ix_ib_activity_ibOrderID", "ib_activity", ["ibOrderID"])

    # _TradeConfirmRow (TCF) schema — same as _TradeRow in the new model
    _tcf_cols = [
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("accruedInt", sa.Numeric(28, 10), nullable=True),
        sa.Column("amount", sa.Numeric(28, 10), nullable=True),
        sa.Column("brokerClearingCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("brokerExecutionCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("commission", sa.Numeric(28, 10), nullable=True),
        sa.Column("fineness", sa.Numeric(28, 10), nullable=True),
        sa.Column("multiplier", sa.Numeric(28, 10), nullable=True),
        sa.Column("netCash", sa.Numeric(28, 10), nullable=True),
        sa.Column("netCashWithBillable", sa.Numeric(28, 10), nullable=True),
        sa.Column("origTradePrice", sa.Numeric(28, 10), nullable=True),
        sa.Column("otherCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("otherTax", sa.Numeric(28, 10), nullable=True),
        sa.Column("price", sa.Numeric(28, 10), nullable=True),
        sa.Column("principalAdjustFactor", sa.Numeric(28, 10), nullable=True),
        sa.Column("proceeds", sa.Numeric(28, 10), nullable=True),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=True),
        sa.Column("salesTax", sa.Numeric(28, 10), nullable=True),
        sa.Column("strike", sa.Numeric(28, 10), nullable=True),
        sa.Column("tax", sa.Numeric(28, 10), nullable=True),
        sa.Column("thirdPartyClearingCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("thirdPartyExecutionCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("thirdPartyRegulatoryCommission", sa.Numeric(28, 10), nullable=True),
        sa.Column("tradeCharge", sa.Numeric(28, 10), nullable=True),
        sa.Column("weight", sa.Numeric(28, 10), nullable=True),
        sa.Column("fromDate", sa.String(8), nullable=True),
        sa.Column("toDate", sa.String(8), nullable=True),
        sa.Column("expiry", sa.String(8), nullable=True),
        sa.Column("origTradeDate", sa.String(8), nullable=True),
        sa.Column("reportDate", sa.String(8), nullable=True),
        sa.Column("settleDate", sa.String(8), nullable=True),
        sa.Column("tradeDate", sa.String(8), nullable=True),
        sa.Column("whenGenerated", sa.String(20), nullable=True),
        sa.Column("dateTime", sa.String(20), nullable=True),
        sa.Column("orderTime", sa.String(20), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("issuer", sa.Text(), nullable=True),
        sa.Column("accountId", sa.String(255), nullable=True),
        sa.Column("acctAlias", sa.String(255), nullable=True),
        sa.Column("allocatedTo", sa.String(255), nullable=True),
        sa.Column("assetCategory", sa.String(255), nullable=True),
        sa.Column("blockID", sa.String(255), nullable=True),
        sa.Column("brokerageOrderID", sa.String(255), nullable=True),
        sa.Column("buySell", sa.String(255), nullable=True),
        sa.Column("clearingFirmID", sa.String(255), nullable=True),
        sa.Column("code", sa.String(255), nullable=True),
        sa.Column("commissionCurrency", sa.String(255), nullable=True),
        sa.Column("commodityType", sa.String(255), nullable=True),
        sa.Column("conid", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(255), nullable=True),
        sa.Column("cusip", sa.String(255), nullable=True),
        sa.Column("deliveryType", sa.String(255), nullable=True),
        sa.Column("execID", sa.String(255), nullable=True),
        sa.Column("exchange", sa.String(255), nullable=True),
        sa.Column("extExecID", sa.String(255), nullable=True),
        sa.Column("figi", sa.String(255), nullable=True),
        sa.Column("isAPIOrder", sa.String(255), nullable=True),
        sa.Column("isin", sa.String(255), nullable=True),
        sa.Column("issuerCountryCode", sa.String(255), nullable=True),
        sa.Column("levelOfDetail", sa.String(255), nullable=True),
        sa.Column("listingExchange", sa.String(255), nullable=True),
        sa.Column("model", sa.String(255), nullable=True),
        sa.Column("orderID", sa.String(255), nullable=True),
        sa.Column("orderReference", sa.String(255), nullable=True),
        sa.Column("orderType", sa.String(255), nullable=True),
        sa.Column("origTradeID", sa.String(255), nullable=True),
        sa.Column("period", sa.String(255), nullable=True),
        sa.Column("positionActionID", sa.String(255), nullable=True),
        sa.Column("putCall", sa.String(255), nullable=True),
        sa.Column("rfqID", sa.String(255), nullable=True),
        sa.Column("securityID", sa.String(255), nullable=True),
        sa.Column("securityIDType", sa.String(255), nullable=True),
        sa.Column("serialNumber", sa.String(255), nullable=True),
        sa.Column("subCategory", sa.String(255), nullable=True),
        sa.Column("symbol", sa.String(255), nullable=True),
        sa.Column("tradeID", sa.String(255), nullable=True),
        sa.Column("traderID", sa.String(255), nullable=True),
        sa.Column("transactionType", sa.String(255), nullable=True),
        sa.Column("underlyingConid", sa.String(255), nullable=True),
        sa.Column("underlyingListingExchange", sa.String(255), nullable=True),
        sa.Column("underlyingSecurityID", sa.String(255), nullable=True),
        sa.Column("underlyingSymbol", sa.String(255), nullable=True),
        sa.Column("volatilityOrderLink", sa.String(255), nullable=True),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    ]
    op.create_table("ib_trades", *_copy.deepcopy(_tcf_cols))
    op.create_index("ix_ib_trades_orderID", "ib_trades", ["orderID"])

    # Backfill ib_trades from trades UNION ALL orders (direct TCF copy)
    _tcf_col_names = (
        "id", "accruedInt", "amount", "brokerClearingCommission", "brokerExecutionCommission",
        "commission", "fineness", "multiplier", "netCash", "netCashWithBillable",
        "origTradePrice", "otherCommission", "otherTax", "price", "principalAdjustFactor",
        "proceeds", "quantity", "salesTax", "strike", "tax",
        "thirdPartyClearingCommission", "thirdPartyExecutionCommission",
        "thirdPartyRegulatoryCommission", "tradeCharge", "weight",
        "fromDate", "toDate", "expiry", "origTradeDate", "reportDate", "settleDate", "tradeDate",
        "whenGenerated", "dateTime", "orderTime", "description", "issuer",
        "accountId", "acctAlias", "allocatedTo", "assetCategory", "blockID", "brokerageOrderID",
        "buySell", "clearingFirmID", "code", "commissionCurrency", "commodityType", "conid",
        "currency", "cusip", "deliveryType", "execID", "exchange", "extExecID", "figi",
        "isAPIOrder", "isin", "issuerCountryCode", "levelOfDetail", "listingExchange", "model",
        "orderID", "orderReference", "orderType", "origTradeID", "period", "positionActionID",
        "putCall", "rfqID", "securityID", "securityIDType", "serialNumber", "subCategory",
        "symbol", "tradeID", "traderID", "transactionType", "underlyingConid",
        "underlyingListingExchange", "underlyingSecurityID", "underlyingSymbol",
        "volatilityOrderLink", "ingested_at",
    )
    _tcf_col_list = ", ".join(f'`{c}`' for c in _tcf_col_names)
    op.execute(
        f"INSERT INTO ib_trades ({_tcf_col_list}) "
        f"SELECT {_tcf_col_list} FROM trades "
        f"UNION ALL "
        f"SELECT {_tcf_col_list} FROM orders"
    )

    # Backfill ib_activity from trades UNION ALL orders using reverse aliases
    _af_target_names = (
        "id", "ibOrderID", "ibExecID", "tradePrice", "tradeMoney", "ibCommission",
        "ibCommissionCurrency", "settleDateTarget", "taxes", "transactionID",
        "accruedInt", "assetCategory", "brokerageOrderID", "buySell", "clearingFirmID",
        "commodityType", "conid", "currency", "cusip", "deliveryType", "exchange",
        "extExecID", "figi", "fineness", "fromDate", "isAPIOrder", "isin",
        "issuerCountryCode", "levelOfDetail", "listingExchange", "model",
        "multiplier", "netCash", "orderReference", "orderType", "origTradeDate",
        "origTradeID", "origTradePrice", "period", "principalAdjustFactor",
        "proceeds", "putCall", "quantity", "reportDate", "securityID", "securityIDType",
        "serialNumber", "strike", "subCategory", "symbol", "toDate", "tradeDate",
        "transactionType", "underlyingConid", "underlyingListingExchange",
        "underlyingSecurityID", "underlyingSymbol", "volatilityOrderLink",
        "weight", "description", "issuer", "whenGenerated", "dateTime", "orderTime",
        "expiry", "acctAlias", "ingested_at",
    )
    _af_source_names = (
        "id", "orderID", "execID", "price", "amount", "commission",
        "commissionCurrency", "settleDate", "tax", "tradeID",
        "accruedInt", "assetCategory", "brokerageOrderID", "buySell", "clearingFirmID",
        "commodityType", "conid", "currency", "cusip", "deliveryType", "exchange",
        "extExecID", "figi", "fineness", "fromDate", "isAPIOrder", "isin",
        "issuerCountryCode", "levelOfDetail", "listingExchange", "model",
        "multiplier", "netCash", "orderReference", "orderType", "origTradeDate",
        "origTradeID", "origTradePrice", "period", "principalAdjustFactor",
        "proceeds", "putCall", "quantity", "reportDate", "securityID", "securityIDType",
        "serialNumber", "strike", "subCategory", "symbol", "toDate", "tradeDate",
        "transactionType", "underlyingConid", "underlyingListingExchange",
        "underlyingSecurityID", "underlyingSymbol", "volatilityOrderLink",
        "weight", "description", "issuer", "whenGenerated", "dateTime", "orderTime",
        "expiry", "acctAlias", "ingested_at",
    )
    _af_target_list = ", ".join(f'`{c}`' for c in _af_target_names)
    _af_source_list = ", ".join(f'`{c}`' for c in _af_source_names)
    op.execute(
        f"INSERT INTO ib_activity ({_af_target_list}) "
        f"SELECT {_af_source_list} FROM trades "
        f"UNION ALL "
        f"SELECT {_af_source_list} FROM orders"
    )

    # Drop new tables
    op.drop_index("uq_symbol_summaries_symbol_date", table_name="symbol_summaries")
    op.drop_index("ix_symbol_summaries_symbol", table_name="symbol_summaries")
    op.drop_table("symbol_summaries")
    op.drop_index("uq_trades_execID", table_name="trades")
    op.drop_index("ix_trades_orderID", table_name="trades")
    op.drop_table("trades")
    op.drop_index("uq_orders_orderID", table_name="orders")
    op.drop_table("orders")
