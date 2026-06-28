export const IST_TIME_ZONE = "Asia/Kolkata";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parseDateValue(value) {
  if (!value) return null;
  const rawValue = typeof value === "object" && value.$date ? value.$date : value;
  const date = rawValue instanceof Date ? rawValue : new Date(rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTimeIST(value, fallback = "Not available") {
  const date = parseDateValue(value);
  return date ? DATE_TIME_FORMATTER.format(date) : fallback;
}

export function formatDateIST(value, fallback = "Not available") {
  const date = parseDateValue(value);
  return date ? DATE_FORMATTER.format(date) : fallback;
}

export function formatTimeIST(value, fallback = "Not available") {
  const date = parseDateValue(value);
  return date ? TIME_FORMATTER.format(date) : fallback;
}

export function toDateKeyIST(value) {
  const date = parseDateValue(value);
  return date ? DATE_KEY_FORMATTER.format(date) : "";
}
