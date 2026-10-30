import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductEngagement } from '../engagement/product-engagement';
import { AccountNavigation } from '../shared/account-navigation';

// Match the public listing detail response; the listing ID identifies one seller's offer.
interface ListingDetails {
  id: number;
  title: string;
  description: string;
  price: string;
  quantityAvailable: number;
  photoUrl: string | null;
  location: string;
  condition: string;
  clothingGender: string | null;
  proteinGrams: string | null;
  category: string;
  createdAt: string;
  seller: {
    id: number;
    fullName: string;
    avatarUrl: string | null;
    averageRating: number | null;
    reviewCount: number;
  };
}

// Load this page by listing ID so direct links and browser refreshes keep working.
@Component({
  selector: 'app-product-details',
  imports: [DatePipe, FormsModule, ProductEngagement, RouterLink, AccountNavigation],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetails {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly listing = signal<ListingDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly currentUserId = signal<number | null>(null);
  protected readonly saved = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal('');
  protected readonly imageUnavailable = signal(false);
  protected readonly buyerPhone = signal('');
  protected readonly quantity = signal(1);
  protected readonly buyerMessage = signal('');
  protected readonly submittingOrder = signal(false);
  protected readonly orderFeedback = signal('');
  protected readonly startingConversation = signal(false);
  protected readonly engagementOffers = computed(() => {
    const current = this.listing();
    return current ? [{ id: current.id, sellerId: current.seller.id, price: current.price }] : [];
  });

  constructor() {
    this.http.get<{ user?: { id: number } }>('/api/auth/me').subscribe({
      next: (response) => this.currentUserId.set(response.user?.id ?? null),
      error: () => this.currentUserId.set(null),
    });
    this.route.paramMap.subscribe((params) => {
      const listingId = Number(params.get('listingId'));
      if (!Number.isSafeInteger(listingId) || listingId < 1) {
        this.error.set('This listing link is invalid.');
        this.loading.set(false);
        return;
      }
      this.loadListing(listingId);
    });
  }

  private loadListing(listingId: number): void {
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<{ success: boolean; listing: ListingDetails; message?: string }>(
        `/api/listings/public/${listingId}`,
      )
      .subscribe({
        next: (response) => {
          this.listing.set(response.listing);
          this.loading.set(false);
          this.loadSavedState(listingId);
        },
        error: (response: HttpErrorResponse) => {
          this.error.set(response.error?.message ?? 'This listing could not be loaded.');
          this.loading.set(false);
        },
      });
  }

  // Read saved listing IDs from the signed-in account; guest browsing remains public.
  private loadSavedState(listingId: number): void {
    this.http.get<{ listingIds: number[] }>('/api/listings/favorites').subscribe({
      next: (response) => this.saved.set((response.listingIds ?? []).includes(listingId)),
      error: () => this.saved.set(false),
    });
  }

  // Change the heart only after the server confirms that this one listing was changed.
  protected toggleSaved(): void {
    const listing = this.listing();
    if (!listing || this.saving()) return;
    this.saving.set(true);
    this.feedback.set('');
    const request = this.saved()
      ? this.http.delete<{ isSaved: boolean }>(`/api/listings/${listing.id}/favorite`)
      : this.http.put<{ isSaved: boolean }>(`/api/listings/${listing.id}/favorite`, {});
    request.subscribe({
      next: (response) => {
        this.saved.set(response.isSaved);
        this.feedback.set(
          response.isSaved ? 'Saved to your wishlist.' : 'Removed from your wishlist.',
        );
        this.saving.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.feedback.set(
          response.status === 401
            ? 'Sign in to save this listing.'
            : (response.error?.message ?? 'Wishlist could not be updated.'),
        );
        this.saving.set(false);
      },
    });
  }

  // Ask to buy the exact listing shown here; the seller still decides whether to accept.
  protected requestToBuy(): void {
    const listing = this.listing();
    if (!listing || this.submittingOrder()) return;
    this.submittingOrder.set(true);
    this.orderFeedback.set('');
    this.http
      .post<{ success: boolean; message?: string }>('/api/orders', {
        listingId: listing.id,
        buyerPhone: this.buyerPhone().trim(),
        quantity: this.quantity(),
        buyerMessage: this.buyerMessage().trim(),
      })
      .subscribe({
        next: () => {
          this.orderFeedback.set('Request sent. The seller can accept or decline it.');
          this.submittingOrder.set(false);
        },
        error: (response: HttpErrorResponse) => {
          this.orderFeedback.set(response.error?.message ?? 'We could not send your request.');
          this.submittingOrder.set(false);
        },
      });
  }

  // Open or resume a private chat for this exact listing after the server checks access.
  protected messageSeller(): void {
    const listing = this.listing();
    if (!listing || !this.currentUserId() || this.startingConversation()) return;
    this.startingConversation.set(true);
    this.feedback.set('');
    this.http
      .post<{ success: boolean; conversation: { id: number }; message?: string }>(
        `/api/messages/listings/${listing.id}`,
        {},
      )
      .subscribe({
        next: (response) => {
          this.startingConversation.set(false);
          void this.router.navigate(['/messages', response.conversation.id]);
        },
        error: (response: HttpErrorResponse) => {
          this.feedback.set(response.error?.message ?? 'We could not open a chat with this seller.');
          this.startingConversation.set(false);
        },
      });
  }

  protected categoryLabel(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  protected stockLabel(quantity: number): string {
    if (quantity === 0) return 'Out of stock';
    return quantity <= 2 ? `Few left · ${quantity} available` : `In stock · ${quantity} available`;
  }
}
