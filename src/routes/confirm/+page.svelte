<!--
  @fileoverview Email confirmation page — token verification, BroadcastChannel
  relay, and close/redirect flow.

  Supabase email links land here with `?token_hash=...&type=...` query
  params. The page verifies the token, broadcasts the result to the
  originating tab via BroadcastChannel, and either tells the user they
  can close the tab or redirects them to the app root.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { handleEmailConfirmation, broadcastAuthConfirmed } from 'stellar-drive/kit';
  import { debug } from 'stellar-drive/utils';

  // ==========================================================================
  //                                 STATE
  // ==========================================================================

  /** Current page state — drives which UI variant is rendered. */
  let status: 'verifying' | 'success' | 'error' | 'redirecting' | 'can_close' = 'verifying';

  /** Human-readable error message when verification fails. */
  let errorMessage = '';

  // ==========================================================================
  //                              CONSTANTS
  // ==========================================================================

  /** BroadcastChannel name shared with the login page. */
  const CHANNEL_NAME = 'infinite-auth-channel';

  // ==========================================================================
  //                              LIFECYCLE
  // ==========================================================================

  onMount(async () => {
    /* ── Read Supabase callback params ── */
    const tokenHash = $page.url.searchParams.get('token_hash');
    const type = $page.url.searchParams.get('type');
    debug('log', '[Confirm] Verifying token, type:', type);

    /* ── Token present → verify it ── */
    if (tokenHash && type) {
      const result = await handleEmailConfirmation(
        tokenHash,
        type as 'signup' | 'email' | 'email_change' | 'magiclink'
      );

      if (!result.success) {
        debug('error', '[Confirm] Verification failed:', result.error);
        status = 'error';
        errorMessage = result.error || 'Unknown error';
        return;
      }

      debug('log', '[Confirm] Verification successful');
      status = 'success';
      /* Brief pause so the user sees the success state */
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    /* ── Notify the originating tab and decide next action ── */
    debug('log', '[Confirm] Broadcasting auth confirmed via BroadcastChannel');
    const tabResult = await broadcastAuthConfirmed(CHANNEL_NAME, type || 'signup');
    if (tabResult === 'can_close') {
      status = 'can_close';
    } else if (tabResult === 'no_broadcast') {
      focusOrRedirect();
    }
  });

  // ==========================================================================
  //                              HELPERS
  // ==========================================================================

  /**
   * Broadcast a confirmation event to any listening login tab, then
   * attempt to close this browser tab. Falls back to a static
   * "you can close this tab" message when `window.close()` is denied.
   */
  async function focusOrRedirect() {
    status = 'redirecting';

    const type = $page.url.searchParams.get('type') || 'signup';

    const result = await broadcastAuthConfirmed(CHANNEL_NAME, type);

    if (result === 'no_broadcast') {
      /* BroadcastChannel unsupported — redirect to home directly */
      goto('/', { replaceState: true });
    } else {
      /* 'can_close' — window.close() was blocked by browser */
      setTimeout(() => {
        status = 'can_close';
      }, 200);
    }
  }
</script>

<svelte:head>
  <title>Confirming... - Infinite Notes</title>
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Confirm Page — full-viewport centered card with five lifecycle states
     ═══════════════════════════════════════════════════════════════════════════ -->
<div class="confirm-page">
  <!-- ── Subtle background — paper-toned gradient with noise texture ── -->
  <div class="page-bg" aria-hidden="true"></div>

  <!-- ── Content card ── -->
  <div class="confirm-card">
    <!-- ── Verifying State — spinning indicator ── -->
    {#if status === 'verifying'}
      <div class="status-icon icon-spinning">
        <!-- Spinning loader circle -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path
            d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <h1 class="status-title">Verifying your email...</h1>
      <p class="status-body">Please wait while we confirm your account.</p>

      <!-- ── Success State — brief flash before redirecting ── -->
    {:else if status === 'success'}
      <div class="status-icon icon-success">
        <!-- Checkmark -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h1 class="status-title">Email Verified!</h1>
      <p class="status-body">Your account has been confirmed. Redirecting...</p>

      <!-- ── Redirecting State — clock icon ── -->
    {:else if status === 'redirecting'}
      <div class="status-icon icon-neutral">
        <!-- Clock icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7v5l3 3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h1 class="status-title">Taking you to Infinite Notes...</h1>
      <p class="status-body">Just a moment.</p>

      <!-- ── Can-Close State — window.close() was blocked ── -->
    {:else if status === 'can_close'}
      <div class="status-icon icon-success">
        <!-- Checkmark -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h1 class="status-title">You're all set!</h1>
      <p class="status-body">
        Your email is verified. You can close this tab and return to Infinite Notes.
      </p>

      <!-- ── Error State — verification failed ── -->
    {:else if status === 'error'}
      <div class="status-icon icon-error">
        <!-- X icon -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>
      <h1 class="status-title">Verification Failed</h1>
      <p class="status-body status-error">{errorMessage}</p>
      <a href="/login" class="btn btn-primary confirm-btn">Go to Login</a>
    {/if}
  </div>
</div>

<style>
  /* ═══ Page Container ═══ */

  .confirm-page {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    overflow: hidden;
  }

  /* ── Subtle paper gradient background — no cosmic elements ── */
  .page-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(74, 125, 255, 0.06) 0%, transparent 60%),
      radial-gradient(ellipse at 70% 80%, rgba(74, 125, 255, 0.04) 0%, transparent 60%),
      var(--color-bg);
  }

  /* ═══ Card ═══ */

  /* Letter-block tile — matches error page card aesthetic */
  .confirm-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 380px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: 3rem 2rem;
    text-align: center;
    box-shadow: var(--shadow-lg);
  }

  /* ═══ Status Icons ═══ */

  .status-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
  }

  .status-icon svg {
    width: 32px;
    height: 32px;
  }

  /* Neutral (verifying / redirecting) — primary accent background */
  .icon-spinning,
  .icon-neutral {
    background: rgba(74, 125, 255, 0.1);
    color: var(--color-primary);
  }

  /* Spinner animation */
  .icon-spinning svg {
    animation: confirmSpin 1.2s linear infinite;
  }

  @keyframes confirmSpin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Success — green tint */
  .icon-success {
    background: rgba(34, 197, 94, 0.12);
    color: var(--color-success);
  }

  /* Error — red tint */
  .icon-error {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-red);
  }

  /* ═══ Typography ═══ */

  .status-title {
    font-family: var(--font-display);
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0 0 0.625rem;
    letter-spacing: -0.02em;
  }

  .status-body {
    font-family: var(--font-body);
    font-size: 0.9375rem;
    line-height: 1.6;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .status-error {
    color: var(--color-red);
    margin-bottom: 1.5rem;
  }

  /* ═══ Action Button ═══ */

  .confirm-btn {
    display: inline-block;
    margin-top: 0.5rem;
    text-decoration: none;
  }

  /* ═══ Responsive ═══ */

  @media (max-width: 480px) {
    .confirm-card {
      padding: 2rem 1.25rem;
      border-radius: var(--radius-lg);
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .icon-spinning svg {
      animation: none;
    }
  }
</style>
