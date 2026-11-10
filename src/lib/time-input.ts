/** Format typed 24-hour digits without accepting or inventing a valid time. */
export function formatTimeEntry(value: string) {
  const text = value.trim();
  if (/^\d:\d{2}$/.test(text)) return `0${text}`;
  const digits = text.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}
