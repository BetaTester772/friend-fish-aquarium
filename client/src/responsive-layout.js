export function responsiveFishingLayout(width, height) {
  if (height <= 520) return 'compact';
  if (width <= 720) return 'stacked';
  if (width <= 980) return 'tablet';
  return 'wide';
}

export function fishCardTopInset(width, height, controlsBottom = 0) {
  return responsiveFishingLayout(width, height) === 'stacked'
    ? Math.max(108, controlsBottom + 8)
    : 8;
}
