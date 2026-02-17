<!--
  @fileoverview Home / landing page — welcome screen and primary content.

  This is the default route (`/`). It renders a clean, letter-block greeting
  with a time-aware salutation and a motivational compliment.

  Features:
  1. **Time-aware greeting** — "Good morning / afternoon / evening" with a
     smooth fade transition when the time period changes.
  2. **Personalised name** — resolved from the Supabase session or offline
     profile with sensible fallbacks.
  3. **Motivational compliment** — randomly selected from a curated list.
  4. **Clean background** — subtle ink-blue gradient, no cosmic elements.
  5. **Staggered entrance** — content fades and slides in sequentially.
-->

<script lang="ts">
  /**
   * @fileoverview Home page script — greeting logic, compliment selection,
   * and sync-event subscription.
   */

  // ==========================================================================
  //                                IMPORTS
  // ==========================================================================

  /* ── Svelte Lifecycle ── */
  import { onMount, onDestroy } from 'svelte';

  /* ── Stellar Drive — Stores & Auth ── */
  import { onSyncComplete, authState } from 'stellar-drive/stores';
  import { resolveFirstName } from 'stellar-drive/auth';
  import { debug } from 'stellar-drive/utils';

  // ==========================================================================
  //                           COMPONENT STATE
  // ==========================================================================

  /** Whether the page is still initialising (shows the loading spinner). */
  let isLoading = $state(true);

  /** The currently displayed motivational message. */
  let selectedCompliment = $state('');

  /** The time-of-day greeting text (e.g. "Good morning"). */
  let timeGreeting = $state('Good day');

  /** When `true`, the greeting text is fading out for a period transition. */
  let isGreetingTransitioning = $state(false);

  // ==========================================================================
  //                        TIME-OF-DAY HELPERS
  // ==========================================================================

  /** Union type representing the three greeting periods. */
  type TimePeriod = 'morning' | 'afternoon' | 'evening';

  /** Tracks the current period so we can detect overnight transitions. */
  let currentTimePeriod = $state<TimePeriod>('morning');

  /**
   * Determines the current time-of-day period based on the local hour.
   *
   * - 05:00 – 11:59 → `'morning'`
   * - 12:00 – 16:59 → `'afternoon'`
   * - 17:00 – 04:59 → `'evening'`
   *
   * @returns The current `TimePeriod`
   */
  function getTimePeriod(): TimePeriod {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    return 'evening';
  }

  /**
   * Maps a `TimePeriod` to its human-readable greeting string.
   *
   * @param period - The time period to convert
   * @returns A greeting like `"Good morning"`
   */
  function getGreetingForPeriod(period: TimePeriod): string {
    switch (period) {
      case 'morning':
        return 'Good morning';
      case 'afternoon':
        return 'Good afternoon';
      case 'evening':
        return 'Good evening';
    }
  }

  /**
   * Checks whether the time-of-day period has changed and, if so,
   * smoothly transitions the greeting text via a brief fade-out / fade-in.
   * Called on sync-completion events to handle overnight changes.
   */
  function updateGreetingIfNeeded(): void {
    const newPeriod = getTimePeriod();
    if (newPeriod !== currentTimePeriod) {
      isGreetingTransitioning = true;

      /* After fade-out, swap the text */
      setTimeout(() => {
        currentTimePeriod = newPeriod;
        timeGreeting = getGreetingForPeriod(newPeriod);

        /* After text update, fade back in */
        setTimeout(() => {
          isGreetingTransitioning = false;
        }, 50);
      }, 300);
    }
  }

  // ==========================================================================
  //                       CLEANUP REFERENCES
  // ==========================================================================

  /** Unsubscribe function returned by `onSyncComplete`. */
  let unsubscribeSyncComplete: (() => void) | null = null;

  // ==========================================================================
  //                          COMPLIMENT DATA
  // ==========================================================================

  /** Pool of motivational compliments — one is randomly selected each visit. */
  const compliments = [
    "you're going to do great things.",
    'your ideas are worth capturing.',
    'every note is a step forward.',
    "you're building something meaningful.",
    'clarity comes from writing it down.',
    'your thoughts matter.',
    'great things start with small notes.',
    'you make the complex simple.',
    "you're exactly where you need to be.",
    'the best is yet to come.',
    "you've got this.",
    'your hard work will pay off.',
    'keep going — progress is progress.',
    'one note at a time.',
    'your focus is your superpower.'
  ];

  /**
   * Picks a random compliment from the pool.
   *
   * @returns A motivational string (lowercase, no period prefix)
   */
  function getRandomCompliment(): string {
    return compliments[Math.floor(Math.random() * compliments.length)];
  }

  // ==========================================================================
  //                          DERIVED STATE
  // ==========================================================================

  /**
   * Derives the user's first name for the greeting display.
   * Falls back through session profile → email username → offline profile → 'Explorer'.
   */
  const firstName = $derived(resolveFirstName($authState.session, $authState.offlineProfile));

  // ==========================================================================
  //                         LIFECYCLE — MOUNT
  // ==========================================================================

  onMount(() => {
    /* Initialise greeting based on current time */
    currentTimePeriod = getTimePeriod();
    timeGreeting = getGreetingForPeriod(currentTimePeriod);
    debug('log', '[Home] Time period:', currentTimePeriod);

    /* Select a random motivational compliment for this visit */
    selectedCompliment = getRandomCompliment();

    isLoading = false;
    debug('log', '[Home] Page loaded, greeting:', timeGreeting);

    /* Subscribe to sync-completion events to detect overnight period changes */
    unsubscribeSyncComplete = onSyncComplete(() => {
      debug('log', '[Home] Sync complete, checking greeting period');
      updateGreetingIfNeeded();
    });
  });

  // ==========================================================================
  //                         LIFECYCLE — DESTROY
  // ==========================================================================

  onDestroy(() => {
    if (unsubscribeSyncComplete) {
      unsubscribeSyncComplete();
      unsubscribeSyncComplete = null;
    }
  });

  /* Auth redirect is handled by the root layout (+layout.ts) via
     PUBLIC_ROUTES — no inline guard needed here. */
</script>

<svelte:head>
  <title>Home - Infinite Notes</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Loading State — simple spinner while auth resolves
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if isLoading}
  <div class="loading-screen">
    <!-- Letter-block spinner — single rotating ring -->
    <div class="page-spinner" aria-label="Loading..." role="status">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  </div>
{:else}
  <!-- ═══════════════════════════════════════════════════════════════════════
       Home Container — clean letter-block welcome screen
       ═══════════════════════════════════════════════════════════════════════ -->
  <div class="home-container">
    <!-- ── Subtle decorative background ── -->
    <div class="home-bg" aria-hidden="true"></div>

    <!-- ── Central Content — greeting and compliment ── -->
    <div class="content">
      <!-- ── Time greeting + user name ── -->
      <div class="greeting-block">
        <p class="greeting-salutation" class:greeting-transitioning={isGreetingTransitioning}>
          {timeGreeting},
        </p>
        <h1 class="greeting-name">{firstName}</h1>
      </div>

      <!-- ── Decorative divider ── -->
      <div class="content-divider" aria-hidden="true"></div>

      <!-- ── Motivational compliment — prefixed with "Remember, " ── -->
      <p class="compliment">
        Remember, {selectedCompliment}
      </p>
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOADING SCREEN
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .loading-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
  }

  /* Single rotating arc — matches letter-block aesthetic */
  .page-spinner {
    color: var(--color-primary);
    animation: spinnerRotate 0.9s linear infinite;
  }

  @keyframes spinnerRotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     HOME CONTAINER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .home-container {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BACKGROUND — Paper-toned gradient, ink-blue accent tint
     No starfields, nebulae, orbital rings, shooting stars, or particles.
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .home-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;

    /* Layered radial tints evoke depth without being distracting */
    background:
      radial-gradient(ellipse at 25% 15%, rgba(74, 125, 255, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 75% 85%, rgba(74, 125, 255, 0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(74, 125, 255, 0.03) 0%, transparent 70%),
      var(--color-bg);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CENTRAL CONTENT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .content {
    position: relative;
    z-index: 1;
    text-align: center;
    padding: 2rem 1.5rem;
  }

  /* ── Greeting Block ── */

  .greeting-block {
    margin-bottom: 1.25rem;
  }

  /* Time-of-day salutation — smaller, uppercase label above the name */
  .greeting-salutation {
    font-family: var(--font-body);
    font-size: clamp(0.8125rem, 2vw, 0.9375rem);
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin: 0 0 0.5rem;
    opacity: 0;
    animation: fadeSlideIn 0.7s var(--ease-out, ease-out) 0.15s forwards;

    /* Smooth fade when time-period changes */
    transition:
      opacity 0.3s var(--ease-out, ease-out),
      transform 0.3s var(--ease-out, ease-out);
  }

  /* Applied while the greeting text is transitioning to a new time period */
  .greeting-salutation.greeting-transitioning {
    opacity: 0 !important;
    transform: translateY(-4px);
  }

  /* User's first name — large display heading */
  .greeting-name {
    font-family: var(--font-display);
    font-size: clamp(3rem, 10vw, 6rem);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1;
    margin: 0;
    color: var(--color-text);
    opacity: 0;
    animation: fadeSlideIn 0.7s var(--ease-out, ease-out) 0.3s forwards;
  }

  /* Ink-blue shimmer on the name */
  .greeting-name {
    background: linear-gradient(
      135deg,
      var(--color-text) 0%,
      var(--color-primary-light) 35%,
      var(--color-primary) 60%,
      var(--color-primary-light) 80%,
      var(--color-text) 100%
    );
    background-size: 300% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation:
      nameShimmer 10s linear infinite,
      fadeSlideIn 0.7s var(--ease-out, ease-out) 0.3s forwards;
  }

  @keyframes nameShimmer {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 300% center;
    }
  }

  /* ── Decorative Divider ── */

  .content-divider {
    width: 48px;
    height: 2px;
    background: var(--color-primary);
    border-radius: var(--radius-full);
    margin: 1.5rem auto;
    opacity: 0;
    animation: fadeIn 0.5s var(--ease-out, ease-out) 0.55s forwards;
  }

  /* ── Compliment ── */

  .compliment {
    font-family: var(--font-body);
    font-size: clamp(1rem, 3vw, 1.25rem);
    font-weight: 400;
    line-height: 1.6;
    color: var(--color-text-secondary);
    max-width: 480px;
    margin: 0 auto;
    opacity: 0;
    animation: fadeSlideIn 0.7s var(--ease-out, ease-out) 0.7s forwards;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ENTRANCE ANIMATIONS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 768px) {
    .content {
      padding: 1.5rem 1rem;
    }
  }

  @media (max-width: 480px) {
    .content {
      padding: 1.25rem 0.75rem;
    }

    .content-divider {
      width: 36px;
      margin: 1.25rem auto;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION — disable all cosmetic animations
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .page-spinner {
      animation: none;
    }

    .greeting-salutation,
    .greeting-name,
    .content-divider,
    .compliment {
      animation: none;
      opacity: 1;
      transform: none;
    }

    /* Keep static colour on name when shimmer animation is disabled */
    .greeting-name {
      background: none;
      -webkit-text-fill-color: var(--color-text);
      color: var(--color-text);
    }

    .greeting-salutation.greeting-transitioning {
      opacity: 0.4 !important;
      transform: none;
    }
  }
</style>
