import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, interval } from 'rxjs';
import { AccountNavigation } from '../shared/account-navigation';

// Keep inbox rows small while each thread contains only the latest 100 messages.
interface ConversationSummary {
  id: string;
  updatedAt: string;
  otherUser: { id: string; fullName: string; avatarUrl: string | null };
  listing: { id: string; title: string; price: string; photoUrl: string | null; status: string } | null;
  confirmedMeeting: { meetupAt: string; meetupLocation: string | null } | null;
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
  meetupStatus?: 'PENDING' | 'CONFIRMED' | 'DENIED' | null;
  editedAt?: string | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

interface ConversationThread {
  id: string;
  otherUser: { id: string; fullName: string; avatarUrl: string | null };
  listing: { id: string; title: string; price: string; photoUrl: string | null; status: string } | null;
  confirmedMeeting: { meetupAt: string; meetupLocation: string | null } | null;
  messages: ChatMessage[];
}

interface DraftTarget {
  listingId: string | null;
  sellerId: string | null;
}

interface DraftConversationResponse {
  success: boolean;
  conversation: { id: string } | null;
  draft: {
    sellerId: string;
    otherUser: ConversationThread['otherUser'];
    listing: ConversationThread['listing'];
  };
}

// Reduce large camera photos before upload so chat image requests stay small and quick.
async function prepareChatPhoto(file: File): Promise<File> {
  const targetBytes = 2_200_000;
  if (file.size <= targetBytes) return file;
  if (typeof createImageBitmap !== 'function') throw new Error('Your browser could not prepare this photo. Try a smaller image.');

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    let smallest: Blob | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this photo.');
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.84, 0.74, 0.64, 0.54]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob) throw new Error('Your browser could not prepare this photo.');
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= targetBytes) {
          return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'chat-photo'}.webp`, {
            type: 'image/webp',
            lastModified: file.lastModified,
          });
        }
      }
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
    if (smallest && smallest.size <= 3_500_000) {
      return new File([smallest], `${file.name.replace(/\.[^.]+$/, '') || 'chat-photo'}.webp`, {
        type: 'image/webp',
        lastModified: file.lastModified,
      });
    }
    throw new Error('This photo is too large to send. Try choosing a smaller image.');
  } finally {
    bitmap.close();
  }
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
  private readonly router = inject(Router);
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
  protected readonly draftTarget = signal<DraftTarget>({ listingId: null, sellerId: null });
  protected readonly uploadingFile = signal(false);
  protected readonly meetupDecisionMessage = signal<ChatMessage | null>(null);
  protected readonly respondingMeetupId = signal<string | null>(null);
  protected readonly deletingMessageId = signal<string | null>(null);
  protected readonly selectedMessageIds = signal<Set<string>>(new Set());
  protected readonly messageSelectionMode = signal(false);
  protected readonly deletingSelectedMessages = signal(false);
  @ViewChild('messageList') private messageList?: ElementRef<HTMLDivElement>;

  private inboxRequestInFlight = false;
  private conversationRequestInFlight = false;
  private lastInboxRefreshAt = 0;

  constructor() {
    this.http.get<{ user?: { id: string } }>('/api/auth/me').subscribe({
      next: (response) => this.currentUserId.set(response.user?.id ?? null),
      error: () => this.currentUserId.set(null),
    });
    this.loadInbox();
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([params, query]) => {
        const value = params.get('conversationId');
        const isDraft = value === 'new';
        const id = value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? value : null;
        const target: DraftTarget = {
          listingId: isDraft ? query.get('listingId') : null,
          sellerId: isDraft ? query.get('sellerId') : null,
        };
        this.conversationId.set(isDraft ? 'new' : id);
        this.draftTarget.set(target);
        this.conversation.set(null);
        this.meetupDecisionMessage.set(null);
        this.conversationRequestInFlight = false;
        if (id) this.loadConversation(id);
        else if (isDraft) this.loadDraftConversation(target);
      });

    // Refresh open conversations frequently, but avoid reloading the whole inbox every few seconds.
    interval(5000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;

        const openConversationId = this.conversationId();
        if (openConversationId && openConversationId !== 'new') {
          this.refreshConversation(openConversationId);
        } else if (!openConversationId && Date.now() - this.lastInboxRefreshAt >= 15_000) {
          this.refreshInbox();
        }
      });
  }

  // Opening a seller chat reads its details but does not create an inbox row.
  private loadDraftConversation(target: DraftTarget): void {
    this.conversationLoading.set(true);
    this.error.set('');
    this.conversationRequestInFlight = true;
    const url = target.listingId
      ? `/api/messages/listings/${encodeURIComponent(target.listingId)}`
      : target.sellerId
        ? `/api/messages/sellers/${encodeURIComponent(target.sellerId)}`
        : null;
    if (!url) {
      this.conversationRequestInFlight = false;
      this.conversationLoading.set(false);
      this.error.set('Choose a seller or listing to start a conversation.');
      return;
    }

    this.http.post<DraftConversationResponse>(url, {}).subscribe({
      next: (response) => {
        this.conversationRequestInFlight = false;
        this.conversationLoading.set(false);
        if (response.conversation?.id) {
          void this.router.navigate(['/messages', response.conversation.id], { replaceUrl: true });
          return;
        }
        this.conversation.set({
          id: 'new',
          otherUser: response.draft.otherUser,
          listing: response.draft.listing,
          confirmedMeeting: null,
          messages: [],
        });
      },
      error: (response: HttpErrorResponse) => {
        this.conversationRequestInFlight = false;
        this.conversationLoading.set(false);
        this.error.set(this.messageError(response, 'conversation'));
        this.signInRequired.set(response.status === 401);
      },
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
    this.lastInboxRefreshAt = Date.now();
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
              || previous?.editedAt !== message.editedAt
              || previous?.meetupStatus !== message.meetupStatus;
          }) || currentConversation.confirmedMeeting?.meetupAt !== nextConversation.confirmedMeeting?.meetupAt
            || currentConversation.confirmedMeeting?.meetupLocation !== nextConversation.confirmedMeeting?.meetupLocation;
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
    if (!id || !body || body.length > 2000 || this.sending() || this.uploadingFile()) return;
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
  protected async sendFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const id = this.conversationId();
    if (!file || !id || this.uploadingFile() || this.sending()) return;
    if (file.size > 10 * 1024 * 1024) {
      this.error.set('Chat files must be 10 MB or smaller.');
      input.value = '';
      return;
    }

    this.uploadingFile.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const preparedFile = file.type.startsWith('image/') ? await prepareChatPhoto(file) : file;
      const form = new FormData();
      form.append('file', preparedFile);
      form.append('caption', this.draft().trim());
      this.sendMessageRequest(`/api/messages/${id}/files`, form, 'File sent.', () => {
        this.draft.set('');
        this.uploadingFile.set(false);
        this.attachmentMenuOpen.set(false);
        input.value = '';
      }, () => {
        this.uploadingFile.set(false);
        input.value = '';
      });
    } catch (error) {
      this.uploadingFile.set(false);
      input.value = '';
      this.error.set(error instanceof Error ? error.message : 'We could not prepare this file. Please try again.');
    }
  }

  // Send one selected sticker from the small built-in CampusX sticker pack.
  protected sendSticker(stickerKey: string): void {
    const id = this.conversationId();
    if (!id || this.uploadingFile()) return;
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
    if (!id || !this.meetupAt() || !this.meetupLocation().trim() || this.uploadingFile()) return;
    this.sendMessageRequest(`/api/messages/${id}/meetups`, {
      meetupAt: new Date(this.meetupAt()).toISOString(),
      meetupLocation: this.meetupLocation().trim(),
    }, 'Meetup request sent.', () => {
      this.meetupAt.set('');
      this.meetupLocation.set('');
      this.meetupFormOpen.set(false);
    });
  }

  protected isIncomingPendingMeetup(message: ChatMessage): boolean {
    return message.type === 'MEETUP'
      && (message.meetupStatus ?? 'PENDING') === 'PENDING'
      && !this.isOwnMessage(message.senderId);
  }

  protected openMeetupDecision(message: ChatMessage, event: Event): void {
    if (!this.isIncomingPendingMeetup(message)) return;
    if (event instanceof KeyboardEvent && event.key === ' ') event.preventDefault();
    event.stopPropagation();
    this.meetupDecisionMessage.set(message);
  }

  protected closeMeetupDecision(): void {
    if (!this.respondingMeetupId()) this.meetupDecisionMessage.set(null);
  }

  protected respondToMeetup(action: 'confirm' | 'deny'): void {
    const conversationId = this.conversationId();
    const request = this.meetupDecisionMessage();
    if (!conversationId || !request || this.respondingMeetupId()) return;
    this.respondingMeetupId.set(request.id);
    this.error.set('');
    this.http.post<{ meetupStatus: 'CONFIRMED' | 'DENIED' }>(
      `/api/messages/${conversationId}/${request.id}/meetup-response`,
      { action },
    ).subscribe({
      next: (response) => {
        const thread = this.conversation();
        if (thread) {
          const updatedMessage = { ...request, meetupStatus: response.meetupStatus };
          this.conversation.set({
            ...thread,
            messages: thread.messages.map((message) => message.id === request.id ? updatedMessage : message),
            confirmedMeeting: response.meetupStatus === 'CONFIRMED'
              ? { meetupAt: request.meetupAt!, meetupLocation: request.meetupLocation ?? null }
              : thread.confirmedMeeting,
          });
        }
        this.respondingMeetupId.set(null);
        this.meetupDecisionMessage.set(null);
        this.notice.set(response.meetupStatus === 'CONFIRMED' ? 'Meetup confirmed.' : 'Meetup request denied.');
        this.refreshConversation(conversationId);
        this.refreshInbox();
      },
      error: (response: HttpErrorResponse) => {
        this.respondingMeetupId.set(null);
        this.error.set(response.error?.message ?? 'We could not respond to this meetup request.');
      },
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
    const requestBody = this.withDraftTarget(body, id);
    this.http.post<{ conversationId?: string | number }>(url, requestBody).subscribe({
      next: (response) => {
        if (successMessage === 'Message sent.') this.draft.set('');
        this.notice.set(successMessage);
        this.sending.set(false);
        onSuccess?.();
        if (id === 'new' && response.conversationId) {
          const savedConversationId = String(response.conversationId);
          this.conversationId.set(savedConversationId);
          this.draftTarget.set({ listingId: null, sellerId: null });
          void this.router.navigate(['/messages', savedConversationId], { replaceUrl: true });
          this.refreshInbox();
          return;
        }
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

  // Add the selected seller/listing only while a draft is being sent for the first time.
  private withDraftTarget(body: object | FormData, conversationId: string): object | FormData {
    if (conversationId !== 'new') return body;
    const target = this.draftTarget();
    if (body instanceof FormData) {
      if (target.listingId) body.append('listingId', target.listingId);
      if (target.sellerId) body.append('sellerId', target.sellerId);
      return body;
    }
    return { ...body, ...target };
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
    if (response.status === 503 && action === 'send' && response.error?.message) return response.error.message;
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
