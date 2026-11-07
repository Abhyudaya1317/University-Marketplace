import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

interface SavedListing {
  savedAt: string;
  listingId: number | string;
  sellerId: number | string;
  sellerName: string;
  sellerAvatarUrl: string | null;
  title: string;
  description: string;
  hashtags: string[];
  price: string;
  photoUrl: string | null;
  condition: string;
  customCondition: string | null;
  category: string;
}

interface FollowedSeller {
  sellerId: number | string;
  sellerName: string;
  sellerAvatarUrl: string | null;
  savedAt: string;
  latestListing: {
    title: string;
    price: string;
    photoUrl: string | null;
    product: { id: number | string; name: string; category: string };
  } | null;
}

// Give the two saved collections separate URLs while keeping their shared shell in one place.
@Component({
  selector: 'app-saved-collections',
  imports: [AccountNavigation, DatePipe, RouterLink],
  templateUrl: './saved-collections.html',
  styleUrl: './saved-collections.css',
})
export class SavedCollections {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly collection = this.route.snapshot.data['collection'] === 'following' ? 'following' : 'wishlist';
  protected readonly isFollowing = this.collection === 'following';
  protected readonly title = computed(() => this.isFollowing ? 'Followed sellers' : 'Wishlist');
  protected readonly listings = signal<SavedListing[]>([]);
  protected readonly sellers = signal<FollowedSeller[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busyId = signal<string | null>(null);

  protected isBusy(id: number | string): boolean {
    return this.busyId() === String(id);
  }

  constructor() {
    if (this.isFollowing) this.loadFollowedSellers();
    else this.loadWishlist();
  }

  protected removeListing(listingId: number | string): void {
    const key = String(listingId);
    if (this.busyId()) return;
    this.busyId.set(key);
    this.notice.set('');
    this.http.delete(`/api/listings/${key}/favorite`).subscribe({
      next: () => {
        this.listings.update((items) => items.filter((item) => String(item.listingId) !== key));
        this.notice.set('Listing removed from your wishlist.');
        this.busyId.set(null);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'This listing could not be removed.');
        this.busyId.set(null);
      },
    });
  }

  protected unfollowSeller(sellerId: number | string): void {
    const key = String(sellerId);
    if (this.busyId()) return;
    this.busyId.set(key);
    this.notice.set('');
    this.http.delete(`/api/sellers/${key}/favorite`).subscribe({
      next: () => {
        this.sellers.update((items) => items.filter((item) => String(item.sellerId) !== key));
        this.notice.set('Seller removed from Followed sellers.');
        this.busyId.set(null);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'This seller could not be unfollowed.');
        this.busyId.set(null);
      },
    });
  }

  private loadWishlist(): void {
    this.http.get<{ listings: SavedListing[] }>('/api/listings/saved').subscribe({
      next: (response) => {
        this.listings.set(response.listings ?? []);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => this.handleLoadError(response),
    });
  }

  private loadFollowedSellers(): void {
    this.http.get<{ sellers: FollowedSeller[] }>('/api/sellers/following').subscribe({
      next: (response) => {
        this.sellers.set(response.sellers ?? []);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => this.handleLoadError(response),
    });
  }

  private handleLoadError(response: HttpErrorResponse): void {
    this.loading.set(false);
    if (response.status === 401) {
      void this.router.navigate(['/auth'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.error.set(response.error?.message ?? `Your ${this.isFollowing ? 'followed sellers' : 'wishlist'} could not be loaded.`);
  }
}
