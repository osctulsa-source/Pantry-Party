/**
 * notificationCopy — the playful phrase bank for expiry digests (pure, no I/O).
 *
 * Voice: "Pantry Party" — food with feelings, light jokes, never nagging. One
 * gentle morning nudge that pushes the user to open the app and cook, rather
 * than a robotic "X expires in N days" per item.
 *
 * Determinism matters: the reconciler wipes and re-schedules on every pantry
 * change and every app-foreground. If copy were random it would reshuffle on
 * every reconcile. So a phrase is chosen by a DAY SEED derived from the
 * digest's trigger date — stable for a given morning, fresh across days.
 *
 * Buckets: {tier} × {one | many}, plus a streak-flavoured bank for the urgent
 * tiers (today / tomorrow) when the user has a streak worth protecting.
 * Templates use tokens {item} {lead} {n} {others} {streak}.
 */

import type { DigestIntent, DigestTier } from "./notifications.ts";

export interface DigestCopy {
  title: string;
  body: string;
}

/** Streak flavour only kicks in for these urgent tiers. */
const MIN_STREAK_FOR_FLAVOUR = 3;

const TITLES: Record<DigestTier, string[]> = {
  today: ["Last call", "Now or never", "Rescue mission"],
  tomorrow: ["One day left", "Tomorrow’s the day", "Clock’s ticking (kindly)"],
  soon: ["Fridge roll call", "Pantry party", "A little nudge"],
};

// One item, still a few days out.
const SOON_ONE = [
  "{item} is getting on in years. Delicious plans?",
  "Psst — {item} would love to be dinner this week.",
  "Your {item} is ripe for a rescue. Just saying.",
  "{item} is eyeing the exit. Give it a purpose?",
  "A few days left for {item} — first dibs on dinner?",
  "{item} is quietly ripening toward a deadline. Tap to plot.",
];

// A handful of items, still a few days out.
const SOON_MANY = [
  "{n} things could be dinner this week — {lead} is first in line.",
  "A few pantry pals ({n} of them, led by {lead}) are eyeing the exit.",
  "{n} items are getting close. {lead} and friends await a rescue.",
  "Peek in the pantry? {n} things (hi, {lead}) would love a plan.",
  "{lead} and {others} more are ripening toward a deadline. Tap to save them.",
];

// One item, expires tomorrow.
const TOMORROW_ONE = [
  "{item} has about a day left to shine. No pressure. (Some pressure.)",
  "Tomorrow’s the deadline for {item} — tonight’s the audition?",
  "{item}: roughly 24 hours to greatness.",
  "Your {item} expires tomorrow. Plot a meal tonight?",
  "One day left for {item}. Make it count?",
];

// A handful of items, expiring tomorrow.
const TOMORROW_MANY = [
  "{n} things bow out tomorrow — {lead} leads the farewell tour.",
  "{n} items are on the clock (a day left). {lead} is first up.",
  "Tomorrow retires {n} pantry regulars, {lead} included. Tap to plan.",
  "{lead} and {others} more want to be used by tomorrow.",
];

// One item, expires today.
const TODAY_ONE = [
  "Last call for {item} — it’s this close to the compost.",
  "{item} is on its final act. Give it a standing ovation (and a plate).",
  "It’s now or never for {item}. Mostly now.",
  "{item} would like to be dinner before it becomes a science experiment.",
  "Your {item} is living on borrowed time. Rescue mission tonight?",
];

// A handful of items, expiring today.
const TODAY_MANY = [
  "{n} things are on their last day — {lead} leads the farewell.",
  "Code red (deliciously): {n} items, {lead} included, need eating today.",
  "{n} fridge friends expire today. A dramatic group rescue awaits.",
  "{lead} and {others} more are about to ghost you. Tap to save them.",
];

// Streak-flavoured — only for today/tomorrow, when a streak is on the line.
const STREAK_ONE = [
  "Your {streak}-day streak vs. one wilting {item}. Save it?",
  "Keep the {streak}-day streak alive — {item} needs a hero.",
  "{item}’s about to break your {streak}-day streak. Not on our watch?",
];
const STREAK_MANY = [
  "Your {streak}-day streak’s on the line — {n} things (incl. {lead}) need you.",
  "Save {n} items, save your {streak}-day streak. {lead} first.",
  "{lead} and {others} more could dent your {streak}-day streak. Rescue them?",
];

function bankFor(tier: DigestTier, single: boolean, streak: boolean): string[] {
  if (streak) return single ? STREAK_ONE : STREAK_MANY;
  if (tier === "today") return single ? TODAY_ONE : TODAY_MANY;
  if (tier === "tomorrow") return single ? TOMORROW_ONE : TOMORROW_MANY;
  return single ? SOON_ONE : SOON_MANY;
}

/**
 * Day seed: a small integer that's stable for a given local morning but
 * changes day to day, so the wording rotates. Derived from the trigger date's
 * local calendar day (YYYYMMDD packed into a number).
 */
function daySeed(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Deterministic pick from a non-empty bank. Callers only pass non-empty arrays. */
function pick<T>(bank: readonly T[], seed: number): T {
  return bank[seed % bank.length] as T;
}

function fill(
  template: string,
  vars: { item: string; lead: string; n: number; others: number; streak: number },
): string {
  return template
    .replace(/\{item\}/g, vars.item)
    .replace(/\{lead\}/g, vars.lead)
    .replace(/\{others\}/g, `${vars.others}`)
    .replace(/\{streak\}/g, `${vars.streak}`)
    .replace(/\{n\}/g, `${vars.n}`);
}

/**
 * Build the {title, body} for a digest. Deterministic given the intent and
 * streakDays: same morning → same copy.
 *
 * @param streakDays  Current streak (0 if unknown). ≥3 unlocks streak flavour
 *                    on the today/tomorrow tiers.
 */
export function digestNotification(
  intent: DigestIntent,
  streakDays = 0,
): DigestCopy {
  const single = intent.items.length === 1;
  const lead = intent.items[0]?.name ?? "something";
  const urgent = intent.tier === "today" || intent.tier === "tomorrow";
  const streak = streakDays >= MIN_STREAK_FOR_FLAVOUR && urgent;

  const seed = daySeed(intent.triggerDate);
  const template = pick(bankFor(intent.tier, single, streak), seed);

  return {
    title: pick(TITLES[intent.tier], seed),
    body: fill(template, {
      item: lead,
      lead,
      n: intent.items.length,
      others: intent.items.length - 1,
      streak: streakDays,
    }),
  };
}
