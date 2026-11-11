/** Format typed 24-hour digits without accepting or inventing a valid time. */
export function formatTimeEntry(value: string) {
  const text = value.trim();
  // A one-digit hour followed by a colon ("9:", "9:3", "9:30") gets its leading zero while typing.
  if (/^\d:\d{0,2}$/.test(text)) return `0${text}`;
  const digits = text.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}
