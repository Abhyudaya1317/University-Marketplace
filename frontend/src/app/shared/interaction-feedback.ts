import { Injectable, signal } from '@angular/core';
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

// Share one sign-in prompt and short-lived action toast across every routed page.
@Injectable({ providedIn: 'root' })
export class InteractionFeedback {
  readonly signInPrompt = signal<SignInPrompt | null>(null);
  readonly toast = signal<ActionToast | null>(null);
  readonly sharePrompt = signal<ListingSharePrompt | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly router: Router) {}

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
  }

  closeSharePrompt(): void {
    this.sharePrompt.set(null);
  }

  shareOnWhatsApp(): void {
    const share = this.sharePrompt();
    if (!share) return;
    const message = `${share.title} — ${share.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    this.closeSharePrompt();
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
