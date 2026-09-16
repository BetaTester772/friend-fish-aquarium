const MAX_VISIBLE = 40;
const BOTTOM_THRESHOLD_PX = 32;

/** Events rendered by the activity panel in its current visibility state. */
export function activityItems(activity, { visible }) {
  return visible ? activity.slice(-MAX_VISIBLE) : [];
}

/** Whether incoming events should keep the scroll position pinned to newest. */
export function isNearBottom({ scrollTop, clientHeight, scrollHeight }) {
  return scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD_PX;
}
