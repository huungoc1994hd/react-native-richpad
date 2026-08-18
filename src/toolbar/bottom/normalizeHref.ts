/** A bare host ("abc.com") is what users type; make it a real URL. */
export const normalizeHref = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};
