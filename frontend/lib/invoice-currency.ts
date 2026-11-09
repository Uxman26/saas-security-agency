export const INVOICE_CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: 'GBP', name: 'British pound', symbol: '£' },
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'CAD', name: 'Canadian dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian dollar', symbol: 'A$' },
  { code: 'NZD', name: 'New Zealand dollar', symbol: 'NZ$' },
  { code: 'CHF', name: 'Swiss franc', symbol: 'CHF ' },
  { code: 'JPY', name: 'Japanese yen', symbol: '¥' },
  { code: 'INR', name: 'Indian rupee', symbol: '₹' },
  { code: 'PKR', name: 'Pakistani rupee', symbol: 'Rs ' },
  { code: 'AED', name: 'UAE dirham', symbol: 'AED ' },
  { code: 'SAR', name: 'Saudi riyal', symbol: 'SAR ' },
  { code: 'ZAR', name: 'South African rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian naira', symbol: '₦' },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$' },
  { code: 'HKD', name: 'Hong Kong dollar', symbol: 'HK$' },
  { code: 'SEK', name: 'Swedish krona', symbol: 'kr ' },
  { code: 'NOK', name: 'Norwegian krone', symbol: 'kr ' },
  { code: 'DKK', name: 'Danish krone', symbol: 'kr ' },
  { code: 'PLN', name: 'Polish złoty', symbol: 'zł ' },
  { code: 'TRY', name: 'Turkish lira', symbol: '₺' },
];

export function invoiceCurrencyCode(code?: string | null) {
  const raw = (code || 'GBP').toUpperCase();
  return INVOICE_CURRENCIES.some((c) => c.code === raw) ? raw : 'GBP';
}

export function formatInvoiceMoney(n: number, code?: string | null) {
  const currency = invoiceCurrencyCode(code);
  const digits = currency === 'JPY' ? 0 : 2;
  const symbol = INVOICE_CURRENCIES.find((c) => c.code === currency)?.symbol ?? '';
  const amount = Math.abs(n).toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const body = symbol.trim() ? `${symbol}${amount}` : `${currency} ${amount}`;
  return n < 0 ? `-${body}` : body;
}
