# _0009_chunk_b1.py — B-1 DDL fragment (data-preserving IB staging split)
#
# Column names matching between ib_activity (AF) and TCF target tables:
# accountId, acctAlias, assetCategory, brokerageOrderID, buySell, clearingFirmID,
# commodityType, conid, currency, cusip, deliveryType, exchange, extExecID, figi,
# isAPIOrder, isin, issuerCountryCode, levelOfDetail, listingExchange, model,
# orderReference, orderType, origTradeDate, origTradeID, period, putCall,
# securityID, securityIDType, serialNumber, subCategory, symbol, tradeDate,
# tradeID, transactionType, underlyingConid, underlyingListingExchange,
# underlyingSecurityID, underlyingSymbol, volatilityOrderLink,
# accruedInt, fineness, multiplier, netCash, origTradePrice, principalAdjustFactor,
# proceeds, quantity, strike, weight, description, issuer,
# fromDate, toDate, expiry, reportDate, whenGenerated, dateTime, orderTime,
# ingested_at
#
# AF columns aliased to TCF names: ibOrderID->orderID, ibExecID->execID,
#   tradePrice->price, tradeMoney->amount, ibCommission->commission,
#   ibCommissionCurrency->commissionCurrency, settleDateTarget->settleDate,
#   taxes->tax, transactionID->tradeID
#
# AF-only columns dropped (logged at runtime): changeInPrice, changeInQuantity,
#   closePrice, cost, fifoPnlRealized, fxRateToBase, initialInvestment, mtmPnl,
#   holdingPeriodDateTime, openDateTime, whenRealized, whenReopened,
#   origTransactionID, relatedTradeID, relatedTransactionID, positionActionID,
#   rtn, traderID

# TCF-only columns not in AF (will be NULL for AF-backfilled rows):
#   brokerClearingCommission, brokerExecutionCommission, otherCommission, otherTax,
#   salesTax, thirdPartyClearingCommission, thirdPartyExecutionCommission,
#   thirdPartyRegulatoryCommission, tradeCharge, netCashWithBillable,
#   allocatedTo, blockID, code, commissionCurrency (aliased from AF), execID
#   (aliased from AF), price (aliased from AF), amount (aliased from AF),
#   commission (aliased from AF), settleDate (aliased from AF), tax (aliased from AF),
#   orderID (aliased from AF), rfqID, positionActionID (AF-only -> dropped)

SHARED_COLS = (
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
