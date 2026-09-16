import test from 'node:test';
import assert from 'node:assert/strict';
import * as responsiveLayout from '../client/src/responsive-layout.js';

test('fishing controls choose a non-overlapping layout for each device shape', () => {
  const layout = responsiveLayout.responsiveFishingLayout;
  assert.equal(layout(390, 844), 'stacked');
  assert.equal(layout(844, 390), 'compact');
  assert.equal(layout(768, 1024), 'tablet');
  assert.equal(layout(1024, 768), 'wide');
});

test('fish cards stay below phone controls without wasting desktop space', () => {
  const inset = responsiveLayout.fishCardTopInset;
  assert.equal(inset?.(320, 568), 108);
  assert.equal(inset?.(390, 844), 108);
  assert.equal(inset?.(844, 390), 8);
  assert.equal(inset?.(768, 1024), 8);
  assert.equal(inset?.(390, 844, 131), 139);
});
