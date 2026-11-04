import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

// Match the minimal signed-in account returned by the backend.
interface AccountResponse {
  success: boolean;
  user?: { id: string; email: string };
}

// Match the public part of a successfully created listing.
interface CreateListingResponse {
  success: boolean;
  message?: string;
  listing?: {
    id: string;
    product: { id: string; name: string; category: string };
    price: string;
    quantityAvailable: number;
  };
}

// Match the seller-only listing response used to prefill edit mode.
interface EditListingResponse {
  success: boolean;
  listing?: {
    name: string;
    category: string;
    description: string;
    price: string;
    quantityAvailable: number;
    phoneNumber: string;
    location: string;
    photoUrl: string | null;
    photoUrl2: string | null;
    condition: string;
    customCondition: string | null;
    clothingGender: string | null;
    proteinGrams: string | null;
  };
}

// Keep the seller form, its validation, and its API request in a feature folder.
@Component({
  selector: 'app-create-listing',
  imports: [FormsModule, RouterLink],
  templateUrl: './create-listing.html',
  styleUrl: './create-listing.css'
})
export class CreateListing implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // The template uses signals to show sign-in, loading, and submission states.
  protected readonly checkingSession = signal(true);
  protected readonly user = signal<AccountResponse['user'] | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly createdListingId = signal<string | null>(null);
  protected readonly photoPreviews = signal<string[]>([]);
  protected readonly photoError = signal('');
  protected readonly isEditing = signal(false);
  protected readonly loadingListing = signal(false);
  protected readonly currentPhotoUrl = signal<string | null>(null);
  protected readonly currentPhotoUrl2 = signal<string | null>(null);

  @ViewChild('photoInput') private photoInput?: ElementRef<HTMLInputElement>;

  // Keep values as form fields until the backend validates and stores them.
  protected name = '';
  protected category = 'CLOTHING';
  protected description = '';
  protected price: number | string = '';
  protected quantityAvailable = 1;
  protected phoneNumber = '';
  protected location = '';
  protected clothingGender = '';
  protected proteinGrams: number | string = '';
  protected proteinRich = false;
  protected condition = 'GOOD';
  protected customCondition = '';
  private selectedPhotos: File[] = [];
  private previewUrls: string[] = [];

  // Use the same controlled category values the backend accepts.
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
    { value: 'OTHER', label: 'Other' }
  ];

  // Check the HttpOnly session cookie on the server before showing the seller form.
  constructor() {
    this.http.get<AccountResponse>('/api/auth/me').subscribe({
      next: (response) => {
        this.user.set(response.user ?? null);
        this.checkingSession.set(false);
        if (response.user) this.loadListingForEdit();
      },
      error: () => {
        this.user.set(null);
        this.checkingSession.set(false);
      }
    });
  }

  // Send one seller offer; product grouping and all field checks happen in the API.
  protected submitListing(): void {
    this.error.set('');
    this.success.set('');
    this.createdListingId.set(null);

    if (this.photoError()) {
      this.error.set(this.photoError());
      return;
    }
    if (this.condition === 'CUSTOM' && this.customCondition.trim().length < 2) {
      this.error.set('Describe the custom condition in at least 2 characters.');
      return;
    }
    if ((!this.isEditing() && this.selectedPhotos.length !== 2) || (this.isEditing() && this.selectedPhotos.length !== 0 && this.selectedPhotos.length !== 2)) {
      this.error.set(this.isEditing() ? 'Choose exactly two photos to replace the current photos.' : 'Choose exactly two product photos before publishing.');
      return;
    }

    // Catch category-specific omissions before sending the form to the API.
    if (this.category === 'CLOTHING' && !this.clothingGender) {
      this.error.set('Choose the clothing gender option.');
      return;
    }
    if (this.category === 'FOOD' && this.proteinRich && (!this.proteinGrams || Number(this.proteinGrams) <= 0)) {
      this.error.set('Enter a positive protein amount per serving.');
      return;
    }
    if (this.location.trim().length < 2) {
      this.error.set('Enter a campus pickup location.');
      return;
    }
    if (!Number.isInteger(this.quantityAvailable) || this.quantityAvailable < 0 || this.quantityAvailable > 9999) {
      this.error.set('Enter available stock as a whole number from 0 to 9,999.');
      return;
    }

    // FormData carries listing details and both required photos in one request.
    const formData = new FormData();
    formData.append('name', this.name);
    formData.append('category', this.category);
    formData.append('description', this.description);
    formData.append('price', String(this.price));
    formData.append('quantityAvailable', String(this.quantityAvailable));
    formData.append('phoneNumber', this.phoneNumber);
    formData.append('location', this.location);
    formData.append('condition', this.condition);
    formData.append('customCondition', this.condition === 'CUSTOM' ? this.customCondition.trim() : '');
    if (this.category === 'CLOTHING') formData.append('clothingGender', this.clothingGender);
    if (this.category === 'FOOD') formData.append('proteinGrams', this.proteinRich ? String(this.proteinGrams) : '0');
    for (const photo of this.selectedPhotos) formData.append('photos', photo);

    this.busy.set(true);

    const request = this.isEditing()
      ? this.http.patch<CreateListingResponse>(`/api/listings/${this.route.snapshot.queryParamMap.get('edit')}`, formData)
      : this.http.post<CreateListingResponse>('/api/listings', formData);
    request.subscribe({
      next: (response) => {
        const productName = response.listing?.product.name ?? this.name.trim();
        if (this.isEditing()) {
          this.success.set(`Your listing for ${productName} was updated.`);
          this.busy.set(false);
          void this.router.navigateByUrl('/dashboard');
          return;
        }
        this.success.set(`Your listing for ${productName} is live.`);
        this.createdListingId.set(response.listing?.id ?? null);
        this.name = '';
        this.category = 'CLOTHING';
        this.description = '';
        this.price = '';
        this.quantityAvailable = 1;
        this.phoneNumber = '';
        this.location = '';
        this.clothingGender = '';
        this.proteinGrams = '';
        this.proteinRich = false;
        this.condition = 'GOOD';
        this.clearSelectedPhotos();
        this.currentPhotoUrl.set(null);
        this.currentPhotoUrl2.set(null);
        this.customCondition = '';
        this.photoError.set('');
        if (this.photoInput) this.photoInput.nativeElement.value = '';
        this.busy.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'We could not create your listing. Please try again.');
        this.busy.set(false);
      }
    });
  }

  // Require two supported images and show both before the seller publishes.
  protected selectPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.photoError.set('');
    this.clearSelectedPhotos();
    if (files.length !== 2) {
      this.photoError.set('Choose exactly two product photos.');
      input.value = '';
      return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      this.photoError.set('Both photos must be JPG, PNG, or WebP images.');
      input.value = '';
      return;
    }
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      this.photoError.set('Each product photo must be 5 MB or smaller.');
      input.value = '';
      return;
    }
    this.selectedPhotos = files;
    this.previewUrls = files.map((file) => URL.createObjectURL(file));
    this.photoPreviews.set(this.previewUrls);
  }

  // Release browser preview URLs whenever the selected files change.
  private clearSelectedPhotos(): void {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.selectedPhotos = [];
    this.photoPreviews.set([]);
  }

  // Release the browser's temporary preview URL when the seller leaves this page.
  ngOnDestroy(): void {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  // Clear fields that belong to the previously selected category.
  protected onCategoryChange(value: string): void {
    this.category = value;
    this.clothingGender = '';
    this.proteinGrams = '';
    this.proteinRich = false;
    this.condition = value === 'FOOD' ? 'FRESH' : 'GOOD';
  }

  // Only ask for protein grams when the seller marks the food as protein-rich.
  protected onProteinRichChange(value: boolean): void {
    this.proteinRich = value;
    if (!value) this.proteinGrams = '';
  }

  // Reuse the same listing form for edit mode and load only the signed-in owner's offer.
  private loadListingForEdit(): void {
    const listingId = this.route.snapshot.queryParamMap.get('edit');
    if (!listingId || !/^\d+$/.test(listingId) || !Number.isSafeInteger(Number(listingId)) || Number(listingId) < 1) return;
    this.isEditing.set(true);
    this.loadingListing.set(true);
    this.http.get<EditListingResponse>(`/api/listings/${listingId}`).subscribe({
      next: (response) => {
        const listing = response.listing;
        if (listing) {
          this.name = listing.name;
          this.category = listing.category;
          this.description = listing.description;
          this.price = listing.price;
          this.quantityAvailable = listing.quantityAvailable;
          this.phoneNumber = listing.phoneNumber;
          this.location = listing.location;
          const foodConditions = ['FRESH', 'PACKAGED', 'OPENED', 'PREPARED', 'FROZEN', 'CUSTOM'];
          this.condition = listing.category === 'FOOD' && !foodConditions.includes(listing.condition)
            ? 'FRESH'
            : listing.condition;
          this.clothingGender = listing.clothingGender ?? '';
          this.proteinGrams = listing.proteinGrams ?? '';
          this.proteinRich = Number(listing.proteinGrams ?? 0) > 0;
          this.currentPhotoUrl.set(listing.photoUrl);
          this.currentPhotoUrl2.set(listing.photoUrl2);
          this.customCondition = listing.customCondition ?? '';
        }
        this.loadingListing.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'This listing could not be loaded for editing.');
        this.loadingListing.set(false);
      }
    });
  }
}
