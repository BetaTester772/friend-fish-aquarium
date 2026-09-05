export const SUPPORTED_LOCALES = ['en', 'ko'];
export const LOCALE_STORAGE_KEY = 'ffa_locale';

export const catalogs = {
  en: {
    'meta.title': 'friend fish aquarium',
    'meta.description': 'A shared tank where your friends are fish. Check in on them. Feed them.',
    'language.label': 'Language',
    'common.cancel': 'Cancel',
    'common.reload': 'Reload',
    'common.tryAgain': 'Try again',
    'error.generic': 'Something went wrong. Try again.',
    'fatal.title': 'The tank is closed',
    'fatal.webgl': 'This browser cannot draw the tank — it has no WebGL. Turn on hardware acceleration in your browser settings, or open the tank on another device.',
    'fatal.notFound': 'That tank link does not exist (any more).',
    'fatal.unreachable': 'Could not reach the tank. Is the server running?',
    'fatal.setup': 'Something went wrong setting up the tank.',
    'connection.reconnecting': 'Lost the tank — reconnecting',
    'hud.addFish': 'Add your fish',
    'hud.reconnecting': 'reconnecting…',
    'hud.summary': '{fishCount} fish · {onlineCount} here now',
    'hud.whoAreYou': 'Who are you?',
    'hud.signedInAs': 'Signed in as {name}',
    'hud.copyInvitePrivate': 'Copy invite link (lets them in)',
    'hud.copyInvite': 'Copy invite link',
    'hud.inviteCopied': 'Invite link copied',
    'hud.copyInvitePrompt': 'Copy this invite link',
    'hud.changeName': 'Change my name',
    'hud.facePrivacy': 'Your face picture is stored only so friends recognise your fish.',
    'hud.signOut': 'Sign out',
    'hud.signedOut': 'Signed out',
    'hud.deleteData': 'Delete my fish and data',
    'hud.deleteTitle': 'Delete everything?',
    'hud.deleteBody': 'This removes your fish, deletes the face image stored on the server, and forgets your account. It cannot be undone.',
    'hud.deleteConfirm': 'Delete it all',
    'hud.deleted': 'Deleted. Nothing of yours is left in the tank.',
    'name.label': 'What should the tank call you?',
    'name.save': 'Save',
    'name.join': 'Join the tank',
    'name.changeTitle': 'Change your name',
    'name.joinTitle': 'Join the tank',
    'name.body': 'No password, no email. Just the name your friends will see over your fish.',
    'gate.placeholder': 'the passphrase',
    'gate.label': 'Passphrase',
    'gate.enter': 'Come in',
    'gate.checking': 'Checking…',
    'gate.reachError': 'Could not reach the tank. Try again.',
    'gate.title': 'this tank is private',
    'gate.body': 'Ask whoever sent you the link for the passphrase. It is the same one for everybody.',
    'fish.you': 'you',
    'fish.status.hungry': 'hungry',
    'fish.status.okay': 'okay',
    'fish.status.full': 'full',
    'fish.statusLine': '{status} · {fullness}/{max}',
    'fish.remove': 'Remove my fish',
    'fish.joinHint': 'Pick a name to start feeding your friends.',
    'fish.join': 'Join the tank',
    'fish.selfHint': 'This one is yours. Wait for a friend to feed it.',
    'fish.fullHint': "{name} is full. Come back when they've digested.",
    'fish.cooldown': 'Hold on — {seconds}s',
    'fish.feedWorth': 'One feed is worth {amount} fullness.',
    'fish.feeding': 'Feeding…',
    'fish.feed': 'Feed',
    'fish.fedToast': 'Fed {name}',
    'fish.fullToast': '{name} is full',
    'fish.ignoredToast': '{name} ignored you',
    'fish.slowDown': 'Slow down',
    'fish.left': 'That fish just left the tank',
    'fish.feedError': 'Could not feed right now',
    'fish.removeTitle': 'Remove your fish?',
    'fish.removeBody': 'Your fish leaves the tank and the face image we stored for it is deleted from the server. You can always make a new one.',
    'fish.removeConfirm': 'Remove it',
    'fish.removed': 'Your fish is gone',
    'fish.removeError': 'Could not remove your fish',
    'fish.aria': '{name}{mine} — {status}, {fullness} out of {max} full. Open actions.',
    'fish.mineSuffix': ' (you)',
    'activity.label': 'Activity',
    'activity.hide': 'Hide log',
    'activity.title': 'Activity',
    'activity.titleCount': 'Activity ({count})',
    'activity.empty': 'Nothing has happened in here yet.',
    'activity.someone': 'someone',
    'activity.presenceSuffix': ' is here',
    'activity.joinedSuffix': ' joined the tank',
    'activity.fedMiddle': ' fed ',
    'activity.fedSuffix': '',
    'activity.fullSuffix': ' is full',
    'activity.ignoredMiddle': ' ignored ',
    'activity.ignoredSuffix': '',
    'creator.consent': 'I understand my camera runs in this browser only. The tank stores one cropped picture of my face so friends can recognise my fish, and I can delete it at any time.',
    'creator.turnOnCamera': 'Turn on camera',
    'creator.title': 'Add your fish',
    'creator.intro': 'Point the camera at your face. We find it, cut it out, and stick it on a fish. Nothing is recorded — only the still cut-out is saved.',
    'creator.inAppBrowser': "You are in {appName}'s built-in browser. Some of them do not pass the camera through — opening this page in Chrome is worth a try.",
    'creator.openChrome': 'Open in Chrome',
    'creator.copyLink': 'Copy the link',
    'creator.copiedChrome': 'Copied — paste it in Chrome',
    'creator.copyChromePrompt': 'Copy this link into Chrome',
    'creator.unsupportedCamera': 'This browser will not give us a camera. Try Safari or Chrome on a device with a front camera.',
    'creator.startingCamera': 'Starting camera…',
    'creator.detectorFailed': 'The face detector would not start on this device. Try a different browser, or ask for a hand.',
    'creator.detectorFailedShort': 'The face detector would not start on this device.',
    'creator.tapStart': 'Tap to start the camera',
    'creator.centerFace': 'Center your face in the frame.',
    'creator.browserPaused': 'Your browser paused the camera.',
    'creator.capture': 'Capture',
    'creator.lineUp': 'Line up your face',
    'creator.permissionTitle': 'We could not open the camera',
    'creator.noCamera': 'This device has no camera the browser can see.',
    'creator.checkWebcam': 'If you have a webcam plugged in, check it is connected.',
    'creator.cameraBusy': 'Another app is holding the camera. Close Zoom, Teams, Meet or whatever else might have it open, then try again.',
    'creator.desktopPermission': 'Chrome is refusing the camera for this site. Click the camera or lock icon at the left of the address bar and set Camera to Allow, then reload.',
    'creator.windowsPermission': 'If that is already allowed, Windows itself may be blocking it: Settings → Privacy & security → Camera, and turn on both “Camera access” and “Let desktop apps access your camera”.',
    'creator.sitePermission': 'Your browser is refusing the camera for this site. Allow it in the site settings, then try again.',
    'creator.privacyReminder': 'The video stays on your device either way — only the cropped face is ever saved.',
    'creator.adjusting': 'Adjusting for this phone…',
    'creator.cameraStalled': 'The camera is not sending a picture. Try reopening this.',
    'creator.framing.too_far': 'Come a bit closer.',
    'creator.framing.off_center': 'Center your face in the frame.',
    'creator.gotIt': 'Got it!',
    'creator.holdStill': 'Hold still… {count}',
    'creator.generationTitle': 'That one did not work',
    'creator.generationBody': 'We could not cut your face out of that frame. Nothing was saved — give it another go.',
    'creator.shuffle': 'Shuffle look',
    'creator.retake': 'Retake',
    'creator.addToTank': 'Add to tank',
    'creator.previewTitle': 'Meet your fish',
    'creator.adding': 'Adding…',
    'creator.added': 'You are in the tank',
    'creator.submitError': 'Could not reach the tank. Check your connection and try again.',
    'api.invalid_name': 'Pick a name between 1 and 24 characters.',
    'api.wrong_passphrase': 'That is not the passphrase.',
    'api.invalid_face_image': 'That face picture could not be used.',
    'api.not_your_fish': 'You can only remove your own fish.',
    'api.cannot_feed_self': 'Feeding is for friends. Go bother someone else.',
    'api.gate_required': 'This tank is private. Enter the passphrase to come in.',
    'api.not_signed_in': 'Pick a name to join the tank first.',
    'api.tank_not_found': 'That tank could not be found.',
    'api.fish_not_found': 'That fish could not be found.',
    'api.face_not_found': 'That face picture could not be found.',
    'api.invalid_body': 'That request could not be understood.',
    'api.not_found': 'That could not be found.',
    'api.internal_error': 'Something went wrong. Try again.',
  },
  ko: {
    'meta.title': 'friend fish aquarium',
    'meta.description': '친구들이 물고기가 되는 함께 쓰는 수조예요. 친구를 만나고 먹이도 주세요.',
    'language.label': '언어',
    'common.cancel': '취소',
    'common.reload': '새로고침',
    'common.tryAgain': '다시 시도',
    'error.generic': '문제가 생겼어요. 다시 시도해 주세요.',
    'fatal.title': '수조가 닫혀 있어요',
    'fatal.webgl': '이 브라우저는 WebGL을 지원하지 않아 수조를 그릴 수 없어요. 브라우저 설정에서 하드웨어 가속을 켜거나 다른 기기에서 열어 주세요.',
    'fatal.notFound': '이 수조 링크는 더 이상 존재하지 않아요.',
    'fatal.unreachable': '수조에 연결할 수 없어요. 서버가 실행 중인지 확인해 주세요.',
    'fatal.setup': '수조를 준비하는 중 문제가 생겼어요.',
    'connection.reconnecting': '수조 연결이 끊겼어요 — 다시 연결 중',
    'hud.addFish': '내 물고기 추가',
    'hud.reconnecting': '다시 연결 중…',
    'hud.summary': '물고기 {fishCount}마리 · 지금 {onlineCount}명 접속 중',
    'hud.whoAreYou': '누구세요?',
    'hud.signedInAs': '{name}님으로 접속 중',
    'hud.copyInvitePrivate': '초대 링크 복사 (바로 입장)',
    'hud.copyInvite': '초대 링크 복사',
    'hud.inviteCopied': '초대 링크를 복사했어요',
    'hud.copyInvitePrompt': '이 초대 링크를 복사하세요',
    'hud.changeName': '내 이름 바꾸기',
    'hud.facePrivacy': '친구들이 내 물고기를 알아볼 수 있도록 얼굴 사진만 저장해요.',
    'hud.signOut': '로그아웃',
    'hud.signedOut': '로그아웃했어요',
    'hud.deleteData': '내 물고기와 데이터 삭제',
    'hud.deleteTitle': '모두 삭제할까요?',
    'hud.deleteBody': '내 물고기와 서버에 저장된 얼굴 사진, 계정 정보를 모두 삭제해요. 되돌릴 수 없어요.',
    'hud.deleteConfirm': '모두 삭제',
    'hud.deleted': '삭제했어요. 수조에 내 데이터가 남아 있지 않아요.',
    'name.label': '수조에서 어떤 이름으로 부를까요?',
    'name.save': '저장',
    'name.join': '수조 입장',
    'name.changeTitle': '이름 바꾸기',
    'name.joinTitle': '수조 입장',
    'name.body': '비밀번호도 이메일도 필요 없어요. 친구들이 물고기 위에서 볼 이름만 정해 주세요.',
    'gate.placeholder': '암호',
    'gate.label': '암호',
    'gate.enter': '들어가기',
    'gate.checking': '확인 중…',
    'gate.reachError': '수조에 연결할 수 없어요. 다시 시도해 주세요.',
    'gate.title': '비공개 수조예요',
    'gate.body': '링크를 보내 준 사람에게 암호를 물어보세요. 모두 같은 암호를 사용해요.',
    'fish.you': '나',
    'fish.status.hungry': '배고픔',
    'fish.status.okay': '괜찮음',
    'fish.status.full': '배부름',
    'fish.statusLine': '{status} · {fullness}/{max}',
    'fish.remove': '내 물고기 제거',
    'fish.joinHint': '이름을 정하고 친구들에게 먹이를 주세요.',
    'fish.join': '수조 입장',
    'fish.selfHint': '내 물고기예요. 친구가 먹이를 줄 때까지 기다려 주세요.',
    'fish.fullHint': '{name}님은 배불러요. 소화되면 다시 와 주세요.',
    'fish.cooldown': '잠시만요 — {seconds}초',
    'fish.feedWorth': '먹이 하나로 포만도가 {amount} 올라요.',
    'fish.feeding': '먹이 주는 중…',
    'fish.feed': '먹이 주기',
    'fish.fedToast': '{name}님에게 먹이를 줬어요',
    'fish.fullToast': '{name}님은 배불러요',
    'fish.ignoredToast': '{name}님이 모른 척했어요',
    'fish.slowDown': '조금 천천히 주세요',
    'fish.left': '그 물고기가 방금 수조를 떠났어요',
    'fish.feedError': '지금은 먹이를 줄 수 없어요',
    'fish.removeTitle': '내 물고기를 제거할까요?',
    'fish.removeBody': '물고기가 수조를 떠나고 서버에 저장된 얼굴 사진도 삭제돼요. 언제든 새로 만들 수 있어요.',
    'fish.removeConfirm': '제거',
    'fish.removed': '내 물고기를 제거했어요',
    'fish.removeError': '내 물고기를 제거할 수 없어요',
    'fish.aria': '{name}{mine} — {status}, 포만도 {max} 중 {fullness}. 동작 열기.',
    'fish.mineSuffix': ' (나)',
    'activity.label': '활동',
    'activity.hide': '기록 숨기기',
    'activity.title': '활동',
    'activity.titleCount': '활동 ({count})',
    'activity.empty': '아직 아무 일도 없었어요.',
    'activity.someone': '누군가',
    'activity.presenceSuffix': '님이 여기 있어요',
    'activity.joinedSuffix': '님이 수조에 들어왔어요',
    'activity.fedMiddle': '님이 ',
    'activity.fedSuffix': '님에게 먹이를 줬어요',
    'activity.fullSuffix': '님이 배불러요',
    'activity.ignoredMiddle': '님이 ',
    'activity.ignoredSuffix': '님을 모른 척했어요',
    'creator.consent': '카메라는 이 브라우저에서만 작동하며, 친구들이 내 물고기를 알아볼 수 있도록 자른 얼굴 사진 한 장만 수조에 저장된다는 점을 이해했어요. 사진은 언제든 삭제할 수 있어요.',
    'creator.turnOnCamera': '카메라 켜기',
    'creator.title': '내 물고기 추가',
    'creator.intro': '카메라를 얼굴에 맞춰 주세요. 얼굴을 찾아 잘라서 물고기에 붙여 드려요. 영상은 녹화하지 않고 자른 사진 한 장만 저장해요.',
    'creator.inAppBrowser': '{appName} 앱 내 브라우저를 사용 중이에요. 카메라가 작동하지 않을 수 있으니 Chrome에서 이 페이지를 열어 보세요.',
    'creator.openChrome': 'Chrome에서 열기',
    'creator.copyLink': '링크 복사',
    'creator.copiedChrome': '복사했어요 — Chrome에 붙여 넣으세요',
    'creator.copyChromePrompt': '이 링크를 복사해 Chrome에 붙여 넣으세요',
    'creator.unsupportedCamera': '이 브라우저에서는 카메라를 사용할 수 없어요. 전면 카메라가 있는 기기에서 Safari나 Chrome을 사용해 보세요.',
    'creator.startingCamera': '카메라 시작 중…',
    'creator.detectorFailed': '이 기기에서 얼굴 감지기를 시작할 수 없어요. 다른 브라우저를 사용하거나 주변에 도움을 요청해 보세요.',
    'creator.detectorFailedShort': '이 기기에서 얼굴 감지기를 시작할 수 없어요.',
    'creator.tapStart': '탭해서 카메라 시작',
    'creator.centerFace': '프레임 가운데에 얼굴을 맞춰 주세요.',
    'creator.browserPaused': '브라우저가 카메라를 일시 중지했어요.',
    'creator.capture': '촬영',
    'creator.lineUp': '얼굴을 맞춰 주세요',
    'creator.permissionTitle': '카메라를 열 수 없어요',
    'creator.noCamera': '브라우저에서 사용할 수 있는 카메라가 이 기기에 없어요.',
    'creator.checkWebcam': '웹캠을 연결했다면 제대로 연결되어 있는지 확인해 주세요.',
    'creator.cameraBusy': '다른 앱이 카메라를 사용 중이에요. Zoom, Teams, Meet 등 카메라를 쓰는 앱을 닫고 다시 시도해 주세요.',
    'creator.desktopPermission': 'Chrome이 이 사이트의 카메라 사용을 차단하고 있어요. 주소창 왼쪽의 카메라 또는 자물쇠 아이콘을 눌러 카메라를 허용한 뒤 새로고침해 주세요.',
    'creator.windowsPermission': '이미 허용했다면 Windows 설정 → 개인 정보 및 보안 → 카메라에서 “카메라 액세스”와 “데스크톱 앱에서 카메라에 액세스하도록 허용”을 모두 켜 주세요.',
    'creator.sitePermission': '브라우저가 이 사이트의 카메라 사용을 차단하고 있어요. 사이트 설정에서 허용한 뒤 다시 시도해 주세요.',
    'creator.privacyReminder': '어떤 경우에도 영상은 기기에만 남고, 잘라낸 얼굴 사진만 저장돼요.',
    'creator.adjusting': '이 휴대폰에 맞게 조정 중…',
    'creator.cameraStalled': '카메라가 화면을 보내지 않고 있어요. 창을 닫고 다시 열어 보세요.',
    'creator.framing.too_far': '조금 더 가까이 와 주세요.',
    'creator.framing.off_center': '프레임 가운데에 얼굴을 맞춰 주세요.',
    'creator.gotIt': '좋아요!',
    'creator.holdStill': '그대로 있어 주세요… {count}',
    'creator.generationTitle': '사진을 처리하지 못했어요',
    'creator.generationBody': '이 화면에서 얼굴을 잘라낼 수 없었어요. 아무것도 저장하지 않았으니 다시 시도해 주세요.',
    'creator.shuffle': '모양 바꾸기',
    'creator.retake': '다시 찍기',
    'creator.addToTank': '수조에 추가',
    'creator.previewTitle': '내 물고기를 만나 보세요',
    'creator.adding': '추가 중…',
    'creator.added': '수조에 들어왔어요',
    'creator.submitError': '수조에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
    'api.invalid_name': '이름은 1자에서 24자 사이로 입력해 주세요.',
    'api.wrong_passphrase': '암호가 맞지 않아요.',
    'api.invalid_face_image': '이 얼굴 사진은 사용할 수 없어요.',
    'api.not_your_fish': '내 물고기만 제거할 수 있어요.',
    'api.cannot_feed_self': '먹이는 친구에게 받는 거예요. 다른 친구를 찾아보세요.',
    'api.gate_required': '비공개 수조예요. 암호를 입력해 주세요.',
    'api.not_signed_in': '먼저 이름을 정하고 수조에 들어와 주세요.',
    'api.tank_not_found': '수조를 찾을 수 없어요.',
    'api.fish_not_found': '물고기를 찾을 수 없어요.',
    'api.face_not_found': '얼굴 사진을 찾을 수 없어요.',
    'api.invalid_body': '요청을 이해할 수 없어요.',
    'api.not_found': '요청한 항목을 찾을 수 없어요.',
    'api.internal_error': '문제가 생겼어요. 다시 시도해 주세요.',
  },
};

const browserStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export function detectLocale({ storage = browserStorage(), languages = globalThis.navigator?.languages } = {}) {
  let saved = null;
  try {
    saved = storage?.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Privacy modes can make localStorage throw; language detection still works.
  }
  if (SUPPORTED_LOCALES.includes(saved)) return saved;

  const preferred = languages?.[0] ?? globalThis.navigator?.language ?? '';
  return String(preferred).toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let currentLocale = detectLocale();
const listeners = new Set();

export function getLocale() {
  return currentLocale;
}

export function translate(key, variables = {}, locale = currentLocale) {
  const catalog = catalogs[SUPPORTED_LOCALES.includes(locale) ? locale : 'en'];
  const message = catalog[key] ?? catalog['error.generic'];
  return message.replace(/\{([a-zA-Z][\w]*)\}/g, (_, name) => String(variables[name] ?? ''));
}

export const t = translate;

export function setLocale(locale, { persist = true } = {}) {
  if (!SUPPORTED_LOCALES.includes(locale)) return false;
  currentLocale = locale;
  if (persist) {
    try {
      browserStorage()?.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // The selection still applies for this page when storage is unavailable.
    }
  }
  applyDocumentLocale();
  for (const listener of [...listeners]) listener(locale);
  return true;
}

export function subscribeLocale(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyDocumentLocale() {
  if (!globalThis.document) return;
  document.documentElement.lang = currentLocale;
  document.title = translate('meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', translate('meta.description'));
}

export function bindText(node, key, variables = {}) {
  const render = () => {
    const resolvedKey = typeof key === 'function' ? key() : key;
    node.textContent = translate(resolvedKey, typeof variables === 'function' ? variables() : variables);
  };
  render();
  const stop = subscribeLocale(() => {
    if (!node.isConnected) {
      stop();
      return;
    }
    render();
  });
  return stop;
}

export function bindAttribute(node, attribute, key, variables = {}) {
  const render = () => {
    const resolvedKey = typeof key === 'function' ? key() : key;
    node.setAttribute(attribute, translate(resolvedKey, typeof variables === 'function' ? variables() : variables));
  };
  render();
  const stop = subscribeLocale(() => {
    if (!node.isConnected) {
      stop();
      return;
    }
    render();
  });
  return stop;
}

export function formatDateTime(value, locale = currentLocale) {
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US');
}

export function translateStatus(status, locale = currentLocale) {
  const key = `fish.status.${status}`;
  return catalogs[locale]?.[key] ? translate(key, {}, locale) : translate('error.generic', {}, locale);
}

export function apiErrorMessage(error, locale = currentLocale) {
  return translate(apiErrorKey(error, locale), {}, locale);
}

export function apiErrorKey(error, locale = currentLocale) {
  const code = typeof error === 'string' ? error : error?.code ?? error?.body?.error;
  const key = `api.${code}`;
  return code && catalogs[locale]?.[key] ? key : 'error.generic';
}

const strong = (text) => ({ text, strong: true });
const plain = (text) => ({ text, strong: false });

export function activitySegments(event, locale = currentLocale) {
  const actor = event.payload?.actorName ?? translate('activity.someone', {}, locale);
  const target = event.payload?.targetName ?? translate('activity.someone', {}, locale);
  switch (event.type) {
    case 'presence':
      return [strong(actor), plain(translate('activity.presenceSuffix', {}, locale))];
    case 'joined':
      return [strong(actor), plain(translate('activity.joinedSuffix', {}, locale))];
    case 'fed':
      return locale === 'ko'
        ? [strong(actor), plain(translate('activity.fedMiddle', {}, locale)), strong(target), plain(translate('activity.fedSuffix', {}, locale))]
        : [strong(actor), plain(translate('activity.fedMiddle', {}, locale)), strong(target)];
    case 'full':
      return [strong(target), plain(translate('activity.fullSuffix', {}, locale))];
    case 'ignored':
      return locale === 'ko'
        ? [strong(target), plain(translate('activity.ignoredMiddle', {}, locale)), strong(actor), plain(translate('activity.ignoredSuffix', {}, locale))]
        : [strong(target), plain(translate('activity.ignoredMiddle', {}, locale)), strong(actor)];
    default:
      return [plain(translate('error.generic', {}, locale))];
  }
}

applyDocumentLocale();
