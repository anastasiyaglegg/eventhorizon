import type { themes } from "../lib/event-themes";

type ThemeId = (typeof themes)[number]["id"];

/** Small CSS scenes keep every theme lively without loading image or video files. */
export function ThemeAnimation({ id }: { id: ThemeId }) {
  return <span className={`theme-art theme-art-${id}`} aria-hidden="true">
    <span className="theme-art-back" />
    <span className="theme-art-main" />
    <span className="theme-art-accent" />
    <span className="theme-art-spark one" />
    <span className="theme-art-spark two" />
    <span className="theme-art-spark three" />
  </span>;
}
