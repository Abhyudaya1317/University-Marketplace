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
  id: string;
  updatedAt: string;
  otherUser: { id: string; fullName: string; avatarUrl: string | null };
  listing: { id: string; title: string; price: string; photoUrl: string | null; status: string } | null;
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'STICKER' | 'MEETUP' | 'CONTACT' | 'LOCATION';
  body: string;
  contactName: string | null;
  contactPhone: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  attachmentUrl: string | null;
  attachmentName?: string | null;
  stickerKey?: string | null;
  meetupAt?: string | null;
  meetupLocation?: string | null;
  editedAt?: string | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface ConversationThread {
  id: string;
  otherUser: { id: string; fullName: string; avatarUrl: string | null };
  listing: { id: string; title: string; price: string; photoUrl: string | null; status: string } | null;
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
  protected readonly currentUserId = signal<string | null>(null);
  // Keep inbox and thread loading independent because both requests start on page entry.
  protected readonly inboxLoading = signal(true);
  protected readonly conversationLoading = signal(true);
  protected readonly sending = signal(false);
  protected readonly draft = signal('');
  protected readonly editingMessageId = signal<string | null>(null);
  protected readonly editDraft = signal('');
  protected readonly attachmentMenuOpen = signal(false);
  protected readonly stickerPickerOpen = signal(false);
  protected readonly meetupFormOpen = signal(false);
  protected readonly meetupAt = signal('');
  protected readonly meetupLocation = signal('');
  protected readonly error = signal('');
  protected readonly signInRequired = signal(false);
  protected readonly notice = signal('');
  protected readonly conversationId = signal<string | null>(null);
  protected readonly uploadingFile = signal(false);
  protected readonly deletingMessageId = signal<string | null>(null);
  protected readonly selectedMessageIds = signal<Set<string>>(new Set());
  protected readonly messageSelectionMode = signal(false);
  protected readonly deletingSelectedMessages = signal(false);
  @ViewChild('messageList') private messageList?: ElementRef<HTMLDivElement>;

  private inboxRequestInFlight = false;
  private conversationRequestInFlight = false;

  constructor() {
    this.http.get<{ user?: { id: string } }>('/api/auth/me').subscribe({
      next: (response) => this.currentUserId.set(response.user?.id ?? null),
      error: () => this.currentUserId.set(null),
    });
    this.loadInbox();
    this.route.paramMap.subscribe((params) => {
      const value = params.get('conversationId');
      const id = value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? value : null;
      this.conversationId.set(id);
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
    if (showLoading) this.inboxLoading.set(true);

    this.http.get<{ conversations: ConversationSummary[] }>('/api/messages').subscribe({
      next: (response) => {
        this.conversations.set(response.conversations ?? []);
        this.inboxRequestInFlight = false;
        this.inboxLoading.set(false);
        this.error.set('');
        this.signInRequired.set(false);
      },
      error: (response: HttpErrorResponse) => {
        this.inboxRequestInFlight = false;
        this.signInRequired.set(response.status === 401);
        this.error.set(this.messageError(response, 'inbox'));
        this.inboxLoading.set(false);
      },
    });
  }

  // Read a thread by its ID; the server checks that this account is a participant.
  protected loadConversation(id = this.conversationId()): void {
    if (!id) return;
    this.fetchConversation(id, true);
  }

  private refreshConversation(id: string): void {
    this.fetchConversation(id, false);
  }

  private fetchConversation(id: string, showLoading: boolean): void {
    if (this.conversationRequestInFlight) return;
    this.conversationRequestInFlight = true;
    if (showLoading) this.conversationLoading.set(true);

    this.http.get<{ conversation: ConversationThread }>(`/api/messages/${id}`).subscribe({
      next: (response) => {
        const nextConversation = response.conversation;
        const currentConversation = this.conversation();
        const hasNewMessages =
          !currentConversation ||
          currentConversation.messages.length !== nextConversation.messages.length ||
          currentConversation.messages.at(-1)?.id !== nextConversation.messages.at(-1)?.id ||
          nextConversation.messages.some((message, index) => {
            const previous = currentConversation.messages[index];
            return previous?.deletedAt !== message.deletedAt
              || previous?.body !== message.body
              || previous?.editedAt !== message.editedAt;
          });
        this.conversationRequestInFlight = false;
        this.conversationLoading.set(false);
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
        this.conversationLoading.set(false);
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

  // Upload one supported image or document; it remains private to chat participants.
  protected sendFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.conversationId();
    if (!file || !id || this.uploadingFile()) return;
    if (file.size > 10 * 1024 * 1024) {
      this.error.set('Chat files must be 10 MB or smaller.');
      input.value = '';
      return;
    }

    const form = new FormData();
    form.append('file', file);
    form.append('caption', this.draft().trim());
    this.uploadingFile.set(true);
    this.sendMessageRequest(`/api/messages/${id}/files`, form, 'File sent.', () => {
      this.draft.set('');
      this.uploadingFile.set(false);
      this.attachmentMenuOpen.set(false);
      input.value = '';
    }, () => {
      this.uploadingFile.set(false);
      input.value = '';
    });
  }

  // Send one selected sticker from the small built-in CampusX sticker pack.
  protected sendSticker(stickerKey: string): void {
    const id = this.conversationId();
    if (!id) return;
    this.sendMessageRequest(`/api/messages/${id}/stickers`, { stickerKey }, 'Sticker sent.', () => {
      this.stickerPickerOpen.set(false);
      this.attachmentMenuOpen.set(false);
    });
  }

  // Keep the date field from offering past meetup times.
  protected minimumMeetupTime(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }

  // Send a proposed campus meetup time and place; the other person still needs to agree.
  protected scheduleMeetup(): void {
    const id = this.conversationId();
    if (!id || !this.meetupAt() || !this.meetupLocation().trim()) return;
    this.sendMessageRequest(`/api/messages/${id}/meetups`, {
      meetupAt: new Date(this.meetupAt()).toISOString(),
      meetupLocation: this.meetupLocation().trim(),
    }, 'Meetup request sent.', () => {
      this.meetupAt.set('');
      this.meetupLocation.set('');
      this.meetupFormOpen.set(false);
    });
  }

  // Open a compact inline editor only for your own regular text messages.
  protected startEditing(message: ChatMessage): void {
    if (!this.isOwnMessage(message.senderId) || message.type !== 'TEXT' || message.deletedAt) return;
    this.editingMessageId.set(message.id);
    this.editDraft.set(message.body);
  }

  protected cancelEditing(): void {
    this.editingMessageId.set(null);
    this.editDraft.set('');
  }

  protected saveEditedMessage(): void {
    const id = this.conversationId();
    const messageId = this.editingMessageId();
    const body = this.editDraft().trim();
    if (!id || !messageId || !body || body.length > 2000 || this.sending()) return;
    this.sending.set(true);
    this.http.patch(`/api/messages/${id}/${messageId}`, { body }).subscribe({
      next: () => {
        this.sending.set(false);
        this.cancelEditing();
        this.notice.set('Message updated.');
        // Refresh without entering a loading state, so the thread stays mounted and keeps its scroll.
        this.refreshConversation(id);
        this.refreshInbox();
      },
      error: (response: HttpErrorResponse) => {
        this.sending.set(false);
        this.error.set(response.error?.message ?? 'We could not edit this message.');
      },
    });
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
        // A quiet refresh updates the bubble in place instead of rebuilding the chat view.
        this.refreshConversation(id);
        this.refreshInbox();
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

  protected isOwnMessage(senderId: string): boolean {
    return senderId === this.currentUserId();
  }

  // Delete only a message authored by the current account; both participants see the tombstone.
  protected deleteMessage(message: ChatMessage): void {
    const conversationId = this.conversationId();
    if (!conversationId || !this.isOwnMessage(message.senderId) || message.deletedAt || this.deletingMessageId()) return;
    this.deletingMessageId.set(message.id);
    this.error.set('');
    this.notice.set('');
    this.http.delete(`/api/messages/${conversationId}/${message.id}`).subscribe({
      next: () => {
        this.deletingMessageId.set(null);
        this.notice.set('Message deleted.');
        this.refreshConversation(conversationId);
        this.refreshInbox();
      },
      error: (response: HttpErrorResponse) => {
        this.deletingMessageId.set(null);
        this.error.set(response.error?.message ?? 'We could not delete this message.');
      },
    });
  }

  // Toggle one of the current user's messages in the bulk-selection set.
  protected toggleMessageSelection(messageId: string): void {
    this.messageSelectionMode.set(true);
    this.selectedMessageIds.update((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  protected clearMessageSelection(): void {
    this.selectedMessageIds.set(new Set());
    this.messageSelectionMode.set(false);
  }

  // In selection mode, tapping any of your undeleted messages toggles it in the selection.
  protected handleMessageSelection(message: ChatMessage, event: MouseEvent): void {
    if (!this.messageSelectionMode() || !this.isOwnMessage(message.senderId) || message.deletedAt) return;
    event.preventDefault();
    event.stopPropagation();
    this.toggleMessageSelection(message.id);
  }

  // Ask the server to tombstone the selected messages, preserving the conversation and its history.
  protected deleteSelectedMessages(): void {
    const conversationId = this.conversationId();
    const messageIds = [...this.selectedMessageIds()];
    if (!conversationId || !messageIds.length || this.deletingSelectedMessages()) return;
    this.deletingSelectedMessages.set(true);
    this.error.set('');
    this.notice.set('');
    this.http.post<{ success: boolean; deletedCount: number }>(
      `/api/messages/${conversationId}/bulk-delete`,
      { messageIds },
    ).subscribe({
      next: (response) => {
        this.deletingSelectedMessages.set(false);
        this.clearMessageSelection();
        this.notice.set(`${response.deletedCount} message${response.deletedCount === 1 ? '' : 's'} deleted.`);
        this.refreshConversation(conversationId);
        this.refreshInbox();
      },
      error: (response: HttpErrorResponse) => {
        this.deletingSelectedMessages.set(false);
        this.error.set(response.error?.message ?? 'We could not delete the selected messages.');
      },
    });
  }

  // Start a new visible date section when the calendar day changes in this thread.
  protected isNewMessageDate(messages: ChatMessage[], index: number): boolean {
    if (index === 0) return true;
    const previousDate = new Date(messages[index - 1].createdAt).toDateString();
    const currentDate = new Date(messages[index].createdAt).toDateString();
    return previousDate !== currentDate;
  }
}
