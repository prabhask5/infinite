<!--
  @fileoverview Privacy policy page.

  Static content page that displays the application's privacy policy.
  Uses a clean letter-block aesthetic — no cosmic or space elements.
  Soft background gradient with a centered scrollable content card.
-->

<script lang="ts">
  import { onMount } from 'svelte';

  /** Controls the fade-in entrance animation for the content card. */
  let isVisible = $state(false);

  onMount(() => {
    /* Short delay lets the background render before revealing content */
    setTimeout(() => (isVisible = true), 100);
  });
</script>

<svelte:head>
  <title>Privacy Policy - Infinite Notes</title>
  <meta name="description" content="Infinite Notes Privacy Policy" />
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Policy Page — scrollable letter-block layout, no cosmic background
     ═══════════════════════════════════════════════════════════════════════════ -->
<div class="policy-page">
  <!-- ── Subtle decorative background — ink-blue tinted gradient + noise ── -->
  <div class="page-bg" aria-hidden="true"></div>

  <!-- ── Scrollable content wrapper — fades in after mount ── -->
  <div class="content-wrapper" class:visible={isVisible}>
    <div class="policy-card">
      <!-- ── Page Title ── -->
      <h1 class="page-title">Privacy</h1>

      <!-- ── Section 1: Infinite Notes Privacy Policy ── -->
      <section class="policy-section">
        <h2 class="section-heading">Infinite Notes Privacy Policy</h2>
        <p class="policy-text">
          Infinite Notes is a fully self-hosted personal notes application. You deploy it to your
          own hosting environment and configure your own database. All data — notes, notebooks, and
          settings — is stored exclusively in your own instance. No data is collected, transmitted
          to, or accessible by the developer or any third party.
        </p>
        <p class="policy-text">
          There is no telemetry, no analytics, and no tracking of any kind. You are the sole owner
          and manager of everything you write.
        </p>
      </section>

      <!-- ── Divider ── -->
      <div class="section-divider" role="separator"></div>

      <!-- ── Section 2: Open Source ── -->
      <section class="policy-section">
        <h2 class="section-heading">Open Source</h2>
        <p class="policy-text">
          Infinite Notes is open source. You can inspect every line of code, verify these claims for
          yourself, and contribute improvements.
        </p>
        <p class="policy-text source-text">
          View the source at
          <a href="https://github.com/prabhask5/infinite" target="_blank" rel="noopener noreferrer">
            github.com/prabhask5/infinite
          </a>
        </p>
      </section>
    </div>
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════
     PAGE CONTAINER — Full-viewport base with subtle background
     ═══════════════════════════════════════════════════════════════════════════════ */

  .policy-page {
    position: relative;
    min-height: 100dvh;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    /* Bleeding margins removed — policy page is standalone */
    padding: 3rem 1.5rem 4rem;
    overflow: hidden;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     BACKGROUND — Paper-toned gradient with subtle ink-blue tint
     No starfields, nebulae, orbits, or cosmic elements.
     ═══════════════════════════════════════════════════════════════════════════════ */

  .page-bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;

    /* Layered radial gradients give depth without being busy */
    background:
      radial-gradient(ellipse at 20% 10%, rgba(74, 125, 255, 0.07) 0%, transparent 55%),
      radial-gradient(ellipse at 80% 90%, rgba(74, 125, 255, 0.05) 0%, transparent 55%),
      var(--color-bg);

    /* Subtle noise texture via SVG data URI */
    background-image:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E"),
      radial-gradient(ellipse at 20% 10%, rgba(74, 125, 255, 0.07) 0%, transparent 55%),
      radial-gradient(ellipse at 80% 90%, rgba(74, 125, 255, 0.05) 0%, transparent 55%),
      var(--color-bg);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     CONTENT WRAPPER — Centered column with fade-in transition
     ═══════════════════════════════════════════════════════════════════════════════ */

  .content-wrapper {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 680px;
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 0.6s var(--ease-out, ease-out),
      transform 0.6s var(--ease-out, ease-out);
  }

  .content-wrapper.visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     POLICY CARD — Letter-block tile matching app design system
     ═══════════════════════════════════════════════════════════════════════════════ */

  .policy-card {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-lg);
    padding: 2.5rem 2.25rem;
    text-align: center;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     PAGE TITLE — Large display heading
     ═══════════════════════════════════════════════════════════════════════════════ */

  .page-title {
    font-family: var(--font-display);
    font-size: clamp(2.25rem, 7vw, 3.5rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: var(--color-text);
    margin: 0 0 2rem;

    /* Ink-blue accent on the title */
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 40%,
      var(--color-primary) 70%,
      var(--color-text) 100%
    );
    background-size: 300% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: titleShimmer 10s linear infinite;
  }

  @keyframes titleShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 300% center;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     POLICY SECTIONS
     ═══════════════════════════════════════════════════════════════════════════════ */

  .policy-section {
    padding: 0.75rem 0;
    text-align: left;
  }

  .section-heading {
    font-family: var(--font-display);
    font-size: clamp(1.125rem, 3.5vw, 1.375rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--color-text);
    margin: 0 0 0.875rem;
  }

  .section-divider {
    height: 1px;
    margin: 1.75rem 0;
    background: var(--color-border);
    border: none;
  }

  .policy-text {
    font-family: var(--font-body);
    font-size: clamp(0.9375rem, 2.5vw, 1rem);
    color: var(--color-text-secondary);
    font-weight: 400;
    line-height: 1.75;
    margin: 0 0 1rem;
  }

  .policy-text:last-child {
    margin-bottom: 0;
  }

  /* ── Source / GitHub link ── */

  .source-text a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 600;
    transition: color var(--duration-fast, 150ms) var(--ease-out, ease-out);
  }

  .source-text a:hover {
    color: var(--color-primary-light);
    text-decoration: underline;
  }

  .source-text a:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .policy-page {
      padding: 2rem 1rem 3rem;
    }

    .policy-card {
      padding: 1.75rem 1.25rem;
      border-radius: var(--radius-xl);
    }
  }

  @media (max-width: 480px) {
    .policy-page {
      padding: 1.5rem 0.75rem 2.5rem;
    }

    .policy-card {
      padding: 1.5rem 1rem;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .page-title {
      animation: none;
      background: none;
      -webkit-text-fill-color: var(--color-text);
      color: var(--color-text);
    }

    .content-wrapper {
      transition: opacity 0.3s ease-out;
      transform: none;
    }

    .content-wrapper.visible {
      transform: none;
    }
  }
</style>
