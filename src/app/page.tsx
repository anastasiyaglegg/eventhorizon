"use client";

import Link from "next/link";
import { useEventPlan } from "../client/event-plan";

const themes = [
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

const stars = Array.from({ length: 56 }, (_, index) => ({
  left: `${(index * 37.79 + 13) % 100}%`,
  top: `${(index * 23.17 + 4) % 83}%`,
  delay: `${(index % 11) * -0.47}s`,
  duration: `${2.4 + (index % 7) * 0.39}s`,
}));

export default function Home() {
  const { plan, setField } = useEventPlan();
  const selected = themes.find(theme => theme.id === plan.themeId);
  return <main className="cosmos-page">
    <section className="cosmos-hero" aria-labelledby="cosmos-title">
      <div className="star-field" aria-hidden="true">{stars.map((star, index) => <i key={index} style={{ left: star.left, top: star.top, animationDelay: star.delay, animationDuration: star.duration }} />)}</div>
      <div className="cosmos-orb" aria-hidden="true" />
      <div className="cosmos-hero-content">
        <p className="cosmos-kicker">EVENT HORIZON · YOUR UNIVERSE, IN ORDER</p>
        <h1 id="cosmos-title">Find your way out of the <em>planning black hole.</em></h1>
        <p>See your event as far as the horizon: the theme, the people, the timing, and the tiny details that try to escape orbit.</p>
        <a className="cosmos-button" href="#themes">Choose your universe <span aria-hidden="true">↘</span></a>
        <p className="cosmos-whisper">Start with a mood. We’ll help keep the rest in orbit.</p>
      </div>
      <div className="horizon-glow" aria-hidden="true" />
      <div className="horizon-line" aria-hidden="true" />
    </section>

    <section className="theme-section" id="themes" aria-labelledby="theme-heading">
      <div className="theme-section-head">
        <div><p className="cosmos-kicker">STEP 01 / THE BIG IDEA</p><h2 id="theme-heading">What universe are we throwing this party in?</h2><p>Pick a theme. You can change your mind without causing a space time incident.</p></div>
        <span className="theme-counter">12 ridiculous possibilities</span>
      </div>
      <div className="theme-grid">{themes.map(theme => <button
        key={theme.id} type="button" data-theme-id={theme.id} className={`theme-card ${plan.themeId === theme.id ? "selected" : ""}`}
        style={{ "--theme-a": theme.colors[0], "--theme-b": theme.colors[1] } as React.CSSProperties}
        aria-pressed={plan.themeId === theme.id} onClick={() => setField("themeId")(theme.id)}>
        <span className="theme-sky"><span className="theme-icon" aria-hidden="true">{theme.icon}</span></span>
        <span className="theme-copy"><strong>{theme.name}</strong><small>{theme.line}</small></span>
        <span className="theme-choose">{plan.themeId === theme.id ? "✓ In your orbit" : "Choose this theme ↗"}</span>
      </button>)}</div>
      <div className="theme-next">
        <div><p className="cosmos-kicker">YOUR FLIGHT PLAN</p><h3>{selected ? `${selected.name} is ready for launch.` : "Choose a theme to begin."}</h3><p>{selected ? "Now find a venue and the people who will bring it to life." : "Your first big decision is the fun one."}</p></div>
        <Link className={`cosmos-button ${selected ? "" : "disabled"}`} href={selected ? "/vendors" : "#themes"}>Search &amp; add vendors <span aria-hidden="true">→</span></Link>
      </div>
    </section>
    <section className="cosmos-footer"><p>One universe. One plan. Fewer things falling into a black hole.</p><div><Link href="/calendar">See the calendar →</Link><Link href="/conflicts">Check potential conflicts →</Link></div></section>
  </main>;
}
