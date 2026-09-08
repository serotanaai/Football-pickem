import { Badge } from "@/components/Badge";

/**
 * The marker on a league card for a board the member has not filled in.
 *
 * There is deliberately no opposite. A card for a league that is up to date
 * says nothing at all, because a badge on every card is wallpaper — the one
 * that means "you still owe picks" only reads as urgent while it is the only
 * thing on the row wearing that colour.
 *
 * One fixed sentence, whatever the state of the board or the clock. It says
 * the thing it is there to say and reads the same on every card, which is what
 * makes a row of them scannable.
 */
export function PicksDue() {
  return <Badge tone="danger">Picks Not Submitted</Badge>;
}
