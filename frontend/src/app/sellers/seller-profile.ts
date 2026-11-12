import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AccountNavigation } from '../shared/account-navigation';
import { InteractionFeedback } from '../shared/interaction-feedback';

// Keep the public seller data limited to active offers and public review totals.
interface SellerProfileResponse {
  success: boolean;
  seller: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    bio: string | null;
    activeListingCount: number;
    followerCount: number;
    followingCount: number;
    averageRating: number | null;
    reviewCount: number;
  };
  listings: Array<{
    id: string;
    productId: string;
    title: string;
    product: { id: string; name: string; category: string };
    description: string;
    price: string;
    quantityAvailable: number;
    photoUrl: string | null;
    photoUrl2: string | null;
    photoUrl3: string | null;
    photoUrl4: string | null;
    location: string;
    clothingGender: string | null;
    proteinGrams: string | null;
    createdAt: string;
  }>;
  message?: string;
}

interface FavoriteResponse {
  success: boolean;
  isFavorite?: boolean;
  user?: { id: string };
}

// Keep private buyer details only on the authenticated seller's own profile.
interface SellerRequest {
  id: string;
  listingId: string;
  productName: string;
  buyerPhone: string;
  quantity: number;
  buyerMessage: string | null;
  price: string;
  createdAt: string;
}

// Present one seller's public profile and let a signed-in visitor save that seller.
@Component({
  selector: 'app-seller-profile',
  imports: [DatePipe, FormsModule, RouterLink, AccountNavigation],
  templateUrl: './seller-profile.html',
  styleUrl: './seller-profile.css',
})
export class SellerProfile {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly interaction = inject(InteractionFeedback);

  // Page state keeps loading, errors, seller details, and favorite status distinct.
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly messaging = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly seller = signal<SellerProfileResponse['seller'] | null>(null);
  protected readonly listings = signal<SellerProfileResponse['listings']>([]);
  protected readonly isSignedIn = signal(false);
  protected readonly isFavorite = signal(false);
  protected readonly isOwnProfile = signal(false);
  protected readonly requests = signal<SellerRequest[]>([]);
  protected readonly stockDrafts = signal<Record<string, number>>({});
  protected readonly meetingTimes = signal<Record<string, string>>({});
  protected readonly meetingLocations = signal<Record<string, string>>({});
  protected readonly stockBusyId = signal<string | null>(null);
  protected readonly requestBusyId = signal<string | null>(null);
  protected readonly stockNotice = signal('');
  protected readonly requestNotice = signal('');
  private sellerId = '';

  // Load the public page and check the viewer's own session independently.
  constructor() {
    this.route.paramMap.subscribe((params) => {
      const value = params.get('sellerId') ?? '';
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
        this.error.set('This seller link is not valid.');
        this.loading.set(false);
        return;
      }
      this.sellerId = value;
      this.loadProfile();
      this.loadViewerState();
    });
  }

  // Load public listings and reputation totals without requesting private account fields.
  private loadProfile(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<SellerProfileResponse>(`/api/sellers/${this.sellerId}`).subscribe({
      next: (response) => {
        this.seller.set(response.seller);
        this.listings.set(response.listings ?? []);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(
          response.error?.message ?? 'This seller profile could not be loaded. Please try again.',
        );
        this.loading.set(false);
      },
    });
  }

  // Check whether the visitor has a session, then load only their own save status.
  private loadViewerState(): void {
    forkJoin({
      account: this.http.get<FavoriteResponse>('/api/auth/me').pipe(catchError(() => of(null))),
      favorite: this.http
        .get<FavoriteResponse>(`/api/sellers/${this.sellerId}/favorite`)
        .pipe(catchError(() => of(null))),
    }).subscribe(({ account, favorite }) => {
      const signedInUserId = account?.user?.id;
      this.isSignedIn.set(signedInUserId !== undefined && signedInUserId !== null);
      this.isOwnProfile.set(signedInUserId != null && String(signedInUserId) === this.sellerId);
      this.isFavorite.set(favorite?.isFavorite ?? false);
      if (signedInUserId === this.sellerId) {
        void this.router.navigateByUrl('/dashboard');
      }
    });
  }

  // Load pending requests only for the seller who owns the profile being viewed.
  private loadSellerRequests(): void {
    this.http
      .get<{ success: boolean; requests: SellerRequest[]; message?: string }>(
        '/api/orders/seller/requests',
      )
      .subscribe({
        next: (response) => this.requests.set(response.requests ?? []),
        error: (response: HttpErrorResponse) =>
          this.requestNotice.set(response.error?.message ?? 'Buyer requests could not be loaded.'),
      });
  }

  // Keep the input's unsaved stock value separate from the public listing record.
  protected stockValue(listing: SellerProfileResponse['listings'][number]): number {
    return this.stockDrafts()[listing.id] ?? listing.quantityAvailable;
  }

  protected setStockDraft(listingId: string, quantity: number): void {
    this.stockDrafts.update((drafts) => ({ ...drafts, [listingId]: quantity }));
  }

  // Save inventory only through the authenticated owner-only endpoint.
  protected updateStock(listingId: string): void {
    const currentListing = this.listings().find((listing) => listing.id === listingId);
    const quantityAvailable = this.stockDrafts()[listingId] ?? currentListing?.quantityAvailable;
    if (!Number.isInteger(quantityAvailable) || quantityAvailable < 0 || quantityAvailable > 9999) {
      this.stockNotice.set('Enter a whole number from 0 to 9,999.');
      return;
    }
    this.stockBusyId.set(listingId);
    this.stockNotice.set('');
    this.http
      .patch<{ success: boolean; quantityAvailable: number }>(`/api/listings/${listingId}/stock`, {
        quantityAvailable,
      })
      .subscribe({
        next: (response) => {
          this.listings.update((listings) =>
            listings.map((listing) =>
              listing.id === listingId
                ? { ...listing, quantityAvailable: response.quantityAvailable }
                : listing,
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

  // Display a clear availability label and the exact count for every seller offer.
  protected stockLabel(quantity: number | null | undefined): string {
    if (!Number.isSafeInteger(quantity) || quantity === null || quantity === undefined)
      return 'Availability unavailable';
    if (quantity === 0) return 'Out of stock';
    return quantity <= 2 ? `Few left · ${quantity} available` : `In stock · ${quantity} available`;
  }

  protected listingRequests(listingId: string): SellerRequest[] {
    return this.requests().filter((request) => request.listingId === listingId);
  }

  protected setMeetingTime(requestId: string, value: string): void {
    this.meetingTimes.update((times) => ({ ...times, [requestId]: value }));
  }

  protected meetingTimeFor(requestId: string): string {
    return this.meetingTimes()[requestId] || '';
  }

  protected setMeetingLocation(requestId: string, value: string): void {
    this.meetingLocations.update((locations) => ({ ...locations, [requestId]: value }));
  }

  protected meetingLocationFor(requestId: string): string {
    return this.meetingLocations()[requestId] || '';
  }

  // Open a seller chat independently of listings, so buyers can still contact the seller.
  protected messageSeller(): void {
    if (!this.isSignedIn()) {
      this.interaction.askToSignIn('Sign in or create an account to message this seller.', this.router.url);
      return;
    }
    if (!this.sellerId || this.messaging()) return;

    this.messaging.set(true);
    this.notice.set('');
    this.http
      .post<{ success: boolean; conversation: { id: string } | null }>(
        `/api/messages/sellers/${this.sellerId}`,
        {},
      )
      .subscribe({
        next: (response) => {
          this.messaging.set(false);
          void this.router.navigate(
            response.conversation
              ? ['/messages', response.conversation.id]
              : ['/messages', 'new'],
            response.conversation ? undefined : { queryParams: { sellerId: this.sellerId } },
          );
        },
        error: (response: HttpErrorResponse) => {
          this.messaging.set(false);
          if (response.status === 401) {
            this.interaction.askToSignIn('Sign in or create an account to message this seller.', this.router.url);
            return;
          }
          this.notice.set(response.error?.message ?? 'We could not open a chat with this seller.');
          this.interaction.showToast('We could not open a chat with this seller.', 'error');
        },
      });
  }

  // Accept only after a seller gives a future meeting time and campus location.
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
      .patch<{ success: boolean; message?: string }>(`/api/orders/${request.id}`, {
        action,
        ...(action === 'accept' ? { meetingAt: meetingAt?.toISOString(), meetingLocation } : {}),
      })
      .subscribe({
        next: () => {
          this.requests.update((requests) => requests.filter((item) => item.id !== request.id));
          this.requestNotice.set(
            action === 'accept'
              ? `Request accepted. The buyer can see the scheduled meetup in My Orders.`
              : 'Request declined.',
          );
          this.requestBusyId.set(null);
          this.interaction.showToast(action === 'accept' ? 'Buyer request accepted.' : 'Buyer request declined.');
          this.loadProfile();
        },
        error: (response: HttpErrorResponse) => {
          this.requestNotice.set(response.error?.message ?? 'We could not update this request.');
          this.interaction.showToast('We could not update the buyer request.', 'error');
          this.requestBusyId.set(null);
        },
      });
  }

  // Save or unsave this seller using the signed-in user's server-side relationship.
  protected toggleFavorite(): void {
    if (this.isOwnProfile() || this.busy()) return;
    if (!this.isSignedIn()) {
      this.interaction.askToSignIn('Sign in or create an account to follow this seller.', this.router.url);
      return;
    }
    const wasFavorite = this.isFavorite();
    this.busy.set(true);
    this.notice.set('');
    const request = this.isFavorite()
      ? this.http.delete<FavoriteResponse>(`/api/sellers/${this.sellerId}/favorite`)
      : this.http.put<FavoriteResponse>(`/api/sellers/${this.sellerId}/favorite`, {});

    request.subscribe({
      next: (response) => {
        this.isFavorite.set(response.isFavorite ?? false);
        if (response.isFavorite !== wasFavorite) {
          this.seller.update((seller) => seller ? {
            ...seller,
            followerCount: Math.max(0, seller.followerCount + (response.isFavorite ? 1 : -1)),
          } : seller);
        }
        this.notice.set(
          this.isFavorite()
            ? 'You are now following this seller.'
            : 'You unfollowed this seller.',
        );
        this.interaction.showToast(
          this.isFavorite() ? 'Seller added to your saved sellers.' : 'Seller removed from your saved sellers.',
          'success',
          this.isFavorite() ? { label: 'See saved sellers', route: '/followed-sellers' } : undefined,
        );
        this.busy.set(false);
      },
      error: (response: HttpErrorResponse) => {
        if (response.status === 401) {
          this.interaction.askToSignIn('Sign in or create an account to follow this seller.', this.router.url);
          this.busy.set(false);
          return;
        }
        this.notice.set(
          response.error?.message ?? 'We could not update your saved sellers. Please try again.',
        );
        this.interaction.showToast('We could not update your saved sellers.', 'error');
        this.busy.set(false);
      },
    });
  }

  // Convert database enum names into short labels that are easy to scan.
  protected categoryLabel(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
