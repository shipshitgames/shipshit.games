import {
  BookOpen,
  Box,
  Code2,
  Dumbbell,
  FlaskConical,
  Folder,
  Gamepad2,
  Images,
  LayoutGrid,
  Map as MapIcon,
  Music,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type SectionId =
  | "projects"
  | "play-lab"
  | "gyms"
  | "gallery"
  | "maps"
  | "sprites"
  | "music"
  | "3d"
  | "moodboard"
  | "lab"
  | "resources"
  | "research"
  | "codegen";
export type Group = "Generators" | "Art Direction" | "Ressources" | "Codegen";
export type Section = { id: SectionId; label: string; group: Group; icon: LucideIcon; blurb: string };

export const SECTIONS: Section[] = [
  { id: "projects", label: "Projects", group: "Codegen", icon: Folder, blurb: "Local game repos, target manifests, and asset catalogs." },
  { id: "play-lab", label: "Play Lab", group: "Codegen", icon: Gamepad2, blurb: "Inspect an IP repo's playable slices, canon graph, assets, and reusable prompt context." },
  { id: "gyms", label: "Gyms", group: "Codegen", icon: Dumbbell, blurb: "Per-game validation surfaces for animation, bounds, hit frames, and tuning." },
  { id: "maps", label: "Maps", group: "Generators", icon: MapIcon, blurb: "Breach-zone layouts and arena maps for the Scourge front." },
  { id: "sprites", label: "Sprites", group: "Generators", icon: Sparkles, blurb: "Forge DOOM-grade billboards and enemy cutouts — straight into a game's assets." },
  { id: "music", label: "Music + SFX", group: "Generators", icon: Music, blurb: "Brutal scores and combat SFX for the shipshitshow." },
  { id: "3d", label: "3D", group: "Generators", icon: Box, blurb: "Meshes, props and Warden engineering for the 3D titles." },
  { id: "gallery", label: "Gallery", group: "Art Direction", icon: Images, blurb: "Review and compare every generated asset in a game's pack — sprites, tiers, textures, UI." },
  { id: "moodboard", label: "Moodboard", group: "Art Direction", icon: LayoutGrid, blurb: "Per-game reference boards for notes, images, and locked visual targets." },
  { id: "lab", label: "Lab", group: "Art Direction", icon: FlaskConical, blurb: "Forge styled variants of one subject, score and tag them, then lock the winning look as the game's style target." },
  { id: "resources", label: "Resources", group: "Ressources", icon: BookOpen, blurb: "Inventory sources, review transcript rights, validate derivatives, and promote approved skills." },
  { id: "research", label: "Rules", group: "Ressources", icon: BookOpen, blurb: "Distill a YouTube game-dev tutorial into a reusable build ruleset." },
  { id: "codegen", label: "Codegen", group: "Codegen", icon: Code2, blurb: "Plan → Review → Execute → Verify → Ship over the local CLI." },
];
export const GROUPS: Group[] = ["Generators", "Art Direction", "Ressources", "Codegen"];

export const PROVIDERS = [
  { id: "codex", label: "Codex CLI — your subscription (no key)" },
  { id: "openai", label: "OpenAI API (gpt-image-2)" },
  { id: "fal", label: "fal.ai (FLUX)" },
  { id: "replicate", label: "Replicate" },
  { id: "suno", label: "Suno" },
  { id: "mock", label: "Mock (offline test)" },
];
export const KEYED = [
  { id: "openai", label: "OpenAI" },
  { id: "fal", label: "fal.ai" },
  { id: "replicate", label: "Replicate" },
  { id: "meshy", label: "Meshy" },
  { id: "tripo", label: "Tripo" },
  { id: "suno", label: "Suno" },
];
export const ASSET_DEFAULTS = [
  { kind: "sprite", label: "Sprites" },
  { kind: "texture", label: "Textures" },
  { kind: "icon", label: "Icons" },
  { kind: "map", label: "Maps" },
  { kind: "music", label: "Music" },
  { kind: "sfx", label: "SFX" },
  { kind: "voice", label: "Voice" },
  { kind: "model", label: "Models" },
];
