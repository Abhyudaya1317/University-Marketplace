import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
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
    title?: string;
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
    hashtags: string[];
    price: string;
    quantityAvailable: number;
    phoneNumber: string;
    location: string;
    photoUrl: string | null;
    photoUrl2: string | null;
    photoUrl3: string | null;
    photoUrl4: string | null;
    condition: string;
    customCondition: string | null;
    clothingGender: string | null;
    clothingSizes: string | null;
    color: string | null;
    proteinRich: boolean;
    posterSize: string | null;
  };
}

// Keep the seller form, its validation, and its API request in a feature folder.
@Component({
  selector: 'app-create-listing',
  imports: [DecimalPipe, FormsModule, RouterLink],
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
  protected readonly photoProcessing = signal(false);
  protected readonly cropIndex = signal<number | null>(null);
  protected readonly cropSourceUrl = signal('');
  protected readonly cropZoom = signal(1);
  protected readonly cropPan = signal({ x: 0, y: 0 });
  protected readonly cropProcessing = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly loadingListing = signal(false);
  protected readonly currentPhotoUrls = signal<string[]>([]);

  @ViewChild('photoInput') private photoInput?: ElementRef<HTMLInputElement>;
  @ViewChild('cropCanvas') private cropCanvas?: ElementRef<HTMLCanvasElement>;

  // Keep values as form fields until the backend validates and stores them.
  protected name = '';
  protected category = 'CLOTHING';
  protected description = '';
  protected hashtags = '';
  protected price: number | string = '';
  protected quantityAvailable = 1;
  protected phoneNumber = '';
  protected location = '';
  protected clothingGender = '';
  protected clothingSizes = '';
  protected color = '';
  protected proteinRich = false;
  protected posterSize = '';
  protected condition = 'GOOD';
  protected customCondition = '';
  private selectedPhotos: File[] = [];
  private previewUrls: string[] = [];
  private photoSelectionGeneration = 0;
  private cropSourceImage: HTMLImageElement | null = null;
  private draggedPhotoIndex: number | null = null;
  private cropPointer: { id: number; x: number; y: number } | null = null;

  // Use the same controlled category values the backend accepts.
  protected readonly categories = [
    { value: 'CLOTHING', label: 'Clothing' },
    { value: 'ACCESSORIES', label: 'Accessories' },
    { value: 'SHOES', label: 'Shoes' },
    { value: 'FOOD', label: 'Food' },
    { value: 'ELECTRONICS', label: 'Electronics' },
    { value: 'BEAUTY', label: 'Beauty products' },
    { value: 'TEMPORARY_TATTOOS', label: 'Temporary tattoos' },
    { value: 'ARTWORK', label: 'Artwork' },
    { value: 'PROJECTS', label: 'Projects' },
    { value: 'SPORTS_EQUIPMENT', label: 'Sports equipment' },
    { value: 'MUSICAL_INSTRUMENTS', label: 'Musical instruments' },
    { value: 'POSTERS', label: 'Posters' },
    { value: 'KITCHEN_ITEMS', label: 'Kitchen items' },
    { value: 'DAILY_USE', label: 'Daily-use products' },
    { value: 'WAX_CANDLES', label: 'Wax candles' },
    { value: 'GIFTS', label: 'Gifts' }
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
      return;
    }
    if (this.photoProcessing()) {
      this.error.set('Wait for photo preparation to finish before publishing.');
      return;
    }
    if (this.cropIndex() !== null) {
      this.error.set('Finish or cancel the photo crop before publishing.');
      return;
    }
    if (this.condition === 'CUSTOM' && this.customCondition.trim().length < 2) {
      this.error.set('Describe the custom condition in at least 2 characters.');
      return;
    }
    if ((!this.isEditing() && (this.selectedPhotos.length < 1 || this.selectedPhotos.length > 4)) ||
        (this.isEditing() && this.selectedPhotos.length !== 0 && this.selectedPhotos.length > 4)) {
      this.photoError.set(this.isEditing() ? 'Choose 1–4 photos to replace the current photos.' : 'Choose 1–4 product photos before publishing.');
      this.photoInput?.nativeElement.focus();
      return;
    }

    // Catch category-specific omissions before sending the form to the API.
    if (this.category === 'CLOTHING' && !this.clothingGender) {
      this.error.set('Choose the clothing gender option.');
      return;
    }
    if (this.category === 'CLOTHING' && !this.clothingSizes.trim()) {
      this.error.set('Enter available clothing sizes separated by commas, for example S, M, L.');
      return;
    }
    if (this.supportsColorField(this.category) && !this.color.trim()) {
      this.error.set('Enter the available color or colors separated by commas.');
      return;
    }
    if (this.category === 'POSTERS' && !this.posterSize.trim()) {
      this.error.set('Enter the poster size, such as A3 or 30 × 40 cm.');
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

    // FormData carries listing details and the selected product photos in one request.
    const formData = new FormData();
    formData.append('name', this.name);
    formData.append('category', this.category);
    formData.append('description', this.description);
    formData.append('hashtags', this.hashtags);
    formData.append('price', String(this.price));
    formData.append('quantityAvailable', String(this.quantityAvailable));
    formData.append('phoneNumber', this.phoneNumber);
    formData.append('location', this.location);
    formData.append('condition', this.condition);
    formData.append('customCondition', this.condition === 'CUSTOM' ? this.customCondition.trim() : '');
    if (this.category === 'CLOTHING') formData.append('clothingGender', this.clothingGender);
    if (this.category === 'CLOTHING') formData.append('clothingSizes', this.clothingSizes.trim());
    if (this.supportsColorField(this.category)) formData.append('color', this.color.trim());
    if (this.category === 'FOOD') formData.append('proteinRich', String(this.proteinRich));
    if (this.category === 'POSTERS') formData.append('posterSize', this.posterSize.trim());
    for (const photo of this.selectedPhotos) formData.append('photos', photo);

    this.busy.set(true);

    const request = this.isEditing()
      ? this.http.patch<CreateListingResponse>(`/api/listings/${this.route.snapshot.queryParamMap.get('edit')}`, formData)
      : this.http.post<CreateListingResponse>('/api/listings', formData);
    request.subscribe({
      next: (response) => {
        const productName = response.listing?.title ?? response.listing?.product.name ?? this.name.trim();
        if (this.isEditing()) {
          this.success.set(`Your listing for ${productName} was updated.`);
          this.busy.set(false);
          this.clearCachedExploreListings();
          const listingId = response.listing?.id ?? this.route.snapshot.queryParamMap.get('edit');
          if (listingId) {
            void this.router.navigate(['/products', listingId]);
          } else {
            void this.router.navigateByUrl('/dashboard');
          }
          return;
        }
        this.success.set(`Your listing for ${productName} is live.`);
        this.createdListingId.set(response.listing?.id ?? null);
        this.name = '';
        this.category = 'CLOTHING';
        this.description = '';
        this.hashtags = '';
        this.price = '';
        this.quantityAvailable = 1;
        this.phoneNumber = '';
        this.location = '';
        this.clothingGender = '';
        this.clothingSizes = '';
        this.color = '';
        this.proteinRich = false;
        this.posterSize = '';
        this.condition = 'GOOD';
        this.clearSelectedPhotos();
        this.currentPhotoUrls.set([]);
        this.customCondition = '';
        this.photoError.set('');
        if (this.photoInput) this.photoInput.nativeElement.value = '';
        this.busy.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.busy.set(false);
        const serverMessage = typeof response.error?.message === 'string' ? response.error.message : '';
        if (/photo|image|upload/i.test(serverMessage)) {
          this.photoError.set(serverMessage);
          this.photoInput?.nativeElement.focus();
          return;
        }
        this.error.set(serverMessage || 'We could not create your listing. Please try again.');
      }
    });
  }

  // Require one to four supported images and show every selection before publishing.
  protected async selectPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const selectionGeneration = ++this.photoSelectionGeneration;
    this.photoError.set('');
    this.photoProcessing.set(false);
    this.closePhotoCrop();
    this.clearSelectedPhotos();
    if (files.length < 1 || files.length > 4) {
      this.photoError.set('Choose between 1 and 4 product photos.');
      input.value = '';
      return;
    }
    if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      this.photoError.set('All photos must be JPG, PNG, or WebP images.');
      input.value = '';
      return;
    }
    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      this.photoError.set('Each product photo must be 5 MB or smaller.');
      input.value = '';
      return;
    }
    this.photoProcessing.set(true);
    try {
      const optimizedPhotos: File[] = [];
      for (const file of files) optimizedPhotos.push(await optimizePhotoForUpload(file));
      if (selectionGeneration !== this.photoSelectionGeneration) return;
      this.selectedPhotos = optimizedPhotos;
      this.previewUrls = optimizedPhotos.map((file) => URL.createObjectURL(file));
      this.photoPreviews.set(this.previewUrls);
    } catch {
      if (selectionGeneration === this.photoSelectionGeneration) {
        this.photoError.set('One or more photos could not be prepared. Choose another JPG, PNG, or WebP image.');
        input.value = '';
      }
    } finally {
      if (selectionGeneration === this.photoSelectionGeneration) this.photoProcessing.set(false);
    }
  }

  // Reorder selected photos before sending; the first photo is stored as the cover image.
  protected movePhoto(fromIndex: number, toIndex: number): void {
    if (toIndex < 0 || toIndex >= this.selectedPhotos.length || fromIndex === toIndex) return;
    const photos = [...this.selectedPhotos];
    const urls = [...this.previewUrls];
    const [photo] = photos.splice(fromIndex, 1);
    const [url] = urls.splice(fromIndex, 1);
    photos.splice(toIndex, 0, photo);
    urls.splice(toIndex, 0, url);
    this.selectedPhotos = photos;
    this.previewUrls = urls;
    this.photoPreviews.set([...urls]);
  }

  // Support drag-and-drop reordering in addition to the keyboard-friendly move buttons.
  protected startPhotoDrag(index: number, event: DragEvent): void {
    this.draggedPhotoIndex = index;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    }
  }

  protected allowPhotoDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  protected dropPhoto(index: number, event: DragEvent): void {
    event.preventDefault();
    if (this.draggedPhotoIndex !== null) this.movePhoto(this.draggedPhotoIndex, index);
    this.draggedPhotoIndex = null;
  }

  protected clearPhotoDrag(): void {
    this.draggedPhotoIndex = null;
  }

  // Open a square crop editor for one prepared photo without changing the others.
  protected openPhotoCrop(index: number): void {
    const sourceUrl = this.previewUrls[index];
    if (!sourceUrl || !this.selectedPhotos[index]) return;
    this.cropSourceImage = null;
    this.cropIndex.set(index);
    this.cropSourceUrl.set(sourceUrl);
    this.cropZoom.set(1);
    this.cropPan.set({ x: 0, y: 0 });
    this.photoError.set('');
  }

  protected onCropSourceLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (!image.naturalWidth || !image.naturalHeight || image.src !== this.cropSourceUrl()) return;
    this.cropSourceImage = image;
    this.drawCropPreview();
  }

  protected onCropZoomChange(event: Event): void {
    this.cropZoom.set(Number((event.target as HTMLInputElement).value));
    this.drawCropPreview();
  }

  protected resetPhotoCrop(): void {
    this.cropZoom.set(1);
    this.cropPan.set({ x: 0, y: 0 });
    this.drawCropPreview();
  }

  protected startCropPan(event: PointerEvent): void {
    if (!this.cropSourceImage) return;
    event.preventDefault();
    (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
    this.cropPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  protected moveCropPan(event: PointerEvent): void {
    if (!this.cropPointer || this.cropPointer.id !== event.pointerId) return;
    const deltaX = event.clientX - this.cropPointer.x;
    const deltaY = event.clientY - this.cropPointer.y;
    this.cropPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.cropPan.update((pan) => ({ x: pan.x + deltaX, y: pan.y + deltaY }));
    this.drawCropPreview();
  }

  protected endCropPan(event: PointerEvent): void {
    if (this.cropPointer?.id === event.pointerId) this.cropPointer = null;
  }

  protected handleCropKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 24 : 8;
    const delta = ({
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    } as const)[event.key];
    if (!delta) return;
    event.preventDefault();
    this.cropPan.update((pan) => ({ x: pan.x + delta.x, y: pan.y + delta.y }));
    this.drawCropPreview();
  }

  // Encode the visible square crop and replace only the selected photo in the upload order.
  protected async applyPhotoCrop(): Promise<void> {
    const index = this.cropIndex();
    const image = this.cropSourceImage;
    const canvas = this.cropCanvas?.nativeElement;
    if (index === null || !image || !canvas) return;

    this.cropProcessing.set(true);
    this.photoProcessing.set(true);
    try {
      const outputSize = 1024;
      const output = document.createElement('canvas');
      output.width = outputSize;
      output.height = outputSize;
      const context = output.getContext('2d');
      if (!context) throw new Error('PHOTO_CANVAS_UNAVAILABLE');

      const scale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight) * this.cropZoom();
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const displayWidth = canvas.clientWidth || 360;
      const pan = this.cropPan();
      const x = this.clampCropOffset((outputSize - width) / 2 + pan.x * outputSize / displayWidth, outputSize - width);
      const y = this.clampCropOffset((outputSize - height) / 2 + pan.y * outputSize / displayWidth, outputSize - height);
      context.drawImage(image, x, y, width, height);

      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/webp', 0.9));
      if (!blob) throw new Error('PHOTO_ENCODING_FAILED');
      const oldPhoto = this.selectedPhotos[index];
      const baseName = oldPhoto.name.replace(/\.[^.]+$/, '') || 'product-photo';
      const croppedPhoto = new File([blob], `${baseName}-cropped.webp`, {
        type: 'image/webp',
        lastModified: oldPhoto.lastModified,
      });
      const optimizedPhoto = await optimizePhotoForUpload(croppedPhoto);

      const photos = [...this.selectedPhotos];
      const urls = [...this.previewUrls];
      photos[index] = optimizedPhoto;
      URL.revokeObjectURL(urls[index]);
      urls[index] = URL.createObjectURL(optimizedPhoto);
      this.selectedPhotos = photos;
      this.previewUrls = urls;
      this.photoPreviews.set([...urls]);
      this.closePhotoCrop();
    } catch {
      this.error.set('This photo could not be cropped. The original is still selected; try again or cancel.');
    } finally {
      this.cropProcessing.set(false);
      this.photoProcessing.set(false);
    }
  }

  protected closePhotoCrop(): void {
    this.cropIndex.set(null);
    this.cropSourceUrl.set('');
    this.cropSourceImage = null;
    this.cropPointer = null;
  }

  // Draw a centered square preview and clamp panning so empty space never enters the crop.
  private drawCropPreview(): void {
    const canvas = this.cropCanvas?.nativeElement;
    const image = this.cropSourceImage;
    if (!canvas || !image) return;

    const size = 720;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight) * this.cropZoom();
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const displayWidth = canvas.clientWidth || 360;
    const pan = this.cropPan();
    const centerX = (size - width) / 2;
    const centerY = (size - height) / 2;
    const x = this.clampCropOffset(centerX + pan.x * size / displayWidth, size - width);
    const y = this.clampCropOffset(centerY + pan.y * size / displayWidth, size - height);
    this.cropPan.set({
      x: (x - centerX) * displayWidth / size,
      y: (y - centerY) * displayWidth / size,
    });
    context.clearRect(0, 0, size, size);
    context.drawImage(image, x, y, width, height);
  }

  private clampCropOffset(offset: number, minimum: number): number {
    return Math.min(0, Math.max(minimum, offset));
  }

  // Release browser preview URLs whenever the selected files change.
  private clearSelectedPhotos(): void {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.selectedPhotos = [];
    this.photoPreviews.set([]);
    this.closePhotoCrop();
  }

  // Release the browser's temporary preview URL when the seller leaves this page.
  ngOnDestroy(): void {
    this.photoSelectionGeneration += 1;
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  // Clear fields that belong to the previously selected category.
  protected onCategoryChange(value: string): void {
    this.category = value;
    this.clothingGender = '';
    this.clothingSizes = '';
    if (!this.supportsColorField(value)) this.color = '';
    this.proteinRich = false;
    this.posterSize = '';
    this.condition = value === 'FOOD' ? 'FRESH' : 'GOOD';
  }

  // Categories where a color choice does not help buyers compare the listing.
  protected supportsColorField(category: string): boolean {
    return !['DAILY_USE', 'FOOD', 'KITCHEN_ITEMS', 'POSTERS', 'PROJECTS', 'SPORTS_EQUIPMENT'].includes(category);
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
          this.hashtags = (listing.hashtags ?? []).map((tag) => `#${tag}`).join(', ');
          this.price = listing.price;
          this.quantityAvailable = listing.quantityAvailable;
          this.phoneNumber = listing.phoneNumber;
          this.location = listing.location;
          const foodConditions = ['FRESH', 'PACKAGED', 'OPENED', 'PREPARED', 'FROZEN', 'CUSTOM'];
          this.condition = listing.category === 'FOOD' && !foodConditions.includes(listing.condition)
            ? 'FRESH'
            : listing.condition;
          this.clothingGender = listing.clothingGender ?? '';
          this.clothingSizes = listing.clothingSizes ?? '';
          this.color = listing.color ?? '';
          this.posterSize = listing.posterSize ?? '';
          this.proteinRich = listing.proteinRich;
          this.currentPhotoUrls.set([listing.photoUrl, listing.photoUrl2, listing.photoUrl3, listing.photoUrl4]
            .filter((url): url is string => Boolean(url)));
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

  // An edited offer must not reappear from this tab's older Explore snapshot.
  private clearCachedExploreListings(): void {
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith('campusx:explore:')) sessionStorage.removeItem(key);
      }
    } catch {
      // The updated listing still opens directly if browser storage is unavailable.
    }
  }
}

// Keep four-image multipart requests below Vercel's request-size ceiling without asking sellers to resize photos.
async function optimizePhotoForUpload(file: File): Promise<File> {
  const maxPreparedPhotoBytes = 850 * 1024;
  if (file.size <= maxPreparedPhotoBytes) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const startingScale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * startingScale));
    let height = Math.max(1, Math.round(bitmap.height * startingScale));
    const qualities = [0.86, 0.78, 0.7, 0.62, 0.54];

    for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PHOTO_CANVAS_UNAVAILABLE');
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) throw new Error('PHOTO_ENCODING_FAILED');
        if (blob.size <= maxPreparedPhotoBytes) {
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-photo';
          return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified });
        }
      }

      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
    throw new Error('PHOTO_TOO_LARGE_AFTER_OPTIMIZATION');
  } finally {
    bitmap.close();
  }
}
