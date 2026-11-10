"use client";

import Link from "next/link";
import { useEventPlan } from "../client/event-plan";
import { themes } from "../lib/event-themes";

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
