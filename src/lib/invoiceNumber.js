// One place that decides what an invoice number looks like, so the
// student's PDF, the stored record and the admin search always agree.
// Format: MED-<YYYYMMDD>-<last 6 of the transaction ID, upper-case>.
// Admin grants have no transaction ID, so they pass `ADM<activation ms>`.
export function makeInvoiceNo(id, date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '');
  return `MED-${ymd}-${String(id).slice(-6).toUpperCase()}`;
}
