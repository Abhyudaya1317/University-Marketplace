import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

// Match the small public account fields sent by the backend.
interface AccountResponse {
  success: boolean;
  message?: string;
  user?: { id: number; email: string; fullName?: string | null; avatarUrl?: string | null };
}

type AuthMode = 'login' | 'signup' | 'reset';

// Keep the sign-in page, its form state, and its API calls in this feature folder.
@Component({
  selector: 'app-auth',
  imports: [FormsModule],
  templateUrl: './auth.html',
  styleUrl: './auth.css',
})
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly returnUrl = this.readSafeReturnUrl();
  protected readonly googleSignInUrl =
    '/api/auth/google?returnUrl=' + encodeURIComponent(this.returnUrl);

  // Signals let the template update when the account form changes state.
  protected readonly mode = signal<AuthMode>('login');
  protected readonly resetCodeSent = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly currentUser = signal<AccountResponse['user'] | null>(null);

  protected email = '';
  protected fullName = '';
  protected password = '';
  protected resetCode = '';
  protected newPassword = '';

  // Restore an existing cookie session and show any status returned by Google OAuth.
  constructor() {
    this.http.get<AccountResponse>('/api/auth/me').subscribe({
      next: (response) => {
        this.currentUser.set(response.user ?? null);
        if (response.user) void this.router.navigateByUrl(this.returnUrl);
      },
      error: () => this.currentUser.set(null),
    });

    const query = new URLSearchParams(window.location.search);
    if (query.get('google') === 'success') {
      this.notice.set('You are signed in with Google.');
      window.history.replaceState({}, document.title, '/auth');
    } else if (query.has('error')) {
      this.error.set(this.googleErrorMessage(query.get('error') ?? ''));
      window.history.replaceState({}, document.title, '/auth');
    }
  }

  // Submit the same email/password fields to the selected signup or login endpoint.
  protected submitPasswordForm(): void {
    this.clearMessages();
    this.busy.set(true);
    const path = this.mode() === 'signup' ? 'signup' : 'login';

    this.http
      .post<AccountResponse>(`/api/auth/${path}`, {
        email: this.email,
        ...(path === 'signup' ? { fullName: this.fullName } : {}),
        password: this.password,
      })
      .subscribe({
        next: (response) => {
          this.currentUser.set(response.user ?? null);
          this.password = '';
          this.notice.set(
            path === 'signup' ? 'Your CampusX account is ready.' : 'You are signed in.',
          );
          this.busy.set(false);
          void this.router.navigateByUrl(this.returnUrl);
        },
        error: (response: HttpErrorResponse) => this.showRequestError(response),
      });
  }

  // Ask the backend to email a reset code, then reveal the code-entry form.
  protected requestResetCode(): void {
    this.clearMessages();
    this.busy.set(true);
    this.http
      .post<AccountResponse>('/api/auth/password-reset/request-code', { email: this.email })
      .subscribe({
        next: (response) => {
          this.notice.set(response.message ?? 'Check your email for a reset code.');
          this.resetCodeSent.set(true);
          this.busy.set(false);
        },
        error: (response: HttpErrorResponse) => this.showRequestError(response),
      });
  }

  // Submit the one-time code and the new password to complete password recovery.
  protected resetPassword(): void {
    this.clearMessages();
    this.busy.set(true);
    this.http
      .post<AccountResponse>('/api/auth/password-reset/verify-code', {
        email: this.email,
        code: this.resetCode,
        newPassword: this.newPassword,
      })
      .subscribe({
        next: (response) => {
          this.notice.set(response.message ?? 'Password updated. Sign in with your new password.');
          this.mode.set('login');
          this.resetCodeSent.set(false);
          this.resetCode = '';
          this.newPassword = '';
          this.busy.set(false);
        },
        error: (response: HttpErrorResponse) => this.showRequestError(response),
      });
  }

  // Revoke the server-side login session and remove the browser cookie.
  protected signOut(): void {
    this.http.post<AccountResponse>('/api/auth/logout', {}).subscribe({
      next: () => {
        this.currentUser.set(null);
        this.notice.set('You have signed out.');
      },
      error: (response: HttpErrorResponse) => this.showRequestError(response),
    });
  }

  // Switch between the account form and password recovery without navigating away.
  protected chooseMode(mode: AuthMode): void {
    this.clearMessages();
    this.mode.set(mode);
    this.resetCodeSent.set(false);
    this.resetCode = '';
    this.newPassword = '';
  }

  // Show only safe messages returned by the API; do not display server internals.
  private showRequestError(response: HttpErrorResponse): void {
    this.error.set(
      response.error?.message ?? 'CampusX could not complete that request. Try again.',
    );
    this.busy.set(false);
  }

  private clearMessages(): void {
    this.error.set('');
    this.notice.set('');
  }

  // Keep sign-in redirects inside CampusX and avoid redirecting back into the sign-in loop.
  private readSafeReturnUrl(): string {
    const candidate = this.route.snapshot.queryParamMap.get('returnUrl');
    if (
      !candidate ||
      !candidate.startsWith('/') ||
      candidate.startsWith('//') ||
      candidate.includes('\\')
    ) {
      return '/';
    }

    try {
      const destination = new URL(candidate, window.location.origin);
      if (
        destination.origin !== window.location.origin ||
        destination.pathname.startsWith('/auth')
      ) {
        return '/';
      }
      return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
      return '/';
    }
  }

  // Translate safe callback reasons into fixes without showing provider internals.
  private googleErrorMessage(reason: string): string {
    const messages: Record<string, string> = {
      google_sign_in_cancelled: 'Google sign-in was cancelled. Try again and approve the request.',
      google_state_cookie_missing:
        'The Google sign-in session cookie was not returned. Use localhost for both app links and retry.',
      google_state_mismatch:
        'Google sign-in could not verify the browser session. Restart both servers and try again.',
      google_code_missing:
        'Google did not return a sign-in code. Restart the sign-in and try again.',
      google_email_unverified:
        'Google did not confirm this email address. Choose a verified Google account.',
      google_callback_failed:
        'Google reached CampusX, but token verification failed. Check the backend terminal for a safe error code and confirm the client secret and callback URI.',
      google_not_configured: 'Google sign-in settings are missing from backend/.env.',
    };

    return (
      messages[reason] ??
      'Google sign-in did not finish. Check the backend terminal for a safe error code and try again.'
    );
  }
}
