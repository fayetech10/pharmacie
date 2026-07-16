import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-skeleton-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './skeleton-list.component.html',
  styleUrls: ['./skeleton-list.component.css']
})
export class SkeletonListComponent {
  @Input() rows: number = 5;
  @Input() cols: number = 6;

  get rowsArray() { return Array.from({ length: this.rows }, (_, i) => i); }
  get colsArray() { return Array.from({ length: this.cols }, (_, i) => i); }
}
