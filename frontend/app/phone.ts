/**
 * Reduces pasted Indian numbers (+91 98765 43210, 919876543210, 09876543210, 00919876543210)
 * to the 10 digits the backend stores. The backend normalises again; this only keeps inputs tidy.
 */
export function toMobileInput(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0091")) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}