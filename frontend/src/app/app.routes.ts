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
import { SavedCollections } from './saved/saved-collections';
import { AdminConsole } from './admin/admin-console';
import { HowToUse } from './how-to-use/how-to-use';
import { FeedbackReport } from './feedback/feedback-report';
import { About } from './about/about';

// Keep page URLs and their feature components together in one route list.
export const routes: Routes = [
  {
    path: 'home',
    component: Home,
    data: { seoTitle: 'UniBee | LPU Marketplace for Students', seoDescription: 'UniBee is the LPU marketplace for students at Lovely Professional University. Buy and sell textbooks, electronics, clothing, and campus essentials.' },
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
    data: { seoTitle: 'Sign in | UniBee', noIndex: true },
  },
  {
    path: 'sell',
    component: CreateListing,
    data: { seoTitle: 'Sell on UniBee | LPU Marketplace', noIndex: true },
  },
  {
    path: 'explore',
    component: Explore,
    data: { seoTitle: 'Explore the LPU Marketplace | UniBee', seoDescription: 'Explore student listings on the LPU marketplace. Find textbooks, electronics, clothing, and campus essentials on UniBee.' },
  },
  {
    path: 'how-to-use',
    component: HowToUse,
    data: { seoTitle: 'How to Buy and Sell on UniBee | LPU Marketplace', seoDescription: 'Learn how to buy and sell items safely on UniBee, the LPU student marketplace at Lovely Professional University.' },
  },
  {
    path: 'feedback-report',
    component: FeedbackReport,
    data: { seoTitle: 'Feedback & Reports | UniBee', noIndex: true },
  },
  {
    path: 'about',
    component: About,
    data: { seoTitle: 'About UniBee | LPU Student Marketplace', seoDescription: 'Learn why Abhyudaya Raj created UniBee, a student marketplace for Lovely Professional University.' },
  },
  {
    path: 'products/:listingId',
    component: ProductDetails,
    data: { seoTitle: 'Student Listings | UniBee LPU Marketplace', noIndex: true },
  },
  {
    path: 'sellers/:sellerId',
    component: SellerProfile,
    data: { seoTitle: 'Campus Sellers | UniBee LPU Marketplace', noIndex: true },
  },
  {
    path: 'dashboard',
    component: Dashboard,
    data: { seoTitle: 'My account | UniBee', noIndex: true },
  },
  {
    path: 'admin',
    component: AdminConsole,
    data: { seoTitle: 'Admin | UniBee', noIndex: true },
  },
  {
    path: 'items-selling',
    component: Dashboard,
    data: { seoTitle: 'My listings | UniBee', noIndex: true },
  },
  {
    path: 'wishlist',
    component: SavedCollections,
    data: { collection: 'wishlist', seoTitle: 'Wishlist | UniBee', noIndex: true },
  },
  {
    path: 'followed-sellers',
    component: SavedCollections,
    data: { collection: 'following', seoTitle: 'Followed sellers | UniBee', noIndex: true },
  },
  {
    path: 'followers',
    component: SavedCollections,
    data: { collection: 'followers', seoTitle: 'Followers | UniBee', noIndex: true },
  },
  {
    path: 'orders',
    component: MyOrders,
    data: { seoTitle: 'My orders | UniBee', noIndex: true },
  },
  {
    path: 'messages/:conversationId',
    component: Messages,
    data: { seoTitle: 'Messages | UniBee', noIndex: true },
  },
  {
    path: 'messages',
    component: Messages,
    data: { seoTitle: 'Messages | UniBee', noIndex: true },
  },
  {
    path: '',
    component: Home,
    data: { seoTitle: 'UniBee | LPU Marketplace for Students', seoDescription: 'UniBee is the LPU marketplace for students at Lovely Professional University. Buy and sell textbooks, electronics, clothing, and campus essentials.' },
  },
  {
    path: '**',
    redirectTo: '',
  },
];
