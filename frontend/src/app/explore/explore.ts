import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

// One Explore card represents one seller's listing, with its own ID and price.
interface ExploreListing {
  id: number;
  sellerId: number;
  sellerName: string;
  title: string;
  category: string;
  description: string;
  price: string;
  quantityAvailable: number;
  photoUrl: string | null;
  photoUrl2: string | null;
  condition: string;
  customCondition: string | null;
}

interface ExploreResponse {
  success: boolean;
  listings: ExploreListing[];
  suggestions?: Array<{ id: number; name: string; category: string }>;
  message?: string;
}

// Keep search, optional filters, and individual listing results in one feature component.
@Component({
  selector: 'app-explore',
  imports: [FormsModule, RouterLink, AccountNavigation],
  templateUrl: './explore.html',
  styleUrl: './explore.css',
})
export class Explore {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly listings = signal<ExploreListing[]>([]);
  protected readonly suggestions = signal<NonNullable<ExploreResponse['suggestions']>>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly showSuggestions = signal(false);
  protected readonly searchText = signal('');
  protected readonly selectedCategory = signal('');
  protected readonly selectedGender = signal('');
  protected readonly proteinOnly = signal(false);
  protected readonly randomizedIds = signal<number[]>([]);
  protected readonly searchSubmitted = signal(false);
  protected readonly unavailablePhotoIds = signal<Set<number>>(new Set());
  protected readonly photoIndexes = signal<Record<number, number>>({});
  protected readonly visibleListings = computed(() => {
    const results = this.listings();
    const order = this.randomizedIds();
    if (!order.length) return results;
    const byId = new Map(results.map((listing) => [listing.id, listing]));
    return order
      .map((id) => byId.get(id))
      .filter((listing): listing is ExploreListing => Boolean(listing));
  });
  private latestRequest = 0;
  private searchDebounce?: ReturnType<typeof setTimeout>;

  protected readonly categories = [
    { value: 'CLOTHING', label: 'Clothing' },
    { value: 'ACCESSORIES', label: 'Accessories' },
    { value: 'SHOES', label: 'Shoes' },
    { value: 'FOOD', label: 'Food' },
    { value: 'ELECTRONICS', label: 'Electronics' },
    { value: 'BEAUTY', label: 'Beauty products' },
    { value: 'ARTWORK', label: 'Artwork' },
    { value: 'SPORTS_EQUIPMENT', label: 'Sports equipment' },
    { value: 'MUSICAL_INSTRUMENTS', label: 'Musical instruments' },
    { value: 'ROOM_DECOR', label: 'Room decorations' },
    { value: 'KITCHEN_ITEMS', label: 'Kitchen items' },
    { value: 'DAILY_USE', label: 'Daily-use products' },
    { value: 'OTHER', label: 'Other' },
  ];

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const category = params.get('category') ?? '';
      const search = params.get('search') ?? '';
      const categoryChanged = category !== this.selectedCategory();
      this.selectedCategory.set(category);
      this.searchText.set(search);
      if (categoryChanged) {
        this.selectedGender.set('');
        this.proteinOnly.set(false);
      }
      this.loadListings();
    });
  }

  protected searchProducts(): void {
    this.searchSubmitted.set(true);
    this.showSuggestions.set(false);
    this.loadListings();
  }

  protected selectSuggestion(name: string): void {
    this.searchText.set(name);
    this.searchSubmitted.set(true);
    this.showSuggestions.set(false);
    this.loadListings();
  }

  protected onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.showSuggestions.set(Boolean(value.trim()));
    this.searchSubmitted.set(false);
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.loadListings(), 250);
  }

  protected onCategoryChange(value: string): void {
    this.selectedCategory.set(value);
    this.selectedGender.set('');
    this.proteinOnly.set(false);
    this.randomizedIds.set([]);
    this.loadListings();
  }

  protected loadDetailFilter(): void {
    this.randomizedIds.set([]);
    this.loadListings();
  }
  protected openSuggestions(): void {
    if (this.searchText().trim()) this.showSuggestions.set(true);
  }
  protected closeSuggestionsSoon(): void {
    setTimeout(() => this.showSuggestions.set(false), 150);
  }

  protected clearSearch(): void {
    this.searchText.set('');
    this.searchSubmitted.set(false);
    this.showSuggestions.set(false);
    clearTimeout(this.searchDebounce);
    this.loadListings();
  }

  protected randomizeResults(): void {
    const ids = this.listings().map((listing) => listing.id);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
    }
    this.randomizedIds.set(ids);
  }

  protected categoryLabel(value: string): string {
    return this.categories.find((category) => category.value === value)?.label ?? 'Other';
  }

  protected conditionLabel(value: string): string {
    return value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  protected listingConditionLabel(listing: ExploreListing): string {
    if (listing.condition === 'CUSTOM' && listing.customCondition) return listing.customCondition;
    if (listing.condition === 'NEW') return 'Brand new';
    if (listing.condition === 'OLD') return 'Old / used';
    return this.conditionLabel(listing.condition);
  }

  protected photoFor(listing: ExploreListing): string | null {
    const photos = [listing.photoUrl, listing.photoUrl2].filter((url): url is string => Boolean(url));
    if (!photos.length || this.unavailablePhotoIds().has(listing.id)) return null;
    return photos[this.photoIndexes()[listing.id] ?? 0] ?? photos[0];
  }

  protected stepPhoto(listing: ExploreListing, direction: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const count = [listing.photoUrl, listing.photoUrl2].filter(Boolean).length;
    if (count < 2) return;
    this.photoIndexes.update((indexes) => ({ ...indexes, [listing.id]: ((indexes[listing.id] ?? 0) + direction + count) % count }));
  }

  protected markPhotoUnavailable(listingId: number): void {
    this.unavailablePhotoIds.update((ids) => new Set(ids).add(listingId));
  }

  protected stockLabel(quantity: number): string {
    return quantity <= 2 ? `Few left · ${quantity} available` : `In stock · ${quantity} available`;
  }

  protected get showClothingFilters(): boolean {
    return this.selectedCategory() === 'CLOTHING';
  }
  protected get showFoodFilters(): boolean {
    return this.selectedCategory() === 'FOOD';
  }

  private loadListings(): void {
    const requestId = ++this.latestRequest;
    this.loading.set(true);
    this.error.set('');
    let params = new HttpParams();
    const search = this.searchText().trim();
    if (search) params = params.set('search', search);
    if (this.selectedCategory()) params = params.set('category', this.selectedCategory());
    if (this.selectedGender()) params = params.set('gender', this.selectedGender());
    if (this.proteinOnly() && this.selectedCategory() === 'FOOD') params = params.set('proteinOnly', 'true');
    this.http.get<ExploreResponse>('/api/products', { params }).subscribe({
      next: (response) => {
        if (requestId !== this.latestRequest) return;
        this.listings.set(response.listings ?? []);
        this.suggestions.set(response.suggestions ?? []);
        this.randomizedIds.set([]);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        if (requestId !== this.latestRequest) return;
        this.listings.set([]);
        this.error.set(
          response.error?.message ?? 'Products could not be loaded. Please try again.',
        );
        this.loading.set(false);
      },
    });
  }
}
