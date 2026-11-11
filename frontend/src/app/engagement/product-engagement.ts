import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InteractionFeedback } from '../shared/interaction-feedback';

// Keep only public seller-offer details needed for choosing which listing to review.
export interface EngagementOffer {
  id: string;
  sellerId: string;
  price: string;
}

interface EngagementResponse {
  success: boolean;
  eligibleSellerIds: string[];
  questions: Array<{
    id: string;
    askerId: string;
    askerName: string;
    question: string;
    createdAt: string;
    answers: Array<{
      id: string;
      sellerId: string;
      sellerName: string;
      answer: string;
      createdAt: string;
    }>;
  }>;
  reviews: Array<{
    id: string;
    listingId: string;
    reviewerId: string;
    reviewerName: string;
    sellerId: string;
    sellerName: string;
    rating: number;
    comment: string;
    createdAt: string;
  }>;
}

interface CurrentUserResponse {
  success: boolean;
  user?: { id: string; email: string };
}

interface ReviewEligibilityResponse {
  success: boolean;
  canReview: boolean;
}

type EngagementEntryType = 'review' | 'question' | 'answer';

interface EngagementDeleteTarget {
  type: EngagementEntryType;
  id: string;
}

// Keep public product discussion and seller feedback in their own feature component.
@Component({
  selector: 'app-product-engagement',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './product-engagement.html',
  styleUrl: './product-engagement.css',
})
export class ProductEngagement {
  private readonly http = inject(HttpClient);
  private readonly interaction = inject(InteractionFeedback);
  private reviewEligibilityRequestKey = '';
  private reviewEligibilityResolvedKey = '';
  private reviewEligibilityGeneration = 0;

  // The parent passes the exact seller listing this discussion belongs to.
  readonly offers = input<EngagementOffer[]>([]);
  readonly listingId = input.required<string>();

  // Signals drive loading, sign-in permissions, feedback, and form state.
  protected readonly loading = signal(true);
  protected readonly currentUserId = signal<string | null>(null);
  protected readonly canReview = signal<boolean | null>(null);
  protected readonly reviewEligibilityError = signal('');
  protected readonly eligibleSellerIds = signal<string[]>([]);
  protected readonly questions = signal<EngagementResponse['questions']>([]);
  protected readonly reviews = signal<EngagementResponse['reviews']>([]);
  protected readonly questionDraft = signal('');
  protected readonly answerDrafts = signal<Record<string, string>>({});
  protected readonly selectedRating = signal(5);
  protected readonly reviewComment = signal('');
  protected readonly savingQuestion = signal(false);
  protected readonly savingAnswerId = signal<string | null>(null);
  protected readonly savingReview = signal(false);
  protected readonly pendingDelete = signal<EngagementDeleteTarget | null>(null);
  protected readonly deletingEntryKey = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly reviewableOffer = computed(
    () =>
      this.offers().find(
        (offer) =>
          String(offer.id) === String(this.listingId()) &&
          String(offer.sellerId) !== String(this.currentUserId()),
      ) ?? null,
  );
  protected readonly listingReviews = computed(() =>
    this.reviews().filter((review) => String(review.listingId) === String(this.listingId())),
  );

  // Load only this offer's discussion and check the user's session.
  constructor() {
    effect(() => {
      const listingId = this.listingId();
      if (listingId) this.loadEngagement(listingId);
    });
    effect(() => {
      const listingId = this.listingId();
      const reviewerId = this.currentUserId();
      const offer = this.reviewableOffer();
      if (!listingId || !reviewerId || !offer) {
        this.reviewEligibilityGeneration += 1;
        this.reviewEligibilityRequestKey = '';
        this.reviewEligibilityResolvedKey = '';
        this.canReview.set(null);
        this.reviewEligibilityError.set('');
        return;
      }
      this.loadReviewEligibility(listingId, reviewerId);
    });
    this.http.get<CurrentUserResponse>('/api/auth/me').subscribe({
      next: (response) => this.currentUserId.set(response.user?.id ?? null),
      error: () => this.currentUserId.set(null),
    });
  }

  // Fetch questions and reviews scoped to the selected seller offer.
  private loadEngagement(listingId = this.listingId()): void {
    this.loading.set(true);
    this.http.get<EngagementResponse>(`/api/listings/${listingId}/engagement`).subscribe({
      next: (response) => {
        this.eligibleSellerIds.set(response.eligibleSellerIds ?? []);
        this.questions.set(response.questions ?? []);
        this.reviews.set(response.reviews ?? []);
        this.loading.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'Questions and reviews could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  // Ask the server whether this signed-in buyer completed this exact seller offer.
  private loadReviewEligibility(listingId: string, reviewerId: string): void {
    const requestKey = `${listingId}:${reviewerId}`;
    if (this.reviewEligibilityRequestKey === requestKey || this.reviewEligibilityResolvedKey === requestKey) return;

    this.reviewEligibilityRequestKey = requestKey;
    const generation = ++this.reviewEligibilityGeneration;
    this.canReview.set(null);
    this.reviewEligibilityError.set('');
    this.http.get<ReviewEligibilityResponse>(`/api/listings/${listingId}/review-eligibility`).subscribe({
      next: (response) => {
        if (generation !== this.reviewEligibilityGeneration) return;
        this.reviewEligibilityRequestKey = '';
        this.reviewEligibilityResolvedKey = requestKey;
        this.canReview.set(response.canReview === true);
      },
      error: () => {
        if (generation !== this.reviewEligibilityGeneration) return;
        this.reviewEligibilityRequestKey = '';
        this.reviewEligibilityResolvedKey = requestKey;
        this.canReview.set(false);
        this.reviewEligibilityError.set('We could not verify your purchase. Refresh the page or sign in again.');
      },
    });
  }

  // Submit a question with the signed-in account's server-verified identity.
  protected submitQuestion(): void {
    if (!this.currentUserId()) {
      this.promptSignIn('Sign in or create an account to ask a question about this item.');
      return;
    }
    this.error.set('');
    this.success.set('');
    this.savingQuestion.set(true);
    this.http
      .post(`/api/listings/${this.listingId()}/questions`, { question: this.questionDraft() })
      .subscribe({
        next: () => {
          this.questionDraft.set('');
          this.success.set('Your question was posted.');
          this.interaction.showToast('Your question was posted.');
          this.savingQuestion.set(false);
          this.loadEngagement();
        },
        error: (response: HttpErrorResponse) => {
          if (response.status === 401) {
            this.promptSignIn('Sign in or create an account to ask a question about this item.');
            this.savingQuestion.set(false);
            return;
          }
          this.error.set(response.error?.message ?? 'Your question could not be posted.');
          this.interaction.showToast('Your question could not be posted.', 'error');
          this.savingQuestion.set(false);
        },
      });
  }

  // Submit or update the current seller's single answer for a question.
  protected submitAnswer(questionId: string): void {
    if (!this.currentUserId()) {
      this.promptSignIn('Sign in or create an account to reply to this question.');
      return;
    }
    this.error.set('');
    this.success.set('');
    this.savingAnswerId.set(questionId);
    this.http
      .post(`/api/listings/questions/${questionId}/answers`, {
        answer: this.answerDraft(questionId),
      })
      .subscribe({
        next: () => {
          this.answerDrafts.update((drafts) => ({ ...drafts, [questionId]: '' }));
          this.success.set('Your seller response was saved.');
          this.interaction.showToast('Your answer was saved.');
          this.savingAnswerId.set(null);
          this.loadEngagement();
        },
        error: (response: HttpErrorResponse) => {
          if (response.status === 401) {
            this.promptSignIn('Sign in or create an account to reply to this question.');
            this.savingAnswerId.set(null);
            return;
          }
          this.error.set(response.error?.message ?? 'Your response could not be saved.');
          this.interaction.showToast('Your answer could not be saved.', 'error');
          this.savingAnswerId.set(null);
        },
      });
  }

  // Submit a community review for the selected seller's offer.
  protected submitReview(): void {
    if (!this.currentUserId()) {
      this.promptSignIn('Sign in or create an account to review this seller after a completed purchase.');
      return;
    }
    const listingId = this.listingId();
    if (!listingId) {
      this.error.set('Choose a seller offer to review.');
      return;
    }
    if (this.canReview() !== true) {
      this.error.set('Complete a purchase of this offer before posting a review.');
      return;
    }

    this.error.set('');
    this.success.set('');
    this.savingReview.set(true);
    this.http
      .post(`/api/listings/${listingId}/reviews`, {
        rating: this.selectedRating(),
        comment: this.reviewComment(),
      })
      .subscribe({
        next: () => {
          this.reviewComment.set('');
          this.success.set('Your community review was saved.');
          this.interaction.showToast('Your review was posted.');
          this.savingReview.set(false);
          this.loadEngagement();
        },
        error: (response: HttpErrorResponse) => {
          if (response.status === 401) {
            this.promptSignIn('Sign in or create an account to review this seller after a completed purchase.');
            this.savingReview.set(false);
            return;
          }
          this.error.set(response.error?.message ?? 'Your review could not be saved.');
          this.interaction.showToast('Your review could not be saved.', 'error');
          this.savingReview.set(false);
        },
      });
  }

  // Ask for confirmation inline so deletion stays deliberate without a browser popup.
  protected requestDelete(type: EngagementEntryType, id: string): void {
    this.clearMessages();
    this.pendingDelete.set({ type, id });
  }

  protected isDeletePending(type: EngagementEntryType, id: string): boolean {
    const target = this.pendingDelete();
    return target?.type === type && target.id === id;
  }

  protected cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  // Delete only the current user's review; the backend verifies ownership again.
  protected deleteReview(reviewId: string): void {
    this.deleteEntry(
      'review',
      reviewId,
      `/api/listings/${this.listingId()}/reviews/${reviewId}`,
      'Your review was deleted.',
      () => this.reviews.update((reviews) => reviews.filter((review) => review.id !== reviewId)),
    );
  }

  // Deleting a question also removes its replies through the database relationship.
  protected deleteQuestion(questionId: string): void {
    this.deleteEntry(
      'question',
      questionId,
      `/api/listings/questions/${questionId}`,
      'Your question and its replies were deleted.',
      () => this.questions.update((questions) => questions.filter((question) => question.id !== questionId)),
    );
  }

  // Remove only the current seller's answer and leave the question in place.
  protected deleteAnswer(questionId: string, answerId: string): void {
    this.deleteEntry(
      'answer',
      answerId,
      `/api/listings/questions/${questionId}/answers/${answerId}`,
      'Your answer was deleted.',
      () =>
        this.questions.update((questions) =>
          questions.map((question) =>
            question.id === questionId
              ? { ...question, answers: question.answers.filter((answer) => answer.id !== answerId) }
              : question,
          ),
        ),
    );
  }

  // Share request state and feedback while each delete operation keeps its own endpoint.
  private deleteEntry(
    type: EngagementEntryType,
    id: string,
    endpoint: string,
    successMessage: string,
    updateLocalEntry: () => void,
  ): void {
    const key = `${type}:${id}`;
    this.clearMessages();
    this.deletingEntryKey.set(key);
    this.http.delete<{ success: boolean }>(endpoint).subscribe({
      next: () => {
        updateLocalEntry();
        this.pendingDelete.set(null);
        this.success.set(successMessage);
        this.deletingEntryKey.set(null);
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'This entry could not be deleted. Please try again.');
        this.deletingEntryKey.set(null);
      },
    });
  }

  // Return an existing seller reply as the input hint so that seller can update it.
  protected answerDraft(
    questionId: string,
    answers: EngagementResponse['questions'][number]['answers'] = [],
  ): string {
    const draft = this.answerDrafts()[questionId];
    if (draft !== undefined) return draft;
    return answers.find((answer) => answer.sellerId === this.currentUserId())?.answer ?? '';
  }

  // Update one question's editable reply without disturbing other sellers' drafts.
  protected setAnswerDraft(questionId: string, value: string): void {
    this.answerDrafts.update((drafts) => ({ ...drafts, [questionId]: value }));
  }

  // Allow replies only for accounts that currently own an active offer in this group.
  protected canCurrentUserAnswer(): boolean {
    const userId = this.currentUserId();
    return userId !== null && this.eligibleSellerIds().some((sellerId) => String(sellerId) === String(userId));
  }

  // Open the shared account prompt and return the visitor to this product afterward.
  protected promptSignIn(message: string): void {
    this.interaction.askToSignIn(message, `/products/${encodeURIComponent(this.listingId())}`);
  }

  // Keep star values numeric when the select field changes.
  protected setRating(value: string): void {
    this.selectedRating.set(Number(value));
  }

  // Turn server errors into short, safe messages for the page.
  protected clearMessages(): void {
    this.error.set('');
    this.success.set('');
  }
}
