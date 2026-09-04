/**
 * Renders an ActivityEvent as the one-line copy seen in the Reel:
 *   "beandog is here" / "clare fed beandog" / "beandog is full" /
 *   "beandog ignored clare"
 *
 * Names are snapshotted into the event payload at write time so the log still
 * reads correctly after someone deletes their fish or leaves the tank.
 */
export const ACTIVITY_TYPES = {
  PRESENCE: 'presence',
  JOINED: 'joined',
  FED: 'fed',
  FULL: 'full',
  IGNORED: 'ignored',
};

/** @returns {Array<{text: string, strong: boolean}>} segments for rich rendering */
export function activitySegments(event) {
  const actor = event.payload?.actorName ?? 'someone';
  const target = event.payload?.targetName ?? 'someone';
  const s = (text) => ({ text, strong: true });
  const p = (text) => ({ text, strong: false });

  switch (event.type) {
    case ACTIVITY_TYPES.PRESENCE:
      return [s(actor), p(' is here')];
    case ACTIVITY_TYPES.JOINED:
      return [s(actor), p(' joined the tank')];
    case ACTIVITY_TYPES.FED:
      return [s(actor), p(' fed '), s(target)];
    case ACTIVITY_TYPES.FULL:
      return [s(target), p(' is full')];
    case ACTIVITY_TYPES.IGNORED:
      return [s(target), p(' ignored '), s(actor)];
    default:
      return [p(event.type)];
  }
}
