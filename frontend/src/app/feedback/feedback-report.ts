import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

type FeedbackKind = 'FEEDBACK' | 'REPORT_USER' | 'REPORT_LISTING' | 'OTHER_ISSUE';

@Component({
  selector: 'app-feedback-report',
  imports: [FormsModule, RouterLink, AccountNavigation],
  templateUrl: './feedback-report.html',
  styleUrl: './feedback-report.css',
})
export class FeedbackReport {
  private readonly http = inject(HttpClient);
  protected readonly signedIn = signal(false);
  protected readonly checkingSession = signal(true);
  protected readonly kind = signal<FeedbackKind>('FEEDBACK');
  protected readonly details = signal('');
  protected readonly targetUserName = signal('');
  protected readonly targetListingUrl = signal('');
  protected readonly photos = signal<File[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');

  constructor() {
    const params = new URLSearchParams(window.location.search);
    const userName = params.get('userName') ?? '';
    const listingUrl = params.get('listingUrl') ?? '';
    if (userName) { this.targetUserName.set(userName); this.kind.set('REPORT_USER'); }
    if (listingUrl) { this.targetListingUrl.set(listingUrl); this.kind.set('REPORT_LISTING'); }
    this.http.get<{ user?: { id: string } }>('/api/auth/me').subscribe({
      next: (result) => { this.signedIn.set(Boolean(result.user)); this.checkingSession.set(false); },
      error: () => { this.signedIn.set(false); this.checkingSession.set(false); },
    });
  }

  protected changeKind(value: string): void {
    if (['FEEDBACK', 'REPORT_USER', 'REPORT_LISTING', 'OTHER_ISSUE'].includes(value)) this.kind.set(value as FeedbackKind);
    this.error.set('');
  }

  protected selectPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = Array.from(input.files ?? []);
    if (selected.length < 1 || selected.length > 4) {
      this.photos.set([]);
      this.error.set('Attach between one and four photos.');
      input.value = '';
      return;
    }
    if (selected.some((file) => file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      this.photos.set([]);
      this.error.set('Use JPG, PNG, or WebP photos up to 5 MB each.');
      input.value = '';
      return;
    }
    this.photos.set(selected);
    this.error.set('');
  }

  protected submit(): void {
    if (!this.signedIn() || this.submitting()) return;
    const details = this.details().trim();
    if (details.length < 10 || details.length > 2000) { this.error.set('Describe the issue in 10 to 2,000 characters.'); return; }
    if (this.photos().length < 1 || this.photos().length > 4) { this.error.set('Attach between one and four photos.'); return; }
    if (this.kind() === 'REPORT_USER' && this.targetUserName().trim().length < 2) { this.error.set('Enter the name of the user you are reporting.'); return; }
    if (this.kind() === 'REPORT_LISTING' && !/^(?:https?:\/\/[^/\s]+)?\/products\/[1-9]\d*\/?(?:[?#][^\s]*)?$/.test(this.targetListingUrl().trim())) { this.error.set('Enter a listing link, such as /products/123.'); return; }

    const form = new FormData();
    form.append('kind', this.kind());
    form.append('details', details);
    if (this.kind() === 'REPORT_USER') form.append('targetUserName', this.targetUserName().trim());
    if (this.kind() === 'REPORT_LISTING') form.append('targetListingUrl', this.targetListingUrl().trim());
    for (const photo of this.photos()) form.append('photos', photo);
    this.submitting.set(true);
    this.error.set('');
    this.success.set('');
    this.http.post<{ message?: string }>('/api/feedback', form).subscribe({
      next: (result) => {
        this.success.set(result.message ?? 'Your submission was sent to the CampusX admin team.');
        this.details.set(''); this.targetUserName.set(''); this.targetListingUrl.set(''); this.photos.set([]);
        const input = document.getElementById('feedback-photos') as HTMLInputElement | null;
        if (input) input.value = '';
        this.submitting.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(error.error?.message ?? 'Your submission could not be sent. Please try again.');
        this.submitting.set(false);
      },
    });
  }
}
