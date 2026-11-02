import { Routes } from '@angular/router';
import { Auth } from './auth/auth';
import { Home } from './home/home';
import { CreateListing } from './listings/create-listing';
import { Explore } from './explore/explore';
import { ProductDetails } from './products/product-details';
import { SellerProfile } from './sellers/seller-profile';
import { Dashboard } from './dashboard/dashboard';
import { MyOrders } from './orders/my-orders';
import { Messages } from './messages/messages';

// Keep page URLs and their feature components together in one route list.
export const routes: Routes = [
  {
    path: 'home',
    component: Home,
  },
  {
    path: 'products',
    redirectTo: 'explore',
    pathMatch: 'full',
  },
  {
    path: 'profile',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'auth',
    component: Auth,
  },
  {
    path: 'sell',
    component: CreateListing,
  },
  {
    path: 'explore',
    component: Explore,
  },
  {
    path: 'products/:listingId',
    component: ProductDetails,
  },
  {
    path: 'sellers/:sellerId',
    component: SellerProfile,
  },
  {
    path: 'dashboard',
    component: Dashboard,
  },
  {
    path: 'items-selling',
    component: Dashboard,
  },
  {
    path: 'orders',
    component: MyOrders,
  },
  {
    path: 'messages/:conversationId',
    component: Messages,
  },
  {
    path: 'messages',
    component: Messages,
  },
  {
    path: '',
    component: Home,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
