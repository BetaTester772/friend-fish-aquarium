/**
 * In-app browser detection, and a way out of one.
 *
 * A link dropped in a chat opens inside that app's own browser, and on Android
 * those are WebViews whose host app has to forward the camera permission via
 * `WebChromeClient.onPermissionRequest`.
 *
 * Plenty of them do. Our own analytics show KakaoTalk 26.7 on Android 16
 * granting the camera and detecting faces without complaint, so being in one of
 * these is NOT a reason to warn anybody up front — that would push working
 * visitors out of a browser that works. This is only ever offered as one
 * possible remedy *after* the camera has actually failed.
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

/** No touch and not a known mobile OS: treat as a desktop for advice purposes. */
export const isDesktop = () => !isAndroid() && !isIos();

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
