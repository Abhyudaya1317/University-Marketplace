import { Component, input, output, signal } from '@angular/core';

// Reuse a Windows-style frame for the featured item and system diagnostics windows.
@Component({
  selector: 'app-retro-window',
  templateUrl: './retro-window.html',
  styleUrl: './retro-window.css',
})
export class RetroWindow {
  readonly title = input.required<string>();
  readonly closed = output<void>();
  protected readonly minimized = signal(false);
  protected readonly maximized = signal(false);

  protected toggleMinimized(): void {
    this.minimized.update((value) => !value);
  }

  protected toggleMaximized(): void {
    this.maximized.update((value) => !value);
  }

  protected closeWindow(): void {
    this.closed.emit();
  }
}
