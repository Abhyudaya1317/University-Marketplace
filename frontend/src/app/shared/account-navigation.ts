import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';

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
        if (response.user) this.refreshNotificationCounts();
      },
      error: () => {
        this.signedIn.set(false);
        this.isAdmin.set(false);
        this.unreadCount.set(0);
        this.pendingRequestCount.set(0);
      },
    });
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
  protected signOut(): void {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => {
        this.signedIn.set(false);
        this.isAdmin.set(false);
        this.unreadCount.set(0);
        this.pendingRequestCount.set(0);
        this.signingOut.set(false);
        void this.router.navigateByUrl('/');
      },
      error: () => {
        this.signingOut.set(false);
        this.refreshSession();
      },
    });
  }
}
