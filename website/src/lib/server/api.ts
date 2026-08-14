/**
 * Parse a database id from untrusted request input (JSON body or form data).
 * pg returns int8 (BigAutoField) ids as strings, so both "42" and 42 are
 * accepted. Returns the id as a positive integer, or null when invalid.
 */
export const parseId = (value: unknown): number | null => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * Strip characters that are unsafe in a Content-Disposition filename
 * (quotes, control characters, path separators).
 */
export const sanitizeFilename = (name: string): string => {
    // eslint-disable-next-line no-control-regex
    return name.replace(/[/\\"\x00-\x1f\x7f]/g, "_");
};
