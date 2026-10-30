import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

// Keep inbox rows small while each thread contains only the latest 100 messages.
interface ConversationSummary {
  id: number;
  updatedAt: string;
  otherUser: { id: number; fullName: string };
  listing: { id: number; title: string; price: string; photoUrl: string | null; status: string };
  lastMessage: { body: string; createdAt: string; senderId: number } | null;
}

interface ConversationThread {
  id: number;
  otherUser: { id: number; fullName: string };
  listing: { id: number; title: string; price: string; photoUrl: string | null; status: string };
  messages: Array<{
    id: number;
    senderId: number;
    senderName: string;
    body: string;
    createdAt: string;
  }>;
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
  protected readonly notice = signal('');
  protected readonly conversationId = signal<number | null>(null);

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
  }

  // Fetch only threads in which the signed-in account is a buyer or seller.
  protected loadInbox(): void {
    this.http.get<{ conversations: ConversationSummary[] }>('/api/messages').subscribe({
      next: (response) => {
        this.conversations.set(response.conversations ?? []);
        this.loading.set(false);
        this.error.set('');
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(
          response.status === 401
            ? 'Sign in to view your messages.'
            : (response.error?.message ?? 'Your messages could not be loaded.'),
        );
        this.loading.set(false);
      },
    });
  }

  // Read a thread by its ID; the server checks that this account is a participant.
  protected loadConversation(id = this.conversationId()): void {
    if (!id) return;
    this.loading.set(true);
    this.http.get<{ conversation: ConversationThread }>(`/api/messages/${id}`).subscribe({
      next: (response) => {
        this.conversation.set(response.conversation);
        this.loading.set(false);
        this.error.set('');
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'This conversation could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  // Send plain text and refresh the latest messages after the server confirms it.
  protected sendMessage(): void {
    const id = this.conversationId();
    const body = this.draft().trim();
    if (!id || !body || body.length > 2000 || this.sending()) return;
    this.sending.set(true);
    this.error.set('');
    this.notice.set('');
    this.http.post(`/api/messages/${id}`, { body }).subscribe({
      next: () => {
        this.draft.set('');
        this.notice.set('Message sent.');
        this.sending.set(false);
        this.loadConversation(id);
        this.loadInbox();
      },
      error: (response: HttpErrorResponse) => {
        this.error.set(response.error?.message ?? 'Your message could not be sent.');
        this.sending.set(false);
      },
    });
  }

  protected isOwnMessage(senderId: number): boolean {
    return senderId === this.currentUserId();
  }
}
