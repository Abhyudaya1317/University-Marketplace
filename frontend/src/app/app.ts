import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { InteractionFeedback } from './shared/interaction-feedback';

// Keep the root component small; routed pages are displayed inside its outlet.
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly interaction = inject(InteractionFeedback);
}
