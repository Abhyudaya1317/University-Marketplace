import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

// Keep the account navigation in sync with the cookie-backed login session.
interface AccountResponse {
  success: boolean;
  user?: { id: number; email: string };
}

@Component({
  selector: 'app-account-navigation',
  imports: [RouterLink],
  templateUrl: './account-navigation.html',
  styleUrl: './account-navigation.css'
})
export class AccountNavigation {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // A missing session is a normal public state, so failed checks show guest links.
  protected readonly signedIn = signal(false);
  protected readonly signingOut = signal(false);

  constructor() {
    this.refreshSession();
  }

  // Ask the backend whether this browser already has a valid CampusX session.
  private refreshSession(): void {
    this.http.get<AccountResponse>('/api/auth/me').subscribe({
      next: (response) => this.signedIn.set(Boolean(response.user)),
      error: () => this.signedIn.set(false)
    });
  }

  // Clear the server cookie before returning to the public home page.
  protected signOut(): void {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.http.post('/api/auth/logout', {}).subscribe({
      next: () => {
        this.signedIn.set(false);
        this.signingOut.set(false);
        void this.router.navigateByUrl('/');
      },
      error: () => {
        this.signingOut.set(false);
        this.refreshSession();
      }
    });
  }
}
