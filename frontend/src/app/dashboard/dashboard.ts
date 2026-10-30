import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

// Match the private summary endpoint without pulling account contact data into this page.
interface DashboardResponse {
  success: boolean;
  profile: {
    id: number;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    activeListingCount: number;
    archivedListingCount: number;
    averageRating: number | null;
    reviewCount: number;
  };
  myListings: Array<{
    id: number;
    title: string;
    product: { id: number; name: string; category: string };
    description: string;
    price: string;
    quantityAvailable: number;
    photoUrl: string | null;
    location: string;
    status: string;
    condition: string;
    archivedAt: string | null;
    createdAt: string;
  }>;
  favoriteSellers: Array<{
    sellerId: number;
    sellerName: string;
    sellerAvatarUrl: string | null;
    savedAt: string;
    latestListing: {
      product: { id: number; name: string; category: string };
      price: string;
    } | null;
  }>;
  savedListings: Array<{
    savedAt: string;
    listingId: number;
    sellerId: number;
    sellerName: string;
    title: string;
    sellerAvatarUrl: string | null;
    product: { id: number; name: string; category: string };
    description: string;
    price: string;
    photoUrl: string | null;
  }>;
  message?: string;
}

// Describe only pending order fields that the seller needs to arrange a campus handoff.
interface SellerRequest {
  id: number;
  listingId: number;
  productName: string;
  listingTitle: string;
  buyerName: string;
  buyerPhone: string;
  quantity: number;
  buyerMessage: string | null;
  price: string;
  createdAt: string;
}

// Give a signed-in user one place to find their current listings and saved sellers.
@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, FormsModule, RouterLink, AccountNavigation],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly http = inject(HttpClient);

  // These states let the page distinguish a sign-in requirement from a service issue.
  protected readonly loading = signal(true);
  protected readonly signedIn = signal(false);
  protected readonly error = signal('');
  protected readonly listings = signal<DashboardResponse['myListings']>([]);
  protected readonly activeListings = computed(() =>
    this.listings().filter((listing) => listing.status !== 'ARCHIVED'),
  );
  protected readonly archivedListings = computed(() =>
    this.listings().filter((listing) => listing.status === 'ARCHIVED'),
  );
  protected readonly profile = signal<DashboardResponse['profile'] | null>(null);
  protected readonly favoriteSellers = signal<DashboardResponse['favoriteSellers']>([]);
  protected readonly savedListings = signal<DashboardResponse['savedListings']>([]);
  protected readonly requests = signal<SellerRequest[]>([]);
  protected readonly stockDrafts = signal<Record<number, number>>({});
  protected readonly meetingTimes = signal<Record<number, string>>({});
  protected readonly meetingLocations = signal<Record<number, string>>({});
  protected readonly stockBusyId = signal<number | null>(null);
  protected readonly requestBusyId = signal<number | null>(null);
  protected readonly stockNotice = signal('');
  protected readonly requestNotice = signal('');
  protected readonly managementNotice = signal('');
  protected readonly archiveDialogListingId = signal<number | null>(null);
  protected readonly deleteDialogListingId = signal<number | null>(null);
  protected readonly managementBusyId = signal<number | null>(null);
  protected readonly profileNameDraft = signal('');
  protected readonly profileNotice = signal('');
  protected readonly profileSaving = signal(false);

  // Load account-owned records through the session-protected dashboard endpoint.
  constructor() {
    this.http.get<DashboardResponse>('/api/sellers/dashboard').subscribe({
      next: (response) => {
        this.signedIn.set(true);
        this.profile.set(response.profile ?? null);
        this.profileNameDraft.set(response.profile?.fullName ?? '');
        this.listings.set(response.myListings ?? []);
        this.favoriteSellers.set(response.favoriteSellers ?? []);
        this.savedListings.set(response.savedListings ?? []);
        this.loading.set(false);
        this.loadSellerRequests();
      },
      error: (response: HttpErrorResponse) => {
        this.signedIn.set(response.status !== 401);
        this.error.set(
          response.status === 401
            ? 'Sign in to see your listings and saved sellers.'
            : (response.error?.message ?? 'Your dashboard could not be loaded. Please try again.'),
        );
        this.loading.set(false);
      },
    });
  }

  // Save only the current account's public display name through the protected profile endpoint.
  protected saveProfileName(): void {
    const fullName = this.profileNameDraft().trim();
    if (fullName.length < 2 || fullName.length > 100) {
      this.profileNotice.set('Enter a name between 2 and 100 characters.');
      return;
    }
    this.profileSaving.set(true);
    this.profileNotice.set('');
    this.http.patch<{ user: { fullName: string } }>('/api/auth/profile', { fullName }).subscribe({
      next: (response) => {
        this.profile.update((profile) =>
          profile ? { ...profile, fullName: response.user.fullName } : profile,
        );
        this.profileNameDraft.set(response.user.fullName);
        this.profileNotice.set('Profile name updated.');
        this.profileSaving.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.profileNotice.set(
          response.error?.message ?? 'Your profile name could not be updated.',
        );
        this.profileSaving.set(false);
      },
    });
  }

  // Display database status values as readable labels on the listing cards.
  protected statusLabel(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  // Show stock safely and distinguish unknown values from genuine zero stock.
  protected stockLabel(quantity: number | null | undefined): string {
    if (!Number.isSafeInteger(quantity) || quantity === null || quantity === undefined)
      return 'Availability unavailable';
    if (quantity === 0) return 'Out of stock';
    return quantity <= 2 ? `Few left · ${quantity} available` : `In stock · ${quantity} available`;
  }

  protected stockValue(listing: DashboardResponse['myListings'][number]): number {
    return this.stockDrafts()[listing.id] ?? listing.quantityAvailable;
  }

  // Remove one saved seller offer without changing other offers in the same product group.
  protected removeSavedListing(listingId: number): void {
    this.http.delete(`/api/listings/${listingId}/favorite`).subscribe({
      next: () =>
        this.savedListings.update((items) => items.filter((item) => item.listingId !== listingId)),
      error: (response: HttpErrorResponse) =>
        this.error.set(response.error?.message ?? 'The saved offer could not be removed.'),
    });
  }

  // Open the archive confirmation instead of changing listing state immediately.
  protected askToArchive(listingId: number): void {
    this.managementNotice.set('');
    this.archiveDialogListingId.set(listingId);
  }

  protected cancelArchive(): void {
    if (this.managementBusyId() === null) this.archiveDialogListingId.set(null);
  }

  // Move a confirmed active listing out of every public marketplace query.
  protected confirmArchive(): void {
    const listingId = this.archiveDialogListingId();
    if (!listingId) return;
    this.managementBusyId.set(listingId);
    this.managementNotice.set('');
    this.http
      .patch<{ status: string; archivedAt: string }>(`/api/listings/${listingId}/archive`, {})
      .subscribe({
        next: (response) => {
          this.listings.update((items) =>
            items.map((item) =>
              item.id === listingId
                ? { ...item, status: response.status, archivedAt: response.archivedAt }
                : item,
            ),
          );
          this.managementNotice.set('Listing moved to your archive.');
          this.archiveDialogListingId.set(null);
          this.managementBusyId.set(null);
        },
        error: (response: HttpErrorResponse) => {
          this.managementNotice.set(
            response.error?.message ?? 'This listing could not be archived.',
          );
          this.managementBusyId.set(null);
        },
      });
  }

  // Restore only this seller's archived listing and keep all saved item details intact.
  protected restoreListing(listingId: number): void {
    this.managementBusyId.set(listingId);
    this.managementNotice.set('');
    this.http.patch<{ status: string }>(`/api/listings/${listingId}/restore`, {}).subscribe({
      next: (response) => {
        this.listings.update((items) =>
          items.map((item) =>
            item.id === listingId ? { ...item, status: response.status, archivedAt: null } : item,
          ),
        );
        this.managementNotice.set('Listing restored to the marketplace.');
        this.managementBusyId.set(null);
      },
      error: (response: HttpErrorResponse) => {
        this.managementNotice.set(response.error?.message ?? 'This listing could not be restored.');
        this.managementBusyId.set(null);
      },
    });
  }

  // Open the explicit irreversible-delete confirmation for one archived listing.
  protected askToDelete(listingId: number): void {
    this.managementNotice.set('');
    this.deleteDialogListingId.set(listingId);
  }

  protected cancelDelete(): void {
    if (this.managementBusyId() === null) this.deleteDialogListingId.set(null);
  }

  // Permanently remove only after confirmation; the API rejects listings with order history.
  protected confirmDelete(): void {
    const listingId = this.deleteDialogListingId();
    if (!listingId) return;
    this.managementBusyId.set(listingId);
    this.managementNotice.set('');
    this.http.delete(`/api/listings/${listingId}`).subscribe({
      next: () => {
        this.listings.update((items) => items.filter((item) => item.id !== listingId));
        this.managementNotice.set('Archived listing permanently deleted.');
        this.deleteDialogListingId.set(null);
        this.managementBusyId.set(null);
      },
      error: (response: HttpErrorResponse) => {
        this.managementNotice.set(
          response.error?.message ?? 'This listing could not be permanently deleted.',
        );
        this.managementBusyId.set(null);
      },
    });
  }

  protected setStockDraft(listingId: number, quantity: number): void {
    this.stockDrafts.update((drafts) => ({ ...drafts, [listingId]: quantity }));
  }

  // Save a new quantity using the owner-only inventory endpoint.
  protected updateStock(listingId: number): void {
    const listing = this.listings().find((item) => item.id === listingId);
    const quantityAvailable = this.stockDrafts()[listingId] ?? listing?.quantityAvailable;
    if (!Number.isInteger(quantityAvailable) || quantityAvailable < 0 || quantityAvailable > 9999) {
      this.stockNotice.set('Enter a whole number from 0 to 9,999.');
      return;
    }
    this.stockBusyId.set(listingId);
    this.stockNotice.set('');
    this.http
      .patch<{ quantityAvailable: number }>(`/api/listings/${listingId}/stock`, {
        quantityAvailable,
      })
      .subscribe({
        next: (response) => {
          this.listings.update((items) =>
            items.map((item) =>
              item.id === listingId
                ? { ...item, quantityAvailable: response.quantityAvailable }
                : item,
            ),
          );
          this.stockDrafts.update((drafts) => ({
            ...drafts,
            [listingId]: response.quantityAvailable,
          }));
          this.stockNotice.set('Stock updated.');
          this.stockBusyId.set(null);
        },
        error: (response: HttpErrorResponse) => {
          this.stockNotice.set(response.error?.message ?? 'Stock could not be updated.');
          this.stockBusyId.set(null);
        },
      });
  }

  // Load private buyer requests only after the dashboard confirms this seller is signed in.
  private loadSellerRequests(): void {
    this.http.get<{ requests: SellerRequest[] }>('/api/orders/seller/requests').subscribe({
      next: (response) => this.requests.set(response.requests ?? []),
      error: (response: HttpErrorResponse) =>
        this.requestNotice.set(response.error?.message ?? 'Buyer requests could not be loaded.'),
    });
  }

  protected listingRequests(listingId: number): SellerRequest[] {
    return this.requests().filter((request) => request.listingId === listingId);
  }

  protected setMeetingTime(requestId: number, value: string): void {
    this.meetingTimes.update((times) => ({ ...times, [requestId]: value }));
  }

  protected setMeetingLocation(requestId: number, value: string): void {
    this.meetingLocations.update((locations) => ({ ...locations, [requestId]: value }));
  }

  // Accept a buyer request only after the seller enters a future meetup time and location.
  protected respondToRequest(request: SellerRequest, action: 'accept' | 'decline'): void {
    const meetingAtLocal = this.meetingTimes()[request.id] ?? '';
    const meetingLocation = (this.meetingLocations()[request.id] ?? '').trim();
    if (action === 'accept' && (!meetingAtLocal || !meetingLocation)) {
      this.requestNotice.set('Choose a meeting date, time, and location before accepting.');
      return;
    }
    const meetingAt = action === 'accept' ? new Date(meetingAtLocal) : null;
    if (
      action === 'accept' &&
      (!meetingAt || Number.isNaN(meetingAt.getTime()) || meetingAt.getTime() <= Date.now())
    ) {
      this.requestNotice.set('Choose a meeting time in the future.');
      return;
    }

    this.requestBusyId.set(request.id);
    this.requestNotice.set('');
    this.http
      .patch(`/api/orders/${request.id}`, {
        action,
        ...(action === 'accept' ? { meetingAt: meetingAt?.toISOString(), meetingLocation } : {}),
      })
      .subscribe({
        next: () => {
          this.requests.update((items) => items.filter((item) => item.id !== request.id));
          this.requestNotice.set(
            action === 'accept'
              ? 'Request accepted. The buyer can see the meetup in My Orders.'
              : 'Request declined.',
          );
          this.requestBusyId.set(null);
        },
        error: (response: HttpErrorResponse) => {
          this.requestNotice.set(response.error?.message ?? 'We could not update this request.');
          this.requestBusyId.set(null);
        },
      });
  }
}
