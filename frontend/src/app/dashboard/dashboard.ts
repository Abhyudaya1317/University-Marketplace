import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { AccountNavigation } from '../shared/account-navigation';

// Match the private summary endpoint without pulling account contact data into this page.
interface DashboardResponse {
  success: boolean;
  profile: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    bio: string | null;
    activeListingCount: number;
    followerCount: number;
    followingCount: number;
    archivedListingCount: number;
    averageRating: number | null;
    reviewCount: number;
  };
  myListings: Array<{
    id: string;
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
    status: string;
    condition: string;
    archivedAt: string | null;
    createdAt: string;
  }>;
  message?: string;
}

// Describe only pending order fields that the seller needs to arrange a campus handoff.
interface SellerRequest {
  id: string;
  buyerId: string;
  listingId: string;
  productName: string;
  listingTitle: string;
  buyerName: string;
  buyerPhone: string;
  quantity: number;
  buyerMessage: string | null;
  price: string;
  createdAt: string;
}

// Keep the side chat limited to information returned for this private conversation.
interface SellerChatThread {
  id: string;
  otherUser: { id: string; fullName: string };
  listing: { id: string; title: string; price: string };
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
    type: string;
    body: string;
    createdAt: string;
    attachmentUrl?: string | null;
  }>;
}

// Give a signed-in seller one place to manage their listings and buyer requests.
@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, FormsModule, RouterLink, AccountNavigation],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly itemsRoute = this.route.snapshot.routeConfig?.path === 'items-selling';

  // These states let the page distinguish a sign-in requirement from a service issue.
  protected readonly loading = signal(true);
  protected readonly signedIn = signal(false);
  protected readonly error = signal('');
  protected readonly listings = signal<DashboardResponse['myListings']>([]);
  protected readonly activeListings = computed(() =>
    this.listings().filter((listing) => listing.status !== 'ARCHIVED'),
  );
  protected readonly showOnlyBuyerRequests = signal(false);
  protected readonly visibleActiveListings = computed(() => {
    const listings = this.activeListings();
    if (!this.showOnlyBuyerRequests()) return listings;
    const requestedListingIds = new Set(this.requests().map((request) => request.listingId));
    return listings.filter((listing) => requestedListingIds.has(listing.id));
  });
  protected readonly archivedListings = computed(() =>
    this.listings().filter((listing) => listing.status === 'ARCHIVED'),
  );
  // The profile photo grid shows only items currently visible to marketplace visitors.
  protected readonly profileGridListings = computed(() =>
    this.listings().filter((listing) => listing.status === 'ACTIVE'),
  );
  protected readonly profile = signal<DashboardResponse['profile'] | null>(null);
  protected readonly requests = signal<SellerRequest[]>([]);
  protected readonly sellerRequestsLoaded = signal(false);
  protected readonly sellerRequestsFailed = signal(false);
  protected readonly stockDrafts = signal<Record<string, number>>({});
  protected readonly meetingTimes = signal<Record<string, string>>({});
  protected readonly meetingLocations = signal<Record<string, string>>({});
  protected readonly stockBusyId = signal<string | null>(null);
  protected readonly requestBusyId = signal<string | null>(null);
  protected readonly messageBusyId = signal<string | null>(null);
  protected readonly stockNotice = signal('');
  protected readonly requestNotice = signal('');
  protected readonly managementNotice = signal('');
  protected readonly archiveDialogListingId = signal<string | null>(null);
  protected readonly deleteDialogListingId = signal<string | null>(null);
  protected readonly managementBusyId = signal<string | null>(null);
  protected readonly profileNameDraft = signal('');
  protected readonly profileBioDraft = signal('');
  protected readonly profileNotice = signal('');
  protected readonly profileSaving = signal(false);
  protected readonly profilePhotoUploading = signal(false);
  protected readonly profileEditOpen = signal(false);
  @ViewChild('profileBioInput') private profileBioInput?: ElementRef<HTMLTextAreaElement>;
  protected readonly buyerChat = signal<SellerChatThread | null>(null);
  protected readonly buyerChatLoading = signal(false);
  protected readonly buyerChatError = signal('');
  protected readonly buyerChatNotice = signal('');
  protected readonly buyerChatDraft = signal('');
  protected readonly buyerChatSending = signal(false);
  private buyerChatFetchInFlight = false;
  private buyerChatRefreshPendingId: string | null = null;

  // Load account-owned records through the session-protected dashboard endpoint.
  constructor() {
    if (this.route.snapshot.queryParamMap.get('notice') === 'archived') {
      this.managementNotice.set('Listing moved to your archive.');
    }
    this.http.get<DashboardResponse>('/api/sellers/dashboard').subscribe({
      next: (response) => {
        this.signedIn.set(true);
        this.profile.set(response.profile ?? null);
        this.profileNameDraft.set(response.profile?.fullName ?? '');
        this.profileBioDraft.set(response.profile?.bio ?? '');
        this.listings.set(response.myListings ?? []);
        this.loading.set(false);
        if (this.itemsRoute) this.loadSellerRequests();
      },
      error: (response: HttpErrorResponse) => {
        this.signedIn.set(response.status !== 401);
        this.error.set(
          response.status === 401
            ? 'Sign in to view your dashboard.'
            : (response.error?.message ?? 'Your dashboard could not be loaded. Please try again.'),
        );
        this.loading.set(false);
      },
    });

    // Refresh an open side chat without making needless requests while this tab is hidden.
    interval(5000).pipe(takeUntilDestroyed()).subscribe(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const conversationId = this.buyerChat()?.id;
      if (conversationId) this.refreshBuyerChat(conversationId);
    });
  }

  // Save the current account's public display name and bio through the protected profile endpoint.
  protected saveProfile(): void {
    const fullName = this.profileNameDraft().trim();
    const bio = this.profileBioDraft().trim();
    if (fullName.length < 2 || fullName.length > 100) {
      this.profileNotice.set('Enter a name between 2 and 100 characters.');
      return;
    }
    if (bio.length > 300) {
      this.profileNotice.set('Keep your bio to 300 characters or fewer.');
      return;
    }
    const previousProfile = this.profile();
    if (!previousProfile) return;
    const submittedBio = bio || null;
    this.profileSaving.set(true);
    this.profile.update((profile) => profile ? { ...profile, fullName, bio: submittedBio } : profile);
    this.profileEditOpen.set(false);
    this.profileNotice.set('Saving your profile in the background…');
    this.http.patch<{ user: { fullName: string; bio: string | null } }>('/api/auth/profile', { fullName, bio }).subscribe({
      next: (response) => {
        this.profile.update((profile) =>
          profile ? { ...profile, fullName: response.user.fullName, bio: response.user.bio } : profile,
        );
        if (this.profileNameDraft().trim() === fullName) this.profileNameDraft.set(response.user.fullName);
        if (this.profileBioDraft().trim() === bio) this.profileBioDraft.set(response.user.bio ?? '');
        this.profileNotice.set('Profile updated.');
        this.profileSaving.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.profile.update((profile) => profile ? {
          ...profile,
          fullName: previousProfile.fullName,
          bio: previousProfile.bio,
        } : profile);
        if (!this.profileEditOpen()) {
          this.profileNameDraft.set(fullName);
          this.profileBioDraft.set(bio);
        }
        this.profileEditOpen.set(true);
        this.profileNotice.set(
          response.error?.message ?? 'Your profile name could not be updated.',
        );
        this.profileSaving.set(false);
      },
    });
  }

  // Upload a chosen profile image through the authenticated photo endpoint.
  protected uploadProfilePhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const photo = input.files?.[0];
    if (!photo || this.profilePhotoUploading()) return;
    if (photo.size > 5 * 1024 * 1024) {
      this.profileNotice.set('Profile photos must be 5 MB or smaller.');
      input.value = '';
      return;
    }

    const form = new FormData();
    form.append('photo', photo);
    this.profilePhotoUploading.set(true);
    this.profileNotice.set('');
    this.http.post<{ user: { avatarUrl: string | null } }>('/api/auth/profile/photo', form).subscribe({
      next: (response) => {
        this.profile.update((profile) => profile ? { ...profile, avatarUrl: response.user.avatarUrl } : profile);
        this.profileNotice.set('Profile photo updated.');
        this.profilePhotoUploading.set(false);
        input.value = '';
      },
      error: (response: HttpErrorResponse) => {
        this.profileNotice.set(response.error?.message ?? 'Your profile photo could not be updated.');
        this.profilePhotoUploading.set(false);
        input.value = '';
      },
    });
  }

  // Open or close the small editor behind the profile's Edit your profile button.
  protected toggleProfileEdit(): void {
    if (!this.profileEditOpen()) {
      this.profileNameDraft.set(this.profile()?.fullName ?? '');
      this.profileBioDraft.set(this.profile()?.bio ?? '');
      this.profileEditOpen.set(true);
    } else {
      this.profileEditOpen.set(false);
    }
    this.profileNotice.set('');
  }

  // Open the profile editor when a seller chooses the blue prompt beneath an empty avatar bio.
  protected openBioEditor(): void {
    this.profileBioDraft.set(this.profile()?.bio ?? '');
    this.profileNameDraft.set(this.profile()?.fullName ?? '');
    this.profileEditOpen.set(true);
    this.profileNotice.set('');
    requestAnimationFrame(() => this.profileBioInput?.nativeElement.focus());
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

  // Open the archive confirmation instead of changing listing state immediately.
  protected askToArchive(listingId: string): void {
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
  protected restoreListing(listingId: string): void {
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
  protected askToDelete(listingId: string): void {
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

  protected setStockDraft(listingId: string, quantity: number): void {
    this.stockDrafts.update((drafts) => ({ ...drafts, [listingId]: quantity }));
  }

  // Save a new quantity using the owner-only inventory endpoint.
  protected updateStock(listingId: string): void {
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
      next: (response) => {
        this.requests.set(response.requests ?? []);
        this.sellerRequestsLoaded.set(true);
      },
      error: (response: HttpErrorResponse) => {
        this.requestNotice.set(response.error?.message ?? 'Buyer requests could not be loaded.');
        this.sellerRequestsFailed.set(true);
        this.sellerRequestsLoaded.set(true);
      },
    });
  }

  protected toggleBuyerRequestFilter(): void {
    this.showOnlyBuyerRequests.update((showOnly) => !showOnly);
  }

  protected listingRequests(listingId: string): SellerRequest[] {
    return this.requests().filter((request) => request.listingId === listingId);
  }

  protected setMeetingTime(requestId: string, value: string): void {
    this.meetingTimes.update((times) => ({ ...times, [requestId]: value }));
  }

  protected setMeetingLocation(requestId: string, value: string): void {
    this.meetingLocations.update((locations) => ({ ...locations, [requestId]: value }));
  }

  // Open or resume this request's private chat in a side drawer on the dashboard.
  protected messageBuyer(request: SellerRequest): void {
    if (this.messageBusyId() !== null) return;
    this.messageBusyId.set(request.id);
    this.requestNotice.set('');
    this.buyerChatError.set('');
    this.buyerChatNotice.set('');
    this.buyerChatDraft.set('');
    this.buyerChatLoading.set(true);
    this.buyerChat.set({
      id: '',
      otherUser: { id: request.buyerId, fullName: request.buyerName },
      listing: { id: request.listingId, title: request.listingTitle || request.productName, price: request.price },
      messages: [],
    });
    this.http
      .post<{ success: boolean; conversation: { id: string }; message?: string }>(
        `/api/orders/${request.id}/conversation`,
        {},
      )
      .subscribe({
        next: (response) => {
          this.messageBusyId.set(null);
          if (this.buyerChat()) this.loadBuyerChat(response.conversation.id);
        },
        error: (response: HttpErrorResponse) => {
          this.buyerChatError.set(response.error?.message ?? 'We could not open a chat with this buyer.');
          this.buyerChatLoading.set(false);
          this.messageBusyId.set(null);
        },
      });
  }

  protected closeBuyerChat(): void {
    this.buyerChat.set(null);
    this.buyerChatDraft.set('');
    this.buyerChatError.set('');
    this.buyerChatNotice.set('');
    this.buyerChatLoading.set(false);
  }

  protected sendBuyerChatMessage(): void {
    const conversationId = this.buyerChat()?.id;
    const body = this.buyerChatDraft().trim();
    if (!conversationId || !body || body.length > 2000 || this.buyerChatSending()) return;

    this.buyerChatSending.set(true);
    this.buyerChatError.set('');
    this.http.post<{ success: boolean; message: SellerChatThread['messages'][number] }>(`/api/messages/${conversationId}`, { body }).subscribe({
      next: (response) => {
        this.buyerChatDraft.set('');
        this.buyerChatSending.set(false);
        this.buyerChatNotice.set('Message sent.');
        this.buyerChat.update((chat) => {
          if (!chat || chat.id !== conversationId || chat.messages.some((item) => item.id === response.message.id)) return chat;
          return { ...chat, messages: [...chat.messages, response.message] };
        });
        this.refreshBuyerChat(conversationId);
      },
      error: (response: HttpErrorResponse) => {
        this.buyerChatError.set(response.error?.message ?? 'Message could not be sent.');
        this.buyerChatNotice.set('');
        this.buyerChatSending.set(false);
      },
    });
  }

  // Enter sends from the compact chat box; Shift+Enter inserts a new line.
  protected handleBuyerChatEnter(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey || keyEvent.isComposing) return;
    keyEvent.preventDefault();
    this.sendBuyerChatMessage();
  }

  // Fetch the thread using the existing participant-checked messages endpoint.
  private loadBuyerChat(conversationId: string): void {
    this.buyerChat.update((chat) => chat ? { ...chat, id: conversationId } : chat);
    this.buyerChatLoading.set(true);
    this.fetchBuyerChat(conversationId);
  }

  private refreshBuyerChat(conversationId: string): void {
    if (this.buyerChatFetchInFlight) {
      this.buyerChatRefreshPendingId = conversationId;
      return;
    }
    this.fetchBuyerChat(conversationId);
  }

  private fetchBuyerChat(conversationId: string): void {
    if (this.buyerChatFetchInFlight) return;
    this.buyerChatFetchInFlight = true;
    this.http.get<{ conversation: SellerChatThread }>(`/api/messages/${conversationId}`).subscribe({
      next: (response) => {
        if (this.buyerChat()?.id === conversationId) this.buyerChat.set(response.conversation);
        this.buyerChatError.set('');
        this.buyerChatLoading.set(false);
        this.buyerChatFetchInFlight = false;
        this.refreshBuyerChatIfQueued();
      },
      error: (response: HttpErrorResponse) => {
        this.buyerChatError.set(response.error?.message ?? 'This conversation could not be loaded.');
        this.buyerChatLoading.set(false);
        this.buyerChatFetchInFlight = false;
        this.refreshBuyerChatIfQueued();
      },
    });
  }

  private refreshBuyerChatIfQueued(): void {
    const pendingConversationId = this.buyerChatRefreshPendingId;
    if (pendingConversationId === null) return;
    this.buyerChatRefreshPendingId = null;
    if (this.buyerChat()?.id === pendingConversationId) this.refreshBuyerChat(pendingConversationId);
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
      .patch<{ success: boolean; quantityAvailable?: number }>(`/api/orders/${request.id}`, {
        action,
        ...(action === 'accept' ? { meetingAt: meetingAt?.toISOString(), meetingLocation } : {}),
      })
      .subscribe({
        next: (response) => {
          if (action === 'accept' && typeof response.quantityAvailable === 'number') {
            this.listings.update((listings) =>
              listings.map((listing) =>
                listing.id === request.listingId
                  ? { ...listing, quantityAvailable: response.quantityAvailable! }
                  : listing,
              ),
            );
            this.stockDrafts.update((drafts) => ({
              ...drafts,
              [request.listingId]: response.quantityAvailable!,
            }));
          }
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
