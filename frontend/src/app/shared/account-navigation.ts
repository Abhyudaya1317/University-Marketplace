import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';

// Keep the account navigation in sync with the cookie-backed login session.
interface AccountResponse {
  success: boolean;
  user?: { id: number; email: string };
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
  protected readonly signingOut = signal(false);
  protected readonly unreadCount = signal(0);
  protected readonly signInQueryParams = { returnUrl: this.router.url };

  constructor() {
    this.refreshSession();
    interval(3000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.signedIn() && typeof document !== 'undefined' && document.visibilityState === 'visible') {
          this.refreshUnreadCount();
        }
      });
  }

  // Ask the backend whether this browser already has a valid CampusX session.
  private refreshSession(): void {
    this.http.get<AccountResponse>('/api/auth/me').subscribe({
      next: (response) => {
        this.signedIn.set(Boolean(response.user));
        if (response.user) this.refreshUnreadCount();
      },
      error: () => {
        this.signedIn.set(false);
        this.unreadCount.set(0);
      },
    });
  }

  // Keep the small navigation badge in sync while the app is open.
  private refreshUnreadCount(): void {
    // Use the same inbox response as the Messages page so the badge and thread counts agree.
    this.http.get<{ conversations: Array<{ unreadCount: number }> }>('/api/messages').subscribe({
      next: (response) => {
        const totalUnread = (response.conversations ?? []).reduce(
          (total, conversation) => total + (Number.isSafeInteger(conversation.unreadCount) ? conversation.unreadCount : 0),
          0,
        );
        this.unreadCount.set(totalUnread);
      },
      // Keep the last known count during a temporary network failure instead of hiding it.
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
        this.unreadCount.set(0);
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
