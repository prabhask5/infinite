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

<!-- ═══ Notebook Page ═══ -->
<div class="notebook-page">
  <div class="notebook-content">
    <!-- ═══ Profile Header ═══ -->
    <header class="profile-header section-enter" style="animation-delay: 0ms">
      <div class="avatar-ring">
        <div class="avatar">
          {resolveAvatarInitial($authState?.session, $authState?.offlineProfile)}
        </div>
      </div>
      <h1 class="profile-name">{firstName} {lastName}</h1>
      <p class="profile-email">{currentEmail || 'No email set'}</p>
    </header>

    <!-- ═══ Section: Edit Profile ═══ -->
    <div class="ruling-divider section-enter" style="animation-delay: 60ms">
      <span class="section-label">Profile</span>
      <span class="ruling-line"></span>
    </div>

    <section class="notebook-section section-enter" style="animation-delay: 60ms">
      <form onsubmit={handleProfileSubmit}>
        <div class="form-row">
          <div class="form-group">
            <label for="firstName">First name</label>
            <input
              class="ruled-input"
              type="text"
              id="firstName"
              bind:value={firstName}
              disabled={profileLoading}
              placeholder="First name"
            />
          </div>
          <div class="form-group">
            <label for="lastName">Last name</label>
            <input
              class="ruled-input"
              type="text"
              id="lastName"
              bind:value={lastName}
              disabled={profileLoading}
              placeholder="Last name"
            />
          </div>
        </div>

        {#if profileError}
          <p class="error-message">{profileError}</p>
        {/if}

        {#if profileSuccess}
          <p class="success-message">{profileSuccess}</p>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={profileLoading}>
          {profileLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </section>

    <!-- ═══ Section: Change Email ═══ -->
    <div class="ruling-divider section-enter" style="animation-delay: 120ms">
      <span class="section-label">Email</span>
      <span class="ruling-line"></span>
    </div>

    <section class="notebook-section section-enter" style="animation-delay: 120ms">
      {#if currentEmail}
        <p class="current-value">Current: <span class="current-value-text">{currentEmail}</span></p>
      {/if}

      <form onsubmit={handleEmailSubmit}>
        <div class="form-group">
          <label for="newEmail">New email address</label>
          <input
            class="ruled-input"
            type="email"
            id="newEmail"
            bind:value={newEmail}
            disabled={emailLoading}
            placeholder="new@email.com"
          />
        </div>

        {#if emailError}
          <p class="error-message">{emailError}</p>
        {/if}

        {#if emailSuccess}
          <p class="success-message">{emailSuccess}</p>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={emailLoading || !newEmail}>
          {emailLoading ? 'Sending...' : 'Update Email'}
        </button>
      </form>
    </section>

    <!-- ═══ Email Confirmation Modal ═══ -->
    {#if showEmailConfirmationModal}
      <div class="modal-overlay" role="dialog" aria-modal="true">
        <div class="modal-card">
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
              <path
                d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
              />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h2 class="modal-title">Check your email</h2>
          <p class="modal-text">
            We sent a confirmation link to <strong>{newEmail}</strong>. Click the link to confirm
            your new email address.
          </p>

          <button
            class="btn btn-secondary modal-resend"
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

    <!-- ═══ Section: Change Gate Code ═══ -->
    <div class="ruling-divider section-enter" style="animation-delay: 180ms">
      <span class="section-label">Gate Code</span>
      <span class="ruling-line"></span>
    </div>

    <section class="notebook-section section-enter" style="animation-delay: 180ms">
      <p class="section-hint">Enter your current code and choose a new one.</p>

      <form onsubmit={handleCodeSubmit}>
        <div class="form-group">
          <label for="oldCode0">Current gate code</label>
          <div class="digit-row">
            {#each oldCodeDigits as digit, i (i)}
              <input
                class="digit-input"
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

        <div class="form-group">
          <label for="newCode0">New gate code</label>
          <div class="digit-row">
            {#each newCodeDigits as digit, i (i)}
              <input
                class="digit-input"
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

        <div class="form-group">
          <label for="confirmCode0">Confirm new gate code</label>
          <div class="digit-row">
            {#each confirmCodeDigits as digit, i (i)}
              <input
                class="digit-input"
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
          <p class="error-message">{codeError}</p>
        {/if}

        {#if codeSuccess}
          <p class="success-message">{codeSuccess}</p>
        {/if}

        <button type="submit" class="btn btn-primary" disabled={codeLoading}>
          {codeLoading ? 'Updating...' : 'Update Gate Code'}
        </button>
      </form>
    </section>

    <!-- ═══ Section: Trusted Devices ═══ -->
    <div class="ruling-divider section-enter" style="animation-delay: 240ms">
      <span class="section-label">Trusted Devices</span>
      <span class="ruling-line"></span>
    </div>

    <section class="notebook-section section-enter" style="animation-delay: 240ms">
      {#if devicesLoading}
        <p class="section-hint">Loading devices...</p>
      {:else if trustedDevices.length === 0}
        <p class="empty-state">No trusted devices registered.</p>
      {:else}
        <div class="device-list">
          {#each trustedDevices as device, idx (device.id)}
            <div
              class="device-card"
              class:device-card-current={device.deviceId === currentDeviceId}
              style="transform: rotate({idx % 2 === 0 ? -0.6 : 0.4}deg)"
            >
              <div class="device-info">
                <span class="device-name">
                  {device.deviceLabel || 'Unknown Device'}
                </span>
                {#if device.deviceId === currentDeviceId}
                  <span class="device-stamp">This Device</span>
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
        </div>
      {/if}
    </section>

    <!-- ═══ Section: Settings ═══ -->
    <div class="ruling-divider section-enter" style="animation-delay: 300ms">
      <span class="section-label">Settings</span>
      <span class="ruling-line"></span>
    </div>

    <section class="notebook-section section-enter" style="animation-delay: 300ms">
      <div class="setting-row">
        <div>
          <strong>Debug Mode</strong>
          <p class="section-hint">Show debug tools below (refresh needed for full effect)</p>
        </div>
        <button
          class="toggle-btn"
          class:active={debugMode}
          onclick={toggleDebugMode}
          role="switch"
          aria-checked={debugMode}
          aria-label="Toggle debug mode"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>

      <div class="setting-row">
        <div>
          <strong>Sign Out</strong>
          <p class="section-hint">Lock your notes and return to login.</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick={handleMobileSignOut}>Sign Out</button>
      </div>
    </section>

    <!-- ═══ Danger Zone ═══ -->
    <div class="ruling-divider ruling-divider-danger section-enter" style="animation-delay: 360ms">
      <span class="section-label section-label-danger">Danger Zone</span>
      <span class="ruling-line ruling-line-danger"></span>
    </div>

    <section class="notebook-section danger-section section-enter" style="animation-delay: 360ms">
      <div class="setting-row danger">
        <div>
          <strong>Reset Database</strong>
          <p class="section-hint">Delete all local data. This cannot be undone.</p>
        </div>
        <button class="btn btn-danger btn-sm" onclick={handleResetDatabase} disabled={resetting}>
          {resetting ? 'Resetting...' : 'Reset'}
        </button>
      </div>
    </section>

    <!-- ═══ Diagnostics Dashboard ═══ -->
    <div class="ruling-divider section-enter" style="animation-delay: 420ms">
      <span class="section-label">Diagnostics</span>
      <span class="ruling-line"></span>
    </div>

    <section class="notebook-section diag-appendix section-enter" style="animation-delay: 420ms">
      <p class="section-hint">Live sync engine health dashboard</p>

      {#if diagnosticsLoading}
        <div class="devices-loading">
          <span class="loading-spinner"></span>
        </div>
      {:else if diagnostics}
        <!-- 1. Status Banner -->
        <div class="diag-status-banner">
          <span class="diag-status-dot diag-status-dot--{getStatusColor(diagnostics.sync.status)}"
          ></span>
          <div class="diag-status-info">
            <span class="diag-status-label">{formatSyncStatus(diagnostics.sync.status)}</span>
            <span class="diag-status-meta">
              {diagnostics.network.online ? 'Online' : 'Offline'} &middot; {diagnostics.deviceId.slice(
                0,
                8
              )}
            </span>
          </div>
        </div>

        <!-- 2. Sync Engine -->
        <div class="diag-section-title">Sync Engine</div>
        <div class="diag-grid">
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.sync.totalCycles}</span>
            <span class="diag-stat-label">Total Cycles</span>
          </div>
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.sync.cyclesLastMinute}</span>
            <span class="diag-stat-label">Last Minute</span>
          </div>
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.sync.pendingCount}</span>
            <span class="diag-stat-label">Pending Ops</span>
          </div>
          <div class="diag-stat">
            <span class="diag-stat-value">{formatTimestamp(diagnostics.sync.lastSyncTime)}</span>
            <span class="diag-stat-label">Last Sync</span>
          </div>
        </div>
        <div class="diag-badges">
          <span class="diag-badge-{diagnostics.sync.hasHydrated ? 'ok' : 'warn'}">
            {diagnostics.sync.hasHydrated ? 'Hydrated' : 'Not Hydrated'}
          </span>
          <span class="diag-badge-{diagnostics.sync.schemaValidated ? 'ok' : 'warn'}">
            {diagnostics.sync.schemaValidated ? 'Schema OK' : 'Schema Pending'}
          </span>
        </div>

        <!-- 3. Realtime -->
        <div class="diag-section-title">Realtime</div>
        <div class="diag-row">
          <span class="diag-row-label">Connection</span>
          <span class="diag-row-value">
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
        <div class="diag-row">
          <span class="diag-row-label">Healthy</span>
          <span class="diag-row-value">{diagnostics.realtime.healthy ? 'Yes' : 'No'}</span>
        </div>
        <div class="diag-row">
          <span class="diag-row-label">Reconnects</span>
          <span class="diag-row-value">{diagnostics.realtime.reconnectAttempts}</span>
        </div>
        <div class="diag-row">
          <span class="diag-row-label">Events Processed</span>
          <span class="diag-row-value">{diagnostics.realtime.recentlyProcessedCount}</span>
        </div>

        <!-- 4. Data Transfer -->
        <div class="diag-section-title">Data Transfer</div>
        <div class="diag-grid-2">
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.egress.totalFormatted}</span>
            <span class="diag-stat-label">Total Egress</span>
          </div>
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.egress.totalRecords.toLocaleString()}</span>
            <span class="diag-stat-label">Records</span>
          </div>
        </div>
        {#if Object.keys(diagnostics.egress.byTable).length > 0}
          <div class="diag-table-bars">
            {#each Object.entries(diagnostics.egress.byTable) as [table, data] (table)}
              <div class="diag-table-row">
                <div class="diag-table-header">
                  <span class="diag-table-name">{table}</span>
                  <span class="diag-table-pct">{data.percentage}</span>
                </div>
                <div class="diag-progress-bar">
                  <div class="diag-progress-fill" style="width: {data.percentage}"></div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- 5. Sync Queue -->
        <div class="diag-section-title">Sync Queue</div>
        <div class="diag-grid-2">
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.queue.pendingOperations}</span>
            <span class="diag-stat-label">Pending</span>
          </div>
          <div class="diag-stat">
            <span class="diag-stat-value">{diagnostics.queue.itemsInBackoff}</span>
            <span class="diag-stat-label">In Backoff</span>
          </div>
        </div>
        {#if diagnostics.queue.oldestPendingTimestamp}
          <div class="diag-row">
            <span class="diag-row-label">Oldest Pending</span>
            <span class="diag-row-value"
              >{formatTimestamp(diagnostics.queue.oldestPendingTimestamp)}</span
            >
          </div>
        {/if}

        <!-- 6. Engine -->
        <div class="diag-section-title">Engine</div>
        <div class="diag-row">
          <span class="diag-row-label">Tab Visible</span>
          <span class="diag-row-value">{diagnostics.engine.isTabVisible ? 'Yes' : 'No'}</span>
        </div>
        <div class="diag-row">
          <span class="diag-row-label">Lock Held</span>
          <span class="diag-row-value">
            {diagnostics.engine.lockHeld ? 'Yes' : 'No'}
            {#if diagnostics.engine.lockHeld && diagnostics.engine.lockHeldForMs}
              <span class="diag-lock-duration"
                >({formatDuration(diagnostics.engine.lockHeldForMs)})</span
              >
            {/if}
          </span>
        </div>
        <div class="diag-row">
          <span class="diag-row-label">Recently Modified</span>
          <span class="diag-row-value">{diagnostics.engine.recentlyModifiedCount}</span>
        </div>

        <!-- 7. Recent Cycles -->
        {#if diagnostics.sync.recentCycles.length > 0}
          <div class="diag-section-title">Recent Cycles</div>
          <div class="diag-cycles">
            {#each diagnostics.sync.recentCycles.slice(0, 5) as cycle (cycle.timestamp)}
              <div class="diag-cycle-item">
                <div class="diag-cycle-header">
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
          <div class="diag-section-title">Conflicts</div>
          <div class="diag-row">
            <span class="diag-row-label">Total</span>
            <span class="diag-row-value">{diagnostics.conflicts.totalCount}</span>
          </div>
        {/if}

        <!-- 9. Errors -->
        {#if diagnostics.errors.lastError || diagnostics.errors.recentErrors.length > 0}
          <div class="diag-section-title">Errors</div>
          {#if diagnostics.errors.lastError}
            <div class="diag-error-banner">
              {diagnostics.errors.lastError}
            </div>
          {/if}
          {#each diagnostics.errors.recentErrors.slice(0, 3) as err (err.entityId)}
            <div class="diag-error-item">
              <span class="diag-error-table">{err.table}.{err.operation}</span>
              <span class="diag-error-msg">{err.message}</span>
            </div>
          {/each}
        {/if}

        <!-- 10. Configuration -->
        <div class="diag-section-title">Configuration</div>
        <div class="diag-config-tables">
          <div class="diag-config-tables-header">
            <span class="diag-row-label">Tables</span>
            <span class="diag-row-value">{diagnostics.config.tableCount}</span>
          </div>
          <div class="diag-config-table-names">
            {#each diagnostics.config.tableNames as name (name)}
              <span class="diag-table-tag">{name}</span>
            {/each}
          </div>
        </div>
        <div class="diag-row">
          <span class="diag-row-label">Sync Interval</span>
          <span class="diag-row-value">{formatDuration(diagnostics.config.syncIntervalMs)}</span>
        </div>
        <div class="diag-row">
          <span class="diag-row-label">Debounce</span>
          <span class="diag-row-value">{formatDuration(diagnostics.config.syncDebounceMs)}</span>
        </div>

        <!-- 11. Footer -->
        <div class="diag-footer">
          <span class="diag-footer-dot"></span>
          Updated {formatTimestamp(diagnostics.timestamp)}
        </div>
      {/if}
    </section>

    <!-- ═══ Section: Debug Tools (conditional) ═══ -->
    {#if debugMode}
      <div class="ruling-divider section-enter" style="animation-delay: 480ms">
        <span class="section-label section-label-debug">Developer's Notebook</span>
        <span class="ruling-line ruling-line-debug"></span>
      </div>

      <section class="notebook-section debug-section section-enter" style="animation-delay: 480ms">
        <div class="debug-actions">
          <div class="debug-tool">
            <button class="btn btn-secondary" onclick={handleForceFullSync} disabled={forceSyncing}>
              {forceSyncing ? 'Syncing...' : 'Force Full Sync'}
            </button>
            <p class="section-hint">
              Resets sync cursor and re-downloads all data from the server.
            </p>
          </div>

          <div class="debug-tool">
            <button
              class="btn btn-secondary"
              onclick={handleTriggerSync}
              disabled={triggeringSyncManual}
            >
              {triggeringSyncManual ? 'Syncing...' : 'Trigger Sync Cycle'}
            </button>
            <p class="section-hint">Manually triggers a push/pull sync cycle.</p>
          </div>

          <div class="debug-tool">
            <button
              class="btn btn-secondary"
              onclick={handleResetSyncCursor}
              disabled={resettingCursor}
            >
              {resettingCursor ? 'Resetting...' : 'Reset Sync Cursor'}
            </button>
            <p class="section-hint">Resets cursor so the next sync pulls all data.</p>
          </div>

          <div class="debug-tool">
            <button
              class="btn btn-secondary"
              onclick={handleViewTombstones}
              disabled={viewingTombstones}
            >
              {viewingTombstones ? 'Loading...' : 'View Tombstones'}
            </button>
            <p class="section-hint">Logs soft-deleted record counts per table to the console.</p>
          </div>

          <div class="debug-tool">
            <button
              class="btn btn-secondary"
              onclick={handleCleanupTombstones}
              disabled={cleaningTombstones}
            >
              {cleaningTombstones ? 'Cleaning...' : 'Cleanup Tombstones'}
            </button>
            <p class="section-hint">
              Permanently removes old soft-deleted records from local and server databases.
            </p>
          </div>
        </div>
      </section>
    {/if}

    <!-- ═══ Footer ═══ -->
    <div class="notebook-footer section-enter" style="animation-delay: 540ms">
      <button class="btn btn-ghost" onclick={goBack}>Back to Home</button>
    </div>
  </div>

  {#if demoToast}
    <div class="demo-toast">{demoToast}</div>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════════
     NOTEBOOK PAGE LAYOUT
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .notebook-page {
    padding: var(--space-6) var(--space-4);
    max-width: 620px;
    margin: 0 auto;
  }

  .notebook-content {
    display: flex;
    flex-direction: column;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SECTION ENTRANCE ANIMATION
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .section-enter {
    animation: sectionFadeUp var(--duration-normal) var(--ease-out) both;
  }

  @keyframes sectionFadeUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     PROFILE HEADER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .profile-header {
    text-align: center;
    padding: var(--space-8) 0 var(--space-6);
  }

  .avatar-ring {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    margin: 0 auto var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
    background: conic-gradient(
      from 180deg,
      var(--color-primary-light),
      var(--color-primary),
      var(--color-primary-dark),
      var(--color-primary),
      var(--color-primary-light)
    );
    padding: 3px;
    box-shadow:
      0 0 20px var(--color-primary-glow),
      var(--shadow-md);
  }

  .avatar {
    width: 82px;
    height: 82px;
    border-radius: 50%;
    background: var(--gradient-primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    font-family: var(--font-display);
  }

  .profile-name {
    font-size: 1.625rem;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
    font-family: var(--font-display);
    letter-spacing: -0.01em;
  }

  .profile-email {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0;
    letter-spacing: 0.01em;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RULING DIVIDER — Notebook section headers
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .ruling-divider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-6);
    margin-bottom: var(--space-1);
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-primary);
    white-space: nowrap;
    font-variant: small-caps;
    font-family: var(--font-display);
  }

  .ruling-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, var(--color-primary-subtle), transparent);
  }

  .section-label-danger {
    color: var(--color-red);
  }

  .ruling-line-danger {
    background: linear-gradient(
      to right,
      color-mix(in srgb, var(--color-red) 30%, transparent),
      transparent
    );
  }

  .section-label-debug {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-variant: normal;
    font-size: 0.625rem;
    letter-spacing: 0.08em;
  }

  .ruling-line-debug {
    height: 1px;
    border: none;
    background: repeating-linear-gradient(
      to right,
      var(--color-border),
      var(--color-border) 4px,
      transparent 4px,
      transparent 8px
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     NOTEBOOK SECTIONS — continuous page feel
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .notebook-section {
    padding: var(--space-4) 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FORM ELEMENTS — ruled-line style
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }

  .form-group {
    margin-bottom: var(--space-4);
  }

  .form-group label {
    display: block;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-1);
    letter-spacing: 0.01em;
  }

  .form-group input {
    width: 100%;
  }

  .ruled-input {
    background: transparent;
    border: none;
    border-bottom: 1.5px solid var(--color-border);
    border-radius: 0;
    padding: var(--space-2) var(--space-1);
    font-size: 0.9375rem;
    color: var(--color-text);
    transition:
      border-color var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out);
    outline: none;
  }

  .ruled-input:focus {
    border-bottom-color: var(--color-primary);
    box-shadow: 0 2px 8px var(--color-primary-glow);
  }

  .ruled-input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.5;
  }

  .ruled-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .current-value {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3);
  }

  .current-value-text {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--color-text);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DIGIT CODE INPUTS — typewriter key / combination lock style
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .digit-row {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    margin: var(--space-3) 0;
  }

  .digit-input {
    width: 46px;
    height: 54px;
    text-align: center;
    font-size: 1.375rem;
    font-family: var(--font-mono);
    font-weight: 700;
    letter-spacing: 0;
    border: 1.5px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    color: var(--color-text);
    box-shadow: var(--shadow-sm), var(--shadow-inset);
    transition:
      border-color var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }

  .digit-input:focus {
    border-color: var(--color-primary);
    box-shadow:
      0 0 0 3px var(--color-primary-glow),
      var(--shadow-sm);
    outline: none;
    transform: translateY(-1px);
  }

  .digit-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .section-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
    line-height: 1.5;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FEEDBACK MESSAGES
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .error-message {
    color: var(--color-red);
    font-size: 0.8125rem;
    margin: var(--space-2) 0;
    font-weight: 500;
  }

  .success-message {
    color: var(--color-green);
    font-size: 0.8125rem;
    margin: var(--space-2) 0;
    font-weight: 500;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     TRUSTED DEVICES — index card style
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .device-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .device-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);
    transition:
      transform var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out);
  }

  .device-card:hover {
    box-shadow: var(--shadow-md);
  }

  .device-card-current {
    border-color: var(--color-primary-subtle);
    background: color-mix(in srgb, var(--color-primary-subtle) 20%, var(--color-bg-secondary));
  }

  .device-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .device-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .device-stamp {
    display: inline-block;
    width: fit-content;
    font-size: 0.5625rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--color-primary);
    border: 1.5px solid var(--color-primary);
    border-radius: var(--radius-xs);
    padding: 1px 6px;
    transform: rotate(-2deg);
    opacity: 0.85;
  }

  .device-date {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .empty-state {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: var(--space-4) 0;
    font-style: italic;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     SETTINGS ROWS
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .setting-row:last-child {
    border-bottom: none;
  }

  .setting-row strong {
    display: block;
    font-size: 0.875rem;
    color: var(--color-text);
  }

  .setting-row .section-hint {
    margin: var(--space-1) 0 0;
    font-size: 0.8125rem;
  }

  .setting-row.danger strong {
    color: var(--color-red);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DANGER SECTION — red margin line
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .danger-section {
    border-left: 2px solid color-mix(in srgb, var(--color-red) 40%, transparent);
    padding-left: var(--space-4);
    margin-left: var(--space-1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     TOGGLE BUTTON
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .toggle-btn {
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: var(--radius-full);
    border: none;
    background: var(--color-bg-tertiary);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
    flex-shrink: 0;
  }

  .toggle-btn.active {
    background: var(--color-primary);
  }

  .toggle-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: white;
    box-shadow: var(--shadow-sm);
    transition: transform var(--duration-fast) var(--ease-out);
  }

  .toggle-btn.active .toggle-knob {
    transform: translateX(20px);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DEBUG TOOLS — Developer's Notebook aesthetic
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .debug-section {
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: var(--space-4);
    background: var(--color-bg-secondary);
  }

  .debug-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .debug-tool {
    padding: var(--space-2) 0;
    border-bottom: 1px dashed var(--color-border);
  }

  .debug-tool:last-child {
    border-bottom: none;
  }

  .debug-tool .btn {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
  }

  .debug-tool .section-hint {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-1);
    font-size: 0.75rem;
    font-family: var(--font-mono);
    color: var(--color-text-muted);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     EMAIL CONFIRMATION MODAL
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: var(--space-4);
  }

  .modal-card {
    background: var(--color-bg-elevated);
    border-radius: var(--radius-lg);
    padding: var(--space-8) var(--space-6);
    max-width: 400px;
    width: 100%;
    text-align: center;
    box-shadow: var(--shadow-xl);
  }

  .modal-icon {
    color: var(--color-primary);
    margin-bottom: var(--space-4);
  }

  .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 var(--space-2);
    font-family: var(--font-display);
  }

  .modal-text {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-6);
    line-height: 1.5;
  }

  .modal-resend {
    width: 100%;
    margin-bottom: var(--space-3);
  }

  .modal-dismiss {
    width: 100%;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .notebook-footer {
    text-align: center;
    padding: var(--space-6) 0 var(--space-4);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DIAGNOSTICS — technical appendix with graph paper texture
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .diag-appendix {
    background:
      linear-gradient(var(--color-border) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
    background-size: 20px 20px;
    background-position: -1px -1px;
    padding: var(--space-4);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .diag-status-banner {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.875rem 1rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: 1rem;
  }

  .diag-status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .diag-status-dot--green {
    background: var(--color-green);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-green) 50%, transparent);
    animation: statusPulse 3s ease-in-out infinite;
  }

  .diag-status-dot--blue {
    background: var(--color-primary);
    box-shadow: 0 0 8px var(--color-primary-glow);
    animation: statusPulse 1s ease-in-out infinite;
  }

  .diag-status-dot--yellow {
    background: #ffd43b;
    box-shadow: 0 0 8px rgba(255, 212, 59, 0.4);
    animation: statusPulse 2s ease-in-out infinite;
  }

  .diag-status-dot--red {
    background: var(--color-red);
    box-shadow: 0 0 8px var(--color-red-glow);
    animation: statusPulse 0.8s ease-in-out infinite;
  }

  @keyframes statusPulse {
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

  .diag-status-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .diag-status-label {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--color-text);
  }

  .diag-status-meta {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .diag-section-title {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-muted);
    margin: 1.25rem 0 0.5rem;
    font-family: var(--font-mono);
  }

  .diag-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .diag-grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .diag-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1875rem;
    padding: 0.625rem 0.375rem;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xs);
    font-variant-numeric: tabular-nums;
  }

  .diag-stat-value {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .diag-stat-label {
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  @media (max-width: 640px) {
    .diag-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .diag-badges {
    display: flex;
    gap: 0.375rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }

  .diag-badge-ok {
    display: inline-flex;
    padding: 0.1875rem 0.5rem;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-radius: var(--radius-xs);
    color: var(--color-green);
    background: color-mix(in srgb, var(--color-green) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-green) 25%, transparent);
    font-family: var(--font-mono);
  }

  .diag-badge-warn {
    display: inline-flex;
    padding: 0.1875rem 0.5rem;
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-radius: var(--radius-xs);
    color: #ffd43b;
    background: rgba(255, 212, 59, 0.12);
    border: 1px solid rgba(255, 212, 59, 0.25);
    font-family: var(--font-mono);
  }

  .diag-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4375rem 0;
    border-bottom: 1px solid var(--color-border);
    font-variant-numeric: tabular-nums;
    gap: 0.75rem;
  }

  .diag-row:last-of-type {
    border-bottom: none;
  }

  .diag-row-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
    font-family: var(--font-mono);
  }

  .diag-row-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text);
    display: flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    text-align: right;
    font-family: var(--font-mono);
  }

  .diag-lock-duration {
    font-size: 0.6875rem;
    font-weight: 400;
    color: var(--color-text-muted);
  }

  .diag-config-tables {
    padding: 0.4375rem 0;
    border-bottom: 1px solid var(--color-border);
  }

  .diag-config-tables-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.375rem;
  }

  .diag-config-table-names {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3125rem;
  }

  .diag-table-tag {
    display: inline-flex;
    padding: 0.125rem 0.4375rem;
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

  .diag-table-bars {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.625rem;
  }

  .diag-table-row {
    display: flex;
    flex-direction: column;
    gap: 0.1875rem;
  }

  .diag-table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .diag-table-name {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text);
    font-family: var(--font-mono);
  }

  .diag-table-pct {
    font-size: 0.625rem;
    font-weight: 600;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .diag-progress-bar {
    height: 4px;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }

  .diag-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
    border-radius: 2px;
    transition: width 600ms var(--ease-out);
  }

  .diag-cycles {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .diag-cycle-item {
    padding: 0.5rem 0.75rem;
    background: var(--color-bg);
    border-left: 2px solid var(--color-primary-subtle);
    border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  }

  .diag-cycle-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.1875rem;
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
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .diag-cycle-stats {
    display: flex;
    gap: 0.625rem;
    font-size: 0.625rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .diag-error-banner {
    padding: 0.625rem 0.875rem;
    background: color-mix(in srgb, var(--color-red) 8%, var(--color-bg));
    border: 1px solid color-mix(in srgb, var(--color-red) 20%, transparent);
    border-radius: var(--radius-xs);
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-red);
    margin-bottom: 0.375rem;
    font-family: var(--font-mono);
  }

  .diag-error-item {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.375rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-red) 10%, transparent);
  }

  .diag-error-item:last-child {
    border-bottom: none;
  }

  .diag-error-table {
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--color-red);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: var(--font-mono);
  }

  .diag-error-msg {
    font-size: 0.6875rem;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .diag-footer {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 1rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.625rem;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    font-family: var(--font-mono);
  }

  .diag-footer-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--color-primary-subtle);
    animation: footerTick 2.5s ease-in-out infinite;
  }

  @keyframes footerTick {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     DEMO TOAST
     ═══════════════════════════════════════════════════════════════════════════════════ */

  .demo-toast {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9500;
    padding: 1rem 2rem;
    background: color-mix(in srgb, var(--color-primary) 90%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-xl);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    color: #fff;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    text-align: center;
    box-shadow: var(--shadow-xl);
    animation: demoToastIn 0.3s var(--ease-out);
    pointer-events: none;
  }

  @keyframes demoToastIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 480px) {
    .notebook-page {
      padding: var(--space-4) var(--space-3);
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .digit-input {
      width: 40px;
      height: 48px;
      font-size: 1.1875rem;
    }

    .diag-stat-value {
      font-size: 0.875rem;
    }

    .diag-grid-2 {
      grid-template-columns: 1fr;
    }

    .diag-cycle-stats {
      flex-wrap: wrap;
    }

    .diag-table-tag {
      font-size: 0.5625rem;
    }

    .diag-appendix {
      background-size: 16px 16px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .section-enter {
      animation: none;
    }
    .diag-status-dot,
    .diag-footer-dot {
      animation: none;
    }
    .diag-progress-fill {
      transition: none;
    }
  }
</style>
