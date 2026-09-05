import test from 'node:test';
import assert from 'node:assert/strict';
import {
  apiErrorMessage,
  apiErrorKey,
  activitySegments,
  catalogs,
  detectLocale,
  translate,
  translateStatus,
} from '../client/src/i18n.js';

const storage = (value) => ({ getItem: () => value });

test('a supported saved locale wins over the browser language', () => {
  assert.equal(detectLocale({ storage: storage('en'), languages: ['ko-KR'] }), 'en');
  assert.equal(detectLocale({ storage: storage('ko'), languages: ['en-US'] }), 'ko');
});

test('Korean browsers default to Korean and all other browsers default to English', () => {
  assert.equal(detectLocale({ storage: storage(null), languages: ['ko-KR', 'en'] }), 'ko');
  assert.equal(detectLocale({ storage: storage(null), languages: ['en-US'] }), 'en');
  assert.equal(detectLocale({ storage: storage(null), languages: ['ja-JP'] }), 'en');
});

test('unsupported saved locales are ignored', () => {
  assert.equal(detectLocale({ storage: storage('fr'), languages: ['ko'] }), 'ko');
  assert.equal(detectLocale({ storage: storage('ko-KP'), languages: ['en'] }), 'en');
});

test('English and Korean catalogs have identical keys and interpolation variables', () => {
  const variables = (message) => [...message.matchAll(/\{([a-zA-Z][\w]*)\}/g)]
    .map((match) => match[1])
    .sort();
  const enKeys = Object.keys(catalogs.en).sort();
  const koKeys = Object.keys(catalogs.ko).sort();

  assert.deepEqual(koKeys, enKeys);
  for (const key of enKeys) {
    assert.deepEqual(variables(catalogs.ko[key]), variables(catalogs.en[key]), key);
  }
});

test('fish statuses and dynamic values render in both languages', () => {
  assert.equal(translateStatus('hungry', 'en'), 'hungry');
  assert.equal(translateStatus('hungry', 'ko'), '배고픔');
  assert.equal(translateStatus('okay', 'en'), 'okay');
  assert.equal(translateStatus('okay', 'ko'), '괜찮음');
  assert.equal(translateStatus('full', 'en'), 'full');
  assert.equal(translateStatus('full', 'ko'), '배부름');
  assert.equal(translate('fish.statusLine', { status: '배고픔', fullness: 37, max: 100 }, 'ko'), '배고픔 · 37/100');
  assert.equal(translate('fish.cooldown', { seconds: 4 }, 'en'), 'Hold on — 4s');
  assert.equal(translate('fish.cooldown', { seconds: 4 }, 'ko'), '잠시만요 — 4초');
});

test('activity event codes preserve names while translating the sentence', () => {
  const fed = { type: 'fed', payload: { actorName: 'Clare', targetName: '콩이' } };
  assert.deepEqual(activitySegments(fed, 'en'), [
    { text: 'Clare', strong: true },
    { text: ' fed ', strong: false },
    { text: '콩이', strong: true },
  ]);
  assert.deepEqual(activitySegments(fed, 'ko'), [
    { text: 'Clare', strong: true },
    { text: '님이 ', strong: false },
    { text: '콩이', strong: true },
    { text: '님에게 먹이를 줬어요', strong: false },
  ]);

  assert.equal(activitySegments({ type: 'full', payload: { targetName: '콩이' } }, 'ko')
    .map(({ text }) => text).join(''), '콩이님이 배불러요');
  assert.equal(activitySegments({ type: 'presence', payload: { actorName: 'Clare' } }, 'en')
    .map(({ text }) => text).join(''), 'Clare is here');
  assert.equal(activitySegments({ type: 'ignored', payload: { actorName: 'Clare', targetName: '콩이' } }, 'ko')
    .map(({ text }) => text).join(''), '콩이님이 Clare님을 모른 척했어요');
});

test('known API error codes translate and unknown errors use the locale fallback', () => {
  assert.equal(apiErrorKey({ code: 'not_signed_in' }, 'ko'), 'api.not_signed_in');
  assert.equal(apiErrorKey({ code: 'brand_new_server_error' }, 'ko'), 'error.generic');
  assert.equal(apiErrorMessage({ code: 'invalid_name' }, 'en'), 'Pick a name between 1 and 24 characters.');
  assert.equal(apiErrorMessage({ code: 'invalid_name' }, 'ko'), '이름은 1자에서 24자 사이로 입력해 주세요.');
  assert.equal(apiErrorMessage({ code: 'wrong_passphrase' }, 'ko'), '암호가 맞지 않아요.');
  assert.equal(apiErrorMessage({ code: 'brand_new_server_error' }, 'en'), 'Something went wrong. Try again.');
  assert.equal(apiErrorMessage({ code: 'brand_new_server_error' }, 'ko'), '문제가 생겼어요. 다시 시도해 주세요.');
});
