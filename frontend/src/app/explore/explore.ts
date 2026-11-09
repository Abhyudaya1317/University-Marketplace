import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

// One Explore card represents one seller's listing, with its own ID and price.
interface ExploreListing {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  hashtags: string[];
  category: string;
  description: string;
  price: string;
  quantityAvailable: number;
  photoUrl: string | null;
  photoUrl2: string | null;
  photoUrl3: string | null;
  photoUrl4: string | null;
  condition: string;
  customCondition: string | null;
  clothingGender: string | null;
}

interface ExploreResponse {
  success: boolean;
  listings: ExploreListing[];
  suggestions?: Array<{ id: string; name: string; category: string }>;
  nextCursor?: string | null;
  message?: string;
}

interface ExploreCacheEntry {
  savedAt: number;
  response: ExploreResponse;
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
  protected readonly refreshing = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly hasLoadedData = signal(false);
  protected readonly refreshNotice = signal('');
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly showSuggestions = signal(false);
  protected readonly searchText = signal('');
  protected readonly selectedCategory = signal('');
  protected readonly selectedGender = signal('');
  protected readonly proteinOnly = signal(false);
  protected readonly randomizedIds = signal<string[]>([]);
  protected readonly searchSubmitted = signal(false);
  protected readonly unavailablePhotoIds = signal<Set<string>>(new Set());
  protected readonly photoIndexes = signal<Record<string, number>>({});
  protected readonly visibleListings = computed(() => {
    // Keep the gender filter enforced in the UI as well as by the API response.
    const gender = this.selectedGender();
    const results = this.listings().filter(
      (listing) => !gender || listing.clothingGender === gender,
    );
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
    { value: 'PROJECTS', label: 'Projects' },
    { value: 'SPORTS_EQUIPMENT', label: 'Sports equipment' },
    { value: 'MUSICAL_INSTRUMENTS', label: 'Musical instruments' },
    { value: 'POSTERS', label: 'Posters' },
    { value: 'KITCHEN_ITEMS', label: 'Kitchen items' },
    { value: 'DAILY_USE', label: 'Daily-use products' },
    { value: 'OTHER', label: 'Other' },
  ];

  // Give each listing card a stable retro filename; its window controls remain decorative.
  protected listingWindowTitle(id: string): string {
    const number = Number(id);
    return Number.isSafeInteger(number) && number > 0
      ? `ITEM_${String(number).padStart(3, '0')}.JPG`
      : 'ITEM.SYS';
  }

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

  // Apply a clothing gender immediately and request only listings for that value.
  protected onGenderChange(value: string): void {
    this.selectedGender.set(value);
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
    if (listing.condition === 'FRESH') return 'Fresh';
    if (listing.condition === 'PACKAGED') return 'Packaged and sealed';
    if (listing.condition === 'OPENED') return 'Opened / partially used';
    if (listing.condition === 'PREPARED') return 'Prepared fresh';
    if (listing.condition === 'FROZEN') return 'Frozen';
    return this.conditionLabel(listing.condition);
  }

  protected photoFor(listing: ExploreListing): string | null {
    const photos = this.listingPhotos(listing);
    if (!photos.length || this.unavailablePhotoIds().has(listing.id)) return null;
    return photos[this.photoIndexes()[listing.id] ?? 0] ?? photos[0];
  }

  protected photoCount(listing: ExploreListing): number {
    return this.listingPhotos(listing).length;
  }

  protected stepPhoto(listing: ExploreListing, direction: number, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const count = this.photoCount(listing);
    if (count < 2) return;
    this.photoIndexes.update((indexes) => ({ ...indexes, [listing.id]: ((indexes[listing.id] ?? 0) + direction + count) % count }));
  }

  private listingPhotos(listing: ExploreListing): string[] {
    return [listing.photoUrl, listing.photoUrl2, listing.photoUrl3, listing.photoUrl4]
      .filter((url): url is string => Boolean(url));
  }

  protected markPhotoUnavailable(listingId: string): void {
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

  protected loadMoreListings(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore() || this.refreshing()) return;
    this.loadListings(cursor, true);
  }

  private loadListings(cursor?: string, append = false): void {
    const requestId = ++this.latestRequest;
    this.loadingMore.set(append);
    let params = this.buildListingParams();
    if (!append) {
      const cached = this.readCache(this.cacheKey(params));
      if (cached) {
        this.applyResponse(cached);
        this.hasLoadedData.set(true);
        this.loading.set(false);
      } else {
        this.nextCursor.set(null);
        this.loading.set(!this.hasLoadedData());
      }
      this.refreshing.set(true);
      this.refreshNotice.set(this.hasLoadedData() ? 'Updating listings…' : '');
      this.error.set('');
    }
    if (cursor) params = params.set('cursor', cursor);
    const cacheKey = this.cacheKey(params);
    this.http.get<ExploreResponse>('/api/products', { params }).subscribe({
      next: (response) => {
        if (requestId !== this.latestRequest) return;
        if (append) {
          const existing = this.listings();
          const seen = new Set(existing.map((listing) => String(listing.id)));
          this.listings.set([...existing, ...(response.listings ?? []).filter((listing) => !seen.has(String(listing.id)))]);
        } else {
          this.applyResponse(response);
          this.writeCache(cacheKey, response);
        }
        this.nextCursor.set(response.nextCursor ?? null);
        this.randomizedIds.set([]);
        this.hasLoadedData.set(true);
        this.loading.set(false);
        this.refreshing.set(false);
        this.loadingMore.set(false);
        this.refreshNotice.set('');
      },
      error: (response: HttpErrorResponse) => {
        if (requestId !== this.latestRequest) return;
        if (append) {
          this.refreshNotice.set('More listings could not be loaded. Please try again.');
        } else if (this.hasLoadedData()) {
          this.refreshNotice.set('Could not refresh listings. Showing the last loaded results.');
        } else {
          this.error.set(response.error?.message ?? 'Products could not be loaded. Please try again.');
        }
        this.loading.set(false);
        this.refreshing.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private buildListingParams(): HttpParams {
    let params = new HttpParams();
    const search = this.searchText().trim();
    if (search) params = params.set('search', search);
    if (this.selectedCategory()) params = params.set('category', this.selectedCategory());
    if (this.selectedGender()) params = params.set('gender', this.selectedGender());
    if (this.proteinOnly() && this.selectedCategory() === 'FOOD') params = params.set('proteinOnly', 'true');
    if (!search) params = params.set('limit', '24');
    return params;
  }

  private cacheKey(params: HttpParams): string {
    return `campusx:explore:v2:${params.toString() || 'all'}`;
  }

  private readCache(key: string): ExploreResponse | null {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as ExploreCacheEntry;
      if (!entry?.response || Date.now() - entry.savedAt > 5 * 60 * 1000) return null;
      return entry.response;
    } catch {
      return null;
    }
  }

  private writeCache(key: string, response: ExploreResponse): void {
    try {
      sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), response } satisfies ExploreCacheEntry));
    } catch {
      // Browsing still works when storage is unavailable or full.
    }
  }

  private applyResponse(response: ExploreResponse): void {
    this.listings.set(response.listings ?? []);
    this.suggestions.set(response.suggestions ?? []);
    this.nextCursor.set(response.nextCursor ?? null);
    this.randomizedIds.set([]);
  }
}
