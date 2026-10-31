import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

// Keep the API fields needed to understand an order and arrange its campus handoff.
interface CampusOrder {
  id: number;
  role: 'BUYER' | 'SELLER';
  status: string;
  paymentMethod: string;
  price: string;
  quantity: number;
  createdAt: string;
  buyerPhone: string | null;
  sellerPhone: string | null;
  sellerId: number;
  buyerId: number;
  sellerName: string;
  buyerName: string;
  buyerMessage: string | null;
  meetingAt: string | null;
  meetingLocation: string | null;
  listing: {
    id: number;
    title: string;
    description: string;
    photoUrl: string | null;
    location: string;
    product: { id: number; name: string; category: string };
  };
}

interface OrdersResponse {
  success: boolean;
  orders: CampusOrder[];
  message?: string;
}

// Show the buyer's and seller's order history with only actions allowed for their role.
@Component({
  selector: 'app-my-orders',
  imports: [DatePipe, RouterLink, AccountNavigation],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.css',
})
export class MyOrders {
  private readonly http = inject(HttpClient);

  // Separate sign-in, loading, and service errors for clear page states.
  protected readonly loading = signal(true);
  protected readonly signedIn = signal(false);
  protected readonly error = signal('');
  protected readonly orders = signal<CampusOrder[]>([]);
  protected readonly updatingOrderId = signal<number | null>(null);

  constructor() {
    this.loadOrders();
  }

  // Load only orders that belong to the current signed-in account.
  private loadOrders(): void {
    this.loading.set(true);
    this.http.get<OrdersResponse>('/api/orders/mine').subscribe({
      next: (response) => {
        this.signedIn.set(true);
        this.orders.set(response.orders ?? []);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.signedIn.set(response.status !== 401);
        this.error.set(
          response.status === 401
            ? 'Sign in to view your purchases and sales.'
            : (response.error?.message ?? 'Your orders could not be loaded. Please try again.'),
        );
        this.loading.set(false);
      },
    });
  }

  // Send a user action to the server, which checks the participant and current status.
  protected updateOrder(order: CampusOrder, action: string): void {
    this.updatingOrderId.set(order.id);
    this.error.set('');
    this.http
      .patch<{ success: boolean; message?: string }>(`/api/orders/${order.id}`, { action })
      .subscribe({
        next: () => {
          this.updatingOrderId.set(null);
          this.loadOrders();
        },
        error: (response: HttpErrorResponse) => {
          this.error.set(
            response.error?.message ?? 'This order could not be updated. Please try again.',
          );
          this.updatingOrderId.set(null);
        },
      });
  }

  // Translate stored status values into plain language for the order cards.
  protected statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Waiting for seller',
      ACCEPTED: 'Meetup scheduled',
      SELLER_CONFIRMED: 'Seller confirmed handoff and cash',
      COMPLETED: 'Completed',
      DECLINED: 'Declined',
      CANCELLED: 'Cancelled',
    };
    return labels[status] ?? 'Order updated';
  }

  // Calculate the visible order total from the saved unit price and requested quantity.
  protected orderTotal(price: string, quantity: number): string {
    return (Number(price) * quantity).toFixed(2);
  }
}
