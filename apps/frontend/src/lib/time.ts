export const DISPLAY_TIMEZONE = "Asia/Kolkata";

const UTC_MISSING_OFFSET_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: DISPLAY_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = UTC_MISSING_OFFSET_PATTERN.test(value) ? `${value}Z` : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDateTimeIST(value: string | null | undefined): string {
  const parsed = parseTimestampMs(value);
  return parsed === null ? "n/a" : `${dateTimeFormatter.format(parsed)} IST`;
}

export function formatDateIST(value: string | null | undefined): string {
  const parsed = parseTimestampMs(value);
  return parsed === null ? "n/a" : `${dateFormatter.format(parsed)} IST`;
}

export function formatTimeIST(value: string | null | undefined): string {
  const parsed = parseTimestampMs(value);
  return parsed === null ? "n/a" : `${timeFormatter.format(parsed)} IST`;
}

export function compareTimestamps(left: string | null | undefined, right: string | null | undefined): number {
  return (parseTimestampMs(left) ?? 0) - (parseTimestampMs(right) ?? 0);
}
