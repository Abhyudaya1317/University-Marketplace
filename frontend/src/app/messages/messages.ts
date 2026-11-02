import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { AccountNavigation } from '../shared/account-navigation';

// Keep inbox rows small while each thread contains only the latest 100 messages.
interface ConversationSummary {
  id: number;
  updatedAt: string;
  otherUser: { id: number; fullName: string; avatarUrl: string | null };
  listing: { id: number; title: string; price: string; photoUrl: string | null; status: string };
  lastMessage: { body: string; createdAt: string; senderId: number } | null;
  unreadCount: number;
}

interface ChatMessage {
  id: number;
  senderId: number;
  senderName: string;
  type: 'TEXT' | 'IMAGE' | 'CONTACT' | 'LOCATION';
  body: string;
  contactName: string | null;
  contactPhone: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  attachmentUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

interface ConversationThread {
  id: number;
  otherUser: { id: number; fullName: string; avatarUrl: string | null };
  listing: { id: number; title: string; price: string; photoUrl: string | null; status: string };
  messages: ChatMessage[];
}

// Provide a simple inbox and a separate direct URL for each private conversation.
@Component({
  selector: 'app-messages',
  imports: [DatePipe, FormsModule, RouterLink, AccountNavigation],
  templateUrl: './messages.html',
  styleUrl: './messages.css',
})
export class Messages {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly conversations = signal<ConversationSummary[]>([]);
  protected readonly conversation = signal<ConversationThread | null>(null);
  protected readonly currentUserId = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly draft = signal('');
  protected readonly error = signal('');
  protected readonly signInRequired = signal(false);
  protected readonly notice = signal('');
  protected readonly conversationId = signal<number | null>(null);
  protected readonly contactFormOpen = signal(false);
  protected readonly contactName = signal('');
  protected readonly contactPhone = signal('');
  protected readonly sharingLocation = signal(false);
  protected readonly uploadingImage = signal(false);
  @ViewChild('messageList') private messageList?: ElementRef<HTMLDivElement>;

  private inboxRequestInFlight = false;
  private conversationRequestInFlight = false;

  constructor() {
    this.http.get<{ user?: { id: number } }>('/api/auth/me').subscribe({
      next: (response) => this.currentUserId.set(response.user?.id ?? null),
      error: () => this.currentUserId.set(null),
    });
    this.loadInbox();
    this.route.paramMap.subscribe((params) => {
      const value = params.get('conversationId');
      const id = value && /^\d+$/.test(value) ? Number(value) : null;
      this.conversationId.set(Number.isSafeInteger(id) ? id : null);
      this.conversation.set(null);
      if (id) this.loadConversation(id);
    });

    // Check for new messages every three seconds while this tab is visible.
    interval(3000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;

        const openConversationId = this.conversationId();
        if (openConversationId) {
          this.refreshConversation(openConversationId);
        } else {
          this.refreshInbox();
        }
      });
  }

  // Fetch only threads in which the signed-in account is a buyer or seller.
  protected loadInbox(): void {
    this.fetchInbox(true);
  }

  private refreshInbox(): void {
    this.fetchInbox(false);
  }

  private fetchInbox(showLoading: boolean): void {
    if (this.inboxRequestInFlight) return;
    this.inboxRequestInFlight = true;
    if (showLoading) this.loading.set(true);

    this.http.get<{ conversations: ConversationSummary[] }>('/api/messages').subscribe({
      next: (response) => {
        this.conversations.set(response.conversations ?? []);
        this.inboxRequestInFlight = false;
        this.loading.set(false);
        this.error.set('');
        this.signInRequired.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.inboxRequestInFlight = false;
        this.signInRequired.set(response.status === 401);
        this.error.set(this.messageError(response, 'inbox'));
        this.loading.set(false);
      },
    });
  }

  // Read a thread by its ID; the server checks that this account is a participant.
  protected loadConversation(id = this.conversationId()): void {
    if (!id) return;
    this.fetchConversation(id, true);
  }

  private refreshConversation(id: number): void {
    this.fetchConversation(id, false);
  }

  private fetchConversation(id: number, showLoading: boolean): void {
    if (this.conversationRequestInFlight) return;
    this.conversationRequestInFlight = true;
    if (showLoading) this.loading.set(true);

    this.http.get<{ conversation: ConversationThread }>(`/api/messages/${id}`).subscribe({
      next: (response) => {
        const nextConversation = response.conversation;
        const currentConversation = this.conversation();
        const hasNewMessages =
          !currentConversation ||
          currentConversation.messages.length !== nextConversation.messages.length ||
          currentConversation.messages.at(-1)?.id !== nextConversation.messages.at(-1)?.id;
        this.conversationRequestInFlight = false;
        this.loading.set(false);
        this.error.set('');
        if (hasNewMessages) {
          const wasNearBottom = this.isMessageListNearBottom();
          this.conversation.set(nextConversation);
          if (wasNearBottom) this.scrollMessageListToBottom();
        }
      },
      error: (response: HttpErrorResponse) => {
        this.conversationRequestInFlight = false;
        this.error.set(this.messageError(response, 'conversation'));
        this.loading.set(false);
      },
    });
  }

  // Keep new messages in view when the reader was already at the bottom of the thread.
  private isMessageListNearBottom(): boolean {
    const element = this.messageList?.nativeElement;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  }

  private scrollMessageListToBottom(): void {
    requestAnimationFrame(() => {
      const element = this.messageList?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }

  // Send plain text and refresh the latest messages after the server confirms it.
  protected sendMessage(): void {
    const id = this.conversationId();
    const body = this.draft().trim();
    if (!id || !body || body.length > 2000 || this.sending()) return;
    this.sendMessageRequest(`/api/messages/${id}`, { body }, 'Message sent.');
  }

  // Enter sends; Shift+Enter keeps its normal behavior and inserts a new line.
  protected handleEnterKey(event: Event): void {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.shiftKey || keyEvent.isComposing) return;
    keyEvent.preventDefault();
    this.sendMessage();
  }

  // Upload one validated image; the server keeps it private to chat participants.
  protected sendImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const image = input.files?.[0];
    const id = this.conversationId();
    if (!image || !id || this.uploadingImage()) return;
    if (image.size > 5 * 1024 * 1024) {
      this.error.set('Chat images must be 5 MB or smaller.');
      input.value = '';
      return;
    }

    const form = new FormData();
    form.append('image', image);
    form.append('caption', this.draft().trim());
    this.uploadingImage.set(true);
    this.sendMessageRequest(`/api/messages/${id}/images`, form, 'Image sent.', () => {
      this.draft.set('');
      this.uploadingImage.set(false);
      input.value = '';
    }, () => {
      this.uploadingImage.set(false);
      input.value = '';
    });
  }

  // Share a name and phone number the user explicitly enters.
  protected shareContact(): void {
    const id = this.conversationId();
    if (!id) return;
    if (this.contactName().trim().length < 2 || this.contactPhone().trim().length < 7) {
      this.error.set('Enter a contact name and a phone number with at least 7 characters.');
      return;
    }
    this.sendMessageRequest(
      `/api/messages/${id}/contacts`,
      { contactName: this.contactName(), contactPhone: this.contactPhone() },
      'Contact shared.',
      () => {
        this.contactName.set('');
        this.contactPhone.set('');
        this.contactFormOpen.set(false);
      },
    );
  }

  protected toggleContactForm(): void {
    this.contactFormOpen.update((open) => !open);
  }

  // Ask the browser for location only after the user presses Share location.
  protected shareLocation(): void {
    const id = this.conversationId();
    if (!id || this.sharingLocation()) return;
    if (!navigator.geolocation) {
      this.error.set('Location sharing is not supported by this browser.');
      return;
    }
    this.sharingLocation.set(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.sendMessageRequest(
          `/api/messages/${id}/location`,
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            locationLabel: 'Shared location',
          },
          'Location shared.',
          () => this.sharingLocation.set(false),
          () => this.sharingLocation.set(false),
        );
      },
      () => {
        this.error.set('CampusX could not get your location. Allow location access and try again.');
        this.sharingLocation.set(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  // Send all supported message types through the same success and error flow.
  private sendMessageRequest(
    url: string,
    body: object | FormData,
    successMessage: string,
    onSuccess?: () => void,
    onError?: () => void,
  ): void {
    const id = this.conversationId();
    if (!id || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    this.notice.set('');
    this.http.post(url, body).subscribe({
      next: () => {
        if (successMessage === 'Message sent.') this.draft.set('');
        this.notice.set(successMessage);
        this.sending.set(false);
        onSuccess?.();
        this.loadConversation(id);
        this.loadInbox();
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(this.messageError(response, 'send'));
        this.sending.set(false);
        onError?.();
      },
    });
  }

  protected mapLocationUrl(message: ChatMessage): string {
    return `https://www.google.com/maps?q=${message.latitude},${message.longitude}`;
  }

  // Separate an expired session from a network or database failure for clear next steps.
  private messageError(
    response: HttpErrorResponse,
    action: 'inbox' | 'conversation' | 'send',
  ): string {
    if (response.status === 401) return 'Your sign-in has expired. Sign in again to continue.';
    if (response.status === 0) {
      return 'CampusX could not reach the backend. Check that the backend server is running, then retry.';
    }
    if (response.status >= 500) {
      return 'CampusX could not access messaging data. Check the backend terminal for a database error and confirm the messaging migration is applied.';
    }
    return (
      response.error?.message ??
      (action === 'inbox'
        ? 'Your messages could not be loaded.'
        : action === 'conversation'
          ? 'This conversation could not be loaded.'
          : 'Your message could not be sent.')
    );
  }

  protected isOwnMessage(senderId: number): boolean {
    return senderId === this.currentUserId();
  }
}
