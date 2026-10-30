import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Explore } from './explore';

describe('Explore individual listings', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Explore],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows each seller listing separately and randomizes the visible listing IDs', () => {
    const fixture = TestBed.createComponent(Explore);
    const component = fixture.componentInstance as any;
    http.match('/api/auth/me').forEach((request) => request.flush({ success: true, user: null }));
    http.expectOne('/api/products').flush({ success: true, listings: [listing(1, 'Jeans', '80.00'), listing(2, 'Jeans', '60.00'), listing(3, 'Desk lamp', '20.00')] });
    expect(component.visibleListings().map((item: { id: number }) => item.id)).toEqual([1, 2, 3]);
    const originalRandom = Math.random;
    Math.random = () => 0.4;
    component.randomizeResults();
    Math.random = originalRandom;
    expect(component.visibleListings().map((item: { id: number }) => item.id)).toEqual([3, 1, 2]);
    fixture.destroy();
  });

  it('sends search and optional category to the API, which can keep search universal', () => {
    const fixture = TestBed.createComponent(Explore);
    const component = fixture.componentInstance as any;
    http.match('/api/auth/me').forEach((request) => request.flush({ success: true, user: null }));
    http.expectOne('/api/products').flush({ success: true, listings: [] });
    component.selectedCategory.set('CLOTHING');
    component.searchText.set('jeans');
    component.searchProducts();
    const request = http.expectOne((candidate) => candidate.url === '/api/products' && candidate.params.get('search') === 'jeans' && candidate.params.get('category') === 'CLOTHING');
    request.flush({ success: true, listings: [listing(1, 'Blue jeans', '80.00')] });
    expect(component.visibleListings().map((item: { title: string }) => item.title)).toEqual(['Blue jeans']);
    fixture.destroy();
  });
});

// Each fixture row models one database Listing, not a grouped Product record.
function listing(id: number, title: string, price: string) {
  return { id, sellerId: id + 10, sellerName: `Seller ${id}`, title, category: 'CLOTHING', description: 'Good condition', price, quantityAvailable: 2, photoUrl: null, condition: 'GOOD' };
}
