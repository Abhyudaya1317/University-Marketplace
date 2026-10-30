import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AccountNavigation } from '../shared/account-navigation';

// Describe the small part of the backend response that this page reads.
interface HealthResponse {
  success: boolean;
  message: string;
}

// Keep the temporary welcome page's UI and backend status behavior in this feature folder.
@Component({
  selector: 'app-home',
  imports: [AccountNavigation],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  private readonly http = inject(HttpClient);

  // The template uses this state to show checking, online, or offline status.
  protected readonly backendState = signal<'checking' | 'online' | 'offline'>('checking');

  // Ask the Express health endpoint whether the backend is reachable when the page opens.
  constructor() {
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (response) => {
        this.backendState.set(response.success ? 'online' : 'offline');
      },
      error: () => this.backendState.set('offline')
    });
  }
}
