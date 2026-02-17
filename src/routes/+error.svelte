<!--
  @fileoverview Error boundary — handles three scenarios:
    1. **Offline** — device has no connectivity, show a friendly offline message
    2. **404**     — page not found, offer navigation back to home
    3. **Generic** — unexpected error, display status code and retry option
-->
<script lang="ts">
  /**
   * @fileoverview Error page script — status detection and recovery actions.
   */

  // ==========================================================================
  //                                IMPORTS
  // ==========================================================================

  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';

  // ==========================================================================
  //                                 STATE
  // ==========================================================================

  /** Whether the user is currently offline — drives which error variant is shown. */
  let isOffline = $state(false);

  // ==========================================================================
  //                          REACTIVE EFFECTS
  // ==========================================================================

  /**
   * Effect: tracks the browser's online/offline status in real time.
   * Sets `isOffline` on mount and attaches `online` / `offline` event listeners.
   * Returns a cleanup function that removes the listeners on destroy.
   */
  $effect(() => {
    if (browser) {
      isOffline = !navigator.onLine;

      const handleOnline = () => {
        isOffline = false;
      };
      const handleOffline = () => {
        isOffline = true;
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  });

  // ==========================================================================
  //                          EVENT HANDLERS
  // ==========================================================================

  /**
   * Reload the current page — useful when the user regains connectivity or
   * wants to retry after a transient server error.
   */
  function handleRetry() {
    window.location.reload();
  }

  /**
   * Navigate back to the home page via SvelteKit client-side routing.
   */
  function handleGoHome() {
    goto('/');
  }
</script>

<svelte:head>
  <title>Error - Infinite Notes</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Error Page — full-viewport centered card, adapts to offline / 404 / generic
     ═══════════════════════════════════════════════════════════════════════════ -->
<div class="error-page">
  <div class="error-container">
    <!-- ── Error Icon — changes based on error type ── -->
    <div class="error-icon">
      {#if isOffline}
        <!-- Wifi-off icon for offline state -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
      {:else if $page.status === 404}
        <!-- Sad-face icon for page not found -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M16 16s-1.5-2-4-2-4 2-4 2"></path>
          <line x1="9" y1="9" x2="9.01" y2="9"></line>
          <line x1="15" y1="9" x2="15.01" y2="9"></line>
        </svg>
      {:else}
        <!-- Warning triangle for generic errors -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="56"
          height="56"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
          ></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      {/if}
    </div>

    <!-- ── Error Title — adapts to error type ── -->
    <h1 class="error-title">
      {#if isOffline}
        You're Offline
      {:else if $page.status === 404}
        Page Not Found
      {:else}
        Something Went Wrong
      {/if}
    </h1>

    <!-- ── Error Description — context-specific guidance ── -->
    <p class="error-message">
      {#if isOffline}
        This page isn't available offline. Please check your connection and try again.
      {:else if $page.status === 404}
        The page you're looking for doesn't exist or has been moved.
      {:else}
        {$page.error?.message || 'An unexpected error occurred. Please try again.'}
      {/if}
    </p>

    <!-- ── Action Buttons — retry or navigate home ── -->
    <div class="error-actions">
      {#if isOffline}
        <button class="btn btn-primary" onclick={handleRetry}>Try Again</button>
      {:else}
        <button class="btn btn-secondary" onclick={handleRetry}>Refresh Page</button>
      {/if}
      <button class="btn btn-ghost" onclick={handleGoHome}>Go Home</button>
    </div>

    <!-- ── Persistent Error Hint — shown only for generic (non-404, non-offline) errors ── -->
    {#if !isOffline && $page.status !== 404}
      <p class="error-hint">
        If this problem persists, try refreshing the page or clearing your browser cache.
      </p>
    {/if}
  </div>
</div>

<style>
  /* ═══ Layout ═══ */

  .error-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: var(--color-bg);
  }

  /* Letter-block card — soft-edged tile */
  .error-container {
    max-width: 420px;
    width: 100%;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    text-align: center;
    box-shadow: var(--shadow-md);
  }

  /* ═══ Icon ═══ */

  .error-icon {
    color: var(--color-primary);
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ═══ Typography ═══ */

  .error-title {
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 0.625rem;
    letter-spacing: -0.02em;
  }

  .error-message {
    font-family: var(--font-body);
    color: var(--color-text-secondary);
    margin: 0 0 1.75rem;
    line-height: 1.6;
    font-size: 0.9375rem;
  }

  /* ═══ Actions ═══ */

  .error-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ═══ Hint ═══ */

  .error-hint {
    margin-top: 1.5rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    line-height: 1.5;
  }

  /* ═══ Responsive ═══ */

  @media (max-width: 480px) {
    .error-container {
      padding: 1.75rem 1.25rem;
      border-radius: var(--radius-lg);
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .error-icon svg {
      transition: none;
    }
  }
</style>
