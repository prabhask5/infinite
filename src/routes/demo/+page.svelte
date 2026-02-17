<!--
  @fileoverview Demo landing page — try Infinite Notes without an account.

  Provides a sandboxed demo environment with mock data. All changes
  reset on page refresh. No account, email, or setup required.

  Theme: "Ink splashing onto paper" — letter-block, premium stationery aesthetic.
  Animations: ink splatter particles, typography stamp cascade, paper ripple,
  ink wash background, wax-seal toggle, ink splash entry, ink dissolve exit.
-->
<script lang="ts">
  import { isDemoMode, setDemoMode, cleanupDemoDatabase } from 'stellar-drive';

  // ── State ──────────────────────────────────────────────────────────────────
  let demoActive = $state(isDemoMode());
  let toggling = $state(false);
  let exploding = $state(false);
  let imploding = $state(false);
  let fading = $state(false);
  let showParticles = $state(false);

  // Split "Demo Mode" into individual letter spans for stamp cascade
  const titleWords = ['Demo', 'Mode'];
  const titleLetters = titleWords.map((word) => word.split(''));

  // ── Toggle handler ─────────────────────────────────────────────────────────
  function handleToggle() {
    if (toggling) return;
    toggling = true;
    const turningOn = !demoActive;
    demoActive = turningOn;

    // Trigger ink splatter particles + directional state
    showParticles = true;

    if (turningOn) {
      exploding = true;
      setTimeout(() => {
        fading = true;
      }, 2700);
      setTimeout(() => {
        setDemoMode(true);
        window.location.href = '/';
      }, 3400);
    } else {
      imploding = true;
      setTimeout(() => {
        fading = true;
      }, 1500);
      setTimeout(() => {
        setDemoMode(false);
        cleanupDemoDatabase('infinite_demo');
        window.location.href = '/';
      }, 2200);
    }
  }
</script>

<svelte:head>
  <title>Demo Mode — Infinite Notes</title>
</svelte:head>

<div class="page" class:active={demoActive} class:exploding class:imploding class:fading>
  <!-- Ink wash background layer -->
  <div class="ink-wash" class:active={demoActive}></div>

  <!-- Paper ripple — appears when toggle is activated -->
  {#if showParticles}
    <div class="ripple-ring"></div>
    <div class="ripple-ring ripple-ring--2"></div>
    <div class="ripple-ring ripple-ring--3"></div>
  {/if}

  <!-- Ink splatter particles — 18 dots -->
  {#if showParticles}
    <div class="particles" aria-hidden="true">
      <span class="particle p1"></span>
      <span class="particle p2"></span>
      <span class="particle p3"></span>
      <span class="particle p4"></span>
      <span class="particle p5"></span>
      <span class="particle p6"></span>
      <span class="particle p7"></span>
      <span class="particle p8"></span>
      <span class="particle p9"></span>
      <span class="particle p10"></span>
      <span class="particle p11"></span>
      <span class="particle p12"></span>
      <span class="particle p13"></span>
      <span class="particle p14"></span>
      <span class="particle p15"></span>
      <span class="particle p16"></span>
      <span class="particle p17"></span>
      <span class="particle p18"></span>
    </div>
  {/if}

  <!-- Typography stamp cascade -->
  <h1 class="title" aria-label="Demo Mode">
    {#each titleWords as _word, wi (wi)}
      <span class="word">
        {#each titleLetters[wi] as letter, li (li)}
          <span class="letter" style="animation-delay: {0.3 + wi * 0.45 + li * 0.07}s"
            >{letter}</span
          >
        {/each}
      </span>
      {#if wi < titleWords.length - 1}
        <span class="word-space" aria-hidden="true"> </span>
      {/if}
    {/each}
  </h1>

  <p class="sub">Explore Infinite Notes with sample data — no account required</p>

  <!-- Toggle zone -->
  <div class="tz">
    <button
      class="tog"
      class:on={demoActive}
      class:stamping={showParticles}
      onclick={handleToggle}
      disabled={toggling}
      aria-label={demoActive ? 'Disable demo mode' : 'Enable demo mode'}
    >
      <span class="track">
        <span class="knob">
          <span class="knob-seal" aria-hidden="true"></span>
        </span>
      </span>
    </button>
    <span class="state-label" class:on={demoActive}>{demoActive ? 'ACTIVE' : 'INACTIVE'}</span>
  </div>

  <!-- Info card -->
  <section class="info">
    <div class="col ok">
      <h3>Available</h3>
      <ul>
        <li>Browse all pages</li>
        <li>Create &amp; edit items</li>
        <li>Full app functionality</li>
      </ul>
    </div>
    <div class="divider"></div>
    <div class="col cap">
      <h3>Limited</h3>
      <ul>
        <li>Cloud sync</li>
        <li>Account settings</li>
        <li>Device management</li>
      </ul>
    </div>
  </section>

  <p class="foot">Data resets each session</p>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════
     LOCAL INK TOKENS — component-scoped design values
     ═══════════════════════════════════════════════════════════════════ */

  .page {
    /* Ink-specific tokens defined locally so component is self-contained */
    --ink-blue: #4a7dff;
    --ink-blue-light: #6b94ff;
    --ink-blue-dark: #3a66d4;
    --ink-blue-deep: #1e3a8a;
    --ink-blue-glow: rgba(74, 125, 255, 0.5);
    --ink-blue-subtle: rgba(74, 125, 255, 0.12);
    --ink-blue-faint: rgba(74, 125, 255, 0.06);
    --ink-blue-mid: rgba(74, 125, 255, 0.25);
    --ink-blue-strong: rgba(74, 125, 255, 0.4);

    --paper-dark: #0c0c0e;
    --paper-base: #121214;
    --paper-raised: #1a1a1e;
    --paper-elevated: #222226;

    --text-primary: #ededef;
    --text-secondary: #a8a8b0;
    --text-muted: #6b6b75;

    --track-off-bg: rgba(255, 255, 255, 0.06);
    --track-off-border: rgba(255, 255, 255, 0.1);
    --track-on-bg: rgba(74, 125, 255, 0.2);
    --track-on-border: rgba(74, 125, 255, 0.4);

    --knob-off-bg: rgba(255, 255, 255, 0.12);
    --knob-on-bg: #4a7dff;

    --card-bg: rgba(255, 255, 255, 0.03);
    --card-border: rgba(255, 255, 255, 0.06);
  }

  /* ═══════════════════════════════════════════════════════════════════
     PAGE — Root container
     ═══════════════════════════════════════════════════════════════════ */

  .page {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    padding-top: max(1.5rem, env(safe-area-inset-top, 0px));
    padding-bottom: max(1.5rem, env(safe-area-inset-bottom, 0px));
    padding-left: max(1.5rem, env(safe-area-inset-left, 0px));
    padding-right: max(1.5rem, env(safe-area-inset-right, 0px));
    gap: clamp(0.75rem, 2vh, 1.5rem);
    overflow: hidden;
    /* Ink wash gradient base — animated in ink-wash layer above */
    background: var(--paper-dark);
    color: var(--text-primary);
    font-family: var(--font-body, inherit);
    /* Ink splash entry: fill from center outward */
    animation: inkSplashEntry 1.1s cubic-bezier(0.16, 1, 0.3, 1) both;
    transition:
      opacity 0.7s ease,
      filter 0.7s ease,
      transform 0.7s ease;
  }

  /* ═══ ENTRY: ink fills from center ═══ */

  @keyframes inkSplashEntry {
    0% {
      clip-path: circle(0% at 50% 50%);
      opacity: 0;
    }
    60% {
      clip-path: circle(65% at 50% 50%);
      opacity: 1;
    }
    100% {
      clip-path: circle(150% at 50% 50%);
      opacity: 1;
    }
  }

  /* ═══ EXIT: ink dissolve ═══ */

  .page.fading {
    opacity: 0;
    filter: blur(16px) saturate(0.4);
    transform: scale(1.06);
  }

  /* ═══════════════════════════════════════════════════════════════════
     INK WASH BACKGROUND — animated gradient that pulses gently
     ═══════════════════════════════════════════════════════════════════ */

  .ink-wash {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse 80% 60% at 50% 50%, var(--ink-blue-faint) 0%, transparent 70%),
      radial-gradient(ellipse 50% 40% at 30% 70%, rgba(74, 125, 255, 0.04) 0%, transparent 60%),
      radial-gradient(ellipse 40% 50% at 70% 30%, rgba(74, 125, 255, 0.04) 0%, transparent 60%),
      linear-gradient(180deg, var(--paper-dark) 0%, #0e0e14 50%, var(--paper-dark) 100%);
    background-size:
      100% 100%,
      100% 100%,
      100% 100%,
      100% 100%;
    animation: inkWashPulse 8s ease-in-out infinite alternate;
    opacity: 0;
    animation-fill-mode: forwards;
    animation-delay: 0.5s;
    transition: opacity 0.6s ease;
  }

  .ink-wash.active {
    opacity: 1;
    animation: inkWashActive 6s ease-in-out infinite alternate;
  }

  @keyframes inkWashPulse {
    0% {
      opacity: 0;
      background-position:
        50% 50%,
        30% 70%,
        70% 30%,
        center;
    }
    100% {
      opacity: 1;
      background-position:
        50% 45%,
        35% 65%,
        65% 35%,
        center;
    }
  }

  @keyframes inkWashActive {
    0% {
      opacity: 1;
      filter: hue-rotate(0deg);
      transform: scale(1);
    }
    50% {
      opacity: 1;
      filter: hue-rotate(8deg);
      transform: scale(1.01);
    }
    100% {
      opacity: 1;
      filter: hue-rotate(0deg);
      transform: scale(1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     PAPER RIPPLE — expanding ring from toggle center on activation
     ═══════════════════════════════════════════════════════════════════ */

  .ripple-ring {
    position: absolute;
    /* Centered on the toggle zone, approximately 60% down the page */
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    z-index: 1;
    pointer-events: none;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    border: 2px solid var(--ink-blue);
    opacity: 0;
    animation: paperRipple 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .ripple-ring--2 {
    border-color: var(--ink-blue-light);
    border-width: 1.5px;
    animation-delay: 0.18s;
    animation-duration: 1.4s;
  }

  .ripple-ring--3 {
    border-color: var(--ink-blue-mid);
    border-width: 1px;
    animation-delay: 0.36s;
    animation-duration: 1.6s;
  }

  @keyframes paperRipple {
    0% {
      transform: scale(0.5);
      opacity: 0.7;
    }
    60% {
      opacity: 0.3;
    }
    100% {
      transform: scale(20);
      opacity: 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     INK SPLATTER PARTICLES — 18 circular dots around the toggle center
     ═══════════════════════════════════════════════════════════════════ */

  .particles {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    pointer-events: none;
    width: 0;
    height: 0;
  }

  .particle {
    position: absolute;
    border-radius: 50%;
    opacity: 0;
  }

  /* Base splatter animation keyframes */
  @keyframes splatter {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.85;
    }
    60% {
      opacity: 0.6;
    }
    100% {
      opacity: 0;
    }
  }

  /* Particle 1 — upper right, large */
  .p1 {
    width: 10px;
    height: 10px;
    background: var(--ink-blue);
    animation: splat1 0.9s 0s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat1 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.9;
    }
    100% {
      transform: translate(90px, -130px) scale(0.2);
      opacity: 0;
    }
  }

  /* Particle 2 — upper left */
  .p2 {
    width: 7px;
    height: 7px;
    background: var(--ink-blue-light);
    animation: splat2 0.75s 0.05s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat2 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.85;
    }
    100% {
      transform: translate(-80px, -110px) scale(0.15);
      opacity: 0;
    }
  }

  /* Particle 3 — right */
  .p3 {
    width: 12px;
    height: 12px;
    background: rgba(74, 125, 255, 0.7);
    animation: splat3 1s 0.02s cubic-bezier(0.2, 1, 0.4, 1) forwards;
  }
  @keyframes splat3 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.8;
    }
    100% {
      transform: translate(140px, -30px) scale(0.1);
      opacity: 0;
    }
  }

  /* Particle 4 — left */
  .p4 {
    width: 8px;
    height: 8px;
    background: var(--ink-blue-dark);
    animation: splat4 0.85s 0.08s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat4 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.9;
    }
    100% {
      transform: translate(-120px, -20px) scale(0.2);
      opacity: 0;
    }
  }

  /* Particle 5 — lower right */
  .p5 {
    width: 6px;
    height: 6px;
    background: var(--ink-blue-light);
    animation: splat5 0.8s 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat5 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.75;
    }
    100% {
      transform: translate(100px, 90px) scale(0.15);
      opacity: 0;
    }
  }

  /* Particle 6 — lower left, medium */
  .p6 {
    width: 9px;
    height: 9px;
    background: rgba(74, 125, 255, 0.6);
    animation: splat6 0.95s 0.04s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat6 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.8;
    }
    100% {
      transform: translate(-90px, 110px) scale(0.1);
      opacity: 0;
    }
  }

  /* Particle 7 — straight up */
  .p7 {
    width: 5px;
    height: 5px;
    background: var(--ink-blue);
    animation: splat7 0.7s 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat7 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.9;
    }
    100% {
      transform: translate(10px, -160px) scale(0.2);
      opacity: 0;
    }
  }

  /* Particle 8 — straight down */
  .p8 {
    width: 7px;
    height: 7px;
    background: var(--ink-blue-light);
    animation: splat8 0.85s 0.07s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat8 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.7;
    }
    100% {
      transform: translate(-5px, 140px) scale(0.15);
      opacity: 0;
    }
  }

  /* Particle 9 — diagonal upper-right, tiny */
  .p9 {
    width: 4px;
    height: 4px;
    background: rgba(107, 148, 255, 0.9);
    animation: splat9 0.65s 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat9 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.85;
    }
    100% {
      transform: translate(60px, -70px) scale(0.1);
      opacity: 0;
    }
  }

  /* Particle 10 — far right, elongated */
  .p10 {
    width: 14px;
    height: 6px;
    background: rgba(74, 125, 255, 0.5);
    animation: splat10 1.1s 0s cubic-bezier(0.2, 1, 0.4, 1) forwards;
  }
  @keyframes splat10 {
    0% {
      transform: translate(0, 0) rotate(0deg) scale(1);
      opacity: 0.7;
    }
    100% {
      transform: translate(170px, 40px) rotate(25deg) scale(0.05);
      opacity: 0;
    }
  }

  /* Particle 11 — upper-left diagonal */
  .p11 {
    width: 5px;
    height: 5px;
    background: var(--ink-blue-dark);
    animation: splat11 0.78s 0.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat11 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.9;
    }
    100% {
      transform: translate(-50px, -100px) scale(0.1);
      opacity: 0;
    }
  }

  /* Particle 12 — wide right arc */
  .p12 {
    width: 8px;
    height: 8px;
    background: rgba(74, 125, 255, 0.65);
    animation: splat12 0.9s 0.06s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat12 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.8;
    }
    100% {
      transform: translate(160px, -80px) scale(0.15);
      opacity: 0;
    }
  }

  /* Particle 13 — lower center */
  .p13 {
    width: 6px;
    height: 6px;
    background: var(--ink-blue-light);
    animation: splat13 0.75s 0.14s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat13 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.75;
    }
    100% {
      transform: translate(30px, 130px) scale(0.1);
      opacity: 0;
    }
  }

  /* Particle 14 — wide left arc */
  .p14 {
    width: 10px;
    height: 5px;
    background: rgba(74, 125, 255, 0.55);
    animation: splat14 1s 0.03s cubic-bezier(0.2, 1, 0.4, 1) forwards;
  }
  @keyframes splat14 {
    0% {
      transform: translate(0, 0) rotate(0deg) scale(1);
      opacity: 0.7;
    }
    100% {
      transform: translate(-155px, 60px) rotate(-20deg) scale(0.05);
      opacity: 0;
    }
  }

  /* Particle 15 — tiny upper-right cluster */
  .p15 {
    width: 3px;
    height: 3px;
    background: var(--ink-blue);
    animation: splat15 0.6s 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat15 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.9;
    }
    100% {
      transform: translate(40px, -50px) scale(0.2);
      opacity: 0;
    }
  }

  /* Particle 16 — large upper-left blob */
  .p16 {
    width: 13px;
    height: 13px;
    background: rgba(74, 125, 255, 0.45);
    animation: splat16 1.05s 0.01s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat16 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.65;
    }
    100% {
      transform: translate(-130px, -95px) scale(0.05);
      opacity: 0;
    }
  }

  /* Particle 17 — far upper arc */
  .p17 {
    width: 4px;
    height: 4px;
    background: rgba(107, 148, 255, 0.8);
    animation: splat17 0.88s 0.09s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat17 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.85;
    }
    100% {
      transform: translate(110px, -150px) scale(0.1);
      opacity: 0;
    }
  }

  /* Particle 18 — lower-right micro */
  .p18 {
    width: 5px;
    height: 5px;
    background: var(--ink-blue-dark);
    animation: splat18 0.72s 0.17s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  @keyframes splat18 {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0.8;
    }
    100% {
      transform: translate(70px, 100px) scale(0.1);
      opacity: 0;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TITLE — typography stamp cascade (letter-press effect)
     ═══════════════════════════════════════════════════════════════════ */

  .title {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.35em;
    flex-wrap: wrap;
    font-size: clamp(2.5rem, 8vw, 5rem);
    font-family: var(--font-display, inherit);
    font-weight: 800;
    letter-spacing: var(--tracking-tight, -0.03em);
    line-height: 1;
    margin: 0;
    text-align: center;
    color: var(--text-primary);
    /* Container not animated — letters are animated individually */
  }

  .word {
    display: inline-flex;
  }

  .word-space {
    display: inline-block;
    width: 0.4em;
  }

  /* Each letter stamps into place — scale down from above like a printing block */
  .letter {
    display: inline-block;
    opacity: 0;
    animation: letterStamp 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    /* Each letter's animation-delay is set inline */
    will-change: transform, opacity;
  }

  @keyframes letterStamp {
    0% {
      opacity: 0;
      transform: translateY(-32px) scaleY(1.4) scaleX(0.8);
      filter: blur(4px);
      text-shadow: none;
    }
    40% {
      opacity: 1;
      transform: translateY(4px) scaleY(0.88) scaleX(1.06);
      filter: blur(0);
      /* Ink impact "squish" moment */
      text-shadow:
        0 6px 20px var(--ink-blue-strong),
        0 2px 4px rgba(0, 0, 0, 0.6);
    }
    70% {
      transform: translateY(-2px) scaleY(1.03) scaleX(0.99);
      text-shadow: 0 4px 16px var(--ink-blue-mid);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scaleY(1) scaleX(1);
      filter: blur(0);
      text-shadow: 0 2px 12px var(--ink-blue-subtle);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SUBTITLE
     ═══════════════════════════════════════════════════════════════════ */

  .sub {
    position: relative;
    z-index: 3;
    font-size: clamp(0.85rem, 2vw, 1.1rem);
    font-family: var(--font-body, inherit);
    color: var(--text-secondary);
    max-width: 420px;
    margin: -0.25rem auto 0;
    text-align: center;
    line-height: 1.5;
    opacity: 0;
    animation: subIn 0.8s 1.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes subIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 0.85;
      transform: translateY(0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     TOGGLE ZONE
     ═══════════════════════════════════════════════════════════════════ */

  .tz {
    position: relative;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    opacity: 0;
    animation: toggleBirth 1.2s 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes toggleBirth {
    0% {
      opacity: 0;
      transform: scale(0.6) translateY(20px);
      filter: blur(12px);
    }
    60% {
      opacity: 1;
      transform: scale(1.05) translateY(-2px);
      filter: blur(0);
    }
    80% {
      transform: scale(0.98) translateY(1px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
      filter: blur(0);
    }
  }

  .tog {
    position: relative;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
    /* Stamp animation on activation */
    transition: transform 0.15s ease;
  }

  /* Wax seal stamp animation — triggered when showParticles becomes true */
  .tog.stamping .track {
    animation: sealStamp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes sealStamp {
    0% {
      transform: scale(1);
    }
    20% {
      transform: scale(0.88) translateY(4px);
    }
    55% {
      transform: scale(1.06) translateY(-2px);
    }
    75% {
      transform: scale(0.97);
    }
    100% {
      transform: scale(1);
    }
  }

  .tog:focus-visible .track {
    outline: 2px solid var(--ink-blue);
    outline-offset: 6px;
  }

  .tog:disabled {
    cursor: default;
  }

  /* ═══ TRACK — paper texture appearance ═══ */

  .track {
    position: relative;
    display: block;
    width: 200px;
    height: 68px;
    border-radius: 34px;
    /* Paper texture: subtle inset shadows for embossed letter-block feel */
    background: var(--track-off-bg);
    border: 2px solid var(--track-off-border);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.2),
      0 1px 0 rgba(255, 255, 255, 0.04);
    transition:
      background 0.45s ease,
      border-color 0.45s ease,
      box-shadow 0.45s ease;
  }

  .tog.on .track {
    background: var(--track-on-bg);
    border-color: var(--track-on-border);
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.3),
      inset 0 1px 2px rgba(0, 0, 0, 0.15),
      0 0 28px var(--ink-blue-mid),
      0 0 60px var(--ink-blue-subtle),
      0 1px 0 rgba(255, 255, 255, 0.06);
  }

  .tog:hover:not(:disabled) .track {
    border-color: rgba(255, 255, 255, 0.18);
  }

  .tog:hover:not(:disabled).on .track {
    border-color: rgba(74, 125, 255, 0.55);
  }

  /* ═══ KNOB — wax seal aesthetic ═══ */

  .knob {
    position: absolute;
    top: 6px;
    left: 6px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    /* Embossed wax seal appearance: gradient + inset shadow */
    background: radial-gradient(
      circle at 38% 35%,
      rgba(255, 255, 255, 0.22) 0%,
      var(--knob-off-bg) 45%,
      rgba(0, 0, 0, 0.25) 100%
    );
    box-shadow:
      inset 0 2px 4px rgba(255, 255, 255, 0.1),
      inset 0 -2px 6px rgba(0, 0, 0, 0.4),
      0 2px 8px rgba(0, 0, 0, 0.5),
      0 1px 2px rgba(0, 0, 0, 0.3);
    transition:
      transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
      background 0.4s ease,
      box-shadow 0.4s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Seal emboss inner detail */
  .knob-seal {
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.1);
    box-shadow:
      inset 0 1px 2px rgba(255, 255, 255, 0.06),
      inset 0 -1px 2px rgba(0, 0, 0, 0.3);
    transition:
      border-color 0.4s ease,
      box-shadow 0.4s ease;
    background: transparent;
  }

  .tog.on .knob {
    transform: translateX(132px);
    background: radial-gradient(
      circle at 38% 35%,
      var(--ink-blue-light) 0%,
      var(--ink-blue) 45%,
      var(--ink-blue-dark) 100%
    );
    box-shadow:
      inset 0 2px 4px rgba(255, 255, 255, 0.25),
      inset 0 -2px 6px rgba(0, 0, 0, 0.35),
      0 0 16px var(--ink-blue-strong),
      0 0 32px var(--ink-blue-mid),
      0 4px 12px rgba(0, 0, 0, 0.5);
  }

  .tog.on .knob-seal {
    border-color: rgba(255, 255, 255, 0.22);
    box-shadow:
      inset 0 1px 2px rgba(255, 255, 255, 0.15),
      inset 0 -1px 2px rgba(0, 0, 0, 0.2);
  }

  /* ═══ STATE LABEL ═══ */

  .state-label {
    font-size: 0.72rem;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
    letter-spacing: 0.18em;
    color: var(--text-muted);
    user-select: none;
    transition: color 0.4s ease;
    opacity: 0.5;
  }

  .state-label.on {
    color: var(--ink-blue-light);
    opacity: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════
     INFO CARD — letter-block style with ink border
     ═══════════════════════════════════════════════════════════════════ */

  .info {
    position: relative;
    z-index: 3;
    display: flex;
    gap: 1.5rem;
    max-width: 440px;
    width: 100%;
    background: var(--card-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--card-border);
    /* Top highlight — letter-block feel */
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 2px 12px rgba(0, 0, 0, 0.3),
      0 1px 4px rgba(0, 0, 0, 0.2);
    border-radius: var(--radius-md, 12px);
    padding: clamp(0.75rem, 2vh, 1.25rem) clamp(1rem, 3vw, 1.5rem);
    opacity: 0;
    animation: infoIn 0.8s 2.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes infoIn {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 0.85;
      transform: translateY(0);
    }
  }

  .col {
    flex: 1;
  }

  .col h3 {
    font-size: 0.68rem;
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin: 0 0 0.55rem;
  }

  .ok h3 {
    color: rgba(237, 237, 239, 0.65);
  }

  .cap h3 {
    color: rgba(107, 107, 117, 0.7);
  }

  .col ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }

  .col li {
    font-size: 0.78rem;
    font-family: var(--font-body, inherit);
    line-height: 1.5;
    padding-left: 1.25rem;
    position: relative;
    color: var(--text-muted);
  }

  .ok li::before {
    content: '\2713';
    position: absolute;
    left: 0;
    color: rgba(52, 211, 153, 0.7);
    font-weight: 700;
    font-size: 0.72rem;
    top: 0.05em;
  }

  .cap li::before {
    content: '\2014';
    position: absolute;
    left: 0;
    color: rgba(107, 107, 117, 0.4);
  }

  .divider {
    width: 1px;
    background: var(--card-border);
    align-self: stretch;
  }

  /* ═══════════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════════ */

  .foot {
    position: relative;
    z-index: 3;
    font-size: 0.68rem;
    font-family: var(--font-mono, monospace);
    color: rgba(107, 107, 117, 0.35);
    margin: 0;
    letter-spacing: 0.06em;
    opacity: 0;
    animation: fadeIn 0.6s 3.1s ease forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     REDUCED MOTION — respect user preference
     ═══════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
      clip-path: none;
    }

    .letter {
      animation: none;
      opacity: 1;
      transform: none;
      filter: none;
      text-shadow: none;
    }

    .sub,
    .tz,
    .info,
    .foot {
      animation: none;
      opacity: 1;
      transform: none;
    }

    .ink-wash {
      animation: none;
      opacity: 0.6;
    }

    .page.fading {
      transition-duration: 0.15s;
    }

    .knob,
    .track,
    .state-label {
      transition-duration: 0.15s;
    }

    .particle,
    .ripple-ring {
      display: none;
    }

    .tog.stamping .track {
      animation: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     RESPONSIVE — 640px breakpoint
     ═══════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .page {
      padding: 1rem;
      padding-top: max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem));
      padding-bottom: max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem));
      gap: clamp(0.5rem, 1.5vh, 1rem);
    }

    .title {
      font-size: clamp(2rem, 10vw, 3rem);
    }

    .track {
      width: 170px;
      height: 58px;
      border-radius: 29px;
    }

    .knob {
      width: 48px;
      height: 48px;
      top: 5px;
      left: 5px;
    }

    .tog.on .knob {
      transform: translateX(112px);
    }

    .info {
      flex-direction: column;
      gap: 0.6rem;
    }

    .divider {
      width: 100%;
      height: 1px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     RESPONSIVE — 380px breakpoint
     ═══════════════════════════════════════════════════════════════════ */

  @media (max-width: 380px) {
    .page {
      padding: 0.75rem;
      padding-top: max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.25rem));
      padding-bottom: max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.25rem));
      gap: clamp(0.5rem, 1.2vh, 0.75rem);
    }

    .title {
      font-size: 1.8rem;
    }

    .track {
      width: 150px;
      height: 52px;
      border-radius: 26px;
    }

    .knob {
      width: 42px;
      height: 42px;
      top: 5px;
      left: 5px;
    }

    .tog.on .knob {
      transform: translateX(98px);
    }

    .info {
      padding: 0.75rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     RESPONSIVE — 600px height breakpoint
     ═══════════════════════════════════════════════════════════════════ */

  @media (max-height: 600px) {
    .page {
      gap: 0.5rem;
      padding: 0.5rem 1rem;
    }

    .title {
      font-size: clamp(1.5rem, 6vw, 2.5rem);
    }

    .info {
      flex-direction: row;
      padding: 0.6rem 0.75rem;
      gap: 0.75rem;
    }

    .col li {
      font-size: 0.72rem;
    }

    .foot {
      display: none;
    }
  }
</style>
