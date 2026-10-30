import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { ProductDetails } from './product-details';

describe('Individual product details', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProductDetails],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'messages/:conversationId', component: TestRoute }]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ listingId: '41' })) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads details by listing ID and restores that listing’s saved state', () => {
    const fixture = TestBed.createComponent(ProductDetails);
    const component = fixture.componentInstance as any;
    http
      .match('/api/auth/me')
      .forEach((request) => request.flush({ success: true, user: { id: 7 } }));
    http.expectOne('/api/listings/public/41').flush({ success: true, listing: details(41) });
    http.expectOne('/api/listings/favorites').flush({ success: true, listingIds: [41, 42] });
    expect(component.listing().id).toBe(41);
    expect(component.saved()).toBe(true);
    fixture.destroy();
  });

  it('sends the exact listing ID when saving, and changes the heart after confirmation', () => {
    const fixture = TestBed.createComponent(ProductDetails);
    const component = fixture.componentInstance as any;
    http
      .match('/api/auth/me')
      .forEach((request) => request.flush({ success: true, user: { id: 7 } }));
    http.expectOne('/api/listings/public/41').flush({ success: true, listing: details(41) });
    http.expectOne('/api/listings/favorites').flush({ success: true, listingIds: [] });
    component.toggleSaved();
    const request = http.expectOne('/api/listings/41/favorite');
    expect(request.request.method).toBe('PUT');
    request.flush({ success: true, isSaved: true });
    expect(component.saved()).toBe(true);
    fixture.destroy();
  });

  it('starts a conversation for the exact listing being viewed', () => {
    const fixture = TestBed.createComponent(ProductDetails);
    const component = fixture.componentInstance as any;
    http
      .match('/api/auth/me')
      .forEach((request) => request.flush({ success: true, user: { id: 7 } }));
    http.expectOne('/api/listings/public/41').flush({ success: true, listing: details(41) });
    http.expectOne('/api/listings/favorites').flush({ success: true, listingIds: [] });

    component.messageSeller();

    const request = http.expectOne('/api/messages/listings/41');
    expect(request.request.method).toBe('POST');
    request.flush({ success: true, conversation: { id: 12 } });
    fixture.destroy();
  });
});

// Use realistic public data while keeping the test focused on listing identity.
function details(id: number) {
  return {
    id,
    title: 'Blue jeans',
    description: 'Gently used',
    price: '80.00',
    quantityAvailable: 2,
    photoUrl: null,
    location: 'Campus',
    condition: 'GOOD',
    clothingGender: 'UNISEX',
    proteinGrams: null,
    category: 'CLOTHING',
    createdAt: new Date().toISOString(),
    seller: {
      id: 5,
      fullName: 'Campus Seller',
      avatarUrl: null,
      averageRating: null,
      reviewCount: 0,
    },
  };
}

@Component({ standalone: true, template: '' })
class TestRoute {}
