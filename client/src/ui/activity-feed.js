import { track } from '../analytics.js';
import {
  activitySegments,
  bindAttribute,
  formatDateTime,
  subscribeLocale,
  t,
} from '../i18n.js';
import { activityItems, isNearBottom } from './activity-feed-state.js';

/**
 * The pill stack from the Reel (spec S5): "beandog is here", "clare fed
 * beandog", "beandog is full", "beandog ignored clare".
 *
 * Newest sits at the bottom; only the most recent handful are shown, with a
 * toggle to expand the rest — the tank has to stay visible behind it.
 */
export function createActivityFeed({ container, state }) {
  bindAttribute(container, 'aria-label', 'activity.label');
  const list = document.createElement('ul');
  list.className = 'activity__list';
  list.setAttribute('aria-live', 'polite');
  list.tabIndex = 0;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn--ghost btn--small activity__toggle';

  let visible = true;
  toggle.addEventListener('click', () => {
    visible = !visible;
    render(state.get().activity);
    if (visible) {
      track('activity_feed_viewed', {
        visible_event_count: state.get().activity.length,
      });
    }
  });

  container.append(toggle, list);

  function render(activity) {
    const followNewest = !list.hidden && isNearBottom(list);
    const shown = activityItems(activity, { visible });

    list.replaceChildren(
      ...(shown.length
        ? shown.map(renderEvent)
        : [emptyState()]),
    );
    list.hidden = !visible;

    toggle.textContent = visible
      ? t('activity.hide')
      : t(activity.length ? 'activity.titleCount' : 'activity.title', {
          count: activity.length,
        });
    toggle.setAttribute('aria-expanded', String(visible));

    if (visible && (followNewest || !list.dataset.rendered)) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
    list.dataset.rendered = 'true';
  }

  function renderEvent(event) {
    const item = document.createElement('li');
    item.className = 'activity__item';
    item.dataset.type = event.type;
    item.title = formatDateTime(event.createdAt);

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
    item.textContent = t('activity.empty');
    return item;
  }

  render(state.get().activity);
  const stop = state.on('activity', render);
  const stopLocale = subscribeLocale(() => render(state.get().activity));

  return {
    destroy() {
      stop();
      stopLocale();
      container.replaceChildren();
    },
  };
}
