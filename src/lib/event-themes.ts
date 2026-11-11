export const themes = [
  { id: "galactic-gatsby", icon: "◈", name: "Galactic Gatsby", line: "Gold tuxedos, cosmic champagne, zero restraint.", colors: ["#f4cf79", "#8f672e"] },
  { id: "disco-supernova", icon: "🪩", name: "Disco Supernova", line: "A dance floor visible from another galaxy.", colors: ["#ff6bd6", "#7b6dff"] },
  { id: "black-hole-brunch", icon: "☕", name: "Black Hole Brunch", line: "Bottomless mimosas. Questionable gravity.", colors: ["#f9a86a", "#4d52ae"] },
  { id: "moonlight-masquerade", icon: "☾", name: "Moonlight Masquerade", line: "Masks, moonbeams, and excellent secrets.", colors: ["#b9c7ff", "#6f5fd0"] },
  { id: "cosmic-carnival", icon: "🎡", name: "Cosmic Carnival", line: "Cotton candy with a side of chaos.", colors: ["#ff8caa", "#fbad63"] },
  { id: "interstellar-garden", icon: "✿", name: "Interstellar Garden", line: "Flowers that look suspiciously celestial.", colors: ["#9af0cc", "#708dff"] },
  { id: "retro-rocket-rave", icon: "🚀", name: "Retro Rocket Rave", line: "Midcentury sci-fi, maximalist dance moves.", colors: ["#ffb354", "#ff5c8f"] },
  { id: "stardust-soiree", icon: "✨", name: "Stardust Soirée", line: "A glitter storm with a guest list.", colors: ["#ffc4ec", "#bda9ff"] },
  { id: "saturn-sweet-sixteen", icon: "🪐", name: "Saturn's Sweet Sixteen", line: "The rings are not optional accessories.", colors: ["#ffd889", "#e893d0"] },
  { id: "nebula-nonsense", icon: "☁", name: "Nebula Nonsense", line: "A very serious excuse for dramatic fog.", colors: ["#b28bff", "#42c9d7"] },
  { id: "orbiting-opera", icon: "♫", name: "Orbiting Opera", line: "Big feelings. Bigger chandeliers.", colors: ["#ef7f97", "#d8adff"] },
  { id: "meteor-afterparty", icon: "☄", name: "Meteor Shower Afterparty", line: "The grand entrance is literally falling stars.", colors: ["#8ee6fb", "#fba567"] },
] as const;

export function themeName(themeId: string): string | null {
  return themes.find(theme => theme.id === themeId)?.name ?? null;
}
