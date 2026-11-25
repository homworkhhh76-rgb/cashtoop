(function(root) {
  const capped = ['products','categories','warehouses','invoices','purchases','customers','suppliers',
    'accounts','transfers','expenses','shifts','held_invoices','vouchers','employees','restaurant_tables',
    'restaurant_sections','restaurant_orders','kitchen_sections','table_reservations','recipes','waste_records',
    'distribution_sessions','distribution_docs','distribution_routes','distribution_shifts','accounting_coa','accounting_journal'];
  const stores = [...capped,'stock','stock_movements','partner_statements','audit_logs','settings','distribution_commissions','distribution_journal'];
  const policy = Object.freeze({
    limit:20, days:3, capped:Object.freeze(capped), stores:Object.freeze(stores),
    counts(row){return !!row&&!row.deletedAt&&!row.isDeleted&&!row.isVirtual},
    key(store,row){return store==='stock'?JSON.stringify([row?.productId,row?.warehouseId]):String((store==='settings'?row?.key:row?.id)||'')}
  });
  if(typeof module==='object'&&module.exports)module.exports=policy;
  else root.CashTopTrialPolicy=policy;
})(globalThis);
