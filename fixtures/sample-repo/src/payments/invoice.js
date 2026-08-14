// Invoice generation for billing, unrelated to authentication.
export function createInvoice(customer, amount) {
  return { customer, amount, issuedAt: 0, status: 'pending' };
}

export function markPaid(invoice) {
  return { ...invoice, status: 'paid' };
}
