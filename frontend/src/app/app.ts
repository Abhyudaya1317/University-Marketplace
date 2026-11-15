import { Component, DestroyRef, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => this.updatePageMetadata());
  }

  // Keep browser titles, descriptions, robots rules, and canonical links in sync with SPA navigation.
  private updatePageMetadata(): void {
    let activeRoute = this.router.routerState.snapshot.root;
    while (activeRoute.firstChild) activeRoute = activeRoute.firstChild;
    const data = activeRoute.data;
    const pageTitle = typeof data['seoTitle'] === 'string' ? data['seoTitle'] : 'UniBee | LPU Student Marketplace';
    const description = typeof data['seoDescription'] === 'string'
      ? data['seoDescription']
      : 'Buy and sell campus essentials with the LPU community on UniBee, the Lovely Professional University student marketplace.';
    const robots = data['noIndex'] === true ? 'noindex,nofollow' : 'index,follow,max-image-preview:large';
    const path = this.router.url.split(/[?#]/, 1)[0] || '/';
    const canonical = new URL(path, 'https://unibee.in').toString();

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: robots });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: canonical });

    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonical;
  }
}
