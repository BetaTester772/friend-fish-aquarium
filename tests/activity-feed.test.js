import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityItems,
  isNearBottom,
} from '../client/src/ui/activity-feed-state.js';

const events = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: `event-${index + 1}` }));

test('hiding the activity log removes every event from the visible list', () => {
  assert.deepEqual(activityItems(events(8), { visible: false }), []);
});

test('an open activity log keeps the newest forty events in chronological order', () => {
  const shown = activityItems(events(45), { visible: true });
  assert.equal(shown.length, 40);
  assert.equal(shown[0].id, 'event-6');
  assert.equal(shown.at(-1).id, 'event-45');
});

test('auto-scroll follows new events only while the reader is near the bottom', () => {
  assert.equal(
    isNearBottom({ scrollTop: 275, clientHeight: 200, scrollHeight: 500 }),
    true,
  );
  assert.equal(
    isNearBottom({ scrollTop: 150, clientHeight: 200, scrollHeight: 500 }),
    false,
  );
});

test('the activity toggle stays at the anchored edge when the list expands', async () => {
  class ElementStub {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.dataset = {};
      this.className = '';
      this.hidden = false;
      this.isConnected = true;
      this.scrollTop = 0;
      this.clientHeight = 0;
      this.scrollHeight = 0;
    }

    setAttribute(name, value) {
      this[name] = value;
    }

    addEventListener() {}

    append(...children) {
      this.children.push(...children);
    }

    replaceChildren(...children) {
      this.children = children;
    }
  }

  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.document = {
    createElement: (tagName) => new ElementStub(tagName),
    documentElement: {},
    querySelector: () => null,
    title: '',
  };
  globalThis.window = { addEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => callback();

  const container = new ElementStub('section');
  const state = {
    get: () => ({ activity: [] }),
    on: () => () => {},
  };

  try {
    const { createActivityFeed } = await import('../client/src/ui/activity-feed.js');
    const feed = createActivityFeed({ container, state });
    assert.deepEqual(
      container.children.map((child) => child.className),
      ['activity__list', 'btn btn--ghost btn--small activity__toggle'],
    );
    feed.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.requestAnimationFrame = previousAnimationFrame;
  }
});
