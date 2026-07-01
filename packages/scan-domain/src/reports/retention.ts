export const RETENTION_WINDOW_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeRetainedUntil(publishedAt: Date): Date {
  return new Date(publishedAt.getTime() + RETENTION_WINDOW_DAYS * MS_PER_DAY);
}

export function isWithinRetention(publishedAt: Date, now: Date): boolean {
  return now.getTime() <= computeRetainedUntil(publishedAt).getTime();
}
