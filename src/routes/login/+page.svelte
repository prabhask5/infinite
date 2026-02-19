<!--
  @fileoverview Login page — three modes:
    1. **Setup**       — first-time account creation (email + PIN)
    2. **Unlock**      — returning user enters PIN to unlock
    3. **Link Device** — new device links to an existing account via email verification

  Uses BroadcastChannel (`auth-channel`) for cross-tab communication with
  the /confirm page so email verification results propagate instantly.
-->
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    setupSingleUser,
    unlockSingleUser,
    getSingleUserInfo,
    completeSingleUserSetup,
    completeDeviceVerification,
    pollDeviceVerification,
    fetchRemoteGateConfig,
    linkSingleUserDevice
  } from 'stellar-drive/auth';
  import { sendDeviceVerification, isDemoMode } from 'stellar-drive';
  import { debug } from 'stellar-drive/utils';

  // ==========================================================================
  //                        LAYOUT / PAGE DATA
  // ==========================================================================

  /** Whether this device has a linked single-user account (derived from IndexedDB, not layout data) */
  let deviceLinked = $state(false);

  /** Post-login redirect URL extracted from `?redirect=` query param */
  const redirectUrl = $derived($page.url.searchParams.get('redirect') || '/');

  // ==========================================================================
  //                          SHARED UI STATE
  // ==========================================================================

  /** `true` while any async auth operation is in-flight */
  let loading = $state(false);

  /** Current error message shown to the user (null = no error) */
  let error = $state<string | null>(null);

  /** Triggers the CSS shake animation on the login card */
  let shaking = $state(false);

  /** Set to `true` after the component mounts — enables entrance animation */
  let mounted = $state(false);

  /** `true` while the initial auth state is being resolved (prevents card flash) */
  let resolving = $state(true);

  // =============================================================================
  //  Setup Mode State (step 1 → email/name, step 2 → PIN creation)
  // =============================================================================

  /** User's email address for account creation */
  let email = $state('');

  /** User's first name */
  let firstName = $state('');

  /** User's last name (optional) */
  let lastName = $state('');

  /** Individual digit values for the 6-digit PIN code */
  let codeDigits = $state(['', '', '', '', '', '']);

  /** Individual digit values for the PIN confirmation */
  let confirmDigits = $state(['', '', '', '', '', '']);

  /** Concatenated PIN code — derived from `codeDigits` */
  const code = $derived(codeDigits.join(''));

  /** Concatenated confirmation code — derived from `confirmDigits` */
  const confirmCode = $derived(confirmDigits.join(''));

  /** Current setup wizard step: 1 = email + name, 2 = PIN creation */
  let setupStep = $state(1); // 1 = email + name, 2 = code

  // =============================================================================
  //  Unlock Mode State (returning user on this device)
  // =============================================================================

  /** Individual digit values for the unlock PIN */
  let unlockDigits = $state(['', '', '', '', '', '']);

  /** Concatenated unlock code — derived from `unlockDigits` */
  const unlockCode = $derived(unlockDigits.join(''));

  /** Cached user profile info (first/last name) for the welcome message */
  let userInfo = $state<{ firstName: string; lastName: string } | null>(null);

  // =============================================================================
  //  Link Device Mode State (new device, existing remote user)
  // =============================================================================

  /** Individual digit values for the device-linking PIN */
  let linkDigits = $state(['', '', '', '', '', '']);

  /** Concatenated link code — derived from `linkDigits` */
  const linkCode = $derived(linkDigits.join(''));

  /**
   * Remote user info fetched from the gate config — contains email,
   * gate type, code length, and profile data for the welcome message.
   */
  let remoteUser = $state<{
    email: string;
    gateType: string;
    codeLength: number;
    profile: Record<string, unknown>;
  } | null>(null);

  /** `true` when we detected a remote user and entered link-device mode */
  let linkMode = $state(false);

  /** Loading state specific to the link-device flow */
  let linkLoading = $state(false);

  /** `true` when offline and no local setup exists — shows offline card */
  let offlineNoSetup = $state(false);

  // =============================================================================
  //  Rate-Limit Countdown State
  // =============================================================================

  /** Seconds remaining before the user can retry after a rate-limit */
  let retryCountdown = $state(0);

  /** Interval handle for the retry countdown timer */
  let retryTimer: ReturnType<typeof setInterval> | null = null;

  // =============================================================================
  //  Modal State — Email Confirmation & Device Verification
  // =============================================================================

  /** Show the "check your email" modal after initial signup */
  let showConfirmationModal = $state(false);

  /** Show the "new device detected" verification modal */
  let showDeviceVerificationModal = $state(false);

  /** Masked email address displayed in the device-verification modal */
  let maskedEmail = $state('');

  /** Seconds remaining before the "resend" button re-enables */
  let resendCooldown = $state(0);

  /** Interval handle for the resend cooldown timer */
  let resendTimer: ReturnType<typeof setInterval> | null = null;

  /** Interval handle for polling device verification status */
  let verificationPollTimer: ReturnType<typeof setInterval> | null = null;

  /** Guard flag to prevent double-execution of verification completion */
  let verificationCompleting = false; // guard against double execution

  // =============================================================================
  //  Input Refs — DOM references for focus management
  // =============================================================================

  /** References to the 6 setup-code `<input>` elements */
  let codeInputs: HTMLInputElement[] = $state([]);

  /** References to the 6 confirm-code `<input>` elements */
  let confirmInputs: HTMLInputElement[] = $state([]);

  /** References to the 6 unlock-code `<input>` elements */
  let unlockInputs: HTMLInputElement[] = $state([]);

  /** References to the link-code `<input>` elements */
  let linkInputs: HTMLInputElement[] = $state([]);

  // =============================================================================
  //  Cross-Tab Communication
  // =============================================================================

  /** BroadcastChannel instance for receiving `AUTH_CONFIRMED` from `/confirm` */
  let authChannel: BroadcastChannel | null = null;

  // =============================================================================
  //  Lifecycle — onMount
  // =============================================================================

  onMount(async () => {
    mounted = true;
    debug('log', '[Login] Mount — resolving auth state');

    /* ── Demo mode → redirect to home ──── */
    if (isDemoMode()) {
      debug('log', '[Login] Demo mode active, redirecting to /');
      goto('/', { replaceState: true });
      return;
    }

    /* ── Check if this device has a local account ──── */
    const info = await getSingleUserInfo();
    if (info) {
      userInfo = {
        firstName: (info.profile.firstName as string) || '',
        lastName: (info.profile.lastName as string) || ''
      };
      deviceLinked = true;
      debug('log', '[Login] Device linked, showing unlock mode');
    } else {
      /* ── No local setup → check for a remote user to link to ──── */
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        offlineNoSetup = true;
      } else {
        try {
          const remote = await fetchRemoteGateConfig();
          if (remote) {
            remoteUser = remote;
            linkMode = true;
            debug('log', '[Login] Remote user found, entering link-device mode');
          }
        } catch {
          /* No remote user found — fall through to normal setup */
        }
      }
    }

    /* ── Initial resolution complete — show the appropriate card ──── */
    resolving = false;

    /* ── Listen for auth confirmation from the `/confirm` page ──── */
    try {
      authChannel = new BroadcastChannel('infinite-auth-channel');
      authChannel.onmessage = async (event) => {
        if (event.data?.type === 'AUTH_CONFIRMED') {
          /* Bring this tab to the foreground before the confirm tab closes */
          window.focus();
          if (showConfirmationModal) {
            /* Setup confirmation complete → finalize account */
            const result = await completeSingleUserSetup();
            if (!result.error) {
              showConfirmationModal = false;
              await invalidateAll();
              goto('/');
            } else {
              error = result.error;
              showConfirmationModal = false;
            }
          } else if (showDeviceVerificationModal) {
            /* Device verification complete (same-browser broadcast) */
            await handleVerificationComplete();
          }
        }
      };
    } catch {
      /* BroadcastChannel not supported — user must manually refresh */
    }
  });

  // =============================================================================
  //  Lifecycle — onDestroy (cleanup timers & channels)
  // =============================================================================

  onDestroy(() => {
    authChannel?.close();
    if (resendTimer) clearInterval(resendTimer);
    if (retryTimer) clearInterval(retryTimer);
    stopVerificationPolling();
  });

  // =============================================================================
  //  Device Verification Polling
  // =============================================================================

  /**
   * Start polling the engine every 3 seconds to check whether the
   * device has been trusted (the user clicked the email link on
   * another device/browser).
   */
  function startVerificationPolling() {
    stopVerificationPolling();
    verificationPollTimer = setInterval(async () => {
      if (verificationCompleting) return;
      const trusted = await pollDeviceVerification();
      if (trusted) {
        await handleVerificationComplete();
      }
    }, 3000);
  }

  /**
   * Stop the verification polling interval and clear the handle.
   */
  function stopVerificationPolling() {
    if (verificationPollTimer) {
      clearInterval(verificationPollTimer);
      verificationPollTimer = null;
    }
  }

  /**
   * Finalize device verification — calls `completeDeviceVerification`
   * and redirects on success. Guarded by `verificationCompleting` to
   * prevent double-execution from both polling and BroadcastChannel.
   */
  async function handleVerificationComplete() {
    if (verificationCompleting) return;
    verificationCompleting = true;
    stopVerificationPolling();

    const result = await completeDeviceVerification();
    if (!result.error) {
      showDeviceVerificationModal = false;
      await invalidateAll();
      goto(redirectUrl);
    } else {
      error = result.error;
      showDeviceVerificationModal = false;
      verificationCompleting = false;
    }
  }

  // =============================================================================
  //  Resend & Retry Cooldowns
  // =============================================================================

  /**
   * Start a 30-second cooldown on the "Resend email" button to
   * prevent spamming the email service.
   */
  function startResendCooldown() {
    resendCooldown = 30;
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendCooldown--;
      if (resendCooldown <= 0 && resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);
  }

  /**
   * Start a countdown after receiving a rate-limit response from the
   * server. Disables the code inputs and auto-clears the error when
   * the countdown reaches zero.
   *
   * @param ms - The `retryAfterMs` value from the server response
   */
  function startRetryCountdown(ms: number) {
    retryCountdown = Math.ceil(ms / 1000);
    if (retryTimer) clearInterval(retryTimer);
    retryTimer = setInterval(() => {
      retryCountdown--;
      if (retryCountdown <= 0) {
        retryCountdown = 0;
        error = null;
        if (retryTimer) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }
    }, 1000);
  }

  // =============================================================================
  //  Email Resend Handler
  // =============================================================================

  /**
   * Resend the confirmation or verification email depending on
   * which modal is currently visible. Respects the resend cooldown.
   */
  async function handleResendEmail() {
    if (resendCooldown > 0) return;
    startResendCooldown();
    /* For setup confirmation → resend the signup email */
    if (showConfirmationModal) {
      const { resendConfirmationEmail } = await import('stellar-drive');
      await resendConfirmationEmail(email);
    }
    /* For device verification → resend the OTP email */
    if (showDeviceVerificationModal) {
      const info = await getSingleUserInfo();
      if (info?.email) {
        await sendDeviceVerification(info.email);
      }
    }
  }

  // =============================================================================
  //  Digit Input Handlers — Shared across all PIN-code fields
  // =============================================================================

  /**
   * Handle a single digit being typed into a PIN input box. Filters
   * non-numeric characters, auto-advances focus, and triggers
   * `onComplete` when the last digit is filled.
   *
   * @param digits    - The reactive digit array being edited
   * @param index     - Which position in the array this input represents
   * @param event     - The native `input` DOM event
   * @param inputs    - Array of `HTMLInputElement` refs for focus management
   * @param onComplete - Optional callback invoked when all digits are filled
   */
  function handleDigitInput(
    digits: string[],
    index: number,
    event: Event,
    inputs: HTMLInputElement[],
    onComplete?: () => void
  ) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');

    if (value.length > 0) {
      digits[index] = value.charAt(value.length - 1);
      input.value = digits[index];
      /* Auto-focus the next input box */
      if (index < digits.length - 1 && inputs[index + 1]) {
        inputs[index + 1].focus();
      }
      /* Auto-submit when the last digit is entered (brief delay for UX) */
      if (index === digits.length - 1 && onComplete && digits.every((d) => d !== '')) {
        setTimeout(() => onComplete(), 300);
      }
    } else {
      digits[index] = '';
    }
  }

  /**
   * Handle backspace in a PIN input — moves focus to the previous
   * input when the current one is already empty.
   *
   * @param digits - The reactive digit array
   * @param index  - Current position index
   * @param event  - The native `keydown` event
   * @param inputs - Array of `HTMLInputElement` refs
   */
  function handleDigitKeydown(
    digits: string[],
    index: number,
    event: KeyboardEvent,
    inputs: HTMLInputElement[]
  ) {
    if (event.key === 'Backspace') {
      if (digits[index] === '' && index > 0 && inputs[index - 1]) {
        inputs[index - 1].focus();
        digits[index - 1] = '';
      } else {
        digits[index] = '';
      }
    }
  }

  /**
   * Handle paste into a PIN input — distributes pasted digits across
   * all input boxes and auto-submits if the full code was pasted.
   *
   * @param digits     - The reactive digit array
   * @param event      - The native `paste` clipboard event
   * @param inputs     - Array of `HTMLInputElement` refs
   * @param onComplete - Optional callback invoked when all digits are filled
   */
  function handleDigitPaste(
    digits: string[],
    event: ClipboardEvent,
    inputs: HTMLInputElement[],
    onComplete?: () => void
  ) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '').replace(/[^0-9]/g, '');
    for (let i = 0; i < digits.length && i < pasted.length; i++) {
      digits[i] = pasted[i];
      if (inputs[i]) inputs[i].value = pasted[i];
    }
    const focusIndex = Math.min(pasted.length, digits.length - 1);
    if (inputs[focusIndex]) inputs[focusIndex].focus();
    /* Auto-submit if the full code was pasted at once */
    if (pasted.length >= digits.length && onComplete && digits.every((d) => d !== '')) {
      onComplete();
    }
  }

  // =============================================================================
  //  Setup Mode — Step Navigation
  // =============================================================================

  /**
   * Validate email and first name, then advance to the PIN-creation
   * step (step 2). Shows an error if validation fails.
   */
  function goToCodeStep() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      error = 'Please enter a valid email address';
      return;
    }
    if (!firstName.trim()) {
      error = 'First name is required';
      return;
    }
    error = null;
    setupStep = 2;
  }

  /**
   * Navigate back from step 2 (PIN creation) to step 1 (email/name).
   */
  function goBackToNameStep() {
    setupStep = 1;
    error = null;
  }

  /**
   * Auto-focus the first confirm-code input when the primary code
   * is fully entered.
   */
  function autoFocusConfirm() {
    if (confirmInputs[0]) confirmInputs[0].focus();
  }

  /**
   * Trigger setup submission when the confirm-code auto-completes.
   */
  function autoSubmitSetup() {
    if (confirmDigits.every((d) => d !== '')) {
      handleSetup();
    }
  }

  /**
   * Trigger unlock submission when the unlock-code auto-completes.
   */
  function autoSubmitUnlock() {
    handleUnlock();
  }

  // =============================================================================
  //  Setup Mode — Account Creation
  // =============================================================================

  /**
   * Handle the full setup flow: validate the code matches its
   * confirmation, call `setupSingleUser`, and handle the response
   * (which may require email confirmation or succeed immediately).
   */
  async function handleSetup() {
    if (loading) return;
    debug('log', '[Login] Setup initiated for:', email);

    error = null;

    if (code.length !== 6) {
      error = 'Please enter a 6-digit code';
      return;
    }

    /* Verify code and confirmation match */
    if (code !== confirmCode) {
      error = 'Codes do not match';
      shaking = true;
      setTimeout(() => {
        shaking = false;
      }, 500);
      /* Clear confirm digits and refocus the first confirm input */
      confirmDigits = ['', '', '', '', '', ''];
      if (confirmInputs[0]) confirmInputs[0].focus();
      return;
    }

    loading = true;

    try {
      const result = await setupSingleUser(
        code,
        {
          firstName: firstName.trim(),
          lastName: lastName.trim()
        },
        email.trim()
      );
      if (result.error) {
        error = result.error;
        shaking = true;
        setTimeout(() => {
          shaking = false;
        }, 500);
        codeDigits = ['', '', '', '', '', ''];
        confirmDigits = ['', '', '', '', '', ''];
        loading = false;
        await tick();
        if (codeInputs[0]) codeInputs[0].focus();
        return;
      }
      if (result.confirmationRequired) {
        /* Email confirmation needed → show the "check your email" modal */
        showConfirmationModal = true;
        startResendCooldown();
        return;
      }
      /* No confirmation needed → go straight to the app (keep loading=true to avoid flash) */
      await invalidateAll();
      goto('/');
      return;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Setup failed. Please try again.';
      shaking = true;
      setTimeout(() => {
        shaking = false;
      }, 500);
      codeDigits = ['', '', '', '', '', ''];
      confirmDigits = ['', '', '', '', '', ''];
      if (codeInputs[0]) codeInputs[0].focus();
    }
    loading = false;
  }

  // =============================================================================
  //  Unlock Mode — PIN Entry for Returning Users
  // =============================================================================

  /**
   * Attempt to unlock the local account with the entered 6-digit PIN.
   * Handles rate-limiting, device verification requirements, and
   * error feedback with shake animation.
   */
  async function handleUnlock() {
    if (loading || retryCountdown > 0) return;
    debug('log', '[Login] Unlock attempt');

    error = null;

    if (unlockCode.length !== 6) {
      error = 'Please enter your 6-digit code';
      return;
    }

    loading = true;

    try {
      const result = await unlockSingleUser(unlockCode);
      if (result.error) {
        error = result.error;
        if (result.retryAfterMs) {
          startRetryCountdown(result.retryAfterMs);
        }
        shaking = true;
        setTimeout(() => {
          shaking = false;
        }, 500);
        unlockDigits = ['', '', '', '', '', ''];
        loading = false;
        await tick();
        if (unlockInputs[0]) unlockInputs[0].focus();
        return;
      }
      if (result.deviceVerificationRequired) {
        /* Untrusted device → show verification modal + start polling */
        maskedEmail = result.maskedEmail || '';
        showDeviceVerificationModal = true;
        startResendCooldown();
        startVerificationPolling();
        return;
      }
      /* Success → navigate to the redirect target (keep loading=true to avoid PIN flash) */
      await invalidateAll();
      goto(redirectUrl);
      return;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Incorrect code';
      shaking = true;
      setTimeout(() => {
        shaking = false;
      }, 500);
      unlockDigits = ['', '', '', '', '', ''];
    }
    loading = false;
    if (error) {
      await tick();
      if (unlockInputs[0]) unlockInputs[0].focus();
    }
  }

  // =============================================================================
  //  Link Device Mode — Connect a New Device to an Existing Account
  // =============================================================================

  /**
   * Trigger link submission when the link-code auto-completes.
   */
  function autoSubmitLink() {
    if (linkDigits.every((d) => d !== '')) {
      handleLink();
    }
  }

  /**
   * Attempt to link this device to the remote user account by
   * submitting the PIN. Similar flow to unlock — may require device
   * verification or trigger rate-limiting.
   */
  async function handleLink() {
    if (linkLoading || !remoteUser || retryCountdown > 0) return;
    debug('log', '[Login] Link device attempt for:', remoteUser.email);

    error = null;

    if (linkCode.length !== remoteUser.codeLength) {
      error = `Please enter a ${remoteUser.codeLength}-digit code`;
      return;
    }

    linkLoading = true;
    try {
      const result = await linkSingleUserDevice(remoteUser.email, linkCode);
      if (result.error) {
        error = result.error;
        if (result.retryAfterMs) {
          startRetryCountdown(result.retryAfterMs);
        }
        shaking = true;
        setTimeout(() => {
          shaking = false;
        }, 500);
        linkDigits = Array(remoteUser.codeLength).fill('');
        linkLoading = false;
        await tick();
        if (linkInputs[0]) linkInputs[0].focus();
        return;
      }
      if (result.deviceVerificationRequired) {
        maskedEmail = result.maskedEmail || '';
        showDeviceVerificationModal = true;
        startResendCooldown();
        startVerificationPolling();
        return;
      }
      /* Success → navigate to the redirect target (keep linkLoading=true to avoid flash) */
      await invalidateAll();
      goto(redirectUrl);
      return;
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : 'Incorrect code';
      shaking = true;
      setTimeout(() => {
        shaking = false;
      }, 500);
      linkDigits = Array(remoteUser.codeLength).fill('');
    }
    linkLoading = false;
    if (error) {
      await tick();
      if (linkInputs[0]) linkInputs[0].focus();
    }
  }
</script>

<svelte:head>
  <title>Login - Infinite Notes</title>
</svelte:head>

<!-- ═══ Page Root — clean letter-block login ═══ -->
{#if resolving}
  <div class="login-page">
    <div class="login-loading">
      <div class="loading-spinner"></div>
    </div>
  </div>

  <!-- ═══ Mode: Offline, No Setup ═══ -->
{:else if offlineNoSetup}
  <div class="login-page">
    <div class="login-card card">
      <div class="card-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-text-muted)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h1>You're Offline</h1>
      <p class="subtitle">Connect to the internet to set up Infinite Notes.</p>
    </div>
  </div>

  <!-- ═══ Mode: Unlock (returning user on this device) ═══ -->
{:else if deviceLinked}
  <div class="login-page" class:mounted>
    <div class="login-card card" class:shake={shaking}>
      <!-- User avatar -->
      <div class="avatar">
        {(userInfo?.firstName || 'U').charAt(0).toUpperCase()}
      </div>

      <h1>Welcome back{userInfo?.firstName ? `, ${userInfo.firstName}` : ''}.</h1>
      <p class="subtitle">Enter your gate code to unlock.</p>

      <!-- PIN code entry -->
      {#if loading}
        <div class="loading-row">
          <div class="loading-spinner"></div>
        </div>
      {:else}
        <div class="digit-row">
          {#each unlockDigits as digit, i (i)}
            <input
              class="digit-input"
              class:filled={digit !== ''}
              class:error={!!error}
              type="tel"
              inputmode="numeric"
              pattern="[0-9]"
              maxlength="1"
              bind:this={unlockInputs[i]}
              value={digit}
              oninput={(e) => handleDigitInput(unlockDigits, i, e, unlockInputs, autoSubmitUnlock)}
              onkeydown={(e) => handleDigitKeydown(unlockDigits, i, e, unlockInputs)}
              onpaste={(e) => handleDigitPaste(unlockDigits, e, unlockInputs, autoSubmitUnlock)}
              disabled={loading || retryCountdown > 0}
              autocomplete="off"
            />
          {/each}
        </div>
      {/if}

      {#if error}
        <p class="error-message">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}{retryCountdown > 0 ? ` (${retryCountdown}s)` : ''}
        </p>
      {/if}
    </div>
  </div>

  <!-- ═══ Mode: Link Device (new device, existing remote user) ═══ -->
{:else if linkMode && remoteUser}
  <div class="login-page" class:mounted>
    <div class="login-card card" class:shake={shaking}>
      <!-- Remote user avatar -->
      <div class="avatar">
        {((remoteUser.profile?.firstName as string) || 'U').charAt(0).toUpperCase()}
      </div>

      <h1>
        Welcome back{remoteUser.profile?.firstName ? `, ${remoteUser.profile.firstName}` : ''}.
      </h1>
      <p class="subtitle">Enter your gate code to link this device.</p>

      <!-- PIN code entry for device linking -->
      {#if linkLoading}
        <div class="loading-row">
          <div class="loading-spinner"></div>
        </div>
      {:else}
        <div class="digit-row">
          {#each linkDigits as digit, i (i)}
            <input
              class="digit-input"
              class:filled={digit !== ''}
              class:error={!!error}
              type="tel"
              inputmode="numeric"
              pattern="[0-9]"
              maxlength="1"
              bind:this={linkInputs[i]}
              value={digit}
              oninput={(e) => handleDigitInput(linkDigits, i, e, linkInputs, autoSubmitLink)}
              onkeydown={(e) => handleDigitKeydown(linkDigits, i, e, linkInputs)}
              onpaste={(e) => handleDigitPaste(linkDigits, e, linkInputs, autoSubmitLink)}
              disabled={linkLoading || retryCountdown > 0}
              autocomplete="off"
            />
          {/each}
        </div>
      {/if}

      {#if error}
        <p class="error-message">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}{retryCountdown > 0 ? ` (${retryCountdown}s)` : ''}
        </p>
      {/if}
    </div>
  </div>

  <!-- ═══ Mode: Setup (first-time account creation) ═══ -->
{:else}
  <div class="login-page" class:mounted>
    <div class="login-card card" class:shake={shaking}>
      {#if setupStep === 1}
        <!-- ── Step 1: Email + Name ── -->
        <div class="step-indicator">
          <div class="step-dot active"></div>
          <div class="step-line"></div>
          <div class="step-dot"></div>
        </div>

        <h1>Welcome to Infinite Notes</h1>
        <p class="subtitle">Let's get you set up.</p>

        <div class="form-fields">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              type="email"
              id="email"
              bind:value={email}
              required
              disabled={loading}
              placeholder="you@example.com"
            />
          </div>

          <div class="name-row">
            <div class="form-group">
              <label for="firstName">First name</label>
              <input
                type="text"
                id="firstName"
                bind:value={firstName}
                required
                disabled={loading}
                placeholder="First"
              />
            </div>
            <div class="form-group">
              <label for="lastName">Last name</label>
              <input
                type="text"
                id="lastName"
                bind:value={lastName}
                disabled={loading}
                placeholder="Last"
              />
            </div>
          </div>

          {#if error}
            <p class="error-message">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </p>
          {/if}

          <button
            type="button"
            class="btn btn-primary submit-btn"
            onclick={goToCodeStep}
            disabled={!email.trim() || !firstName.trim()}
          >
            Continue
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <button
          class="btn btn-ghost btn-sm link-text"
          onclick={() => {
            linkMode = true;
          }}
        >
          Already have an account? Link this device
        </button>
      {:else}
        <!-- ── Step 2: Create Gate Code ── -->
        <div class="step-indicator">
          <div class="step-dot completed">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div class="step-line active"></div>
          <div class="step-dot active"></div>
        </div>

        <button type="button" class="back-link" onclick={goBackToNameStep}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h1>Create Your Gate Code</h1>
        <p class="subtitle">Choose a 6-digit code to secure your notes, {firstName.trim()}.</p>

        <div class="form-fields">
          <!-- Primary code entry -->
          <div class="code-section">
            <span class="code-label">Gate code</span>
            <div class="digit-row" role="group" aria-label="Gate code">
              {#each codeDigits as digit, i (i)}
                <input
                  class="digit-input"
                  class:filled={digit !== ''}
                  type="tel"
                  inputmode="numeric"
                  pattern="[0-9]"
                  maxlength="1"
                  aria-label="Digit {i + 1} of 6"
                  bind:this={codeInputs[i]}
                  value={digit}
                  oninput={(e) => handleDigitInput(codeDigits, i, e, codeInputs, autoFocusConfirm)}
                  onkeydown={(e) => handleDigitKeydown(codeDigits, i, e, codeInputs)}
                  onpaste={(e) => handleDigitPaste(codeDigits, e, codeInputs, autoFocusConfirm)}
                  disabled={loading}
                  autocomplete="off"
                />
              {/each}
            </div>
          </div>

          <!-- Confirmation code entry -->
          <div class="code-section">
            <span class="code-label">Confirm gate code</span>
            {#if loading}
              <div class="loading-row">
                <div class="loading-spinner"></div>
              </div>
            {:else}
              <div class="digit-row">
                {#each confirmDigits as digit, i (i)}
                  <input
                    class="digit-input"
                    class:filled={digit !== ''}
                    type="tel"
                    inputmode="numeric"
                    pattern="[0-9]"
                    maxlength="1"
                    bind:this={confirmInputs[i]}
                    value={digit}
                    oninput={(e) =>
                      handleDigitInput(confirmDigits, i, e, confirmInputs, autoSubmitSetup)}
                    onkeydown={(e) => handleDigitKeydown(confirmDigits, i, e, confirmInputs)}
                    onpaste={(e) =>
                      handleDigitPaste(confirmDigits, e, confirmInputs, autoSubmitSetup)}
                    disabled={loading}
                    autocomplete="off"
                  />
                {/each}
              </div>
            {/if}
          </div>

          {#if error}
            <p class="error-message">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- ═══ Email Confirmation Modal (after setup) ═══ -->
{#if showConfirmationModal}
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div
    class="modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Email confirmation"
    onclick={() => {
      showConfirmationModal = false;
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape') showConfirmationModal = false;
    }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-primary)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
        </svg>
      </div>
      <h2>Check Your Email</h2>
      <p class="modal-text">
        We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
      </p>
      <p class="modal-hint">This page will update automatically once confirmed.</p>
      <button
        type="button"
        class="btn btn-primary submit-btn"
        onclick={handleResendEmail}
        disabled={resendCooldown > 0}
      >
        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
      </button>
    </div>
  </div>
{/if}

<!-- ═══ Device Verification Modal (after unlock on untrusted device) ═══ -->
{#if showDeviceVerificationModal}
  <div class="modal-overlay">
    <div class="modal-card card">
      <div class="modal-icon">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-primary)"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>
      <h2>New Device Detected</h2>
      <p class="modal-text">
        We sent a verification link to <strong>{maskedEmail}</strong>. Click it to trust this
        device.
      </p>
      <p class="modal-hint">This page will update automatically once verified.</p>
      <button
        type="button"
        class="btn btn-primary submit-btn"
        onclick={handleResendEmail}
        disabled={resendCooldown > 0}
      >
        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
      </button>
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN PAGE — Full-viewport centered layout
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-page {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: var(--color-bg);
    /* Extend behind safe areas on iOS */
    height: calc(100vh + env(safe-area-inset-top, 0px) + env(safe-area-inset-bottom, 0px));
    margin-top: calc(-1 * env(safe-area-inset-top, 0px));
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOGIN CARD — Central white card with letter-block styling
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-card {
    max-width: 420px;
    width: 100%;
    padding: 2.5rem;
    text-align: center;
    animation: cardEnter var(--duration-slow) var(--ease-out) both;
  }

  /* Disable hover lift on the login card — it's not interactive as a whole */
  .login-card:hover {
    transform: none;
    box-shadow: var(--shadow-sm);
    border-color: var(--color-border);
  }

  .login-card h1 {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    margin-bottom: 0.375rem;
    line-height: 1.3;
  }

  .subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LOADING STATE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .login-loading {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-row {
    display: flex;
    justify-content: center;
    padding: 1rem 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     AVATAR — User initial circle
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--gradient-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.375rem;
    font-weight: 700;
    font-family: var(--font-display);
    margin: 0 auto 1.25rem;
    box-shadow:
      var(--shadow-md),
      0 0 0 3px rgba(79, 70, 229, 0.15);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CARD ICON — SVG icon at top of card (offline, etc.)
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .card-icon {
    margin-bottom: 1.25rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DIGIT INPUT ROW — 6-digit PIN entry
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .digit-row {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    margin: 1.25rem 0;
  }

  .digit-input {
    width: 48px;
    height: 56px;
    text-align: center;
    font-size: 1.5rem;
    font-family: var(--font-mono);
    font-weight: 600;
    border: 2px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-bg);
    color: var(--color-text);
    padding: 0;
    box-shadow: var(--shadow-sm);
    transition:
      border-color var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out),
      background var(--duration-fast) var(--ease-out);
  }

  .digit-input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--glow-primary), var(--shadow-sm);
    background: var(--color-bg-elevated);
  }

  .digit-input.filled {
    border-color: var(--color-primary);
    background: var(--color-primary-subtle);
  }

  .digit-input.error {
    border-color: var(--color-red);
    box-shadow: 0 0 0 3px var(--color-red-glow);
  }

  .digit-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM FIELDS — Setup mode inputs
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .form-fields {
    text-align: left;
    margin-top: 0.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 0.375rem;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .form-group input {
    width: 100%;
  }

  .name-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     CODE SECTION — Gate code creation (step 2)
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .code-section {
    margin-bottom: 1.25rem;
  }

  .code-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    margin-bottom: 0.375rem;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    text-align: left;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     ERROR MESSAGE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .error-message {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    color: var(--color-red);
    font-size: 0.875rem;
    font-weight: 500;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    animation: fadeIn var(--duration-fast) var(--ease-out);
  }

  .error-message svg {
    flex-shrink: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SUBMIT BUTTON — Full-width primary action
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .submit-btn {
    width: 100%;
    margin-top: 0.75rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     LINK TEXT — Secondary action at bottom of card
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .link-text {
    margin-top: 1.25rem;
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     BACK LINK — Return to previous step
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    padding: 0.25rem 0;
    transition: color var(--duration-fast) var(--ease-out);
  }

  .back-link:hover {
    color: var(--color-primary);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     STEP INDICATOR — Setup wizard progress dots
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 1.5rem;
  }

  .step-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-border-strong);
    transition: background var(--duration-normal) var(--ease-out);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-dot.active {
    background: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-glow);
  }

  .step-dot.completed {
    background: var(--color-success);
    box-shadow: 0 0 0 3px var(--color-success-glow);
  }

  .step-dot.completed svg {
    color: white;
  }

  .step-line {
    width: 2rem;
    height: 2px;
    background: var(--color-border-strong);
    transition: background var(--duration-normal) var(--ease-out);
  }

  .step-line.active {
    background: var(--gradient-primary);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SHAKE ANIMATION — Error feedback
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .shake {
    animation: shake 0.5s var(--ease-out);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     MODAL OVERLAY — Email confirmation + device verification
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    animation: fadeIn var(--duration-fast) var(--ease-out);
  }

  .modal-card {
    max-width: 400px;
    width: 100%;
    padding: 2rem;
    text-align: center;
    animation: cardEnter var(--duration-normal) var(--ease-spring) both;
  }

  /* Disable hover lift on modals */
  .modal-card:hover {
    transform: none;
    box-shadow: var(--shadow-sm);
    border-color: var(--color-border);
  }

  .modal-icon {
    margin-bottom: 1rem;
  }

  .modal-card h2 {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    margin-bottom: 0.5rem;
  }

  .modal-text {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin-bottom: 0.5rem;
  }

  .modal-text strong {
    color: var(--color-text);
    font-weight: 600;
  }

  .modal-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-bottom: 1.25rem;
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     KEYFRAMES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @keyframes cardEnter {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
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

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    10% {
      transform: translateX(-6px);
    }
    30% {
      transform: translateX(5px);
    }
    50% {
      transform: translateX(-4px);
    }
    70% {
      transform: translateX(3px);
    }
    90% {
      transform: translateX(-2px);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE — Mobile adjustments
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 480px) {
    .login-card {
      padding: 1.75rem 1.25rem;
    }

    .login-card h1 {
      font-size: 1.25rem;
    }

    .digit-input {
      width: 42px;
      height: 50px;
      font-size: 1.25rem;
    }

    .digit-row {
      gap: 0.375rem;
    }

    .name-row {
      grid-template-columns: 1fr;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DARK MODE — Override for prefers-color-scheme: dark
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-color-scheme: dark) {
    .digit-input {
      background: var(--color-bg-secondary);
      border-color: var(--color-border-strong);
    }

    .digit-input.filled {
      background: rgba(79, 70, 229, 0.15);
    }

    .modal-overlay {
      background: rgba(0, 0, 0, 0.6);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION — Respect user preference
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .login-card,
    .modal-card {
      animation: none;
    }

    .loading-spinner {
      animation: spin 1.5s linear infinite;
    }

    .shake {
      animation: none;
    }
  }
</style>
