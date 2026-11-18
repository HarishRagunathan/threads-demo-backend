export const cents = (value) => Math.round(Number(value) * 100);
export const money = (value) => value / 100;
export function calculateLine(price, quantity, discount, rate) {
  const taxable = cents(price) * quantity - cents(discount);
  if (taxable < 0) throw new Error("Discount cannot exceed the line amount");
  const tax = Math.round((taxable * Number(rate)) / 100);
  return {
    taxable: money(taxable),
    tax: money(tax),
    total: money(taxable + tax),
  };
}
