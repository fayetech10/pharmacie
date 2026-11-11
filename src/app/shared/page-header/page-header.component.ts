import { Component } from '@angular/core';

/** En-tête commun des pages : titre, contexte et actions projetés par l'écran. */
@Component({
  selector: 'app-page-header',
  standalone: true,
  host: { class: 'page-head' },
  template: `
    <ng-content select="[page-header-title]"></ng-content>
    <ng-content select="[page-header-actions]"></ng-content>
    <ng-content></ng-content>
  `
})
export class PageHeaderComponent {}
