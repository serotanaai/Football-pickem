import { Badge } from "@/components/Badge";

/**
 * The marker on a league card for a board the member has not filled in.
 *
 * There is deliberately no opposite. A card for a league that is up to date
 * says nothing at all, because a badge on every card is wallpaper — the one
 * that means "you still owe picks" only reads as urgent while it is the only
 * thing on the row wearing that colour.
 *
 * The wording carries the urgency rather than the styling: how many are owed
 * while there is still time, a countdown once the lock is close.
 */
export function PicksDue({
  lockAt,
  remaining,
  now,
}: {
  lockAt: string | null;
  remaining: number;
  now: number;
}) {
  return <Badge tone="danger">{dueLabel(lockAt, remaining, now)}</Badge>;
}

/**
 * One badge carries both facts, and which one leads depends on how long is
 * left.
 *
 * With days to go the number of games is the useful part — it is the size of
 * the job being put off. Inside a day the clock takes over, because by then how
 * many are left matters far less than the fact that they are about to stop
 * being pickable at all.
 */
export function dueLabel(lockAt: string | null, remaining: number, now: number): string {
  const count = `${remaining} ${remaining === 1 ? "pick" : "picks"} due`;
  if (!lockAt) return count;

  const ms = new Date(lockAt).getTime() - now;
  // Already locked. The caller filters these out, so this is the belt to that
  // braces rather than a state anybody should reach.
  if (ms <= 0) return count;

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);

  // Past a day out the exact time is noise — "locks in 4d" is not a reason to
  // act now, and it is the same sentence four days running.
  if (hours >= 24) return count;
  if (hours >= 1) return `Locks in ${hours}h`;
  if (minutes >= 1) return `Locks in ${minutes}m`;
  return "Locks any minute";
}
