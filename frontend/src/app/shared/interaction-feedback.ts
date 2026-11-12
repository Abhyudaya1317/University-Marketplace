import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

export interface SignInPrompt {
  message: string;
  returnUrl: string;
}

export interface ActionToast {
  message: string;
  kind: 'success' | 'error';
  action?: { label: string; route: string };
}

export interface ListingSharePrompt {
  title: string;
  url: string;
}

interface ShareConversation {
  id: string;
  otherUser: { fullName: string; avatarUrl: string | null };
  listing: { title: string } | null;
}

interface ShareInboxResponse {
  conversations: ShareConversation[];
}

// Share one sign-in prompt and short-lived action toast across every routed page.
@Injectable({ providedIn: 'root' })
export class InteractionFeedback {
  readonly signInPrompt = signal<SignInPrompt | null>(null);
  readonly toast = signal<ActionToast | null>(null);
  readonly sharePrompt = signal<ListingSharePrompt | null>(null);
  readonly shareConversations = signal<ShareConversation[]>([]);
  readonly shareSearch = signal('');
  readonly filteredShareConversations = computed(() => {
    const query = this.shareSearch().trim().toLocaleLowerCase();
    return this.shareConversations().filter((conversation) =>
      `${conversation.otherUser.fullName} ${conversation.listing?.title ?? ''}`.toLocaleLowerCase().includes(query),
    );
  });
  readonly shareInboxState = signal<'idle' | 'loading' | 'ready' | 'signin' | 'error'>('idle');
  readonly selectedShareConversationId = signal('');
  readonly sendingShareMessage = signal(false);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly router: Router, private readonly http: HttpClient) {}

  // Remember where the visitor was so sign-in returns them to the interrupted action.
  askToSignIn(message: string, returnUrl: string): void {
    this.signInPrompt.set({ message, returnUrl });
  }

  closeSignInPrompt(): void {
    this.signInPrompt.set(null);
  }

  // Give a brief, visible response after an action succeeds or fails.
  showToast(
    message: string,
    kind: 'success' | 'error' = 'success',
    action?: ActionToast['action'],
  ): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ message, kind, action });
    this.toastTimer = setTimeout(() => {
      this.toast.set(null);
      this.toastTimer = undefined;
    }, action ? 5000 : kind === 'success' ? 2000 : 3200);
  }

  openToastAction(): void {
    const route = this.toast()?.action?.route;
    if (!route) return;
    this.toast.set(null);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = undefined;
    void this.router.navigateByUrl(route);
  }

  openSharePrompt(title: string, url: string): void {
    this.sharePrompt.set({ title, url });
    this.shareConversations.set([]);
    this.shareSearch.set('');
    this.selectedShareConversationId.set('');
    this.shareInboxState.set('loading');
    this.http.get<ShareInboxResponse>('/api/messages').subscribe({
      next: (response) => {
        const conversations = response.conversations ?? [];
        this.shareConversations.set(conversations);
        this.shareInboxState.set('ready');
      },
      error: (error: HttpErrorResponse) => {
        this.shareInboxState.set(error.status === 401 || error.status === 403 ? 'signin' : 'error');
      },
    });
  }

  closeSharePrompt(): void {
    this.sharePrompt.set(null);
    this.sendingShareMessage.set(false);
  }

  selectShareConversation(conversationId: string): void {
    this.selectedShareConversationId.set(conversationId);
  }

  setShareSearch(value: string): void {
    this.shareSearch.set(value);
  }

  sendListingToConversation(): void {
    const share = this.sharePrompt();
    const conversationId = this.selectedShareConversationId();
    if (!share || !conversationId || this.sendingShareMessage()) return;

    this.sendingShareMessage.set(true);
    const body = `I thought you might like this listing: ${share.title} — ${share.url}`;
    this.http.post(`/api/messages/${conversationId}`, { body }).subscribe({
      next: () => {
        this.closeSharePrompt();
        this.showToast('Listing sent in chat.', 'success', {
          label: 'Open inbox',
          route: `/messages/${conversationId}`,
        });
      },
      error: (error: HttpErrorResponse) => {
        this.sendingShareMessage.set(false);
        if (error.status === 401 || error.status === 403) {
          this.shareInboxState.set('signin');
          return;
        }
        this.showToast(error.error?.message ?? 'The listing could not be sent. Please try again.', 'error');
      },
    });
  }

  shareOnWhatsApp(): void {
    const share = this.sharePrompt();
    if (!share) return;
    const message = `${share.title} — ${share.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    this.closeSharePrompt();
  }

  shareOnFacebook(): void {
    const share = this.sharePrompt();
    if (!share) return;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.url)}`, '_blank', 'noopener,noreferrer');
  }

  shareOnX(): void {
    const share = this.sharePrompt();
    if (!share) return;
    const text = `Check out ${share.title}`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(share.url)}`, '_blank', 'noopener,noreferrer');
  }

  shareOnThreads(): void {
    const share = this.sharePrompt();
    if (!share) return;
    const text = `Check out ${share.title} ${share.url}`;
    window.open(`https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  shareByEmail(): void {
    const share = this.sharePrompt();
    if (!share) return;
    const subject = `UniBee listing: ${share.title}`;
    const body = `I thought you might like this listing: ${share.title} — ${share.url}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async shareWithApps(): Promise<void> {
    const share = this.sharePrompt();
    if (!share) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: share.title, url: share.url });
        this.closeSharePrompt();
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        this.showToast('Your device could not open the share menu.', 'error');
      }
      return;
    }
    await this.copyShareLink();
  }

  async copyShareLink(): Promise<void> {
    const share = this.sharePrompt();
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      this.closeSharePrompt();
      this.showToast('Product link copied. Share it anywhere.');
    } catch {
      this.showToast('Could not copy the link. Try sharing from your browser menu.', 'error');
    }
  }
}
