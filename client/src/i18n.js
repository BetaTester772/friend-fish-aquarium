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
    'fish.reactAria': 'React {emoji} to {name}',
    'fish.reactionError': 'Could not send that reaction',
    'fish.nudge': '💥 Nudge this fish',
    'fish.nudging': 'Nudging…',
    'fish.nudged': 'Nudged {name}',
    'fish.nudgeError': 'Could not nudge that fish',
    'fish.aria': '{name}{mine} — {status}, {fullness} out of {max} full. Open actions.',
    'fish.mineSuffix': ' (you)',
    'fishing.idle': 'Try your luck',
    'fishing.cast': '🎣 Cast a line',
    'fishing.waiting': 'Waiting near {name}…',
    'fishing.wait': 'Wait…',
    'fishing.bite': 'A bite!',
    'fishing.reel': 'Reel now!',
    'fishing.missed': 'It got away',
    'fishing.tooEarly': 'Too early — the fish got spooked',
    'fishing.tooLate': 'Too late — the fish got away',
    'fishing.targetGone': 'That fish left before the bite',
    'fishing.caught': 'Caught {name}! Released safely.',
    'fishing.error': 'Could not reel that fish in',
    'effect.reactionAria': '{actor} reacted {emoji}',
    'effect.hitAria': '{actor} nudged a fish',
    'effect.catchAria': '{actor} caught and released a fish',
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
    'api.invalid_reaction': 'That reaction is not available.',
    'api.cannot_hit_self': 'You cannot nudge your own fish.',
    'api.interaction_cooldown': 'Give it a moment before trying that again.',
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
    'meta.description': '친구들이 물고기로 헤엄치는 우리만의 수조예요. 구경하고, 먹이도 주고, 함께 놀아 보세요.',
    'language.label': '언어',
    'common.cancel': '취소',
    'common.reload': '새로고침',
    'common.tryAgain': '다시 해 보기',
    'error.generic': '앗, 문제가 생겼어요. 잠시 뒤에 다시 해 주세요.',
    'fatal.title': '수조를 열지 못했어요',
    'fatal.webgl': '이 브라우저에서는 수조 화면을 그릴 수 없어요. 브라우저의 하드웨어 가속을 켜거나 다른 기기에서 다시 열어 주세요.',
    'fatal.notFound': '이 수조는 사라졌거나 링크가 잘못됐어요.',
    'fatal.unreachable': '수조에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 해 주세요.',
    'fatal.setup': '수조를 준비하다가 문제가 생겼어요. 새로고침해 주세요.',
    'connection.reconnecting': '수조와 연결이 끊겼어요. 다시 연결하고 있어요…',
    'hud.addFish': '내 물고기 추가',
    'hud.reconnecting': '다시 연결 중…',
    'hud.summary': '물고기 {fishCount}마리 · {onlineCount}명이 함께 보는 중',
    'hud.whoAreYou': '이름 알려주기',
    'hud.signedInAs': '{name}님으로 들어와 있어요',
    'hud.copyInvitePrivate': '바로 들어오는 초대 링크 복사',
    'hud.copyInvite': '초대 링크 복사',
    'hud.inviteCopied': '초대 링크를 복사했어요',
    'hud.copyInvitePrompt': '아래 초대 링크를 복사해 친구에게 보내 주세요',
    'hud.changeName': '이름 바꾸기',
    'hud.facePrivacy': '친구들이 알아볼 수 있게 잘라낸 얼굴 사진 한 장만 보관해요.',
    'hud.signOut': '수조에서 나가기',
    'hud.signedOut': '수조에서 나왔어요',
    'hud.deleteData': '내 정보 모두 삭제',
    'hud.deleteTitle': '내 정보를 모두 지울까요?',
    'hud.deleteBody': '내 물고기와 얼굴 사진, 이름을 모두 지워요. 한 번 지우면 되돌릴 수 없어요.',
    'hud.deleteConfirm': '네, 모두 지울게요',
    'hud.deleted': '모두 지웠어요. 수조에 내 정보가 남아 있지 않아요.',
    'name.label': '수조에서 쓸 이름을 알려 주세요',
    'name.save': '이 이름으로 저장',
    'name.join': '이 이름으로 들어가기',
    'name.changeTitle': '이름 바꾸기',
    'name.joinTitle': '수조에 들어갈까요?',
    'name.body': '가입은 필요 없어요. 친구들이 알아볼 이름만 하나 정해 주세요.',
    'gate.placeholder': '암호',
    'gate.label': '암호',
    'gate.enter': '수조 들어가기',
    'gate.checking': '암호 확인 중…',
    'gate.reachError': '수조에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.',
    'gate.title': '비공개 수조예요',
    'gate.body': '초대 링크를 보내 준 친구에게 수조 암호를 물어보세요.',
    'fish.you': '나',
    'fish.status.hungry': '배고파요',
    'fish.status.okay': '잘 지내요',
    'fish.status.full': '배불러요',
    'fish.statusLine': '{status} · 포만도 {fullness}/{max}',
    'fish.remove': '내 물고기 보내기',
    'fish.joinHint': '먼저 이름을 알려 주면 친구 물고기와 놀 수 있어요.',
    'fish.join': '이름 알려주기',
    'fish.selfHint': '내 물고기예요. 이번에는 친구가 먹여 주길 기다려 볼까요?',
    'fish.fullHint': '{name} 물고기는 지금 배가 불러요. 조금 뒤에 다시 와 주세요.',
    'fish.cooldown': '조금만 기다려 주세요 · {seconds}초',
    'fish.feedWorth': '먹이를 주면 포만도가 {amount}만큼 올라요.',
    'fish.feeding': '먹이 주는 중…',
    'fish.feed': '먹이 주기',
    'fish.fedToast': '{name} 물고기가 맛있게 먹었어요',
    'fish.fullToast': '{name} 물고기는 이미 배가 불러요',
    'fish.ignoredToast': '{name} 물고기가 먹이를 슬쩍 피했어요',
    'fish.slowDown': '잠깐만요. 조금 뒤에 다시 주세요.',
    'fish.left': '방금 수조를 떠난 물고기예요',
    'fish.feedError': '먹이를 주지 못했어요. 잠시 뒤에 다시 해 주세요.',
    'fish.removeTitle': '내 물고기를 수조에서 보낼까요?',
    'fish.removeBody': '내 물고기와 얼굴 사진이 수조에서 사라져요. 원하면 언제든 새로 만들 수 있어요.',
    'fish.removeConfirm': '물고기 보내기',
    'fish.removed': '내 물고기를 수조에서 보냈어요',
    'fish.removeError': '물고기를 보내지 못했어요. 잠시 뒤에 다시 해 주세요.',
    'fish.reactAria': '{name} 물고기에게 {emoji} 반응 보내기',
    'fish.reactionError': '반응을 보내지 못했어요. 잠시 뒤에 다시 해 주세요.',
    'fish.nudge': '💥 살짝 툭 치기',
    'fish.nudging': '다가가는 중…',
    'fish.nudged': '{name} 물고기를 살짝 툭 쳤어요',
    'fish.nudgeError': '지금은 물고기를 툭 칠 수 없어요. 잠시 뒤에 다시 해 주세요.',
    'fish.aria': '{name}{mine} 물고기. {status}. 포만도 {max} 중 {fullness}. 메뉴 열기.',
    'fish.mineSuffix': ' (나)',
    'fishing.idle': '타이밍에 맞춰 물고기를 낚아 보세요',
    'fishing.cast': '🎣 낚시 시작',
    'fishing.waiting': '{name} 물고기가 미끼를 물 때까지 기다리는 중…',
    'fishing.wait': '입질을 기다리세요…',
    'fishing.bite': '지금이에요!',
    'fishing.reel': '낚아 올리기!',
    'fishing.missed': '아쉽게 놓쳤어요',
    'fishing.tooEarly': '앗, 너무 빨랐어요. 물고기가 놀라 도망갔어요.',
    'fishing.tooLate': '앗, 한발 늦었어요. 물고기가 도망갔어요.',
    'fishing.targetGone': '기다리던 물고기가 수조를 떠났어요',
    'fishing.caught': '{name} 물고기를 낚았어요! 바로 놓아 줬으니 걱정 마세요.',
    'fishing.error': '낚시에 실패했어요. 잠시 뒤에 다시 해 주세요.',
    'effect.reactionAria': '{actor}님이 {emoji} 반응을 보냈어요',
    'effect.hitAria': '{actor}님이 물고기를 살짝 툭 쳤어요',
    'effect.catchAria': '{actor}님이 물고기를 낚았다가 바로 놓아 줬어요',
    'activity.label': '수조 소식',
    'activity.hide': '소식 숨기기',
    'activity.title': '수조 소식',
    'activity.titleCount': '수조 소식 {count}개',
    'activity.empty': '아직 조용하네요. 친구를 불러 볼까요?',
    'activity.someone': '누군가',
    'activity.presenceSuffix': '님이 수조에 놀러 왔어요',
    'activity.joinedSuffix': '님의 물고기가 수조에 합류했어요',
    'activity.fedMiddle': '님이 ',
    'activity.fedSuffix': '님에게 먹이를 줬어요',
    'activity.fullSuffix': ' 물고기는 이제 배가 불러요',
    'activity.ignoredMiddle': '님이 ',
    'activity.ignoredSuffix': '님의 먹이를 슬쩍 피했어요',
    'creator.consent': '카메라 영상은 이 기기에서만 처리돼요. 친구들이 알아볼 수 있도록 잘라낸 얼굴 사진 한 장만 수조에 보관해요. 이 사진은 언제든 직접 지울 수 있어요.',
    'creator.turnOnCamera': '카메라 켜기',
    'creator.title': '내 물고기 추가',
    'creator.intro': '카메라 앞에 얼굴을 맞춰 주세요. 얼굴 부분만 예쁘게 잘라 내 물고기에 붙여 드릴게요. 영상은 녹화하지 않아요.',
    'creator.inAppBrowser': '지금 {appName} 앱 안에서 열려 있어 카메라가 작동하지 않을 수 있어요. Chrome에서 다시 열어 보세요.',
    'creator.openChrome': 'Chrome에서 열기',
    'creator.copyLink': '링크 복사',
    'creator.copiedChrome': '링크를 복사했어요. Chrome에 붙여 넣어 주세요.',
    'creator.copyChromePrompt': '아래 링크를 복사해 Chrome에 붙여 넣어 주세요',
    'creator.unsupportedCamera': '이 브라우저에서는 카메라를 쓸 수 없어요. 카메라가 있는 기기에서 Safari나 Chrome으로 다시 열어 주세요.',
    'creator.startingCamera': '카메라 시작 중…',
    'creator.detectorFailed': '얼굴을 찾는 기능을 시작하지 못했어요. 다른 브라우저에서 다시 열어 보세요.',
    'creator.detectorFailedShort': '얼굴을 찾는 기능을 시작하지 못했어요.',
    'creator.tapStart': '눌러서 카메라 켜기',
    'creator.centerFace': '화면 가운데에 얼굴을 맞춰 주세요.',
    'creator.browserPaused': '카메라가 잠시 멈췄어요.',
    'creator.capture': '촬영',
    'creator.lineUp': '얼굴을 화면에 맞춰 주세요',
    'creator.permissionTitle': '카메라를 열 수 없어요',
    'creator.noCamera': '이 기기에서 사용할 수 있는 카메라를 찾지 못했어요.',
    'creator.checkWebcam': '웹캠을 쓰고 있다면 케이블이 잘 연결됐는지 확인해 주세요.',
    'creator.cameraBusy': '다른 앱이 카메라를 사용하고 있어요. Zoom이나 Meet처럼 카메라를 쓰는 앱을 닫고 다시 해 주세요.',
    'creator.desktopPermission': 'Chrome이 카메라 사용을 막고 있어요. 주소창 왼쪽의 카메라나 자물쇠 아이콘을 눌러 카메라를 허용한 뒤 새로고침해 주세요.',
    'creator.windowsPermission': '이미 허용했다면 Windows 설정 → 개인 정보 및 보안 → 카메라에서 “카메라 액세스”와 “데스크톱 앱에서 카메라에 액세스하도록 허용”을 모두 켜 주세요.',
    'creator.sitePermission': '브라우저가 카메라 사용을 막고 있어요. 사이트 설정에서 카메라를 허용한 뒤 다시 해 주세요.',
    'creator.privacyReminder': '영상은 이 기기 밖으로 나가지 않아요. 잘라낸 얼굴 사진 한 장만 저장해요.',
    'creator.adjusting': '화면을 맞추는 중…',
    'creator.cameraStalled': '카메라 화면이 멈췄어요. 이 창을 닫고 다시 열어 주세요.',
    'creator.framing.too_far': '조금 더 가까이 와 주세요.',
    'creator.framing.off_center': '화면 가운데에 얼굴을 맞춰 주세요.',
    'creator.gotIt': '좋아요!',
    'creator.holdStill': '그대로 있어 주세요… {count}',
    'creator.generationTitle': '얼굴 사진을 만들지 못했어요',
    'creator.generationBody': '얼굴을 또렷하게 잘라 내지 못했어요. 저장된 것은 없으니 편하게 다시 찍어 주세요.',
    'creator.shuffle': '모양 바꾸기',
    'creator.retake': '다시 찍기',
    'creator.addToTank': '이 모습으로 수조에 넣기',
    'creator.previewTitle': '내 물고기가 태어났어요!',
    'creator.adding': '수조로 데려가는 중…',
    'creator.added': '내 물고기가 수조에 들어왔어요',
    'creator.submitError': '물고기를 수조에 넣지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.',
    'api.invalid_name': '이름은 1자에서 24자 사이로 입력해 주세요.',
    'api.wrong_passphrase': '암호가 맞지 않아요. 다시 확인해 주세요.',
    'api.invalid_face_image': '사진을 읽지 못했어요. 다른 사진으로 다시 해 주세요.',
    'api.not_your_fish': '내 물고기만 수조에서 보낼 수 있어요.',
    'api.cannot_feed_self': '내 물고기 먹이는 친구에게 맡겨 볼까요?',
    'api.invalid_reaction': '고를 수 없는 반응이에요.',
    'api.cannot_hit_self': '내 물고기 말고 친구 물고기를 골라 주세요.',
    'api.interaction_cooldown': '잠깐 쉬었다가 다시 놀아 주세요.',
    'api.gate_required': '친구들만 들어오는 수조예요. 암호를 알려 주세요.',
    'api.not_signed_in': '먼저 이름을 알려 주세요.',
    'api.tank_not_found': '수조를 찾지 못했어요. 링크가 맞는지 확인해 주세요.',
    'api.fish_not_found': '그 물고기는 더 이상 수조에 없어요.',
    'api.face_not_found': '얼굴 사진을 찾지 못했어요.',
    'api.invalid_body': '입력한 내용을 다시 확인해 주세요.',
    'api.not_found': '찾는 내용을 발견하지 못했어요.',
    'api.internal_error': '잠시 문제가 생겼어요. 조금 뒤에 다시 해 주세요.',
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
