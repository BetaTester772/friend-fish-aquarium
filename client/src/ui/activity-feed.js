import { activitySegments } from '../../../shared/activity-text.js';
import { track } from '../analytics.js';

const VISIBLE = 6;

/**
 * The pill stack from the Reel (spec S5): "beandog is here", "clare fed
 * beandog", "beandog is full", "beandog ignored clare".
 *
 * Newest sits at the bottom; only the most recent handful are shown, with a
 * toggle to expand the rest — the tank has to stay visible behind it.
 */
export function createActivityFeed({ container, state }) {
  const list = document.createElement('ul');
  list.className = 'activity__list';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn--ghost btn--small activity__toggle';

  let expanded = false;
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    render(state.get().activity);
    if (expanded) {
      track('activity_feed_viewed', {
        visible_event_count: state.get().activity.length,
      });
    }
  });

  container.append(toggle, list);

  function render(activity) {
    const shown = expanded ? activity.slice(-40) : activity.slice(-VISIBLE);

    list.replaceChildren(
      ...(shown.length
        ? shown.map(renderEvent)
        : [emptyState()]),
    );

    toggle.textContent = expanded
      ? 'Hide log'
      : `Activity${activity.length > VISIBLE ? ` (${activity.length})` : ''}`;
    toggle.setAttribute('aria-expanded', String(expanded));
  }

  function renderEvent(event) {
    const item = document.createElement('li');
    item.className = 'activity__item';
    item.dataset.type = event.type;
    item.title = new Date(event.createdAt).toLocaleString();

    for (const segment of activitySegments(event)) {
      const node = document.createElement(segment.strong ? 'b' : 'span');
      node.textContent = segment.text;
      item.append(node);
    }
    return item;
  }

  function emptyState() {
    const item = document.createElement('li');
    item.className = 'activity__empty';
    item.textContent = 'Nothing has happened in here yet.';
    return item;
  }

  render(state.get().activity);
  const stop = state.on('activity', render);

  return {
    destroy() {
      stop();
      container.replaceChildren();
    },
  };
}
