/**
 * Per-project identity color. Maps a project's REGISTRATION INDEX (its position
 * in the ordered list of registered project IDs — i.e. insertion order in the
 * global config) to one of 8 palette slots, cycling after 8.
 *
 * The color is an identity axis only, kept separate from semantic status color
 * and always paired with the project name/dot (never the sole signal).
 */
export interface ProjectColor {
  /** Palette slot 1..8. */
  slot: number;
  /** CSS var for the project color, e.g. "var(--project-color-3)". */
  colorVar: string;
  /** CSS var for the companion tint, e.g. "var(--project-tint-3)". */
  tintVar: string;
}

export const PROJECT_COLOR_SLOTS = 8;

export function getProjectColor(
  projectId: string,
  registeredProjectIds: string[],
): ProjectColor {
  const index = registeredProjectIds.indexOf(projectId);
  const slot = ((index < 0 ? 0 : index) % PROJECT_COLOR_SLOTS) + 1;
  return {
    slot,
    colorVar: `var(--project-color-${slot})`,
    tintVar: `var(--project-tint-${slot})`,
  };
}

/**
 * Tailwind background-color class for a palette slot. Spelled out (not
 * interpolated) so the CSS var reference is statically present for the bundler.
 */
const PROJECT_BG_CLASS: Record<number, string> = {
  1: "bg-[var(--project-color-1)]",
  2: "bg-[var(--project-color-2)]",
  3: "bg-[var(--project-color-3)]",
  4: "bg-[var(--project-color-4)]",
  5: "bg-[var(--project-color-5)]",
  6: "bg-[var(--project-color-6)]",
  7: "bg-[var(--project-color-7)]",
  8: "bg-[var(--project-color-8)]",
};

export function projectColorBgClass(slot: number): string {
  return PROJECT_BG_CLASS[slot] ?? "bg-[var(--project-color-1)]";
}

/** Tailwind left-border class for a palette slot (used for card rails). */
const PROJECT_BORDER_CLASS: Record<number, string> = {
  1: "border-l-[color:var(--project-color-1)]",
  2: "border-l-[color:var(--project-color-2)]",
  3: "border-l-[color:var(--project-color-3)]",
  4: "border-l-[color:var(--project-color-4)]",
  5: "border-l-[color:var(--project-color-5)]",
  6: "border-l-[color:var(--project-color-6)]",
  7: "border-l-[color:var(--project-color-7)]",
  8: "border-l-[color:var(--project-color-8)]",
};

export function projectColorBorderClass(slot: number): string {
  return PROJECT_BORDER_CLASS[slot] ?? "border-l-[color:var(--project-color-1)]";
}
