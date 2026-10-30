import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Keep the root component small; routed pages are displayed inside its outlet.
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {}
