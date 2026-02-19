<!--
  @fileoverview Root layout component — app shell, auth hydration,
  navigation chrome, overlays, and PWA lifecycle.

  This is the outermost Svelte component. It wraps every page and is
  responsible for hydrating auth state from the load function, rendering
  the navigation bar / tab bar, and mounting global overlays like the
  service-worker update prompt.
-->
<script lang="ts">
  /**
   * @fileoverview Root layout script — auth state management, navigation logic,
   * service worker communication, and global event handlers.
   */

  // =============================================================================
  //  Imports
  // =============================================================================

  /* ── Svelte Lifecycle & Transitions ── */
  import { onMount, onDestroy } from 'svelte';

  /* ── SvelteKit Utilities ── */
  import { page } from '$app/stores';
  import { browser } from '$app/environment';

  /* ── Global Styles ── */
  import '../app.css';

  /* ── Svelte Transitions ── */
  import { fade } from 'svelte/transition';

  /* ── Stellar Engine — Auth & Stores ── */
  import { lockSingleUser, resolveFirstName, resolveAvatarInitial } from 'stellar-drive/auth';
  import { authState, hasHydrated, wasDbReset } from 'stellar-drive/stores';
  import { debug } from 'stellar-drive/utils';
  import { hydrateAuthState } from 'stellar-drive/kit';

  /* ── Components ── */
  import DemoBanner from 'stellar-drive/components/DemoBanner';
  import SyncStatus from 'stellar-drive/components/SyncStatus';
  import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';

  /* ── Types ── */
  import type { LayoutData } from './+layout';

  // =============================================================================
  //  Props
  // =============================================================================

  interface Props {
    /** Default slot content — the matched page component. */
    children?: import('svelte').Snippet;

    /** Layout data from `+layout.ts` — session, auth mode, offline profile. */
    data: LayoutData;
  }

  let { children, data }: Props = $props();

  // =============================================================================
  //  Component State
  // =============================================================================

  /* ── Toast Notification ── */
  /** Whether the toast notification is currently visible. */
  let showToast = $state(false);

  /** The text content of the current toast notification. */
  let toastMessage = $state('');

  /** The visual style of the toast — `'info'` (purple) or `'error'` (pink). */
  let toastType = $state<'info' | 'error'>('info');

  /* ── Sign-Out ── */
  /** When `true`, a full-screen overlay is shown to mask the sign-out transition. */
  let isSigningOut = $state(false);

  /* ── Sidebar ── */
  /** Sidebar open state for mobile drawer. */
  let sidebarOpen = $state(false);

  /* ── Cleanup References ── */
  /** Stored reference to the chunk error handler so we can remove it on destroy. */
  let chunkErrorHandler: ((event: PromiseRejectionEvent) => void) | null = null;

  // =============================================================================
  //  Derived State
  // =============================================================================

  /** User's first name for the sidebar greeting. */
  const firstName = $derived(resolveFirstName($authState.session, $authState.offlineProfile));

  /** Single uppercase initial for avatar circles. */
  const avatarInitial = $derived(
    resolveAvatarInitial($authState.session, $authState.offlineProfile)
  );

  /**
   * Derived booleans for determining navigation visibility.
   * Auth pages (login, setup, confirm, demo, policy) hide the sidebar entirely.
   */
  const isOnLoginPage = $derived($page.url.pathname === '/login');
  const isOnSetupPage = $derived($page.url.pathname === '/setup');
  const isOnConfirmPage = $derived($page.url.pathname === '/confirm');
  const isOnDemoPage = $derived($page.url.pathname === '/demo');
  const isOnPolicyPage = $derived($page.url.pathname === '/policy');
  const isAuthPage = $derived(
    isOnLoginPage || isOnSetupPage || isOnConfirmPage || isOnDemoPage || isOnPolicyPage
  );
  const isAuthenticated = $derived(data.authMode !== 'none' && !isAuthPage);

  // =============================================================================
  //  Reactive Effects
  // =============================================================================

  /**
   * Effect: hydrate the global `authState` store from layout load data.
   *
   * Runs whenever `data` changes (e.g. after navigation or revalidation).
   * Maps the three possible auth modes to the corresponding store setter:
   * - `'supabase'` + session → `setSupabaseAuth`
   * - `'offline'` + cached profile → `setOfflineAuth`
   * - anything else → `setNoAuth`
   */
  $effect(() => {
    debug('log', '[Layout] Hydrating auth state:', data.authMode);
    hydrateAuthState(data);
  });

  // =============================================================================
  //  Lifecycle — Mount
  // =============================================================================

  onMount(() => {
    // ── Chunk Error Handler ────────────────────────────────────────────────
    // When navigating offline to a page whose JS chunks aren't cached,
    // the dynamic import fails and shows a cryptic error. Catch and show a friendly message.
    chunkErrorHandler = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      // Check if this is a chunk loading error (fetch failed or syntax error from 503 response)
      const isChunkError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('error loading dynamically imported module') ||
        error?.message?.includes('Importing a module script failed') ||
        error?.name === 'ChunkLoadError' ||
        (error?.message?.includes('Loading chunk') && error?.message?.includes('failed'));

      if (isChunkError && !navigator.onLine) {
        event.preventDefault(); // Prevent default error handling
        // Show offline navigation toast
        toastMessage = "This page isn't available offline. Please reconnect or go back.";
        toastType = 'info';
        showToast = true;
        setTimeout(() => {
          showToast = false;
        }, 5000);
      }
    };

    window.addEventListener('unhandledrejection', chunkErrorHandler);

    // ── Sign-Out Event Listener ───────────────────────────────────────────
    // Listen for sign out requests from child pages (e.g. mobile profile page)
    window.addEventListener('infinite:signout', handleSignOut);

    // ── Service Worker — Background Precaching ────────────────────────────
    // Proactively cache all app chunks for full offline support.
    // This runs in the background after page load, so it doesn't affect Lighthouse scores.
    if ('serviceWorker' in navigator) {
      // Listen for precache completion messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'PRECACHE_COMPLETE') {
          const { cached, total } = event.data;
          debug('log', `[PWA] Background precaching complete: ${cached}/${total} assets cached`);
          if (cached === total) {
            debug('log', '[PWA] Full offline support ready - all pages accessible offline');
          } else {
            debug('warn', `[PWA] Some assets failed to cache: ${total - cached} missing`);
          }
        }
      });

      // Wait for service worker to be ready (handles first load case)
      navigator.serviceWorker.ready.then((registration) => {
        debug('log', '[PWA] Service worker ready, scheduling background precache...');

        // Give the page time to fully load, then trigger background precaching
        setTimeout(() => {
          const controller = navigator.serviceWorker.controller || registration.active;
          if (!controller) {
            debug('warn', '[PWA] No service worker controller available');
            return;
          }

          // First, cache current page's assets (scripts + stylesheets)
          const scripts = Array.from(document.querySelectorAll('script[src]'))
            .map((el) => (el as HTMLScriptElement).src)
            .filter((src) => src.startsWith(location.origin));

          const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .map((el) => (el as HTMLLinkElement).href)
            .filter((href) => href.startsWith(location.origin));

          const urls = [...scripts, ...styles];

          if (urls.length > 0) {
            debug('log', `[PWA] Caching ${urls.length} current page assets...`);
            controller.postMessage({
              type: 'CACHE_URLS',
              urls
            });
          }

          // Then trigger full background precaching for all app chunks.
          // This ensures offline support for all pages, not just visited ones.
          debug('log', '[PWA] Triggering background precache of all app chunks...');
          controller.postMessage({
            type: 'PRECACHE_ALL'
          });
        }, 500); // Cache assets quickly to reduce window for uncached refreshes
      });
    }
  });

  // =============================================================================
  //  Lifecycle — Destroy
  // =============================================================================

  onDestroy(() => {
    if (browser) {
      // Cleanup chunk error handler
      if (chunkErrorHandler) {
        window.removeEventListener('unhandledrejection', chunkErrorHandler);
      }
      // Cleanup sign out listener
      window.removeEventListener('infinite:signout', handleSignOut);
    }
  });

  // =============================================================================
  //  Event Handlers
  // =============================================================================

  /**
   * Handles the sign-out flow with a visual transition.
   *
   * 1. Shows a full-screen "Locking..." overlay immediately.
   * 2. Waits 250ms for the overlay fade-in to complete.
   * 3. Calls `lockSingleUser()` to stop the engine and clear the session
   *    (but NOT destroy user data).
   * 4. Hard-navigates to `/login` (full page reload to reset all state).
   */
  async function handleSignOut() {
    debug('log', '[Layout] Sign-out initiated');
    // Show full-screen overlay immediately
    isSigningOut = true;

    // Wait for overlay to fully appear
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Lock the single-user session (stops engine, resets auth state, does NOT destroy data)
    await lockSingleUser();

    // Navigate to login
    window.location.href = '/login';
  }

  /**
   * Checks whether a given route `href` matches the current page path.
   * Used to highlight the active nav item.
   *
   * @param href - The route path to check (e.g. `'/agenda'`)
   * @returns `true` if the current path starts with `href`
   */
  function isActive(href: string): boolean {
    return $page.url.pathname.startsWith(href);
  }

  /**
   * Dismisses the currently visible toast notification.
   */
  function dismissToast() {
    showToast = false;
  }

  /**
   * Toggles the mobile sidebar drawer open/closed.
   */
  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    debug('log', '[Layout] Sidebar toggled:', sidebarOpen ? 'open' : 'closed');
  }

  /**
   * Closes the mobile sidebar drawer.
   */
  function closeSidebar() {
    sidebarOpen = false;
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Sign-Out Overlay — full-screen transition during lock
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if isSigningOut}
  <div class="signout-overlay" transition:fade={{ duration: 200 }}>
    <div class="signout-content">
      <div class="signout-icon">
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
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <p class="signout-text">Locking...</p>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     Loading Overlay — prevents flash during initial auth check
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if ($authState.isLoading || (wasDbReset() && !hasHydrated())) && !isAuthPage}
  <div class="loading-overlay">
    <!-- Subtle paper grain texture -->
    <div class="loader-grain" aria-hidden="true"></div>

    <div class="loader-scene">
      <!-- Ink drop that blooms into a ring -->
      <div class="ink-bloom" aria-hidden="true">
        <div class="ink-ring ink-ring-1"></div>
        <div class="ink-ring ink-ring-2"></div>
        <div class="ink-dot"></div>
      </div>

      <!-- Pen nib writing a line -->
      <div class="pen-line" aria-hidden="true">
        <div class="pen-nib-wrapper">
          <svg
            class="pen-nib"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </div>
        <div class="ink-trail"></div>
      </div>

      <!-- Brand text fades in below -->
      <p class="loader-brand" aria-label="Loading Infinite Notes" role="status">
        <span class="brand-letter" style="--i:0">I</span><span class="brand-letter" style="--i:1"
          >n</span
        ><span class="brand-letter" style="--i:2">f</span><span class="brand-letter" style="--i:3"
          >i</span
        ><span class="brand-letter" style="--i:4">n</span><span class="brand-letter" style="--i:5"
          >i</span
        ><span class="brand-letter" style="--i:6">t</span><span class="brand-letter" style="--i:7"
          >e</span
        >
      </p>
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     Toast Notification — fixed position for offline errors, etc.
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if showToast}
  <div class="toast toast-{toastType}" transition:fade={{ duration: 200 }}>
    <span>{toastMessage}</span>
    <button class="toast-dismiss" onclick={dismissToast} aria-label="Dismiss notification"
      >&times;</button
    >
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     Desktop Sidebar (visible >= 768px) — Notion-style collapsed rail
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if isAuthenticated}
  <aside class="sidebar">
    <div class="sidebar-inner">
      <!-- Brand -->
      <a href="/" class="sidebar-brand">
        <div class="sidebar-logo">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-primary)"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            <path d="M8 7h6" />
            <path d="M8 11h8" />
          </svg>
        </div>
        <span class="sidebar-brand-text">Infinite</span>
      </a>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <a href="/" class="sidebar-nav-item" class:active={$page.url.pathname === '/'}>
          <span class="sidebar-nav-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
          <span class="sidebar-nav-label">Home</span>
        </a>
        <a href="/notes" class="sidebar-nav-item" class:active={isActive('/notes')}>
          <span class="sidebar-nav-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </span>
          <span class="sidebar-nav-label">Notes</span>
        </a>
      </nav>

      <!-- Spacer -->
      <div class="sidebar-spacer"></div>

      <!-- Footer -->
      <div class="sidebar-footer">
        <a href="/profile" class="sidebar-profile">
          <span class="sidebar-avatar">{avatarInitial}</span>
          <span class="sidebar-greeting">Hey, {firstName}!</span>
        </a>
        <button class="sidebar-signout" onclick={handleSignOut} aria-label="Sign out">
          <span class="sidebar-signout-icon">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span class="sidebar-signout-label">Sign out</span>
        </button>
      </div>
    </div>
  </aside>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     Mobile Header + Drawer (visible < 768px)
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if isAuthenticated}
  <header class="mobile-header">
    <button class="mobile-hamburger" onclick={toggleSidebar} aria-label="Open navigation">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
    <span class="mobile-brand">Infinite</span>
    <div class="mobile-sync">
      <SyncStatus />
    </div>
  </header>

  <!-- Mobile Drawer Backdrop -->
  {#if sidebarOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="drawer-backdrop"
      transition:fade={{ duration: 200 }}
      onclick={closeSidebar}
      onkeydown={closeSidebar}
    ></div>
  {/if}

  <!-- Mobile Drawer -->
  <aside class="mobile-drawer" class:open={sidebarOpen}>
    <div class="drawer-header">
      <a href="/" class="drawer-brand" onclick={closeSidebar}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-primary)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          <path d="M8 7h6" />
          <path d="M8 11h8" />
        </svg>
        <span>Infinite</span>
      </a>
      <button class="drawer-close" onclick={closeSidebar} aria-label="Close navigation">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>

    <nav class="drawer-nav">
      <a
        href="/"
        class="drawer-nav-item"
        class:active={$page.url.pathname === '/'}
        onclick={closeSidebar}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>Home</span>
      </a>
      <a
        href="/notes"
        class="drawer-nav-item"
        class:active={isActive('/notes')}
        onclick={closeSidebar}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        <span>Notes</span>
      </a>
    </nav>

    <div class="drawer-spacer"></div>

    <div class="drawer-footer">
      <a href="/profile" class="drawer-profile" onclick={closeSidebar}>
        <span class="drawer-avatar">{avatarInitial}</span>
        <span>Hey, {firstName}!</span>
      </a>
      <button class="drawer-signout" onclick={handleSignOut}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>Sign out</span>
      </button>
    </div>
  </aside>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     Desktop Sync Status — fixed top-right indicator
     ═══════════════════════════════════════════════════════════════════════════ -->
{#if isAuthenticated}
  <div class="desktop-sync">
    <SyncStatus />
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════════
     Main Content Area — renders the matched page
     ═══════════════════════════════════════════════════════════════════════════ -->
<main class="main-content" class:no-sidebar={!isAuthenticated}>
  {@render children?.()}
</main>

<!-- ═══════════════════════════════════════════════════════════════════════════
     Global Components
     ═══════════════════════════════════════════════════════════════════════════ -->
<UpdatePrompt />
<DemoBanner />

<style>
  /* ═══════════════════════════════════════════════════════════════════════════
     SIGN-OUT OVERLAY
     ═══════════════════════════════════════════════════════════════════════════ */

  .signout-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
  }

  .signout-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .signout-icon {
    color: var(--color-primary);
    opacity: 0.8;
  }

  .signout-text {
    font-size: 1.125rem;
    font-weight: 500;
    color: var(--color-text-secondary);
    letter-spacing: 0.02em;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     LOADING OVERLAY — Ink Bloom Loader
     ═══════════════════════════════════════════════════════════════════════════ */

  .loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg);
    overflow: hidden;
  }

  /* Subtle paper grain texture overlay */
  .loader-grain {
    position: absolute;
    inset: 0;
    opacity: 0.035;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 200px;
    pointer-events: none;
  }

  /* Central scene container */
  .loader-scene {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    animation: sceneEntry 0.5s var(--ease-out) both;
  }

  @keyframes sceneEntry {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Ink Bloom — concentric rings expanding from a central dot ── */

  .ink-bloom {
    position: relative;
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ink-ring {
    position: absolute;
    border-radius: 50%;
    border: 1.5px solid var(--color-primary);
  }

  .ink-ring-1 {
    width: 100%;
    height: 100%;
    opacity: 0;
    animation: inkExpand 2.4s var(--ease-out) infinite;
  }

  .ink-ring-2 {
    width: 100%;
    height: 100%;
    opacity: 0;
    animation: inkExpand 2.4s var(--ease-out) 0.8s infinite;
  }

  @keyframes inkExpand {
    0% {
      transform: scale(0.3);
      opacity: 0.7;
    }
    60% {
      opacity: 0.15;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }

  /* Central ink dot — pulses gently */
  .ink-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-primary);
    box-shadow:
      0 0 16px var(--color-primary-glow),
      0 0 32px rgba(74, 125, 255, 0.15);
    animation: dotPulse 2.4s var(--ease-in-out) infinite;
    position: relative;
    z-index: 1;
  }

  @keyframes dotPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.9;
    }
    50% {
      transform: scale(1.3);
      opacity: 1;
    }
  }

  /* ── Pen Nib + Ink Trail — a pen writing a line ── */

  .pen-line {
    position: relative;
    width: 120px;
    height: 24px;
    display: flex;
    align-items: flex-end;
  }

  /* Wrapper positions the pen so its tip (bottom-left of SVG) aligns with the ink trail */
  .pen-nib-wrapper {
    position: absolute;
    left: 0;
    bottom: 0;
    animation: penMove 2.4s var(--ease-in-out) infinite;
    z-index: 2;
  }

  .pen-nib {
    display: block;
    color: var(--color-primary);
    filter: drop-shadow(0 0 6px var(--color-primary-glow));
  }

  @keyframes penMove {
    0% {
      left: 0;
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    70% {
      left: calc(100% - 2px);
      opacity: 1;
    }
    85% {
      opacity: 0;
    }
    100% {
      left: calc(100% - 2px);
      opacity: 0;
    }
  }

  /* The ink trail drawn behind the pen tip (bottom-left of SVG = ~1.5px from left) */
  .ink-trail {
    position: absolute;
    left: 1.5px;
    bottom: 0;
    height: 1.5px;
    background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
    border-radius: var(--radius-full);
    transform-origin: left center;
    animation: trailDraw 2.4s var(--ease-in-out) infinite;
  }

  @keyframes trailDraw {
    0% {
      width: 0;
      opacity: 0;
    }
    10% {
      opacity: 0.6;
    }
    70% {
      width: calc(100% - 2px);
      opacity: 0.6;
    }
    85% {
      width: calc(100% - 2px);
      opacity: 0;
    }
    100% {
      width: 0;
      opacity: 0;
    }
  }

  /* ── Brand Letters — stagger-typed "Infinite" ── */

  .loader-brand {
    display: flex;
    gap: 0;
    font-family: var(--font-display);
    font-size: 1.125rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    margin: 0;
    user-select: none;
  }

  .brand-letter {
    opacity: 0;
    transform: translateY(6px);
    animation: letterType 0.35s var(--ease-out) forwards;
    animation-delay: calc(0.6s + var(--i) * 0.07s);
  }

  @keyframes letterType {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* ── Reduced Motion ── */

  @media (prefers-reduced-motion: reduce) {
    .ink-ring-1,
    .ink-ring-2,
    .ink-dot,
    .pen-nib-wrapper,
    .ink-trail {
      animation: none;
    }

    .ink-ring-1 {
      opacity: 0.2;
      transform: scale(0.7);
    }

    .ink-ring-2 {
      opacity: 0.1;
      transform: scale(1);
    }

    .ink-dot {
      opacity: 1;
    }

    .pen-line {
      display: none;
    }

    .brand-letter {
      animation: none;
      opacity: 1;
      transform: none;
    }

    .loader-scene {
      animation: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TOAST NOTIFICATION
     ═══════════════════════════════════════════════════════════════════════════ */

  .toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-strong);
    box-shadow: var(--shadow-lg);
    font-size: 0.875rem;
    color: var(--color-text);
    max-width: calc(100vw - 32px);
  }

  .toast-info {
    border-left: 3px solid var(--color-primary);
  }

  .toast-error {
    border-left: 3px solid var(--color-red);
  }

  .toast-dismiss {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    color: var(--color-text-muted);
    padding: 0 0 0 4px;
    line-height: 1;
    flex-shrink: 0;
  }

  .toast-dismiss:hover {
    color: var(--color-text);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DESKTOP SIDEBAR — Notion-style collapsed rail
     ═══════════════════════════════════════════════════════════════════════════ */

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    height: 100vh;
    height: 100dvh;
    width: 64px;
    background: var(--color-bg-secondary);
    border-right: 1px solid var(--color-border);
    z-index: 100;
    overflow: hidden;
    transition: width 0.2s var(--ease-spring);
    display: none;
  }

  .sidebar:hover {
    width: 260px;
    box-shadow: var(--shadow-lg);
  }

  .sidebar-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 260px;
    padding: 16px 0;
  }

  /* ── Brand ── */
  .sidebar-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    text-decoration: none;
    color: var(--color-text);
    margin-bottom: 8px;
  }

  .sidebar-logo {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-brand-text {
    font-weight: 700;
    font-size: 1.125rem;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .sidebar:hover .sidebar-brand-text {
    opacity: 1;
  }

  /* ── Navigation Items ── */
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
    min-height: 44px;
  }

  .sidebar-nav-item:hover {
    background: var(--color-primary-subtle);
    color: var(--color-text);
  }

  .sidebar-nav-item.active {
    color: var(--color-primary);
    background: var(--color-primary-subtle);
  }

  .sidebar-nav-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-nav-label {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .sidebar:hover .sidebar-nav-label {
    opacity: 1;
  }

  /* ── Spacer ── */
  .sidebar-spacer {
    flex: 1;
  }

  /* ── Footer ── */
  .sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 0 8px;
  }

  .sidebar-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    transition: background var(--duration-fast) ease;
    min-height: 44px;
  }

  .sidebar-profile:hover {
    background: var(--color-primary-subtle);
    color: var(--color-text);
  }

  .sidebar-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--gradient-primary);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .sidebar-greeting {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .sidebar:hover .sidebar-greeting {
    opacity: 1;
  }

  .sidebar-signout {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
    min-height: 44px;
    width: 100%;
    text-align: left;
  }

  .sidebar-signout-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sidebar-signout:hover {
    background: rgba(239, 68, 68, 0.08);
    color: var(--color-red);
  }

  .sidebar-signout-label {
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .sidebar:hover .sidebar-signout-label {
    opacity: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DESKTOP SYNC STATUS — fixed top-right indicator
     ═══════════════════════════════════════════════════════════════════════════ */

  .desktop-sync {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 101;
    display: none;
  }

  /* Override tooltip to open to the left (not right) since we're in the top-right corner */
  .desktop-sync :global(.tooltip) {
    right: 0;
    left: auto;
  }

  .desktop-sync :global(.tooltip-arrow) {
    right: 16px;
    left: auto;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MOBILE HEADER
     ═══════════════════════════════════════════════════════════════════════════ */

  .mobile-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    padding-top: env(safe-area-inset-top);
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    padding-left: max(12px, env(safe-area-inset-left));
    padding-right: max(12px, env(safe-area-inset-right));
    gap: 12px;
    z-index: 100;
  }

  .mobile-hamburger {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .mobile-hamburger:hover {
    background: var(--color-primary-subtle);
  }

  .mobile-brand {
    font-weight: 700;
    font-size: 1.125rem;
    color: var(--color-text);
    flex: 1;
  }

  .mobile-sync {
    flex-shrink: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MOBILE DRAWER
     ═══════════════════════════════════════════════════════════════════════════ */

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 199;
  }

  .mobile-drawer {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    max-width: calc(100vw - 56px);
    background: var(--color-bg);
    z-index: 200;
    display: flex;
    flex-direction: column;
    transform: translateX(-100%);
    transition: transform 0.25s var(--ease-out);
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    box-shadow: var(--shadow-xl);
  }

  .mobile-drawer.open {
    transform: translateX(0);
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--color-border);
  }

  .drawer-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: var(--color-text);
    font-weight: 700;
    font-size: 1.125rem;
  }

  .drawer-close {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
    border-radius: var(--radius-sm);
  }

  .drawer-close:hover {
    background: var(--color-primary-subtle);
    color: var(--color-text);
  }

  .drawer-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px;
  }

  .drawer-nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--color-text-secondary);
    font-size: 0.9375rem;
    font-weight: 500;
    min-height: 44px;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  .drawer-nav-item:hover {
    background: var(--color-primary-subtle);
    color: var(--color-text);
  }

  .drawer-nav-item.active {
    color: var(--color-primary);
    background: var(--color-primary-subtle);
  }

  .drawer-spacer {
    flex: 1;
  }

  .drawer-footer {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-top: 1px solid var(--color-border);
  }

  .drawer-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--color-text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    min-height: 44px;
    transition: background var(--duration-fast) ease;
  }

  .drawer-profile:hover {
    background: var(--color-primary-subtle);
    color: var(--color-text);
  }

  .drawer-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--gradient-primary);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8125rem;
    font-weight: 700;
    flex-shrink: 0;
  }

  .drawer-signout {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    font-weight: 500;
    width: 100%;
    text-align: left;
    min-height: 44px;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  .drawer-signout:hover {
    background: rgba(239, 68, 68, 0.08);
    color: var(--color-red);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MAIN CONTENT AREA
     ═══════════════════════════════════════════════════════════════════════════ */

  .main-content {
    min-height: 100vh;
    min-height: 100dvh;
  }

  .main-content.no-sidebar {
    margin-left: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESPONSIVE BREAKPOINTS
     ═══════════════════════════════════════════════════════════════════════════ */

  /* Mobile (< 768px): Show mobile header + drawer, hide sidebar */
  @media (max-width: 767px) {
    .sidebar {
      display: none !important;
    }

    .main-content:not(.no-sidebar) {
      margin-left: 0;
      padding-top: calc(56px + env(safe-area-inset-top));
    }
  }

  /* Desktop (>= 768px): Show sidebar rail, hide mobile header + drawer */
  @media (min-width: 768px) {
    .sidebar {
      display: block;
    }

    .desktop-sync {
      display: block;
    }

    .mobile-header {
      display: none;
    }

    .mobile-drawer {
      display: none;
    }

    .drawer-backdrop {
      display: none;
    }

    .main-content:not(.no-sidebar) {
      margin-left: 64px;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DARK MODE
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (prefers-color-scheme: dark) {
    .signout-overlay {
      background: var(--color-bg);
    }

    .loading-overlay {
      background: var(--color-bg);
    }

    .drawer-backdrop {
      background: rgba(0, 0, 0, 0.6);
    }

    .mobile-drawer {
      box-shadow:
        var(--shadow-xl),
        0 0 0 1px var(--color-border);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     REDUCED MOTION
     ═══════════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }

    .mobile-drawer {
      transition: none;
    }

    .loading-spinner {
      animation-duration: 1.5s;
    }
  }
</style>
