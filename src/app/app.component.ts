import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadingSpinnerComponent } from './shared/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LoadingSpinnerComponent],
  template: `
    <app-loading-spinner></app-loading-spinner>
    <router-outlet></router-outlet>
  `,
  styles: []
})
export class AppComponent {
  title = 'pharmacie-csu-frontend';
}
