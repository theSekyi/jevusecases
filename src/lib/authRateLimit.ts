import { createRateLimiter } from "@/lib/rateLimit";

const WINDOW_MS = 15 * 60 * 1000;

// Per-instance, like the other limiters here. Keyed two ways so one source can't hammer the whole
// site and can't hammer one account, while someone else's guesses can't lock the owner out.
const perSource = createRateLimiter(30, WINDOW_MS);
const perSourceAndAccount = createRateLimiter(5, WINDOW_MS);
const perAdmin = createRateLimiter(5, WINDOW_MS);

export function allowLoginAttempt(ip: string, email: string): boolean {
  return perSource(ip) && perSourceAndAccount(`${ip}|${email}`);
}

export function allowPasswordChangeAttempt(adminId: string): boolean {
  return perAdmin(adminId);
}
