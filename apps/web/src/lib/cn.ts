type ClassValue = string | false | null | undefined | 0;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
