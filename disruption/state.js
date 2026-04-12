// Shared mutable state for the disruption agent service layer
export let lastEventAt = null;
export function setLastEventAt(ts) {
  lastEventAt = ts;
}
