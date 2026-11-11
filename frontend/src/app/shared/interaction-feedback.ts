import { Injectable, signal } from '@angular/core';

export interface SignInPrompt {
  message: string;
  returnUrl: string;
}

export interface ActionToast {
  message: string;
  kind: 'success' | 'error';
}

// Share one sign-in prompt and short-lived action toast across every routed page.
@Injectable({ providedIn: 'root' })
export class InteractionFeedback {
  readonly signInPrompt = signal<SignInPrompt | null>(null);
  readonly toast = signal<ActionToast | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  // Remember where the visitor was so sign-in returns them to the interrupted action.
  askToSignIn(message: string, returnUrl: string): void {
    this.signInPrompt.set({ message, returnUrl });
  }

  closeSignInPrompt(): void {
    this.signInPrompt.set(null);
  }

  // Give a brief, visible response after an action succeeds or fails.
  showToast(message: string, kind: 'success' | 'error' = 'success'): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ message, kind });
    this.toastTimer = setTimeout(() => {
      this.toast.set(null);
      this.toastTimer = undefined;
    }, kind === 'success' ? 2000 : 3200);
  }
}
