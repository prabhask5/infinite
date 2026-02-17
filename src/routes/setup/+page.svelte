<!--
  @fileoverview Five-step Supabase configuration wizard.

  Guides the user through entering Supabase credentials, validating them
  against the server, optionally deploying environment variables to Vercel,
  and reloading the app with the new config active.
-->
<script lang="ts">
  /**
   * @fileoverview Setup wizard page — first-time Supabase configuration.
   *
   * Guides the user through a five-step process to connect their own
   * Supabase backend to Infinite Notes:
   *
   * 1. Create a Supabase project (instructions only).
   * 2. Configure authentication (enable anonymous sign-ins).
   * 3. Initialize the database by running the schema SQL.
   * 4. Enter and validate Supabase credentials (URL + publishable key).
   * 5. Persist configuration via Vercel API (set env vars + redeploy).
   *
   * After a successful deploy the page polls for a new service-worker
   * version — once detected the user is prompted to refresh.
   *
   * Access is controlled by the companion `+page.ts` load function:
   * - Unconfigured → anyone can reach this page (`isFirstSetup: true`).
   * - Configured → authenticated users only (`isFirstSetup: false`).
   */

  import { page } from '$app/stores';
  import { setConfig } from 'stellar-drive/config';
  import { isOnline } from 'stellar-drive/stores';
  import { pollForNewServiceWorker } from 'stellar-drive/kit';
  import { debug } from 'stellar-drive/utils';

  // =============================================================================
  //  Form State — Supabase + Vercel credentials
  // =============================================================================

  /** Supabase project URL entered by the user */
  let supabaseUrl = $state('');

  /** Supabase publishable key entered by the user */
  let supabasePublishableKey = $state('');

  /** One-time Vercel API token for setting env vars */
  let vercelToken = $state('');

  // =============================================================================
  //  UI State — Validation & Deployment feedback
  // =============================================================================

  /** Whether the "Test Connection" request is in-flight */
  let validating = $state(false);

  /** Current wizard step (1–5) */
  let currentStep = $state(1);

  /** Whether the deploy/redeploy flow is in-flight */
  let deploying = $state(false);

  /** Error from credential validation, if any */
  let validateError = $state<string | null>(null);

  /** `true` after credentials have been successfully validated */
  let validateSuccess = $state(false);

  /** Error from the deployment step, if any */
  let deployError = $state<string | null>(null);

  /** Current deployment pipeline stage — drives the progress UI */
  let deployStage = $state<'idle' | 'setting-env' | 'deploying' | 'ready'>('idle');

  /** URL returned by Vercel for the triggered deployment (informational) */
  let _deploymentUrl = $state('');

  // =============================================================================
  //  Derived State
  // =============================================================================

  /** Whether this is a first-time setup (public) or reconfiguration */
  const isFirstSetup = $derived(($page.data as { isFirstSetup?: boolean }).isFirstSetup ?? false);

  /**
   * Snapshot of the credentials at validation time — used to detect
   * if the user edits the inputs *after* a successful validation.
   */
  let validatedUrl = $state('');
  let validatedKey = $state('');

  /**
   * `true` when the user changes credentials after a successful
   * validation — the "Continue" button should be re-disabled.
   */
  const credentialsChanged = $derived(
    validateSuccess && (supabaseUrl !== validatedUrl || supabasePublishableKey !== validatedKey)
  );

  // =============================================================================
  //  Effects
  // =============================================================================

  /**
   * Auto-reset validation state when the user modifies credentials
   * after they were already validated — forces re-validation.
   */
  $effect(() => {
    if (credentialsChanged) {
      validateSuccess = false;
      validateError = null;
    }
  });

  // =============================================================================
  //  Validation — "Test Connection"
  // =============================================================================

  /**
   * Send the entered Supabase credentials to `/api/setup/validate`
   * and update UI state based on the result. On success, also
   * cache the config locally via `setConfig` so the app is usable
   * immediately after the deployment finishes.
   */
  async function handleValidate() {
    debug('log', '[Setup] Validating Supabase credentials');
    validateError = null;
    validateSuccess = false;
    validating = true;

    try {
      const res = await fetch('/api/setup/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabasePublishableKey })
      });

      const data = await res.json();

      if (data.valid) {
        validateSuccess = true;
        validatedUrl = supabaseUrl;
        validatedKey = supabasePublishableKey;
        /* Cache config locally so the app works immediately after deploy */
        setConfig({
          supabaseUrl,
          supabasePublishableKey,
          configured: true
        });
      } else {
        validateError = data.error || 'Validation failed';
      }
    } catch (e) {
      validateError = e instanceof Error ? e.message : 'Network error';
    }

    validating = false;
  }

  // =============================================================================
  //  Deployment Polling
  // =============================================================================

  /**
   * Poll for a new service-worker version to detect when the Vercel
   * redeployment has finished. Uses the engine's `pollForNewServiceWorker`
   * helper which checks `registration.update()` at regular intervals.
   *
   * Resolves a Promise when a new SW is detected in the waiting state.
   */
  function pollForDeployment(): Promise<void> {
    return new Promise((resolve) => {
      pollForNewServiceWorker({
        intervalMs: 3000,
        maxAttempts: 200,
        onFound: () => {
          deployStage = 'ready';
          resolve();
        }
      });
    });
  }

  // =============================================================================
  //  Deployment — Set env vars + trigger Vercel redeploy
  // =============================================================================

  /**
   * Send credentials and the Vercel token to `/api/setup/deploy`,
   * which sets the environment variables on the Vercel project and
   * triggers a fresh deployment. Then poll until the new build is live.
   */
  async function handleDeploy() {
    debug('log', '[Setup] Starting deployment to Vercel');
    deployError = null;
    deploying = true;
    deployStage = 'setting-env';

    try {
      const res = await fetch('/api/setup/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl, supabasePublishableKey, vercelToken })
      });

      const data = await res.json();

      if (data.success) {
        deployStage = 'deploying';
        _deploymentUrl = data.deploymentUrl || '';
        /* Poll for the new SW version → marks `deployStage = 'ready'` */
        await pollForDeployment();
      } else {
        deployError = data.error || 'Deployment failed';
        deployStage = 'idle';
      }
    } catch (e) {
      deployError = e instanceof Error ? e.message : 'Network error';
      deployStage = 'idle';
    }

    deploying = false;
  }
</script>

<svelte:head>
  <title>Setup - Infinite Notes</title>
</svelte:head>

<!-- ═══ Setup Wizard ═══ -->
<div class="setup-page">
  <div class="setup-container">
    <!-- ═══ Header ═══ -->
    <h1 class="setup-title">Set Up Infinite Notes</h1>
    <p class="setup-subtitle">Connect your own Supabase backend in five quick steps.</p>

    <!-- ═══ Step Indicator ═══ -->
    <div class="step-indicator">
      {#each [1, 2, 3, 4, 5] as step (step)}
        <div
          class="step-dot"
          class:active={currentStep === step}
          class:completed={currentStep > step}
        >
          {#if currentStep > step}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
            >
          {:else}
            {step}
          {/if}
        </div>
        {#if step < 5}
          <div class="step-line" class:completed={currentStep > step}></div>
        {/if}
      {/each}
    </div>

    <!-- ═══ Offline Warning ═══ -->
    {#if !$isOnline}
      <div class="message error">
        You are currently offline. Setup requires an internet connection to validate credentials and
        deploy configuration.
      </div>
    {/if}

    <!-- ═══ Step Card ═══ -->
    <div class="step-card card">
      <!-- ─── Step 1: Create a Supabase Project ─── -->
      {#if currentStep === 1}
        <h2>Create a Supabase Project</h2>
        <p>
          Infinite Notes stores data in your own Supabase project. Create one if you don't have one
          already &mdash; the free tier is more than enough.
        </p>
        <ol class="instruction-list">
          <li>
            Go to
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
              supabase.com/dashboard
            </a>
            and sign in (or create an account)
          </li>
          <li>
            Click <strong>New Project</strong>, pick a name, set a database password, and choose a
            region close to you
          </li>
          <li>Wait for provisioning to finish (about 30 seconds)</li>
        </ol>

        <!-- ─── Step 2: Configure Authentication ─── -->
      {:else if currentStep === 2}
        <h2>Enable Anonymous Sign-ins</h2>
        <p>
          Infinite Notes uses anonymous sessions so users can start taking notes immediately without
          creating an account.
        </p>
        <ol class="instruction-list">
          <li>In your Supabase dashboard, go to <strong>Authentication &gt; Providers</strong></li>
          <li>Find <strong>Anonymous Sign-ins</strong> and toggle it <strong>on</strong></li>
          <li>Click <strong>Save</strong></li>
        </ol>
        <div class="info-note">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line
              x1="12"
              y1="8"
              x2="12.01"
              y2="8"
            /></svg
          >
          <span
            >For production use, configure a custom SMTP provider in Authentication &gt; Settings.
            Supabase's built-in email service is limited to 2 emails per hour.</span
          >
        </div>

        <!-- ─── Step 3: Initialize Database ─── -->
      {:else if currentStep === 3}
        <h2>Initialize the Database</h2>
        <p>
          The required tables and RLS policies are created automatically when the app connects to
          your Supabase project for the first time. No manual SQL is needed.
        </p>
        <div class="info-note">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line
              x1="12"
              y1="8"
              x2="12.01"
              y2="8"
            /></svg
          >
          <span
            >If you need to run the schema manually, you can find <code>supabase-schema.sql</code> in
            the repository root.</span
          >
        </div>

        <!-- ─── Step 4: Enter Credentials ─── -->
      {:else if currentStep === 4}
        <h2>Connect Your Supabase Project</h2>
        <p>
          Find these values in your Supabase dashboard under <strong>Settings &gt; API</strong>.
        </p>

        <div class="form-group">
          <label for="supabaseUrl">Supabase URL</label>
          <input
            type="url"
            id="supabaseUrl"
            bind:value={supabaseUrl}
            placeholder="https://your-project.supabase.co"
            disabled={deploying || deployStage === 'ready'}
          />
        </div>

        <div class="form-group">
          <label for="supabasePublishableKey">Supabase Publishable Key</label>
          <input
            type="text"
            id="supabasePublishableKey"
            bind:value={supabasePublishableKey}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            disabled={deploying || deployStage === 'ready'}
          />
          <span class="input-hint"
            >This is your public (anon) key. Row-Level Security policies enforce access control.</span
          >
        </div>

        <!-- Validation feedback -->
        {#if validateError}
          <div class="message error">{validateError}</div>
        {/if}
        {#if validateSuccess && !credentialsChanged}
          <div class="message success">Credentials validated successfully.</div>
        {/if}

        <!-- Test Connection button -->
        <button
          class="btn btn-secondary"
          onclick={handleValidate}
          disabled={!supabaseUrl ||
            !supabasePublishableKey ||
            validating ||
            deploying ||
            deployStage === 'ready'}
        >
          {#if validating}
            <span class="loading-spinner"></span>
            Validating...
          {:else}
            Test Connection
          {/if}
        </button>

        <!-- ─── Step 5: Deploy ─── -->
      {:else}
        <h2>Deploy to Vercel</h2>

        {#if isFirstSetup}
          <p>
            To persist your Supabase credentials across deployments, Infinite Notes needs a one-time
            Vercel API token to set environment variables and trigger a redeploy.
          </p>

          <ol class="instruction-list">
            <li>
              Go to
              <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener noreferrer">
                Vercel Settings &gt; Tokens
              </a>
            </li>
            <li>Create a token with a descriptive name (e.g., "Infinite Notes Setup")</li>
            <li>Copy the token and paste it below</li>
          </ol>

          <div class="info-note">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line
                x1="12"
                y1="8"
                x2="12.01"
                y2="8"
              /></svg
            >
            <span
              >This token is used once to set environment variables and trigger a redeployment. It
              is not stored.</span
            >
          </div>

          <div class="form-group">
            <label for="vercelToken">Vercel API Token</label>
            <input
              type="password"
              id="vercelToken"
              bind:value={vercelToken}
              placeholder="Enter your Vercel token"
              disabled={deploying || deployStage === 'ready'}
            />
          </div>

          <!-- Deploy error -->
          {#if deployError}
            <div class="message error">{deployError}</div>
          {/if}

          <!-- Deploy button -->
          {#if deployStage === 'idle'}
            <button
              class="btn btn-primary"
              onclick={handleDeploy}
              disabled={!validateSuccess || credentialsChanged || !vercelToken || deploying}
            >
              Deploy
            </button>
          {/if}

          <!-- Deployment progress stages -->
          {#if deployStage !== 'idle'}
            <div class="deploy-stages">
              <div
                class="deploy-stage"
                class:active={deployStage === 'setting-env'}
                class:complete={deployStage === 'deploying' || deployStage === 'ready'}
              >
                {#if deployStage === 'setting-env'}
                  <span class="loading-spinner small"></span>
                {:else}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                  >
                {/if}
                <span>Setting environment variables...</span>
              </div>

              <div
                class="deploy-stage"
                class:active={deployStage === 'deploying'}
                class:complete={deployStage === 'ready'}
              >
                {#if deployStage === 'deploying'}
                  <span class="loading-spinner small"></span>
                {:else if deployStage === 'ready'}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                  >
                {:else}
                  <span class="stage-dot"></span>
                {/if}
                <span>Deploying... (this may take a minute)</span>
              </div>

              <div class="deploy-stage" class:active={deployStage === 'ready'}>
                {#if deployStage === 'ready'}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                  >
                {:else}
                  <span class="stage-dot"></span>
                {/if}
                <span>Ready</span>
              </div>
            </div>

            {#if deployStage === 'ready'}
              <div class="message success">
                Your Infinite Notes instance is configured and the new deployment is live.
              </div>
              <button class="btn btn-primary" onclick={() => location.reload()}>
                Refresh to Complete Setup
              </button>
            {/if}
          {/if}
        {:else}
          <!-- Reconfiguration mode (not first setup) -->
          <p>Your Supabase credentials have been saved locally.</p>
          <div class="message success">Configuration saved successfully.</div>
          <a href="/" class="btn btn-primary" style="text-decoration: none; text-align: center;"
            >Done</a
          >
        {/if}
      {/if}
    </div>

    <!-- ═══ Step Navigation ═══ -->
    <div class="step-nav">
      {#if currentStep > 1}
        <button
          class="btn btn-secondary"
          onclick={() => currentStep--}
          disabled={deploying || deployStage === 'ready'}
        >
          Back
        </button>
      {:else}
        <div></div>
      {/if}

      {#if currentStep < 4}
        <button class="btn btn-primary" onclick={() => currentStep++}> Continue </button>
      {:else if currentStep === 4}
        <button
          class="btn btn-primary"
          onclick={() => currentStep++}
          disabled={!validateSuccess || credentialsChanged}
        >
          Continue
        </button>
      {/if}
    </div>

    <!-- ═══ Security notice (first-time setup) ═══ -->
    {#if isFirstSetup}
      <div class="security-notice">
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
          <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span
          >This page is publicly accessible until setup is complete. Afterward, only authenticated
          users can reconfigure.</span
        >
      </div>
    {/if}
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════════════════
     SETUP PAGE — Centered layout
     ═══════════════════════════════════════════════════════════════════════════════ */

  .setup-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    background: var(--gradient-surface);
  }

  .setup-container {
    max-width: 560px;
    width: 100%;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     HEADER — Title + subtitle
     ═══════════════════════════════════════════════════════════════════════════════ */

  .setup-title {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    text-align: center;
    margin: 0 0 0.25rem;
  }

  .setup-subtitle {
    font-size: 0.9375rem;
    color: var(--color-text-muted);
    text-align: center;
    margin: 0 0 1.5rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP INDICATOR — Horizontal dot + line progress
     ═══════════════════════════════════════════════════════════════════════════════ */

  .step-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .step-dot {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8125rem;
    font-weight: 600;
    border: 2px solid var(--color-border-strong);
    color: var(--color-text-muted);
    background: var(--color-bg);
    transition: all var(--duration-fast) var(--ease-out);
    flex-shrink: 0;
  }

  .step-dot.active {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-subtle);
    box-shadow: 0 0 0 3px var(--color-primary-glow);
  }

  .step-dot.completed {
    border-color: var(--color-green);
    background: var(--color-green);
    color: white;
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: var(--color-border-strong);
    transition: background var(--duration-fast) var(--ease-out);
  }

  .step-line.completed {
    background: var(--color-green);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP CARD — White letter-block card for wizard content
     ═══════════════════════════════════════════════════════════════════════════════ */

  .step-card {
    padding: 2rem;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    position: relative;
  }

  .step-card h2 {
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text);
    margin: 0 0 0.5rem;
  }

  .step-card p {
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0 0 1rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     STEP NAVIGATION — Back / Continue buttons
     ═══════════════════════════════════════════════════════════════════════════════ */

  .step-nav {
    display: flex;
    justify-content: space-between;
    margin-top: 1rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     INSTRUCTION LIST
     ═══════════════════════════════════════════════════════════════════════════════ */

  .instruction-list {
    text-align: left;
    padding-left: 1.25rem;
    margin: 0 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9375rem;
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .instruction-list li::marker {
    color: var(--color-primary);
    font-weight: 600;
  }

  .instruction-list a {
    color: var(--color-primary);
    text-decoration: none;
    border-bottom: 1px solid var(--color-primary-glow);
    transition: border-color var(--duration-fast) var(--ease-out);
  }

  .instruction-list a:hover {
    border-bottom-color: var(--color-primary);
  }

  .instruction-list strong {
    color: var(--color-text);
    font-weight: 600;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     INFO NOTE — Callout box
     ═══════════════════════════════════════════════════════════════════════════════ */

  .info-note {
    display: flex;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    background: var(--color-primary-subtle);
    border: 1px solid rgba(79, 70, 229, 0.15);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }

  .info-note svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--color-primary);
  }

  .info-note code {
    background: var(--color-primary-subtle);
    padding: 0.0625rem 0.25rem;
    border-radius: var(--radius-xs);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-primary);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     FORM STYLES
     ═══════════════════════════════════════════════════════════════════════════════ */

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-muted);
    margin-bottom: 0.375rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem 1rem;
    font-size: 0.9375rem;
    color: var(--color-text);
    background: var(--color-bg);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-family: inherit;
    transition: all var(--duration-fast) var(--ease-out);
    box-shadow: var(--shadow-sm);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--glow-primary), var(--shadow-sm);
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: var(--color-bg-tertiary);
  }

  .form-group input::placeholder {
    color: var(--color-text-muted);
    opacity: 0.6;
  }

  .input-hint {
    display: block;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
    line-height: 1.4;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     MESSAGES — Error and success feedback
     ═══════════════════════════════════════════════════════════════════════════════ */

  .message {
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  .error {
    background: rgba(239, 68, 68, 0.08);
    color: var(--color-red);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .success {
    background: var(--color-success-subtle);
    color: var(--color-success-dark);
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     BUTTONS
     ═══════════════════════════════════════════════════════════════════════════════ */

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 600;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: none;
    font-family: inherit;
    transition:
      transform var(--duration-fast) var(--ease-spring),
      box-shadow var(--duration-fast) var(--ease-out),
      background var(--duration-fast) var(--ease-out);
  }

  .btn-primary {
    background: var(--gradient-primary);
    color: white;
    box-shadow: var(--shadow-sm);
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-secondary {
    background: var(--color-primary-subtle);
    color: var(--color-primary);
    border: 1px solid rgba(79, 70, 229, 0.2);
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(79, 70, 229, 0.12);
    border-color: rgba(79, 70, 229, 0.35);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     LOADING SPINNER
     ═══════════════════════════════════════════════════════════════════════════════ */

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(79, 70, 229, 0.2);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-spinner.small {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     DEPLOY STAGES — Progress pipeline
     ═══════════════════════════════════════════════════════════════════════════════ */

  .deploy-stages {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .deploy-stage {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    font-size: 0.875rem;
    color: var(--color-text-muted);
    transition: all var(--duration-fast) var(--ease-out);
  }

  .deploy-stage.active {
    background: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .deploy-stage.complete {
    color: var(--color-success);
  }

  .stage-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-border-strong);
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     SECURITY NOTICE — Bottom warning for first-time setup
     ═══════════════════════════════════════════════════════════════════════════════ */

  .security-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    color: var(--color-orange);
    line-height: 1.5;
  }

  .security-notice svg {
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     RESPONSIVE — Mobile breakpoints
     ═══════════════════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .setup-page {
      padding: 1.5rem 0.75rem;
      align-items: flex-start;
    }

    .setup-title {
      font-size: 1.375rem;
    }

    .step-card {
      padding: 1.5rem 1.25rem;
    }

    .step-card h2 {
      font-size: 1.125rem;
    }

    .form-group input {
      font-size: 16px; /* Prevents iOS zoom */
    }
  }

  @media (max-width: 375px) {
    .setup-page {
      padding: 1rem 0.5rem;
    }

    .step-card {
      padding: 1.25rem 1rem;
    }

    .step-dot {
      width: 28px;
      height: 28px;
      font-size: 0.75rem;
    }

    .step-line {
      width: 28px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     DARK MODE
     ═══════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-color-scheme: dark) {
    .step-card {
      background: var(--color-bg-secondary);
      border-color: var(--color-border);
    }

    .form-group input {
      background: var(--color-bg);
      border-color: var(--color-border);
    }

    .success {
      color: var(--color-success-light);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .loading-spinner {
      animation: none;
    }

    .btn {
      transition: none;
    }
  }
</style>
