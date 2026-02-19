<!--
  @fileoverview Profile & settings page.

  Capabilities:
    - View / edit display name and avatar
    - Change email address (with re-verification)
    - Change unlock gate type (PIN length, pattern, etc.)
    - Manage trusted devices (view, revoke)
    - Toggle debug mode
    - Reset local database (destructive — requires confirmation)
-->
<script lang="ts">
  // =============================================================================
  //                               IMPORTS
  // =============================================================================

  import { goto } from '$app/navigation';
  import {
    changeSingleUserGate,
    updateSingleUserProfile,
    getSingleUserInfo,
    changeSingleUserEmail,
    completeSingleUserEmailChange,
    resolveUserId,
    resolveAvatarInitial
  } from 'stellar-drive/auth';
  import { authState } from 'stellar-drive/stores';
  import { isDebugMode, setDebugMode, getDiagnostics, debug } from 'stellar-drive/utils';
  import {
    resetDatabase,
    getTrustedDevices,
    removeTrustedDevice,
    getCurrentDeviceId,
    isDemoMode
  } from 'stellar-drive';
  import type { TrustedDevice, DiagnosticsSnapshot } from 'stellar-drive';
  import { getDemoConfig } from 'stellar-drive';
  import { onMount, onDestroy } from 'svelte';

  /** Whether the app is in demo mode — shows a simplified read-only profile. */
  const inDemoMode = $derived(isDemoMode());

  // =============================================================================
  //                         COMPONENT STATE
  // =============================================================================

  /* ── Profile form fields ──── */
  let firstName = $state('');
  let lastName = $state('');

  /* ── Gate (6-digit code) change — digit-array approach ──── */
  let oldCodeDigits = $state(['', '', '', '', '', '']);
  let newCodeDigits = $state(['', '', '', '', '', '']);
  let confirmCodeDigits = $state(['', '', '', '', '', '']);

  /** Concatenated old code string → derived from individual digit inputs */
  const oldCode = $derived(oldCodeDigits.join(''));
  /** Concatenated new code string → derived from individual digit inputs */
  const newCode = $derived(newCodeDigits.join(''));
  /** Concatenated confirm code string — must match `newCode` */
  const confirmNewCode = $derived(confirmCodeDigits.join(''));

  /* ── Input element refs for auto-focus advancement ──── */
  let oldCodeInputs: HTMLInputElement[] = $state([]);
  let newCodeInputs: HTMLInputElement[] = $state([]);
  let confirmCodeInputs: HTMLInputElement[] = $state([]);

  /* ── Email change fields ──── */
  let currentEmail = $state('');
  let newEmail = $state('');
  let emailLoading = $state(false);
  let emailError = $state<string | null>(null);
  let emailSuccess = $state<string | null>(null);
  /** Whether the email confirmation modal overlay is visible */
  let showEmailConfirmationModal = $state(false);
  /** Seconds remaining before the user can re-send the confirmation email */
  let emailResendCooldown = $state(0);

  /* ── General UI / feedback state ──── */
  let profileLoading = $state(false);
  let codeLoading = $state(false);
  let profileError = $state<string | null>(null);
  let profileSuccess = $state<string | null>(null);
  let codeError = $state<string | null>(null);
  let codeSuccess = $state<string | null>(null);
  let debugMode = $state(isDebugMode());
  let resetting = $state(false);

  /* ── Debug tools loading flags ──── */
  let forceSyncing = $state(false);
  let triggeringSyncManual = $state(false);
  let resettingCursor = $state(false);

  let viewingTombstones = $state(false);
  let cleaningTombstones = $state(false);

  /* ── Demo mode toast ──── */
  let demoToast = $state('');
  let demoToastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Show a temporary toast for blocked demo operations. */
  function showDemoToast(msg: string) {
    demoToast = msg;
    if (demoToastTimer) clearTimeout(demoToastTimer);
    demoToastTimer = setTimeout(() => (demoToast = ''), 3000);
  }

  /* ── Diagnostics ──── */
  let diagnostics = $state<DiagnosticsSnapshot | null>(null);
  let diagnosticsLoading = $state(true);
  let diagnosticsInterval: ReturnType<typeof setInterval> | null = null;

  /* ── Trusted devices ──── */
  let trustedDevices = $state<TrustedDevice[]>([]);
  let currentDeviceId = $state('');
  let devicesLoading = $state(true);
  /** ID of the device currently being removed — shows spinner on that row */
  let removingDeviceId = $state<string | null>(null);

  // =============================================================================
  //                           LIFECYCLE
  // =============================================================================

  /** Populate form fields from the engine and load trusted devices on mount. */
  onMount(async () => {
    /* In demo mode, populate from mock profile instead of real data */
    if (inDemoMode) {
      const demoConfig = getDemoConfig();
      if (demoConfig) {
        firstName = demoConfig.mockProfile.firstName;
        lastName = demoConfig.mockProfile.lastName;
        currentEmail = demoConfig.mockProfile.email;
      }

      // Mock trusted devices — show realistic but non-functional device list
      currentDeviceId = 'demo-device';
      trustedDevices = [
        {
          id: 'demo-td-1',
          userId: 'demo-user',
          deviceId: 'demo-device',
          deviceLabel: 'Chrome on macOS',
          trustedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
          lastUsedAt: new Date().toISOString()
        },
        {
          id: 'demo-td-2',
          userId: 'demo-user',
          deviceId: 'demo-device-2',
          deviceLabel: 'Safari on iPhone',
          trustedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
          lastUsedAt: new Date(Date.now() - 2 * 86400000).toISOString()
        }
      ] as TrustedDevice[];

      // Mock diagnostics — reflect disconnected/unsynced state
      diagnostics = {
        timestamp: new Date().toISOString(),
        prefix: 'infinite',
        deviceId: 'demo-device',
        sync: {
          status: 'idle' as const,
          totalCycles: 0,
          lastSyncTime: null,
          lastSuccessfulSyncTimestamp: null,
          syncMessage: null,
          recentCycles: [],
          cyclesLastMinute: 0,
          hasHydrated: false,
          schemaValidated: false,
          pendingCount: 0
        },
        egress: {
          sessionStart: new Date().toISOString(),
          totalBytes: 0,
          totalFormatted: '0 B',
          totalRecords: 0,
          byTable: {}
        },
        queue: {
          pendingOperations: 0,
          pendingEntityIds: [],
          byTable: {},
          byOperationType: {},
          oldestPendingTimestamp: null,
          itemsInBackoff: 0
        },
        realtime: {
          connectionState: 'disconnected' as const,
          healthy: false,
          reconnectAttempts: 0,
          lastError: null,
          userId: null,
          deviceId: 'demo-device',
          recentlyProcessedCount: 0,
          operationInProgress: false,
          reconnectScheduled: false
        },
        network: {
          online: true
        },
        engine: {
          isTabVisible: true,
          tabHiddenAt: null,
          lockHeld: false,
          lockHeldForMs: null,
          recentlyModifiedCount: 0,
          wasOffline: false,
          authValidatedAfterReconnect: false
        },
        conflicts: {
          recentHistory: [],
          totalCount: 0
        },
        errors: {
          lastError: null,
          lastErrorDetails: null,
          recentErrors: []
        },
        crdt: {
          enabled: false,
          config: null,
          activeDocuments: [],
          activeDocumentCount: 0,
          offline: {
            documentCount: 0,
            maxDocuments: 0,
            totalSizeBytes: 0,
            totalSizeFormatted: '0 B',
            documents: []
          },
          pendingUpdates: [],
          totalPendingUpdates: 0
        },
        config: {
          tableCount: 0,
          tableNames: [],
          syncDebounceMs: 500,
          syncIntervalMs: 30000,
          tombstoneMaxAgeDays: 30
        }
      } as DiagnosticsSnapshot;

      diagnosticsLoading = false;
      devicesLoading = false;
      return;
    }

    const info = await getSingleUserInfo();
    if (info) {
      firstName = (info.profile.firstName as string) || '';
      lastName = (info.profile.lastName as string) || '';
      currentEmail = info.email || '';
    }

    // Load trusted devices
    currentDeviceId = getCurrentDeviceId();
    try {
      const userId = resolveUserId($authState?.session, $authState?.offlineProfile);
      if (userId) {
        trustedDevices = await getTrustedDevices(userId);
      }
    } catch {
      // Ignore errors loading devices
    }
    devicesLoading = false;

    // Start diagnostics polling
    pollDiagnostics();
    diagnosticsInterval = setInterval(pollDiagnostics, 3000);
  });

  onDestroy(() => {
    if (diagnosticsInterval) {
      clearInterval(diagnosticsInterval);
      diagnosticsInterval = null;
    }
  });

  /** Poll diagnostics and update state. */
  async function pollDiagnostics() {
    try {
      diagnostics = await getDiagnostics();
    } catch {
      // Ignore polling errors — stale data is fine
    }
    diagnosticsLoading = false;
  }

  // =============================================================================
  //                     DIGIT INPUT HELPERS
  // =============================================================================

  /**
   * Handle single-digit input in a code field.
   * Auto-advances focus to the next input when a digit is entered.
   * @param digits  - Reactive digit array to mutate
   * @param index   - Position in the 6-digit code (0–5)
   * @param event   - Native input event
   * @param inputs  - Array of `<input>` refs for focus management
   */
  function handleDigitInput(
    digits: string[],
    index: number,
    event: Event,
    inputs: HTMLInputElement[]
  ) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/[^0-9]/g, '');
    if (value.length > 0) {
      digits[index] = value.charAt(value.length - 1);
      input.value = digits[index];
      if (index < 5 && inputs[index + 1]) {
        inputs[index + 1].focus();
      }
    } else {
      digits[index] = '';
    }
  }

  /**
   * Handle Backspace in a digit field — moves focus backward when the current
   * digit is already empty.
   * @param digits  - Reactive digit array to mutate
   * @param index   - Position in the 6-digit code (0–5)
   * @param event   - Native keyboard event
   * @param inputs  - Array of `<input>` refs for focus management
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
   * Handle paste into a digit field — distributes pasted digits across all 6 inputs.
   * @param digits  - Reactive digit array to mutate
   * @param event   - Native clipboard event
   * @param inputs  - Array of `<input>` refs for focus management
   */
  function handleDigitPaste(digits: string[], event: ClipboardEvent, inputs: HTMLInputElement[]) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') || '').replace(/[^0-9]/g, '');
    for (let i = 0; i < 6 && i < pasted.length; i++) {
      digits[i] = pasted[i];
      if (inputs[i]) inputs[i].value = pasted[i];
    }
    const focusIndex = Math.min(pasted.length, 5);
    if (inputs[focusIndex]) inputs[focusIndex].focus();
  }

  // =============================================================================
  //                      FORM SUBMISSION HANDLERS
  // =============================================================================

  /**
   * Submit profile name changes to the engine and update the auth store
   * so the navbar reflects changes immediately.
   * @param e - Form submit event
   */
  async function handleProfileSubmit(e: Event) {
    e.preventDefault();
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    profileLoading = true;
    profileError = null;
    profileSuccess = null;

    try {
      debug('log', '[Profile] Saving profile:', firstName.trim(), lastName.trim());
      const result = await updateSingleUserProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim()
      });
      if (result.error) {
        profileError = result.error;
      } else {
        // Update auth state to immediately reflect changes in navbar
        authState.updateUserProfile({ first_name: firstName.trim(), last_name: lastName.trim() });
        profileSuccess = 'Profile updated successfully';
        setTimeout(() => (profileSuccess = null), 3000);
      }
    } catch (err: unknown) {
      profileError = err instanceof Error ? err.message : 'Failed to update profile';
    }

    profileLoading = false;
  }

  /**
   * Validate and submit a 6-digit gate code change.
   * Resets all digit arrays on success.
   * @param e - Form submit event
   */
  async function handleCodeSubmit(e: Event) {
    e.preventDefault();
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }

    if (oldCode.length !== 6) {
      codeError = 'Please enter your current 6-digit code';
      return;
    }

    if (newCode.length !== 6) {
      codeError = 'Please enter a new 6-digit code';
      return;
    }

    if (newCode !== confirmNewCode) {
      codeError = 'New codes do not match';
      return;
    }

    codeLoading = true;
    codeError = null;
    codeSuccess = null;

    try {
      const result = await changeSingleUserGate(oldCode, newCode);
      if (result.error) {
        codeError = result.error;
      } else {
        codeSuccess = 'Code changed successfully';
        oldCodeDigits = ['', '', '', '', '', ''];
        newCodeDigits = ['', '', '', '', '', ''];
        confirmCodeDigits = ['', '', '', '', '', ''];
        setTimeout(() => (codeSuccess = null), 3000);
      }
    } catch (err: unknown) {
      codeError = err instanceof Error ? err.message : 'Failed to change code';
    }

    codeLoading = false;
  }

  // =============================================================================
  //                      EMAIL CHANGE FLOW
  // =============================================================================

  /**
   * Initiate an email change — sends a confirmation link to the new address.
   * Opens the confirmation modal and starts listening for the cross-tab
   * `BroadcastChannel` auth event.
   * @param e - Form submit event
   */
  async function handleEmailSubmit(e: Event) {
    e.preventDefault();
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    emailError = null;
    emailSuccess = null;

    if (!newEmail.trim()) {
      emailError = 'Please enter a new email address';
      return;
    }

    if (newEmail.trim() === currentEmail) {
      emailError = 'New email is the same as your current email';
      return;
    }

    emailLoading = true;

    try {
      const result = await changeSingleUserEmail(newEmail.trim());
      if (result.error) {
        emailError = result.error;
      } else if (result.confirmationRequired) {
        showEmailConfirmationModal = true;
        startResendCooldown();
        listenForEmailConfirmation();
      }
    } catch (err: unknown) {
      emailError = err instanceof Error ? err.message : 'Failed to change email';
    }

    emailLoading = false;
  }

  /** Start a 30-second countdown preventing repeated confirmation emails. */
  function startResendCooldown() {
    emailResendCooldown = 30;
    const interval = setInterval(() => {
      emailResendCooldown--;
      if (emailResendCooldown <= 0) clearInterval(interval);
    }, 1000);
  }

  /** Re-send the email change confirmation (guarded by cooldown). */
  async function handleResendEmailChange() {
    if (emailResendCooldown > 0) return;
    try {
      await changeSingleUserEmail(newEmail.trim());
      startResendCooldown();
    } catch {
      // Ignore resend errors
    }
  }

  /**
   * Listen on a `BroadcastChannel` for the confirmation tab to signal
   * that the user clicked the email-change link. Once received, complete
   * the email change server-side and update local state.
   */
  function listenForEmailConfirmation() {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('infinite-auth-channel');
    channel.onmessage = async (event) => {
      if (
        event.data?.type === 'AUTH_CONFIRMED' &&
        event.data?.verificationType === 'email_change'
      ) {
        // Bring this tab to the foreground before the confirm tab closes
        window.focus();
        const result = await completeSingleUserEmailChange();
        if (!result.error && result.newEmail) {
          currentEmail = result.newEmail;
          emailSuccess = 'Email changed successfully';
          newEmail = '';
          setTimeout(() => (emailSuccess = null), 5000);
        } else {
          emailError = result.error || 'Failed to complete email change';
        }
        showEmailConfirmationModal = false;
        channel.close();
      }
    };
  }

  /** Close the email confirmation modal without completing the change. */
  function dismissEmailModal() {
    showEmailConfirmationModal = false;
  }

  // =============================================================================
  //                     ADMINISTRATION HANDLERS
  // =============================================================================

  /** Toggle debug mode on/off — requires a page refresh to take full effect. */
  function toggleDebugMode() {
    debugMode = !debugMode;
    setDebugMode(debugMode);
    debug('log', '[Profile] Debug mode toggled:', debugMode);
  }

  /** Navigate back to the main tasks view. */
  function goBack() {
    goto('/');
  }

  /**
   * Delete and recreate the local IndexedDB, then reload the page.
   * Session is preserved in localStorage so the app will re-hydrate.
   */
  async function handleResetDatabase() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    if (
      !confirm(
        'This will delete all local data and reload. Your data will be re-synced from the server. Continue?'
      )
    ) {
      return;
    }
    resetting = true;
    try {
      await resetDatabase();
      // Reload the page — session is preserved in localStorage, so the app
      // will re-create the DB, fetch config from Supabase, and re-hydrate.
      window.location.reload();
    } catch (err) {
      alert('Reset failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      resetting = false;
    }
  }

  /**
   * Remove a trusted device by ID and update the local list.
   * @param id - Database ID of the trusted device row
   */
  async function handleRemoveDevice(id: string) {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    removingDeviceId = id;
    try {
      await removeTrustedDevice(id);
      trustedDevices = trustedDevices.filter((d) => d.id !== id);
    } catch {
      // Ignore errors
    }
    removingDeviceId = null;
  }

  // =============================================================================
  //                     DEBUG TOOL HANDLERS
  // =============================================================================

  /**
   * Cast `window` to an untyped record for accessing runtime-injected
   * debug helpers (e.g., `__infiniteSync`, `__infiniteDiagnostics`).
   * @returns The global `window` as a loose `Record`
   */
  function getDebugWindow(): Record<string, unknown> {
    return window as unknown as Record<string, unknown>;
  }

  /** Resets the sync cursor and re-downloads all data from Supabase. */
  async function handleForceFullSync() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    if (
      !confirm(
        'This will reset the sync cursor and re-download all data from the server. Continue?'
      )
    )
      return;
    forceSyncing = true;
    try {
      const fn = getDebugWindow().__infiniteSync as
        | { forceFullSync: () => Promise<void> }
        | undefined;
      if (fn?.forceFullSync) {
        await fn.forceFullSync();
        alert('Force full sync complete.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Force full sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    forceSyncing = false;
  }

  /** Manually trigger a single push/pull sync cycle. */
  async function handleTriggerSync() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    triggeringSyncManual = true;
    try {
      const fn = getDebugWindow().__infiniteSync as { sync: () => Promise<void> } | undefined;
      if (fn?.sync) {
        await fn.sync();
        alert('Sync cycle complete.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Sync failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    triggeringSyncManual = false;
  }

  /** Reset the sync cursor so the next cycle pulls all remote data. */
  async function handleResetSyncCursor() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    resettingCursor = true;
    try {
      const fn = getDebugWindow().__infiniteSync as
        | { resetSyncCursor: () => Promise<void> }
        | undefined;
      if (fn?.resetSyncCursor) {
        await fn.resetSyncCursor();
        alert('Sync cursor reset. The next sync will pull all data.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Reset cursor failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    resettingCursor = false;
  }

  /** Log soft-deleted record counts per table to the browser console. */
  async function handleViewTombstones() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    viewingTombstones = true;
    try {
      const fn = getDebugWindow().__infiniteTombstones as
        | ((opts?: { cleanup?: boolean; force?: boolean }) => Promise<void>)
        | undefined;
      if (fn) {
        await fn();
        alert('Tombstone details logged to console. Open DevTools to view.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('View tombstones failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    viewingTombstones = false;
  }

  /** Permanently remove old soft-deleted records from local + remote DBs. */
  async function handleCleanupTombstones() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    if (
      !confirm(
        'This will permanently remove old soft-deleted records from local and server databases. Continue?'
      )
    )
      return;
    cleaningTombstones = true;
    try {
      const fn = getDebugWindow().__infiniteTombstones as
        | ((opts?: { cleanup?: boolean; force?: boolean }) => Promise<void>)
        | undefined;
      if (fn) {
        await fn({ cleanup: true });
        alert('Tombstone cleanup complete. Details logged to console.');
      } else {
        alert('Debug mode must be enabled and the page refreshed to use this tool.');
      }
    } catch (err) {
      alert('Tombstone cleanup failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    cleaningTombstones = false;
  }

  /** Dispatch a custom event that the app shell listens for to sign out on mobile. */
  function handleMobileSignOut() {
    if (inDemoMode) {
      showDemoToast('Not available in demo mode');
      return;
    }
    window.dispatchEvent(new CustomEvent('infinite:signout'));
  }

  // =============================================================================
  //                    DIAGNOSTICS HELPERS
  // =============================================================================

  function formatSyncStatus(status: string): string {
    switch (status) {
      case 'idle':
        return 'Idle';
      case 'syncing':
        return 'Syncing';
      case 'error':
        return 'Error';
      case 'offline':
        return 'Offline';
      default:
        return status;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'idle':
        return 'green';
      case 'syncing':
        return 'blue';
      case 'error':
        return 'red';
      case 'offline':
        return 'yellow';
      default:
        return 'gray';
    }
  }

  function formatTimestamp(iso: string | null): string {
    if (!iso) return '-';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 1000) return 'just now';
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }

  function formatDuration(ms: number | null | undefined): string {
    if (ms == null) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

<svelte:head>
  <title>Profile - Infinite Notes</title>
</svelte:head>

<div class="profile-page">
  <!-- Header (no card) -->
  <header class="profile-hero section-reveal" style="animation-delay: 0ms">
    <div class="avatar-ring">
      <div class="avatar-disc">
        {resolveAvatarInitial($authState?.session, $authState?.offlineProfile)}
      </div>
    </div>
    <h1 class="profile-name">{firstName} {lastName}</h1>
    <p class="profile-email">{currentEmail || 'No email set'}</p>
  </header>

  <!-- Section: Profile -->
  <div class="section-reveal" style="animation-delay: 50ms">
    <p class="section-label">Profile</p>
    <div class="card">
      <form onsubmit={handleProfileSubmit}>
        <div class="field-row">
          <div class="field">
            <label class="field-label" for="firstName">First name</label>
            <input
              class="field-input"
              type="text"
              id="firstName"
              bind:value={firstName}
              disabled={profileLoading}
              placeholder="First name"
            />
          </div>
          <div class="field">
            <label class="field-label" for="lastName">Last name</label>
            <input
              class="field-input"
              type="text"
              id="lastName"
              bind:value={lastName}
              disabled={profileLoading}
              placeholder="Last name"
            />
          </div>
        </div>

        {#if profileError}
          <p class="msg-error">{profileError}</p>
        {/if}

        {#if profileSuccess}
          <p class="msg-success">{profileSuccess}</p>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={profileLoading}>
          {profileLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  </div>

  <!-- Section: Email -->
  <div class="section-reveal" style="animation-delay: 100ms">
    <p class="section-label">Email</p>
    <div class="card">
      {#if currentEmail}
        <p class="current-email">Current: <span class="current-email-addr">{currentEmail}</span></p>
      {/if}

      <form onsubmit={handleEmailSubmit}>
        <div class="field">
          <label class="field-label" for="newEmail">New email address</label>
          <input
            class="field-input"
            type="email"
            id="newEmail"
            bind:value={newEmail}
            disabled={emailLoading}
            placeholder="new@email.com"
          />
        </div>

        {#if emailError}
          <p class="msg-error">{emailError}</p>
        {/if}

        {#if emailSuccess}
          <p class="msg-success">{emailSuccess}</p>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={emailLoading || !newEmail}>
          {emailLoading ? 'Sending...' : 'Update Email'}
        </button>
      </form>
    </div>
  </div>

  <!-- Email Confirmation Modal -->
  {#if showEmailConfirmationModal}
    <div class="modal-backdrop" role="dialog" aria-modal="true">
      <div class="modal-pane">
        <div class="modal-icon">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h2 class="modal-heading">Check your email</h2>
        <p class="modal-body">
          We sent a confirmation link to <strong>{newEmail}</strong>. Click the link to confirm your
          new email address.
        </p>

        <button
          class="btn btn-secondary modal-primary"
          disabled={emailResendCooldown > 0}
          onclick={handleResendEmailChange}
        >
          {#if emailResendCooldown > 0}
            Resend in {emailResendCooldown}s
          {:else}
            Resend confirmation email
          {/if}
        </button>

        <button class="btn btn-ghost modal-dismiss" onclick={dismissEmailModal}>Cancel</button>
      </div>
    </div>
  {/if}

  <!-- Section: Gate Code -->
  <div class="section-reveal" style="animation-delay: 150ms">
    <p class="section-label">Gate Code</p>
    <div class="card">
      <p class="hint">Enter your current code and choose a new one.</p>

      <form onsubmit={handleCodeSubmit}>
        <div class="field">
          <label class="field-label" for="oldCode0">Current gate code</label>
          <div class="digit-row">
            {#each oldCodeDigits as digit, i (i)}
              <input
                class="digit-box"
                type="tel"
                inputmode="numeric"
                pattern="[0-9]"
                maxlength="1"
                id={`oldCode${i}`}
                bind:this={oldCodeInputs[i]}
                value={digit}
                oninput={(e) => handleDigitInput(oldCodeDigits, i, e, oldCodeInputs)}
                onkeydown={(e) => handleDigitKeydown(oldCodeDigits, i, e, oldCodeInputs)}
                onpaste={(e) => handleDigitPaste(oldCodeDigits, e, oldCodeInputs)}
                disabled={codeLoading}
                autocomplete="off"
              />
            {/each}
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="newCode0">New gate code</label>
          <div class="digit-row">
            {#each newCodeDigits as digit, i (i)}
              <input
                class="digit-box"
                type="tel"
                inputmode="numeric"
                pattern="[0-9]"
                maxlength="1"
                id={`newCode${i}`}
                bind:this={newCodeInputs[i]}
                value={digit}
                oninput={(e) => handleDigitInput(newCodeDigits, i, e, newCodeInputs)}
                onkeydown={(e) => handleDigitKeydown(newCodeDigits, i, e, newCodeInputs)}
                onpaste={(e) => handleDigitPaste(newCodeDigits, e, newCodeInputs)}
                disabled={codeLoading}
                autocomplete="off"
              />
            {/each}
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="confirmCode0">Confirm new gate code</label>
          <div class="digit-row">
            {#each confirmCodeDigits as digit, i (i)}
              <input
                class="digit-box"
                type="tel"
                inputmode="numeric"
                pattern="[0-9]"
                maxlength="1"
                id={`confirmCode${i}`}
                bind:this={confirmCodeInputs[i]}
                value={digit}
                oninput={(e) => handleDigitInput(confirmCodeDigits, i, e, confirmCodeInputs)}
                onkeydown={(e) => handleDigitKeydown(confirmCodeDigits, i, e, confirmCodeInputs)}
                onpaste={(e) => handleDigitPaste(confirmCodeDigits, e, confirmCodeInputs)}
                disabled={codeLoading}
                autocomplete="off"
              />
            {/each}
          </div>
        </div>

        {#if codeError}
          <p class="msg-error">{codeError}</p>
        {/if}

        {#if codeSuccess}
          <p class="msg-success">{codeSuccess}</p>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={codeLoading}>
          {codeLoading ? 'Updating...' : 'Update Gate Code'}
        </button>
      </form>
    </div>
  </div>

  <!-- Section: Trusted Devices -->
  <div class="section-reveal" style="animation-delay: 200ms">
    <p class="section-label">Trusted Devices</p>
    <div class="card">
      {#if devicesLoading}
        <p class="hint">Loading devices...</p>
      {:else if trustedDevices.length === 0}
        <p class="empty-msg">No trusted devices registered.</p>
      {:else}
        {#each trustedDevices as device (device.id)}
          <div class="device-row" class:device-row--current={device.deviceId === currentDeviceId}>
            <div class="device-meta">
              <span class="device-label">
                {device.deviceLabel || 'Unknown Device'}
              </span>
              {#if device.deviceId === currentDeviceId}
                <span class="device-badge">This Device</span>
              {/if}
              <span class="device-date"
                >Last used {new Date(device.lastUsedAt).toLocaleDateString()}</span
              >
            </div>
            {#if device.deviceId !== currentDeviceId}
              <button
                class="btn btn-danger btn-sm"
                onclick={() => handleRemoveDevice(device.id)}
                disabled={removingDeviceId === device.id}
              >
                {removingDeviceId === device.id ? 'Removing...' : 'Remove'}
              </button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Section: Settings -->
  <div class="section-reveal" style="animation-delay: 250ms">
    <p class="section-label">Settings</p>
    <div class="card">
      <div class="setting-item">
        <div>
          <strong>Debug Mode</strong>
          <p class="hint">Show debug tools below (refresh needed for full effect)</p>
        </div>
        <button
          class="toggle"
          class:on={debugMode}
          onclick={toggleDebugMode}
          role="switch"
          aria-checked={debugMode}
          aria-label="Toggle debug mode"
        >
          <span class="toggle-pip"></span>
        </button>
      </div>

      <div class="setting-item">
        <div>
          <strong>Sign Out</strong>
          <p class="hint">Lock your notes and return to login.</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick={handleMobileSignOut}>Sign Out</button>
      </div>
    </div>
  </div>

  <!-- Section: Danger Zone -->
  <div class="section-reveal" style="animation-delay: 300ms">
    <p class="section-label section-label--danger">Danger Zone</p>
    <div class="card card--danger">
      <div class="setting-item danger">
        <div>
          <strong>Reset Database</strong>
          <p class="hint">Delete all local data. This cannot be undone.</p>
        </div>
        <button class="btn btn-danger btn-sm" onclick={handleResetDatabase} disabled={resetting}>
          {resetting ? 'Resetting...' : 'Reset'}
        </button>
      </div>
    </div>
  </div>

  <!-- Section: Diagnostics -->
  <div class="section-reveal" style="animation-delay: 350ms">
    <p class="section-label">Diagnostics</p>
    <div class="card diag-panel">
      {#if diagnosticsLoading}
        <p class="hint">Loading diagnostics...</p>
      {:else if diagnostics}
        <!-- 1. Status Banner -->
        <div class="diag-banner">
          <span class="diag-dot diag-dot--{getStatusColor(diagnostics.sync.status)}"></span>
          <div>
            <span class="diag-label">{formatSyncStatus(diagnostics.sync.status)}</span>
            <div class="diag-sub">
              {diagnostics.network.online ? 'Online' : 'Offline'} &middot; {diagnostics.deviceId.slice(
                0,
                8
              )}
            </div>
          </div>
        </div>

        <!-- 2. Sync Engine -->
        <div class="diag-heading">Sync Engine</div>
        <div class="diag-grid-4">
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.sync.totalCycles}</span>
            <span class="diag-key">Total Cycles</span>
          </div>
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.sync.cyclesLastMinute}</span>
            <span class="diag-key">Last Minute</span>
          </div>
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.sync.pendingCount}</span>
            <span class="diag-key">Pending Ops</span>
          </div>
          <div class="diag-stat">
            <span class="diag-val">{formatTimestamp(diagnostics.sync.lastSyncTime)}</span>
            <span class="diag-key">Last Sync</span>
          </div>
        </div>
        <div class="diag-pills">
          <span class="diag-pill diag-pill--{diagnostics.sync.hasHydrated ? 'ok' : 'warn'}">
            {diagnostics.sync.hasHydrated ? 'Hydrated' : 'Not Hydrated'}
          </span>
          <span class="diag-pill diag-pill--{diagnostics.sync.schemaValidated ? 'ok' : 'warn'}">
            {diagnostics.sync.schemaValidated ? 'Schema OK' : 'Schema Pending'}
          </span>
        </div>

        <!-- 3. Realtime -->
        <div class="diag-heading">Realtime</div>
        <div class="diag-kv">
          <span class="diag-kv-label">Connection</span>
          <span class="diag-kv-value">
            <span
              class="diag-inline-dot diag-inline-dot--{diagnostics.realtime.connectionState ===
              'connected'
                ? 'green'
                : diagnostics.realtime.connectionState === 'connecting'
                  ? 'yellow'
                  : 'red'}"
            ></span>
            {diagnostics.realtime.connectionState}
          </span>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Healthy</span>
          <span class="diag-kv-value">{diagnostics.realtime.healthy ? 'Yes' : 'No'}</span>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Reconnects</span>
          <span class="diag-kv-value">{diagnostics.realtime.reconnectAttempts}</span>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Events Processed</span>
          <span class="diag-kv-value">{diagnostics.realtime.recentlyProcessedCount}</span>
        </div>

        <!-- 4. Data Transfer -->
        <div class="diag-heading">Data Transfer</div>
        <div class="diag-grid-2">
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.egress.totalFormatted}</span>
            <span class="diag-key">Total Egress</span>
          </div>
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.egress.totalRecords.toLocaleString()}</span>
            <span class="diag-key">Records</span>
          </div>
        </div>
        {#if Object.keys(diagnostics.egress.byTable).length > 0}
          <div class="diag-bars">
            {#each Object.entries(diagnostics.egress.byTable) as [table, data] (table)}
              <div class="diag-bar-row">
                <div class="diag-bar-head">
                  <span class="diag-bar-name">{table}</span>
                  <span class="diag-bar-pct">{data.percentage}</span>
                </div>
                <div class="diag-bar-track">
                  <div class="diag-bar-fill" style="width: {data.percentage}"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- 5. Sync Queue -->
        <div class="diag-heading">Sync Queue</div>
        <div class="diag-grid-2">
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.queue.pendingOperations}</span>
            <span class="diag-key">Pending</span>
          </div>
          <div class="diag-stat">
            <span class="diag-val">{diagnostics.queue.itemsInBackoff}</span>
            <span class="diag-key">In Backoff</span>
          </div>
        </div>
        {#if diagnostics.queue.oldestPendingTimestamp}
          <div class="diag-kv">
            <span class="diag-kv-label">Oldest Pending</span>
            <span class="diag-kv-value"
              >{formatTimestamp(diagnostics.queue.oldestPendingTimestamp)}</span
            >
          </div>
        {/if}

        <!-- 6. Engine -->
        <div class="diag-heading">Engine</div>
        <div class="diag-kv">
          <span class="diag-kv-label">Tab Visible</span>
          <span class="diag-kv-value">{diagnostics.engine.isTabVisible ? 'Yes' : 'No'}</span>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Lock Held</span>
          <span class="diag-kv-value">
            {diagnostics.engine.lockHeld ? 'Yes' : 'No'}
            {#if diagnostics.engine.lockHeld && diagnostics.engine.lockHeldForMs}
              <span class="diag-lock-dur">({formatDuration(diagnostics.engine.lockHeldForMs)})</span
              >
            {/if}
          </span>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Recently Modified</span>
          <span class="diag-kv-value">{diagnostics.engine.recentlyModifiedCount}</span>
        </div>

        <!-- 7. Recent Cycles -->
        {#if diagnostics.sync.recentCycles.length > 0}
          <div class="diag-heading">Recent Cycles</div>
          <div class="diag-cycles">
            {#each diagnostics.sync.recentCycles.slice(0, 5) as cycle (cycle.timestamp)}
              <div class="diag-cycle">
                <div class="diag-cycle-head">
                  <span class="diag-cycle-trigger">{cycle.trigger}</span>
                  <span class="diag-cycle-time">{formatTimestamp(cycle.timestamp)}</span>
                </div>
                <div class="diag-cycle-stats">
                  <span>{cycle.pushedItems} pushed</span>
                  <span>{cycle.pulledRecords} pulled</span>
                  <span>{formatDuration(cycle.durationMs)}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- 8. Conflicts -->
        {#if diagnostics.conflicts.totalCount > 0}
          <div class="diag-heading">Conflicts</div>
          <div class="diag-kv">
            <span class="diag-kv-label">Total</span>
            <span class="diag-kv-value">{diagnostics.conflicts.totalCount}</span>
          </div>
        {/if}

        <!-- 9. Errors -->
        {#if diagnostics.errors.lastError || diagnostics.errors.recentErrors.length > 0}
          <div class="diag-heading">Errors</div>
          {#if diagnostics.errors.lastError}
            <div class="diag-err-box">
              {diagnostics.errors.lastError}
            </div>
          {/if}
          {#each diagnostics.errors.recentErrors.slice(0, 3) as err (err.entityId)}
            <div class="diag-err-item">
              <span class="diag-err-table">{err.table}.{err.operation}</span>
              <span class="diag-err-msg">{err.message}</span>
            </div>
          {/each}
        {/if}

        <!-- 10. Configuration -->
        <div class="diag-heading">Configuration</div>
        <div class="diag-tables-block">
          <div class="diag-tables-head">
            <span class="diag-kv-label">Tables</span>
            <span class="diag-kv-value">{diagnostics.config.tableCount}</span>
          </div>
          <div class="diag-tags">
            {#each diagnostics.config.tableNames as name (name)}
              <span class="diag-tag">{name}</span>
            {/each}
          </div>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Sync Interval</span>
          <span class="diag-kv-value">{formatDuration(diagnostics.config.syncIntervalMs)}</span>
        </div>
        <div class="diag-kv">
          <span class="diag-kv-label">Debounce</span>
          <span class="diag-kv-value">{formatDuration(diagnostics.config.syncDebounceMs)}</span>
        </div>

        <!-- 11. Footer -->
        <div class="diag-foot">
          <span class="diag-tick"></span>
          Updated {formatTimestamp(diagnostics.timestamp)}
        </div>
      {/if}
    </div>
  </div>

  <!-- Section: Debug Tools (conditional) -->
  {#if debugMode}
    <div class="section-reveal" style="animation-delay: 400ms">
      <p class="section-label section-label--debug">Debug Tools</p>
      <div class="card card--debug">
        <div class="debug-item">
          <button class="btn btn-secondary" onclick={handleForceFullSync} disabled={forceSyncing}>
            {forceSyncing ? 'Syncing...' : 'Force Full Sync'}
          </button>
          <p class="hint">Resets sync cursor and re-downloads all data from the server.</p>
        </div>

        <div class="debug-item">
          <button
            class="btn btn-secondary"
            onclick={handleTriggerSync}
            disabled={triggeringSyncManual}
          >
            {triggeringSyncManual ? 'Syncing...' : 'Trigger Sync Cycle'}
          </button>
          <p class="hint">Manually triggers a push/pull sync cycle.</p>
        </div>

        <div class="debug-item">
          <button
            class="btn btn-secondary"
            onclick={handleResetSyncCursor}
            disabled={resettingCursor}
          >
            {resettingCursor ? 'Resetting...' : 'Reset Sync Cursor'}
          </button>
          <p class="hint">Resets cursor so the next sync pulls all data.</p>
        </div>

        <div class="debug-item">
          <button
            class="btn btn-secondary"
            onclick={handleViewTombstones}
            disabled={viewingTombstones}
          >
            {viewingTombstones ? 'Loading...' : 'View Tombstones'}
          </button>
          <p class="hint">Logs soft-deleted record counts per table to the console.</p>
        </div>

        <div class="debug-item">
          <button
            class="btn btn-secondary"
            onclick={handleCleanupTombstones}
            disabled={cleaningTombstones}
          >
            {cleaningTombstones ? 'Cleaning...' : 'Cleanup Tombstones'}
          </button>
          <p class="hint">
            Permanently removes old soft-deleted records from local and server databases.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Footer -->
  <div class="profile-footer section-reveal" style="animation-delay: 450ms">
    <button class="btn btn-ghost" onclick={goBack}>Back to Home</button>
  </div>

  {#if demoToast}
    <div class="demo-toast">{demoToast}</div>
  {/if}
</div>

<style>
  /* Page layout */
  .profile-page {
    max-width: 660px;
    margin: 0 auto;
    padding: 40px 20px 48px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Staggered reveal */
  .section-reveal {
    animation: revealUp 0.4s var(--ease-out) both;
  }
  @keyframes revealUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Section labels — ABOVE cards, Apple Settings style */
  .section-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    padding-left: 4px;
    margin: 0 0 8px;
  }
  .section-label--danger {
    color: var(--color-red);
  }
  .section-label--debug {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  /* Profile hero */
  .profile-hero {
    text-align: center;
    padding: 0 0 28px;
  }

  /* Avatar with gradient ring */
  .avatar-ring {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    margin: 0 auto 16px;
    padding: 3px;
    background: conic-gradient(
      from 180deg,
      var(--color-primary-light),
      var(--color-primary),
      var(--color-primary-dark),
      var(--color-primary),
      var(--color-primary-light)
    );
    box-shadow:
      0 0 24px var(--color-primary-glow),
      var(--shadow-md);
  }
  .avatar-disc {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--gradient-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    font-weight: 600;
    font-family: var(--font-display);
  }

  .profile-name {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-display);
    letter-spacing: -0.01em;
  }
  .profile-email {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: 4px 0 0;
  }

  /* Forms */
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .field {
    margin-bottom: 20px;
  }
  .field-label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: 6px;
  }
  .field-input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid var(--color-border);
    border-radius: 0;
    padding: 10px 2px;
    font-size: 0.9375rem;
    color: var(--color-text);
    outline: none;
    transition:
      border-color 160ms,
      box-shadow 160ms;
  }
  .field-input:focus {
    border-bottom-color: var(--color-primary);
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }
  .field-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.5;
  }
  .field-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Current value display */
  .current-email {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0 0 16px;
  }
  .current-email-addr {
    font-family: var(--font-mono);
    color: var(--color-text);
  }

  /* Digit code inputs */
  .digit-row {
    display: flex;
    gap: 10px;
    justify-content: center;
    margin: 16px 0;
  }
  .digit-box {
    width: 44px;
    height: 52px;
    text-align: center;
    font-size: 1.25rem;
    font-family: var(--font-mono);
    font-weight: 700;
    border: 1.5px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    color: var(--color-text);
    box-shadow: var(--shadow-sm), var(--shadow-inset);
    transition:
      border-color 160ms,
      box-shadow 160ms,
      transform 160ms;
  }
  .digit-box:focus {
    border-color: var(--color-primary);
    box-shadow:
      0 0 0 3px var(--color-primary-glow),
      var(--shadow-sm);
    outline: none;
    transform: translateY(-1px);
  }
  .digit-box:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Hint text inside cards */
  .hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0 0 16px;
    line-height: 1.5;
  }

  /* Feedback messages */
  .msg-error {
    color: var(--color-red);
    font-size: 0.8125rem;
    margin: 8px 0;
    font-weight: 500;
  }
  .msg-success {
    color: var(--color-green);
    font-size: 0.8125rem;
    margin: 8px 0;
    font-weight: 500;
  }

  /* Device list */
  .device-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .device-row:last-child {
    border-bottom: none;
  }
  .device-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .device-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text);
  }
  .device-badge {
    display: inline-block;
    width: fit-content;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-primary);
    background: var(--color-primary-subtle);
    padding: 2px 8px;
    border-radius: var(--radius-full);
  }
  .device-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  .empty-msg {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: 16px 0;
  }

  /* Setting rows */
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .setting-item:last-child {
    border-bottom: none;
  }
  .setting-item strong {
    display: block;
    font-size: 0.875rem;
    color: var(--color-text);
  }
  .setting-item .hint {
    margin: 4px 0 0;
    font-size: 0.8125rem;
  }
  .setting-item.danger strong {
    color: var(--color-red);
  }

  /* Toggle switch */
  .toggle {
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: var(--radius-full);
    border: none;
    background: var(--color-bg-tertiary);
    cursor: pointer;
    transition: background 160ms;
    flex-shrink: 0;
  }
  .toggle.on {
    background: var(--color-primary);
  }
  .toggle-pip {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    box-shadow: var(--shadow-sm);
    transition: transform 160ms var(--ease-out);
  }
  .toggle.on .toggle-pip {
    transform: translateX(20px);
  }

  /* Danger card */
  .card--danger {
    border-left: 2px solid color-mix(in srgb, var(--color-red) 35%, transparent);
  }

  /* Debug card */
  .card--debug {
    border-style: dashed;
    background: var(--color-bg-secondary);
  }
  .debug-item {
    padding: 12px 0;
    border-bottom: 1px dashed var(--color-border);
  }
  .debug-item:last-child {
    border-bottom: none;
  }
  .debug-item .btn {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }
  .debug-item .hint {
    margin: 6px 0 0;
    padding-left: 2px;
    font-size: 0.75rem;
    font-family: var(--font-mono);
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 20px;
  }
  .modal-pane {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: 40px 28px;
    max-width: 400px;
    width: 100%;
    text-align: center;
    box-shadow: var(--shadow-xl);
  }
  .modal-icon {
    color: var(--color-primary);
    margin-bottom: 20px;
  }
  .modal-heading {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 8px;
    font-family: var(--font-display);
  }
  .modal-body {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin: 0 0 28px;
    line-height: 1.5;
  }
  .modal-primary {
    width: 100%;
    margin-bottom: 12px;
  }
  .modal-dismiss {
    width: 100%;
  }

  /* Footer */
  .profile-footer {
    text-align: center;
    padding: 32px 0 8px;
  }

  /* Diagnostics panel — graph paper texture */
  .diag-panel {
    background-image:
      linear-gradient(var(--color-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: -1px -1px;
  }

  /* Diagnostics internals */
  .diag-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: 16px;
  }
  .diag-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .diag-dot--green {
    background: var(--color-green);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-green) 50%, transparent);
    animation: pulse 3s ease-in-out infinite;
  }
  .diag-dot--blue {
    background: var(--color-primary);
    box-shadow: 0 0 8px var(--color-primary-glow);
    animation: pulse 1s ease-in-out infinite;
  }
  .diag-dot--yellow {
    background: #ffd43b;
    box-shadow: 0 0 8px rgba(255, 212, 59, 0.4);
    animation: pulse 2s ease-in-out infinite;
  }
  .diag-dot--red {
    background: var(--color-red);
    box-shadow: 0 0 8px var(--color-red-glow);
    animation: pulse 0.8s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(0.85);
    }
  }
  .diag-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--color-text);
  }
  .diag-sub {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }
  .diag-heading {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-muted);
    margin: 20px 0 8px;
    font-family: var(--font-mono);
  }
  .diag-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .diag-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .diag-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px 6px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
  }
  .diag-val {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .diag-key {
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .diag-pill {
    display: inline-flex;
    padding: 2px 8px;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-radius: var(--radius-xs);
    font-family: var(--font-mono);
  }
  .diag-pill--ok {
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-green) 25%, transparent);
  }
  .diag-pill--warn {
    color: #ffd43b;
    background: rgba(255, 212, 59, 0.12);
    border: 1px solid rgba(255, 212, 59, 0.25);
  }
  .diag-pills {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .diag-kv {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 0;
    border-bottom: 1px solid var(--color-border);
    font-variant-numeric: tabular-nums;
    gap: 12px;
  }
  .diag-kv:last-of-type {
    border-bottom: none;
  }
  .diag-kv-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    flex-shrink: 0;
  }
  .diag-kv-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
    display: flex;
    align-items: center;
    gap: 6px;
    text-align: right;
  }
  .diag-lock-dur {
    font-size: 0.6875rem;
    font-weight: 400;
    color: var(--color-text-muted);
  }
  .diag-tables-block {
    padding: 7px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .diag-tables-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .diag-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .diag-tag {
    display: inline-flex;
    padding: 2px 7px;
    font-size: 0.625rem;
    font-weight: 600;
    font-family: var(--font-mono);
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
    border: 1px solid color-mix(in srgb, var(--color-primary) 20%, transparent);
    border-radius: var(--radius-xs);
  }
  .diag-inline-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .diag-inline-dot--green {
    background: var(--color-green);
    box-shadow: 0 0 4px color-mix(in srgb, var(--color-green) 40%, transparent);
  }
  .diag-inline-dot--yellow {
    background: #ffd43b;
    box-shadow: 0 0 4px rgba(255, 212, 59, 0.4);
  }
  .diag-inline-dot--red {
    background: var(--color-red);
    box-shadow: 0 0 4px var(--color-red-glow);
  }

  /* Data transfer bars */
  .diag-bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }
  .diag-bar-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .diag-bar-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .diag-bar-name {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
  }
  .diag-bar-pct {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .diag-bar-track {
    height: 4px;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }
  .diag-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
    border-radius: 2px;
    transition: width 600ms var(--ease-out);
  }

  /* Recent cycles */
  .diag-cycles {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .diag-cycle {
    padding: 8px 12px;
    background: var(--color-bg);
    border-left: 2px solid var(--color-primary-subtle);
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  }
  .diag-cycle-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }
  .diag-cycle-trigger {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-primary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: var(--font-mono);
  }
  .diag-cycle-time {
    font-size: 0.625rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .diag-cycle-stats {
    display: flex;
    gap: 10px;
    font-size: 0.625rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  /* Errors */
  .diag-err-box {
    padding: 10px 14px;
    background: color-mix(in srgb, var(--color-red) 8%, var(--color-bg));
    border: 1px solid color-mix(in srgb, var(--color-red) 20%, transparent);
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-red);
    margin-bottom: 6px;
    font-family: var(--font-mono);
  }
  .diag-err-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-red) 10%, transparent);
  }
  .diag-err-item:last-child {
    border-bottom: none;
  }
  .diag-err-table {
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--color-red);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: var(--font-mono);
  }
  .diag-err-msg {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  /* Diagnostics footer */
  .diag-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 16px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
    font-size: 0.625rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .diag-tick {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-primary-subtle);
    animation: tick 2.5s ease-in-out infinite;
  }
  @keyframes tick {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  /* Demo toast */
  .demo-toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9500;
    padding: 16px 32px;
    background: color-mix(in srgb, var(--color-primary) 90%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-xl);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: var(--shadow-xl);
    animation: toastIn 0.3s var(--ease-out);
    pointer-events: none;
  }
  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* Responsive */
  @media (max-width: 480px) {
    .profile-page {
      padding: 24px 16px 40px;
    }
    .field-row {
      grid-template-columns: 1fr;
    }
    .digit-box {
      width: 38px;
      height: 46px;
      font-size: 1.125rem;
    }
    .diag-grid-4 {
      grid-template-columns: repeat(2, 1fr);
    }
    .diag-grid-2 {
      grid-template-columns: 1fr;
    }
    .diag-cycle-stats {
      flex-wrap: wrap;
    }
    .diag-panel {
      background-size: 16px 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .section-reveal {
      animation: none;
    }
    .diag-dot,
    .diag-tick {
      animation: none;
    }
    .diag-bar-fill {
      transition: none;
    }
  }
</style>
