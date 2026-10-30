import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

// Match the minimal signed-in account returned by the backend.
interface AccountResponse {
  success: boolean;
  user?: { id: number; email: string };
}

// Match the public part of a successfully created listing.
interface CreateListingResponse {
  success: boolean;
  message?: string;
  listing?: {
    id: number;
    product: { id: number; name: string; category: string };
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
    condition: string;
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
  protected readonly createdListingId = signal<number | null>(null);
  protected readonly photoPreview = signal<string | null>(null);
  protected readonly photoError = signal('');
  protected readonly isEditing = signal(false);
  protected readonly loadingListing = signal(false);
  protected readonly currentPhotoUrl = signal<string | null>(null);
  protected readonly removeCurrentPhoto = signal(false);

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
  protected condition = 'GOOD';
  private selectedPhoto: File | null = null;

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

    // Catch category-specific omissions before sending the form to the API.
    if (this.category === 'CLOTHING' && !this.clothingGender) {
      this.error.set('Choose the clothing gender option.');
      return;
    }
    if (this.category === 'FOOD' && this.proteinGrams === '') {
      this.error.set('Enter protein per serving in grams.');
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

    // FormData carries normal fields and the optional photo in one multipart request.
    const formData = new FormData();
    formData.append('name', this.name);
    formData.append('category', this.category);
    formData.append('description', this.description);
    formData.append('price', String(this.price));
    formData.append('quantityAvailable', String(this.quantityAvailable));
    formData.append('phoneNumber', this.phoneNumber);
    formData.append('location', this.location);
    formData.append('condition', this.condition);
    formData.append('removePhoto', String(this.removeCurrentPhoto()));
    if (this.category === 'CLOTHING') formData.append('clothingGender', this.clothingGender);
    if (this.category === 'FOOD') formData.append('proteinGrams', String(this.proteinGrams));
    if (this.selectedPhoto) formData.append('photo', this.selectedPhoto);

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
        this.condition = 'GOOD';
        this.selectedPhoto = null;
        this.currentPhotoUrl.set(null);
        this.removeCurrentPhoto.set(false);
        this.photoError.set('');
        if (this.photoPreview()) URL.revokeObjectURL(this.photoPreview()!);
        this.photoPreview.set(null);
        if (this.photoInput) this.photoInput.nativeElement.value = '';
        this.busy.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'We could not create your listing. Please try again.');
        this.busy.set(false);
      }
    });
  }

  // Keep only one small, browser-recognized image and show the seller a local preview.
  protected selectPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoError.set('');
    if (file) this.removeCurrentPhoto.set(false);
    if (file && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.photoError.set('Choose a JPG, PNG, or WebP image.');
      this.clearSelectedPhoto();
      input.value = '';
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      this.photoError.set('Product photos must be 5 MB or smaller.');
      this.clearSelectedPhoto();
      input.value = '';
      return;
    }
    if (this.photoPreview()) URL.revokeObjectURL(this.photoPreview()!);
    this.selectedPhoto = file;
    this.photoPreview.set(file ? URL.createObjectURL(file) : null);
  }

  // Revoke the local preview URL and discard a file that failed validation.
  private clearSelectedPhoto(): void {
    this.selectedPhoto = null;
    if (this.photoPreview()) URL.revokeObjectURL(this.photoPreview()!);
    this.photoPreview.set(null);
  }

  // Release the browser's temporary preview URL when the seller leaves this page.
  ngOnDestroy(): void {
    if (this.photoPreview()) URL.revokeObjectURL(this.photoPreview()!);
  }

  // Clear fields that belong to the previously selected category.
  protected onCategoryChange(value: string): void {
    this.category = value;
    this.clothingGender = '';
    this.proteinGrams = '';
  }

  // Reuse the same listing form for edit mode and load only the signed-in owner's offer.
  private loadListingForEdit(): void {
    const listingId = Number(this.route.snapshot.queryParamMap.get('edit'));
    if (!Number.isSafeInteger(listingId) || listingId < 1) return;
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
          this.condition = listing.condition;
          this.clothingGender = listing.clothingGender ?? '';
          this.proteinGrams = listing.proteinGrams ?? '';
          this.currentPhotoUrl.set(listing.photoUrl);
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
