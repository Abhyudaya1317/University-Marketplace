import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

interface AdminOverview {
  users: number;
  bannedUsers: number;
  activeListings: number;
  removedListings: number;
  orders: number;
}

interface AdminUser {
  id: number;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  bannedAt: string | null;
  banReason: string | null;
  listingCount: number;
}

interface AdminListing {
  id: number;
  title: string;
  description: string;
  price: string;
  quantityAvailable: number;
  phoneNumber: string;
  location: string;
  condition: string;
  customCondition: string | null;
  clothingGender: string | null;
  proteinGrams: string | null;
  posterSize: string | null;
  hashtags: string[];
  photoUrl: string | null;
  photoUrl2: string | null;
  photoUrl3: string | null;
  photoUrl4: string | null;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  product: { id: number; name: string; category: string };
  seller: { id: number; fullName: string | null; email: string; bannedAt: string | null };
  orderCount: number;
}

interface ListingDraft {
  name: string;
  category: string;
  description: string;
  hashtags: string;
  price: string;
  phoneNumber: string;
  quantityAvailable: number;
  location: string;
  condition: string;
  customCondition: string;
  clothingGender: string;
  proteinGrams: string;
  posterSize: string;
  photoUrl: string;
  photoUrl2: string;
  photoUrl3: string;
  photoUrl4: string;
}

type AdminTab = 'users' | 'listings';

// One protected console for the current administrator's user and listing controls.
@Component({
  selector: 'app-admin-console',
  imports: [DatePipe, FormsModule, RouterLink, AccountNavigation],
  templateUrl: './admin-console.html',
  styleUrl: './admin-console.css',
})
export class AdminConsole {
  private readonly http = inject(HttpClient);

  protected readonly access = signal<'checking' | 'allowed' | 'signed-out' | 'denied'>('checking');
  protected readonly tab = signal<AdminTab>('users');
  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly listings = signal<AdminListing[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly selectedBanUser = signal<AdminUser | null>(null);
  protected readonly editingListing = signal<AdminListing | null>(null);
  protected readonly removingListing = signal<AdminListing | null>(null);
  protected readonly categories = [
    'CLOTHING', 'ACCESSORIES', 'JEWELLERY', 'SHOES', 'FOOD', 'ELECTRONICS', 'BEAUTY',
    'TEMPORARY_TATTOOS', 'ARTWORK', 'PROJECTS', 'SPORTS_EQUIPMENT', 'MUSICAL_INSTRUMENTS',
    'POSTERS', 'KITCHEN_ITEMS', 'DAILY_USE', 'OTHER', 'WAX_CANDLES', 'GIFTS',
  ];
  protected readonly conditions = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'OLD', 'FRESH', 'PACKAGED', 'OPENED', 'PREPARED', 'FROZEN', 'CUSTOM'];
  protected readonly genders = ['MEN', 'WOMEN', 'UNISEX', 'OTHER'];

  protected userSearch = '';
  protected listingSearch = '';
  protected listingStatus = 'ALL';
  protected banReason = '';
  protected draft: ListingDraft | null = null;

  constructor() {
    // Check the server's account allowlist before requesting protected admin data.
    this.http.get<{ user?: { isAdmin?: boolean } }>('/api/auth/me').subscribe({
      next: (response) => {
        if (!response.user) {
          this.access.set('signed-out');
          return;
        }
        if (!response.user.isAdmin) {
          this.access.set('denied');
          return;
        }
        this.access.set('allowed');
        this.refreshAll();
      },
      error: (error: HttpErrorResponse) =>
        this.access.set(error.status === 401 ? 'signed-out' : 'denied'),
    });
  }

  // Refresh real totals and the current tab from the protected API.
  protected refreshAll(): void {
    this.loadOverview();
    this.loadUsers();
    this.loadListings();
  }

  protected chooseTab(tab: AdminTab): void {
    this.tab.set(tab);
    this.error.set('');
  }

  protected loadOverview(): void {
    this.http.get<{ overview: AdminOverview }>('/api/admin/overview').subscribe({
      next: (response) => this.overview.set(response.overview),
      error: (error: HttpErrorResponse) => this.showError(error, 'Overview could not be loaded.'),
    });
  }

  protected loadUsers(): void {
    const params = this.userSearch.trim() ? new HttpParams().set('q', this.userSearch.trim()) : undefined;
    this.loading.set(true);
    this.http.get<{ users: AdminUser[] }>('/api/admin/users', { params }).subscribe({
      next: (response) => { this.users.set(response.users); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.showError(error, 'Users could not be loaded.'); this.loading.set(false); },
    });
  }

  protected loadListings(): void {
    let params = new HttpParams().set('status', this.listingStatus);
    if (this.listingSearch.trim()) params = params.set('q', this.listingSearch.trim());
    this.loading.set(true);
    this.http.get<{ listings: AdminListing[] }>('/api/admin/listings', { params }).subscribe({
      next: (response) => { this.listings.set(response.listings); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.showError(error, 'Listings could not be loaded.'); this.loading.set(false); },
    });
  }

  protected askToBan(user: AdminUser): void {
    this.banReason = '';
    this.selectedBanUser.set(user);
  }

  protected confirmBan(): void {
    const user = this.selectedBanUser();
    if (!user) return;
    this.runAction(`/api/admin/users/${user.id}/ban`, { reason: this.banReason }, 'Account access suspended.', () => {
      this.selectedBanUser.set(null);
      this.loadUsers();
      this.loadOverview();
    });
  }

  protected unban(user: AdminUser): void {
    this.runAction(`/api/admin/users/${user.id}/unban`, {}, 'Account access restored.', () => {
      this.loadUsers();
      this.loadOverview();
    });
  }

  protected startEdit(listing: AdminListing): void {
    this.editingListing.set(listing);
    this.draft = {
      name: listing.title,
      category: listing.product.category,
      description: listing.description,
      hashtags: listing.hashtags.join(', '),
      price: listing.price,
      phoneNumber: listing.phoneNumber,
      quantityAvailable: listing.quantityAvailable,
      location: listing.location,
      condition: listing.condition,
      customCondition: listing.customCondition ?? '',
      clothingGender: listing.clothingGender ?? '',
      proteinGrams: listing.proteinGrams ?? '0',
      posterSize: listing.posterSize ?? '',
      photoUrl: listing.photoUrl ?? '',
      photoUrl2: listing.photoUrl2 ?? '',
      photoUrl3: listing.photoUrl3 ?? '',
      photoUrl4: listing.photoUrl4 ?? '',
    };
  }

  protected saveListing(): void {
    const listing = this.editingListing();
    if (!listing || !this.draft) return;
    this.runAction(`/api/admin/listings/${listing.id}`, this.draft, 'Listing changes saved.', () => {
      this.editingListing.set(null);
      this.draft = null;
      this.loadListings();
    });
  }

  protected askToRemove(listing: AdminListing): void {
    this.removingListing.set(listing);
  }

  protected confirmRemove(): void {
    const listing = this.removingListing();
    if (!listing) return;
    this.runAction(`/api/admin/listings/${listing.id}/remove`, {}, 'Listing archived and hidden from the marketplace.', () => {
      this.removingListing.set(null);
      this.loadListings();
      this.loadOverview();
    });
  }

  protected restoreListing(listing: AdminListing): void {
    this.runAction(`/api/admin/listings/${listing.id}/restore`, {}, 'Listing restored to the marketplace.', () => {
      this.loadListings();
      this.loadOverview();
    });
  }

  private runAction(url: string, body: object, success: string, afterSuccess: () => void): void {
    this.error.set('');
    this.notice.set('');
    this.http.patch<{ message?: string }>(url, body).subscribe({
      next: (response) => { this.notice.set(response.message ?? success); afterSuccess(); },
      error: (error: HttpErrorResponse) => this.showError(error, 'That change could not be saved.'),
    });
  }

  private showError(error: HttpErrorResponse, fallback: string): void {
    this.error.set(error.error?.message ?? fallback);
  }
}
