// Button (multi-file directory)
export * from "./button";

// Motion primitives
export * from "./marquee";
export * from "./tabs";
export * from "./switch";
export * from "./checkbox";
export * from "./radio";
export * from "./tilt-card";
export * from "./dock";
export * from "./tooltip";
export * from "./bottom-sheet";
export * from "./morphing-modal";
export * from "./animated-badge";
export * from "./animated-toast-stack";
export * from "./theme-toggle";
export * from "./bouncy-accordion";
export * from "./drawer";
export * from "./range-slider";
export * from "./shared-layout-bg";

// Text animation
export * from "./text-reveal";
export * from "./text-shimmer";
export * from "./text-cascade";

// Number animation
export * from "./number-ticker";
export * from "./animated-number";

// Action swap — base exports first, then variant-unique names only (variants
// re-export the base types internally, so we avoid double-exporting them)
export * from "./action-swap";
export { ActionSwapCascadeButton, ActionSwapCascadeText, ActionSwapCascadeIcon } from "./action-swap-cascade";
export type { ActionSwapCascadeButtonProps, ActionSwapCascadeTextProps, ActionSwapCascadeIconProps } from "./action-swap-cascade";
export { ActionSwapBlurButton, ActionSwapBlurText, ActionSwapBlurIcon } from "./action-swap-blur";
export type { ActionSwapBlurButtonProps, ActionSwapBlurTextProps, ActionSwapBlurIconProps } from "./action-swap-blur";
export { ActionSwapRollButton, ActionSwapRollText, ActionSwapRollIcon } from "./action-swap-roll";
export type { ActionSwapRollButtonProps, ActionSwapRollTextProps, ActionSwapRollIconProps } from "./action-swap-roll";

// Scroll animation
export * from "./smooth-scroll";
export * from "./scroll-progress";
export * from "./parallax";
export * from "./scroll-to";
export * from "./scroll-reveal";

// Shared primitive (used internally by MagneticButton, also useful standalone)
export * from "./magnetic";

// Blocks
export * from "./swap";
export * from "./dynamic-island";
export * from "./command-palette";
export * from "./expandable-action-bar";
export * from "./overflow-actions";
export * from "./expandable-tabs";
export * from "./swipeable-list";
export * from "./file-upload";
export * from "./prediction-market";
export * from "./otp-input";
export * from "./bloom-menu";
export * from "./not-found";
