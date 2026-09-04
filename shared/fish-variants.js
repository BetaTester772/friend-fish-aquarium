/**
 * Fish look-and-feel options, shared by the client renderer and the server
 * validator so a fish can never be stored with a variant the scene can't draw.
 *
 * The Reel shows chunky pastel bodies at wildly different sizes with a flat
 * face plate at the front (spec S4 "Customization" is listed as unobserved, so
 * these are picked randomly at creation time).
 */
export const BODY_VARIANTS = ['blimp', 'torpedo', 'orb', 'guppy'];
export const FIN_VARIANTS = ['classic', 'spiky', 'ribbon', 'fan'];

export const BODY_COLORS = [
  '#6ad3c8', // seafoam
  '#f45d4c', // tomato
  '#d6e34b', // acid lime
  '#7b4bd6', // grape
  '#4bb2e3', // pool blue
  '#4ce35d', // slime
  '#e3a14b', // apricot
  '#e34ba7', // bubblegum
];

/** Scale multiplier applied to the body. Big fish / tiny fish is the joke. */
export const SCALE_RANGE = { min: 0.5, max: 1.55 };

export const isBodyVariant = (v) => BODY_VARIANTS.includes(v);
export const isFinVariant = (v) => FIN_VARIANTS.includes(v);
export const isBodyColor = (v) => BODY_COLORS.includes(v);

export function randomLook(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  return {
    bodyVariant: pick(BODY_VARIANTS),
    finVariant: pick(FIN_VARIANTS),
    bodyColor: pick(BODY_COLORS),
    scale:
      SCALE_RANGE.min + random() * (SCALE_RANGE.max - SCALE_RANGE.min),
  };
}
