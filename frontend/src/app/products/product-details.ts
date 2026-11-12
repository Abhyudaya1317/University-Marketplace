import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductEngagement } from '../engagement/product-engagement';
import { AccountNavigation } from '../shared/account-navigation';
import { InteractionFeedback } from '../shared/interaction-feedback';

// Match the public listing detail response; the listing ID identifies one seller's offer.
interface ListingDetails {
  id: string;
  title: string;
  description: string;
  hashtags: string[];
  price: string;
  quantityAvailable: number;
  photoUrl: string | null;
  photoUrl2: string | null;
  photoUrl3: string | null;
  photoUrl4: string | null;
  location: string;
  condition: string;
  customCondition: string | null;
  clothingGender: string | null;
  clothingSizes: string | null;
  color: string | null;
  proteinGrams: string | null;
  posterSize: string | null;
  category: string;
  createdAt: string;
  seller: {
    id: string;
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
  private readonly interaction = inject(InteractionFeedback);
  protected readonly listing = signal<ListingDetails | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly currentUserId = signal<string | null>(null);
  protected readonly sessionCheckComplete = signal(false);
  protected readonly sessionError = signal('');
  protected readonly saved = signal(false);
  protected readonly saving = signal(false);
  protected readonly feedback = signal('');
  protected readonly unavailablePhotoUrls = signal<Set<string>>(new Set());
  protected readonly activePhotoIndex = signal(0);
  protected readonly imageViewerOpen = signal(false);
  protected readonly productPhotos = computed(() => {
    const item = this.listing();
    return [item?.photoUrl, item?.photoUrl2, item?.photoUrl3, item?.photoUrl4]
      .filter((url): url is string => Boolean(url));
  });
  protected readonly activePhotoUrl = computed(() => this.productPhotos()[this.activePhotoIndex()] ?? null);
  protected readonly buyerPhone = signal('');
  protected readonly quantity = signal(1);
  protected readonly buyerMessage = signal('');
  protected readonly submittingOrder = signal(false);
  protected readonly archiveDialogOpen = signal(false);
  protected readonly archiving = signal(false);
  protected readonly archiveError = signal('');
  protected readonly orderFeedback = signal('');
  protected readonly requestSubmitted = signal(false);
  protected readonly startingConversation = signal(false);
  private photoTouchStartX: number | null = null;
  protected readonly engagementOffers = computed(() => {
    const current = this.listing();
    return current ? [{ id: current.id, sellerId: current.seller.id, price: current.price }] : [];
  });

  constructor() {
    this.http.get<{ user?: { id: string } }>('/api/auth/me').subscribe({
      next: (response) => {
        this.currentUserId.set(response.user?.id == null ? null : String(response.user.id));
        this.sessionCheckComplete.set(true);
      },
      error: (response: HttpErrorResponse) => {
        this.currentUserId.set(null);
        this.sessionCheckComplete.set(true);
        if (response.status !== 401) {
          this.sessionError.set(
            response.status === 0
              ? 'CampusX could not reach the backend. Start the backend server, then try messaging again.'
              : 'CampusX could not verify your sign-in. Refresh the page and try again.',
          );
        }
      },
    });
    this.route.paramMap.subscribe((params) => {
      const listingId = params.get('listingId');
      if (!listingId || !/^\d+$/.test(listingId) || !Number.isSafeInteger(Number(listingId)) || Number(listingId) < 1) {
        this.error.set('This listing link is invalid.');
        this.loading.set(false);
        return;
      }
      this.loadListing(listingId);
    });
  }

  private loadListing(listingId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.activePhotoIndex.set(0);
    this.unavailablePhotoUrls.set(new Set());
    this.orderFeedback.set('');
    this.requestSubmitted.set(false);
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
  private loadSavedState(listingId: string): void {
    this.http.get<{ listingIds: string[] }>('/api/listings/favorites').subscribe({
      next: (response) => this.saved.set((response.listingIds ?? []).includes(listingId)),
      error: () => this.saved.set(false),
    });
  }

  // Change the heart only after the server confirms that this one listing was changed.
  protected toggleSaved(): void {
    const listing = this.listing();
    if (!listing || this.saving()) return;
    if (!this.currentUserId()) {
      this.interaction.askToSignIn('Sign in or create an account to save this item.', this.router.url);
      return;
    }
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
        this.interaction.showToast(
          response.isSaved ? 'Item saved to your wishlist.' : 'Item removed from your wishlist.',
          'success',
          response.isSaved ? { label: 'See saved items', route: '/wishlist' } : undefined,
        );
        this.saving.set(false);
      },
      error: (response: HttpErrorResponse) => {
        if (response.status === 401) {
          this.interaction.askToSignIn('Sign in or create an account to save this item.', this.router.url);
          this.saving.set(false);
          return;
        }
        this.feedback.set(
          response.error?.message ?? 'Wishlist could not be updated.',
        );
        this.interaction.showToast('Wishlist could not be updated. Please try again.', 'error');
        this.saving.set(false);
      },
    });
  }

  // Ask to buy the exact listing shown here; the seller still decides whether to accept.
  protected requestToBuy(): void {
    const listing = this.listing();
    if (!listing || this.submittingOrder()) return;
    if (!this.currentUserId()) {
      this.interaction.askToSignIn('Sign in or create an account to send a request to this seller.', this.router.url);
      return;
    }
    if (!Number.isSafeInteger(this.quantity()) || this.quantity() < 1 || this.quantity() > listing.quantityAvailable) {
      this.orderFeedback.set(`Choose a whole-number quantity from 1 to ${listing.quantityAvailable}.`);
      return;
    }
    const phone = this.buyerPhone().trim();
    const phoneDigits = phone.replace(/\D/g, '').length;
    if (!/^[+\d\s().-]+$/.test(phone) || phoneDigits < 7 || phoneDigits > 15) {
      const message = 'Enter a valid phone number so the seller can arrange pickup.';
      this.orderFeedback.set(message);
      this.interaction.showToast(message, 'error');
      return;
    }
    this.submittingOrder.set(true);
    this.orderFeedback.set('');
    this.http
      .post<{ success: boolean; message?: string }>('/api/orders', {
        listingId: listing.id,
        buyerPhone: phone,
        quantity: this.quantity(),
        buyerMessage: this.buyerMessage().trim(),
      })
      .subscribe({
        next: () => {
          this.orderFeedback.set('Request sent. The seller can accept or decline it.');
          this.requestSubmitted.set(true);
          this.interaction.showToast('Your request was sent to the seller.', 'success', {
            label: 'See your requests',
            route: '/orders',
          });
          this.submittingOrder.set(false);
        },
        error: (response: HttpErrorResponse) => {
          if (response.status === 401) {
            this.interaction.askToSignIn('Sign in or create an account to send a request to this seller.', this.router.url);
            this.submittingOrder.set(false);
            return;
          }
          const message = typeof response.error?.message === 'string'
            ? response.error.message
            : 'We could not send your request. Please try again.';
          this.orderFeedback.set(message);
          this.interaction.showToast(message, 'error');
          this.submittingOrder.set(false);
        },
      });
  }

  // Open or resume a private chat for this exact listing after the server checks access.
  protected messageSeller(): void {
    const listing = this.listing();
    if (!listing || this.startingConversation()) return;
    if (!this.currentUserId()) {
      this.interaction.askToSignIn('Sign in or create an account to message this seller.', this.router.url);
      return;
    }
    this.startingConversation.set(true);
    this.feedback.set('');
    this.http
      .post<{ success: boolean; conversation: { id: string } | null; message?: string }>(
        `/api/messages/listings/${listing.id}`,
        {},
      )
      .subscribe({
        next: (response) => {
          this.startingConversation.set(false);
          void this.router.navigate(
            response.conversation
              ? ['/messages', response.conversation.id]
              : ['/messages', 'new'],
            response.conversation ? undefined : { queryParams: { listingId: listing.id } },
          );
        },
        error: (response: HttpErrorResponse) => {
          if (response.status === 401) {
            this.interaction.askToSignIn('Sign in or create an account to message this seller.', this.router.url);
          }
          this.feedback.set(this.chatErrorMessage(response));
          this.startingConversation.set(false);
        },
      });
  }

  // Explain whether chat failed because of sign-in, a missing listing, or the backend.
  private chatErrorMessage(response: HttpErrorResponse): string {
    if (response.status === 0) {
      return 'CampusX could not reach the backend. Start the backend server, then try again.';
    }
    if (response.status === 401) {
      return 'Your sign-in could not be verified. Sign in again, then retry messaging.';
    }
    if (response.status >= 500) {
      return 'CampusX could not create the chat. Check that PostgreSQL is running and the latest database migrations are applied.';
    }
    return response.error?.message ?? 'We could not open a chat with this seller.';
  }

  protected categoryLabel(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // Keep color information off categories where color is not a useful listing attribute.
  protected supportsColorField(category: string): boolean {
    return !['DAILY_USE', 'FOOD', 'KITCHEN_ITEMS', 'POSTERS', 'PROJECTS', 'SPORTS_EQUIPMENT'].includes(category);
  }

  // Switch between the listing photos without stretching either image.
  protected stepPhoto(direction: number): void {
    const count = this.productPhotos().length;
    if (count < 2) return;
    this.activePhotoIndex.update((index) => (index + direction + count) % count);
  }

  protected openImageViewer(): void {
    if (this.activePhotoUrl()) this.imageViewerOpen.set(true);
  }

  protected closeImageViewer(): void {
    this.imageViewerOpen.set(false);
  }

  protected photoTouchStart(event: TouchEvent): void {
    this.photoTouchStartX = event.changedTouches[0]?.clientX ?? null;
  }

  protected photoTouchEnd(event: TouchEvent): void {
    const startX = this.photoTouchStartX;
    this.photoTouchStartX = null;
    const endX = event.changedTouches[0]?.clientX;
    if (startX === null || endX === undefined) return;
    const distance = endX - startX;
    if (Math.abs(distance) < 40) return;
    this.stepPhoto(distance < 0 ? 1 : -1);
  }

  protected shareListing(): void {
    const listing = this.listing();
    if (!listing) return;
    this.interaction.openSharePrompt(
      listing.title,
      new URL(`/products/${listing.id}`, window.location.origin).toString(),
    );
  }

  protected isPhotoAvailable(url: string): boolean {
    return !this.unavailablePhotoUrls().has(url);
  }

  protected markPhotoUnavailable(url: string): void {
    this.unavailablePhotoUrls.update((urls) => new Set(urls).add(url));

      // If one photo URL is broken, automatically show the next available uploaded photo.
      const photos = this.productPhotos();
      if (photos.length > 1 && photos[this.activePhotoIndex()] === url) {
        const currentIndex = this.activePhotoIndex();
        for (let offset = 1; offset < photos.length; offset += 1) {
          const nextIndex = (currentIndex + offset) % photos.length;
          if (!this.unavailablePhotoUrls().has(photos[nextIndex])) {
            this.activePhotoIndex.set(nextIndex);
            break;
          }
        }
      }
  }

  protected conditionLabel(item: ListingDetails): string {
    if (item.condition === 'CUSTOM' && item.customCondition) return item.customCondition;
    const labels: Record<string, string> = {
      NEW: 'Brand new', LIKE_NEW: 'Like new', GOOD: 'Good', FAIR: 'Fair', OLD: 'Old / used',
      FRESH: 'Fresh', PACKAGED: 'Packaged and sealed', OPENED: 'Opened / partially used',
      PREPARED: 'Prepared fresh', FROZEN: 'Frozen'
    };
    return labels[item.condition] ?? item.condition;
  }

  // Keep food protein information with its description and use 0/null for a non-protein food.
  protected foodProteinDescription(item: ListingDetails): string {
    const grams = Number(item.proteinGrams ?? 0);
    return grams > 0
      ? `Protein-rich food: Yes · ${grams.toFixed(2)} g per serving`
      : 'Protein-rich food: No';
  }

  protected stockLabel(quantity: number): string {
    if (quantity === 0) return 'Out of stock';
    return quantity <= 2 ? `Few left · ${quantity} available` : `In stock · ${quantity} available`;
  }

  // Compare normalized IDs because the API may serialize database IDs as numbers or strings.
  protected isOwnListing(item: ListingDetails): boolean {
    return this.currentUserId() !== null && String(this.currentUserId()) === String(item.seller.id);
  }

  // Ask the owner before removing this listing from public search and seller pages.
  protected askToArchive(): void {
    this.archiveError.set('');
    this.archiveDialogOpen.set(true);
  }

  protected cancelArchive(): void {
    if (!this.archiving()) this.archiveDialogOpen.set(false);
  }

  protected confirmArchive(): void {
    const item = this.listing();
    if (!item || !this.isOwnListing(item) || this.archiving()) return;
    this.archiving.set(true);
    this.archiveError.set('');
    this.http.patch<{ success: boolean }>(`/api/listings/${item.id}/archive`, {}).subscribe({
      next: () => {
        this.archiveDialogOpen.set(false);
        this.archiving.set(false);
        void this.router.navigate(['/items-selling'], { queryParams: { notice: 'archived' } });
      },
      error: (response: HttpErrorResponse) => {
        this.archiveError.set(response.error?.message ?? 'This listing could not be archived.');
        this.archiving.set(false);
      },
    });
  }
}
