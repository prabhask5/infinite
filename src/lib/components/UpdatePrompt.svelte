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
     UpdatePrompt Toast — fixed bottom bar that slides up when showPrompt is true
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if showPrompt}
  <!-- Update available notification — slides in from the bottom -->
  <div class="update-toast" role="status" aria-live="polite" aria-label="App update available">
    <!-- ── Icon + label ── -->
    <div class="toast-content">
      <!-- Spinning refresh icon -->
      <span class="toast-icon" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
      </span>
      <span class="toast-label">A new version is available</span>
    </div>

    <!-- ── Action buttons ── -->
    <div class="toast-actions">
      <button class="btn btn-ghost toast-btn-later" onclick={handleDismiss}>Later</button>
      <button class="btn btn-primary toast-btn-refresh" onclick={handleRefresh}>Refresh</button>
    </div>
  </div>
{/if}

<style>
  /* ═══ Toast Container ═══ */

  /* Fixed bottom bar — slides up when rendered */
  .update-toast {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;

    display: flex;
    align-items: center;
    gap: 1rem;

    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-xl);
    padding: 0.75rem 1rem;
    box-shadow: var(--shadow-lg);

    /* Entrance animation — slides up from just below the viewport */
    animation: toastSlideUp var(--duration-normal, 260ms)
      var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)) both;

    /* Clamp width for readability on both narrow and wide viewports */
    width: max-content;
    max-width: min(calc(100vw - 2rem), 480px);
  }

  @keyframes toastSlideUp {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(1rem);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  /* ═══ Icon + Label Row ═══ */

  .toast-content {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex: 1;
    min-width: 0;
  }

  /* Spinning refresh icon */
  .toast-icon {
    color: var(--color-primary);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast-icon svg {
    animation: toastIconSpin 1.8s linear infinite;
  }

  @keyframes toastIconSpin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .toast-label {
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ═══ Action Buttons ═══ */

  .toast-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Tighter padding for compact toast context */
  .toast-btn-later,
  .toast-btn-refresh {
    padding: 0.375rem 0.875rem;
    font-size: 0.8125rem;
  }

  /* ═══ Responsive ═══ */

  /* On very small screens, stack vertically */
  @media (max-width: 360px) {
    .update-toast {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .toast-actions {
      justify-content: flex-end;
    }
  }

  /* Safe-area padding for devices with home bar */
  @supports (padding-bottom: env(safe-area-inset-bottom)) {
    .update-toast {
      bottom: calc(1rem + env(safe-area-inset-bottom));
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .update-toast {
      animation: none;
    }

    .toast-icon svg {
      animation: none;
    }
  }
</style>
