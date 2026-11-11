import { HttpClient } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AccountNavigation } from '../shared/account-navigation';
import { RetroWindow } from '../shared/retro-window';
import { InteractionFeedback } from '../shared/interaction-feedback';

// Describe the small part of the backend response that this page reads.
interface HealthResponse {
  success: boolean;
  message: string;
}

// Use real marketplace listings for the featured window, filters, and homepage feed.
interface HomeListing {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  category: string;
  description: string;
  price: string;
  quantityAvailable: number;
  photoUrl: string | null;
  condition: string;
  location?: string;
}

interface ListingsResponse {
  success: boolean;
  listings: HomeListing[];
}

// Keep the temporary welcome page's UI and backend status behavior in this feature folder.
@Component({
  selector: 'app-home',
  imports: [AccountNavigation, FormsModule, RetroWindow, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly interaction = inject(InteractionFeedback);

  // The template uses this state to show checking, online, or offline status.
  protected readonly backendState = signal<'checking' | 'online' | 'offline'>('checking');
  protected readonly listings = signal<HomeListing[]>([]);
  protected readonly listingError = signal(false);
  protected readonly clock = signal('');
  protected readonly batteryPercent = signal<number | null>(null);
  protected readonly searchDraft = signal('');
  protected readonly showFeatured = signal(true);
  protected readonly showDropNotice = signal(true);
  protected readonly categories = computed(() => {
    const unique = new Map<string, HomeListing>();
    for (const listing of this.listings()) {
      if (!unique.has(listing.category)) unique.set(listing.category, listing);
    }
    const categories = [...unique.keys()].slice(0, 8);
    if (!categories.includes('PROJECTS')) {
      if (categories.length === 8) categories[7] = 'PROJECTS';
      else categories.push('PROJECTS');
    }
    return categories;
  });
  protected readonly featuredListing = computed(() => {
    const liveListings = this.listings();
    // Prefer a later real listing photo so the hero does not keep spotlighting the first upload.
    return [...liveListings].reverse().find((listing) => Boolean(listing.photoUrl)) ?? liveListings[0] ?? null;
  });
  // Keep the home feed to one curated-looking row while Explore remains the full catalog.
  protected readonly homeFeed = computed(() => this.listings().slice(0, 4));
  protected readonly sellerCount = computed(() => new Set(this.listings().map((item) => item.sellerId)).size);
  protected readonly pickupAreaCount = computed(() => new Set(this.listings().map((item) => item.location).filter(Boolean)).size);

  protected shareListing(item: HomeListing, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.interaction.openSharePrompt(
      item.title,
      new URL(`/products/${item.id}`, window.location.origin).toString(),
    );
  }

  // Ask the Express health endpoint whether the backend is reachable when the page opens.
  constructor() {
    this.updateClock();
    this.readBatteryStatus();
    interval(30_000).pipe(takeUntilDestroyed()).subscribe(() => this.updateClock());
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (response) => {
        this.backendState.set(response.success ? 'online' : 'offline');
      },
      error: () => this.backendState.set('offline')
    });
    this.http.get<ListingsResponse>('/api/products').subscribe({
      next: (response) => this.listings.set(response.listings ?? []),
      error: () => this.listingError.set(true),
    });
  }

  // Keep the display clock current without presenting a fake online-user count.
  private updateClock(): void {
    this.clock.set(new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date()));
  }

  // Read the device battery only where the browser exposes this optional API.
  private readBatteryStatus(): void {
    type BatteryInfo = EventTarget & { level: number };
    type BatteryNavigator = Navigator & { getBattery?: () => Promise<BatteryInfo> };
    const getBattery = (navigator as BatteryNavigator).getBattery;
    if (!getBattery) return;

    void getBattery.call(navigator).then((battery) => {
      const updateLevel = () => this.batteryPercent.set(Math.round(battery.level * 100));
      updateLevel();
      battery.addEventListener('levelchange', updateLevel);
      this.destroyRef.onDestroy(() => battery.removeEventListener('levelchange', updateLevel));
    }).catch(() => this.batteryPercent.set(null));
  }

  protected searchMarketplace(): void {
    void this.router.navigate(['/explore'], { queryParams: { search: this.searchDraft().trim() || null } });
  }

  protected categoryLabel(category: string): string {
    return category.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  protected openCategory(category: string): void {
    void this.router.navigate(['/explore'], { queryParams: { category } });
  }
}
