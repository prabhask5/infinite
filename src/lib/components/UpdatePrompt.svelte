<script lang="ts">
  /**
   * @fileoverview UpdatePrompt — service-worker update notification.
   *
   * Detects when a new service worker version is waiting to activate and
   * shows an "update available" prompt. Detection relies on six signals:
   *   1. `statechange` on the installing SW → catches updates during the visit
   *   2. `updatefound` on the registration → catches background installs
   *   3. `visibilitychange` → re-checks when the tab becomes visible
   *   4. `online` event → re-checks when connectivity is restored
   *   5. Periodic interval → fallback for iOS standalone mode
   *   6. Initial check on mount → catches SWs that installed before this component
   *
   * Uses `monitorSwLifecycle()` from stellar-drive to wire up all six, and
   * `handleSwUpdate()` to send SKIP_WAITING + reload on user confirmation.
   */

  // ==========================================================================
  //                                IMPORTS
  // ==========================================================================

  import { onMount, onDestroy } from 'svelte';
  import { monitorSwLifecycle, handleSwUpdate } from 'stellar-drive/kit';

  // ==========================================================================
  //                           COMPONENT STATE
  // ==========================================================================

  /** Whether the update prompt is visible */
  let showPrompt = $state(false);

  /** Guard flag to prevent double-reload */
  let reloading = false;

  /** Cleanup function returned by monitorSwLifecycle */
  let cleanup: (() => void) | null = null;

  // ==========================================================================
  //                      SERVICE WORKER MONITORING
  // ==========================================================================

  onMount(() => {
    cleanup = monitorSwLifecycle({
      onUpdateAvailable: () => {
        showPrompt = true;
      }
    });
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  //                          ACTION HANDLERS
  // ==========================================================================

  /**
   * Apply the update: sends SKIP_WAITING to the waiting SW,
   * waits for controllerchange, then reloads the page.
   */
  async function handleRefresh() {
    if (reloading) return;
    reloading = true;
    showPrompt = false;
    await handleSwUpdate();
  }

  /**
   * Dismiss the prompt. The update will apply on the next visit.
   */
  function handleDismiss() {
    showPrompt = false;
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     UpdatePrompt — Letter card that slides up from the bottom
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if showPrompt}
  <div class="update-card" role="status" aria-live="polite" aria-label="App update available">
    <!-- Ink margin stripe — the notebook binding edge -->
    <div class="card-margin" aria-hidden="true">
      <div class="margin-line"></div>
      <!-- Ink seal dot — like a wax seal on the margin -->
      <div class="ink-seal">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      </div>
    </div>

    <!-- Card body -->
    <div class="card-body">
      <div class="card-text">
        <span class="card-label">New version</span>
        <span class="card-message">A fresh page is ready for you.</span>
      </div>
      <div class="card-actions">
        <button class="card-btn card-btn-dismiss" onclick={handleDismiss}>Later</button>
        <button class="card-btn card-btn-apply" onclick={handleRefresh}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Refresh
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     UPDATE CARD — Letter-block note card with ink margin
     ═══════════════════════════════════════════════════════════════════════════ */

  .update-card {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;

    display: flex;
    align-items: stretch;

    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    overflow: hidden;

    /* Layered shadow: tight contact shadow + broader ambient + faint ink glow */
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.4),
      0 8px 24px rgba(0, 0, 0, 0.35),
      0 0 0 1px rgba(74, 125, 255, 0.06);

    width: max-content;
    max-width: min(calc(100vw - 2rem), 440px);

    /* Entrance — card slides up from below with a slight spring */
    animation: cardSlideUp var(--duration-normal, 260ms)
      var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)) both;
  }

  @keyframes cardSlideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(1.5rem);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* ── Ink Margin — the left accent stripe ── */

  .card-margin {
    position: relative;
    width: 36px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary-subtle);
  }

  /* Vertical rule line — the notebook margin */
  .margin-line {
    position: absolute;
    right: 0;
    top: 8px;
    bottom: 8px;
    width: 1px;
    background: var(--color-primary);
    opacity: 0.25;
    border-radius: var(--radius-full);
  }

  /* Pen icon — sits in the margin like a notation mark */
  .ink-seal {
    position: relative;
    z-index: 1;
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    animation: sealWrite 2s var(--ease-in-out, ease) infinite;
  }

  @keyframes sealWrite {
    0%,
    100% {
      transform: translateY(0) rotate(0deg);
    }
    25% {
      transform: translateY(-1px) rotate(-4deg);
    }
    75% {
      transform: translateY(1px) rotate(2deg);
    }
  }

  /* ── Card Body — text + actions ── */

  .card-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    min-width: 0;
  }

  .card-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .card-label {
    font-family: var(--font-display);
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-primary);
    line-height: 1;
  }

  .card-message {
    font-family: var(--font-body);
    font-size: 0.8125rem;
    font-weight: 400;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
  }

  /* ── Action Buttons ── */

  .card-actions {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .card-btn {
    font-family: var(--font-body);
    font-size: 0.8125rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-sm);
    padding: 0.4rem 0.75rem;
    transition:
      background var(--duration-fast, 160ms) var(--ease-out),
      color var(--duration-fast, 160ms) var(--ease-out),
      transform var(--duration-fast, 160ms) var(--ease-spring);
    line-height: 1.2;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .card-btn:active {
    transform: scale(0.96);
  }

  /* Dismiss — ghost button, understated */
  .card-btn-dismiss {
    background: transparent;
    color: var(--color-text-muted);
  }

  .card-btn-dismiss:hover {
    background: var(--color-border);
    color: var(--color-text-secondary);
  }

  /* Apply — ink-filled primary action */
  .card-btn-apply {
    background: var(--color-primary);
    color: #fff;
    box-shadow: 0 1px 4px rgba(74, 125, 255, 0.3);
  }

  .card-btn-apply:hover {
    background: var(--color-primary-hover, #5a8aff);
    box-shadow: 0 2px 8px rgba(74, 125, 255, 0.4);
  }

  .card-btn-apply svg {
    flex-shrink: 0;
  }

  /* ═══ Responsive ═══ */

  @media (max-width: 360px) {
    .update-card {
      max-width: calc(100vw - 1.5rem);
    }

    .card-body {
      flex-direction: column;
      align-items: stretch;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem;
    }

    .card-actions {
      justify-content: flex-end;
    }

    .card-message {
      white-space: normal;
    }
  }

  /* Safe area for devices with home bar */
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .update-card {
      bottom: calc(1rem + env(safe-area-inset-bottom));
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .update-card {
      animation: none;
    }

    .ink-seal {
      animation: none;
    }
  }
</style>
