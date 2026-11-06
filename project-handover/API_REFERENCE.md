# CampusX API Reference

Actual endpoints are mounted by backend/src/server.js. All responses are JSON except OAuth redirects. Unless stated otherwise, errors use { success:false, message }. The API is same-origin through Angular proxy locally. Session authentication uses campusx_session HttpOnly cookie.

## Health

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| GET /api/health | No | None | {success:true,message:"CampusX backend is running!"} | src/routes/healthRoutes.js |

## Authentication

| Method and path | Auth | Request | Response / errors | Source |
|---|---|---|---|---|
| POST /api/auth/signup | No | {email, fullName, password}; name 2–100 chars; password 10–128 | 201 {success,user:{id,email,fullName,avatarUrl}}; 409 duplicate; 400 invalid | auth/authController.js signUp |
| POST /api/auth/login | No | {email,password} | {success,user}; 401 invalid credentials; 400 malformed | signIn |
| POST /api/auth/logout | Cookie optional | None | {success:true}; revokes session and clears cookie | signOut |
| GET /api/auth/me | Cookie required by handler | None | {success:true,user}; 401 absent/expired | getCurrentUser |
| PATCH /api/auth/profile | Required | {fullName} | {success:true,user}; 400 invalid | updateCurrentProfile |
| POST /api/auth/profile/photo | Required; multipart/form-data | avatar image | {success:true,user:{avatarUrl}}; 400 invalid/missing file | updateCurrentProfilePhoto |
| POST /api/auth/password-reset/request-code | No | {email} | Generic success to avoid account disclosure; 503 if SMTP unavailable; 429 resend delay | requestPasswordResetCode |
| POST /api/auth/password-reset/verify-code | No | {email, six-digit code, newPassword} | {success:true,message}; 400 invalid/expired | resetPassword |
| GET /api/auth/google | Provider config required | Browser redirect | Redirect to Google; 503 if not configured | startGoogleSignIn |
| GET /api/auth/google/callback | Google callback | OAuth query code/state | Creates/reuses account and redirects to frontend; failures to /auth?error=<safe reason> | finishGoogleSignIn |

## Listings and Explore

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| GET /api/products | No | Query search, category, gender, proteinOnly | {success:true,listings:[individual active in-stock offers],suggestions:[up to 6 title/category items]}; category-specific validation errors 400 | listings/productsRoutes.js → getExploreProducts |
| GET /api/listings/public/:listingId | No | Listing ID | {success:true,listing:{offer fields,seller:{id,fullName,avatarUrl,averageRating,reviewCount}}}; 404 unavailable | listingsRoutes.js → getPublicListingDetails |
| POST /api/listings | Required; multipart/form-data; 2–4 photos required | name, category, description, price, quantityAvailable, phoneNumber, location, condition; customCondition for CUSTOM; clothingGender for clothing; proteinGrams for food | 201 {success:true,listing}; 400 validation; 401 session | createListing |
| GET /api/listings/:listingId | Required, owner only | ID | {success:true,listing} for active owner's edit form; 404 otherwise | listingManagementController.getListingForEdit |
| PATCH /api/listings/:listingId | Required, owner only; multipart | Same listing fields; optionally keep existing photos or replace with 2–4 photos; removePhoto | {success:true,listing}; 400/404/500 | updateListing |
| PATCH /api/listings/:listingId/stock | Required, owner only | {quantityAvailable: integer 0–9999} | {success:true,quantityAvailable}; 404 if not active/owned | updateListingStock |
| PATCH /api/listings/:listingId/archive | Required, owner only | None | {success:true,status:"ARCHIVED",archivedAt}; supports ACTIVE/SOLD | archiveListing |
| PATCH /api/listings/:listingId/restore | Required, owner only | None | {success:true,status:"ACTIVE"}; only own archived offer | restoreListing |
| DELETE /api/listings/:listingId | Required, owner only; archived only | None | {success:true,deleted:true}; 409 if any order history | permanentlyDeleteListing |

Explore query search uses normalized keywords, prefix and a small edit-distance tolerance. Category/gender/protein apply only when no search text; search is universal. Explore only returns status ACTIVE and quantity > 0. Search currently fetches matching candidates from DB then filters in Node; no pagination.

## Listing wishlist

All wishlist mutations use the individual Listing ID. ListingFavorite composite unique key is [userId,listingId].

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| GET /api/listings/favorites | Required | None | {success:true,listingIds:[Listing.id,...]} | getSavedListingIds |
| GET /api/listings/:listingId/favorite | Required | ID | {success:true,isSaved:boolean} | getListingFavorite |
| PUT /api/listings/:listingId/favorite | Required | Empty JSON object accepted | 201 {success:true,isSaved:true}; only active offer | saveListing |
| DELETE /api/listings/:listingId/favorite | Required | ID | {success:true,isSaved:false}; idempotent | removeSavedListing |

## Engagement: questions and reviews

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| GET /api/listings/:listingId/engagement | No | ID | {success,eligibleSellerIds,questions:[...answers],reviews:[...]}; only active listing; newest 50 questions / 100 reviews | getListingEngagement |
| GET /api/listings/:listingId/review-eligibility | Required | ID | {success,canReview}; true only for a buyer with a completed order for this exact offer | getListingReviewEligibility |
| POST /api/listings/:listingId/questions | Required | {question}, 10–500 chars | 201 {success:true,question}; max 20 per user/listing per day; exact listing scope | askListingQuestion |
| POST /api/listings/questions/:questionId/answers | Required; exact listing seller | {answer}, 2–1000 chars | 201 {success:true,answer}; upsert one answer per seller/question | answerProductQuestion |
| POST /api/listings/:listingId/reviews | Required | {rating:1..5,comment:3..1000 chars} | 201 {success:true,review}; requires the buyer to have a COMPLETED order for this exact offer; blocks self-review; upsert one review per user/listing | reviewListing |

Order completion requires the seller to confirm handoff and the buyer to confirm receipt and cash payment. Reviews can be read publicly, but only completed buyers can create or update one.

## Sellers and dashboard

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| GET /api/sellers/dashboard | Required | None | {success:true,profile:{id,email,fullName,avatarUrl,activeListingCount,archivedListingCount,averageRating,reviewCount},myListings:[{id,title,product,description,price,quantityAvailable,photoUrl,location,status,archivedAt,condition,createdAt}],favoriteSellers:[...],savedListings:[...]}; 404 account missing | sellerController.getSellerDashboard |
| GET /api/sellers/:sellerId | No | Seller ID | {success:true,seller:{id,fullName,avatarUrl,activeListingCount,averageRating,reviewCount},listings:[...]}; public listing fields omit phone/email; 400 invalid ID / 404 missing seller | getSellerProfile |
| GET /api/sellers/:sellerId/favorite | Required | Seller ID | {success:true,isSaved:boolean} | getFavoriteStatus |
| PUT /api/sellers/:sellerId/favorite | Required | None | Idempotently favorite another seller; self-favorite rejected | saveFavoriteSeller |
| DELETE /api/sellers/:sellerId/favorite | Required | None | Remove favorite | removeFavoriteSeller |

## Orders (cash on delivery)

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| POST /api/orders | Required | {listingId,buyerPhone,quantity,buyerMessage?} | 201 {success:true,order}; rejects self, inactive, out-of-stock, too-large quantity; no payment capture | createOrder |
| GET /api/orders/mine | Required | None | {success:true,orders:[buyer/seller participant rows]}; private contact shaping | getMyOrders |
| GET /api/orders/seller/requests/count | Required | None | {success:true,pendingCount}; count of the signed-in seller's pending buyer requests only | getSellerRequestCount |
| GET /api/orders/seller/requests | Required | None | {success:true,requests:[pending seller requests]} | getSellerRequests |
| PATCH /api/orders/:orderId | Required; relevant participant | {action,meetingAt?,meetingLocation?} | {success:true,status}; actions accept, decline, cancel, confirmHandoff, confirmReceipt; invalid state 409; accept decrements stock transactionally | updateOrderStatus |

Order statuses: PENDING → ACCEPTED → SELLER_CONFIRMED → COMPLETED. Pending can become DECLINED or CANCELLED. Accept requires future meeting date/time and 2–120 character location. Seller acceptance consumes stock. No refund/payment/payout endpoint exists.

## Messages (present in working tree; integration not verified)

| Method and path | Auth | Request | Response / behavior | Source |
|---|---|---|---|---|
| POST /api/messages/listings/:listingId | Required | Empty JSON | 200 {success:true,conversation:{id}}; creates/resumes unique buyer/listing thread; active listing only; self-chat rejected | messagesController.startListingConversation |
| GET /api/messages | Required | None | {success:true,conversations:[summary]} for participant only, newest updated first | getMyConversations |
| GET /api/messages/:conversationId | Required participant | ID | {success:true,conversation:{id,otherUser,listing,messages}} latest 100 chronological | getConversation |
| POST /api/messages/:conversationId | Required participant | {body}, 1–2000 chars after trim | 201 {success:true,message}; updates conversation timestamp | sendConversationMessage |

Nonparticipant read/send returns 404 to avoid disclosing thread existence. Current UI refreshes manually; no WebSocket/SSE endpoint.

## Not present

No cart endpoints, payment provider endpoints, Razorpay webhook, upload API independent of listing form, standalone category API, dispute API, seller payout API, or online checkout API were found. Do not invent routes for them.
