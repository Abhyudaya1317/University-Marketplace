import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, interval } from 'rxjs';

// Keep the account navigation in sync with the cookie-backed login session.
interface AccountResponse {
  success: boolean;
  user?: { id: string; email: string; isAdmin?: boolean };
}

// Keep the seller's pending request total separate from their message unread total.
interface SellerRequestsResponse {
  success: boolean;
  pendingCount: number;
}

type PushStatus = 'idle' | 'enabling' | 'enabled' | 'disabling' | 'unsupported' | 'error';

const PUSH_PROMPT_STORAGE_KEY = 'unibee-push-permission-prompt-handled';

// Convert the backend's URL-safe VAPID key to the bytes required by PushManager.
function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

@Component({
  selector: 'app-account-navigation',
  imports: [RouterLink],
  templateUrl: './account-navigation.html',
  styleUrl: './account-navigation.css',
})
export class AccountNavigation {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // A missing session is a normal public state, so failed checks show guest links.
  protected readonly signedIn = signal(false);
  protected readonly isAdmin = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly unreadCount = signal(0);
  protected readonly pendingRequestCount = signal(0);
  protected readonly pushStatus = signal<PushStatus>('idle');
  protected readonly pushStatusMessage = signal('');
  protected readonly showPushPrompt = signal(false);
  protected readonly totalNotificationCount = computed(
    () => this.unreadCount() + this.pendingRequestCount(),
  );
  protected readonly signInQueryParams = { returnUrl: this.router.url };

  constructor() {
    this.refreshSession();
    // Keep badges fresh without repeatedly waking the API and database on every page.
    interval(30_000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.signedIn() && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          this.refreshNotificationCounts();
        }
      });
  }

  // Ask the backend whether this browser already has a valid CampusX session.
  private refreshSession(): void {
    this.http.get<AccountResponse>('/api/auth/me').subscribe({
      next: (response) => {
        this.signedIn.set(Boolean(response.user));
        this.isAdmin.set(Boolean(response.user?.isAdmin));
        if (response.user) {
          this.refreshNotificationCounts();
          void this.refreshPushStatus();
        }
      },
      error: () => {
        this.signedIn.set(false);
        this.isAdmin.set(false);
        this.unreadCount.set(0);
        this.pendingRequestCount.set(0);
      },
    });
  }

  // Check permission on page load; show our explanation first when the browser can still ask.
  private async refreshPushStatus(): Promise<void> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)
      || !('PushManager' in window) || !('Notification' in window)) {
      this.pushStatus.set('unsupported');
      this.pushStatusMessage.set('Phone alerts are not supported by this browser.');
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        this.pushStatus.set('enabled');
        return;
      }

      if (Notification.permission === 'granted') {
        // Permission was already granted on this browser. Restore its signed-in subscription silently.
        await this.createPushSubscription();
        return;
      }

      this.pushStatus.set('idle');
      this.pushStatusMessage.set('');
      if (Notification.permission === 'default' && !this.hasHandledPushPrompt()) {
        this.showPushPrompt.set(true);
      }
    } catch {
      this.pushStatus.set('idle');
    }
  }

  // Browsers require a user action before showing their native permission prompt.
  protected async enablePushFromPrompt(): Promise<void> {
    this.showPushPrompt.set(false);
    this.markPushPromptHandled();
    await this.togglePushNotifications();
  }

  // Remember either choice so the custom prompt does not keep appearing on later visits.
  protected dismissPushPrompt(): void {
    this.showPushPrompt.set(false);
    this.markPushPromptHandled();
  }

  private hasHandledPushPrompt(): boolean {
    try {
      return window.localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === 'yes';
    } catch {
      return true;
    }
  }

  private markPushPromptHandled(): void {
    try {
      window.localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'yes');
    } catch {
      // The browser may block storage; permission state still prevents repeated native prompts.
    }
  }

  // Ask for browser permission only after the signed-in user taps the control.
  protected async togglePushNotifications(): Promise<void> {
    if (this.pushStatus() === 'enabled') {
      await this.disablePushNotifications();
      return;
    }
    if (this.pushStatus() === 'enabling' || this.pushStatus() === 'unsupported') return;

    this.pushStatus.set('enabling');
    this.pushStatusMessage.set('');
    try {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error(permission === 'denied'
            ? 'Notifications are blocked in this browser. Allow them in site settings and try again.'
            : 'Allow notifications to receive buyer requests and messages.');
        }
      }

      await this.createPushSubscription();
    } catch (error) {
      this.pushStatus.set('error');
      this.pushStatusMessage.set(error instanceof Error ? error.message : 'We could not enable phone alerts.');
    }
  }

  // Create or refresh the server-side subscription after permission is already granted.
  private async createPushSubscription(): Promise<void> {
    const keyResponse = await firstValueFrom(
      this.http.get<{ enabled: boolean; publicKey: string | null }>('/api/notifications/vapid-public-key'),
    );
    if (!keyResponse.enabled || !keyResponse.publicKey) {
      throw new Error('Phone alerts are not configured on the server yet.');
    }

    const registration = await navigator.serviceWorker.register('/sw.js');
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(keyResponse.publicKey),
      });
    }
    await firstValueFrom(
      this.http.post('/api/notifications/subscriptions', subscription.toJSON()),
    );
    this.pushStatus.set('enabled');
    this.pushStatusMessage.set('Phone alerts are on for this browser.');
  }

  // Remove only this browser's endpoint so other opted-in devices keep receiving alerts.
  private async disablePushNotifications(): Promise<void> {
    this.pushStatus.set('disabling');
    this.pushStatusMessage.set('');
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await firstValueFrom(
          this.http.delete('/api/notifications/subscriptions', { body: { endpoint: subscription.endpoint } }),
        );
        await subscription.unsubscribe();
      }
      this.pushStatus.set('idle');
      this.pushStatusMessage.set('Phone alerts are off for this browser.');
    } catch {
      this.pushStatus.set('error');
      this.pushStatusMessage.set('We could not turn off phone alerts. Try again.');
    }
  }

  // Keep the small navigation badge in sync while the app is open.
  private refreshNotificationCounts(): void {
    // Ask the dedicated endpoint for unread messages so the menu badge stays lightweight.
    this.http.get<{ unreadCount: number }>('/api/messages/unread-count').subscribe({
      next: (response) => this.unreadCount.set(Math.max(0, Number(response.unreadCount) || 0)),
      error: () => undefined,
    });

    // Fetch a count only; the menu does not need the buyer's private request details.
    this.http.get<SellerRequestsResponse>('/api/orders/seller/requests/count').subscribe({
      next: (response) => this.pendingRequestCount.set(Math.max(0, Number(response.pendingCount) || 0)),
      error: () => undefined,
    });
  }

  // Clear the server cookie before returning to the public home page.
  protected async signOut(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      // A shared device should stop receiving this account's private push alerts after sign-out.
      const registration = await navigator.serviceWorker?.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await Promise.allSettled([
          firstValueFrom(this.http.delete('/api/notifications/subscriptions', { body: { endpoint: subscription.endpoint } })),
          subscription.unsubscribe(),
        ]);
      }
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
      this.signedIn.set(false);
      this.isAdmin.set(false);
      this.unreadCount.set(0);
      this.pendingRequestCount.set(0);
      this.pushStatus.set('idle');
      this.signingOut.set(false);
      void this.router.navigateByUrl('/');
    } catch {
      this.signingOut.set(false);
      this.refreshSession();
    }
  }
}
