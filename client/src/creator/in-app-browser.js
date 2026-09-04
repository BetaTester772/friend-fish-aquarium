/**
 * In-app browser detection, and a way out of one.
 *
 * A link dropped in a chat opens inside that app's own browser, and on Android
 * those are WebViews whose host app has to forward the camera permission
 * (`WebChromeClient.onPermissionRequest`). Most never implement it, so
 * `getUserMedia` is either missing outright or rejects with NotAllowedError no
 * matter how many times the visitor taps allow. Since the invite link is meant
 * to be pasted into a group chat, this is the single most likely reason someone
 * says the camera "doesn't work".
 *
 * User-agent sniffing is brittle, so nothing here blocks anyone: a match only
 * adds a shortcut out, and "try anyway" is always available.
 */
const IN_APP_BROWSERS = [
  [/KAKAOTALK/i, 'KakaoTalk'],
  [/NAVER\(inapp/i, 'Naver'],
  [/DaumApps/i, 'Daum'],
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/\bLine\//i, 'LINE'],
  [/Snapchat/i, 'Snapchat'],
  [/Twitter/i, 'X'],
];

export const isAndroid = () => /Android/i.test(navigator.userAgent);

export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports as a Mac; a touch-capable "Mac" is an iPad.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** @returns {string|null} the app's name, or null when this is a real browser. */
export function inAppBrowser() {
  const ua = navigator.userAgent;
  for (const [pattern, name] of IN_APP_BROWSERS) {
    if (pattern.test(ua)) return name;
  }
  // Android WebViews say so outright, and none of them forward the camera.
  if (isAndroid() && /\bwv\b/.test(ua)) return 'this app';
  return null;
}

/**
 * Android's `intent://` scheme hands a URL to a named app, which is the only
 * reliable way out of a WebView. iOS has no equivalent — there the link has to
 * be copied.
 */
export function androidChromeUrl(href) {
  const url = new URL(href);
  return (
    `intent://${url.host}${url.pathname}${url.search}` +
    `#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`
  );
}

/** Can we offer a one-tap escape, or only "copy this link"? */
export const canJumpToRealBrowser = () => isAndroid();
