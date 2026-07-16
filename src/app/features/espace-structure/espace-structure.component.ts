import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FactureStructureFormComponent } from './facture-structure-form/facture-structure-form.component';
import { FacturesStructureListComponent } from './factures-structure-list/factures-structure-list.component';

@Component({
  selector: 'app-espace-structure',
  standalone: true,
  imports: [CommonModule, FactureStructureFormComponent, FacturesStructureListComponent],
  templateUrl: './espace-structure.component.html',
  styleUrls: ['./espace-structure.component.css']
})
export class EspaceStructureComponent implements OnInit {
  selectedTab = 0;
  private destroyRef = inject(DestroyRef);

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const tab = +(params.get('tab') ?? 0);
        this.selectedTab = tab === 0 ? 0 : 1;
      });
  }

  onTabChange(index: number) {
    const currentTab = +(this.route.snapshot.queryParamMap.get('tab') ?? 0);
    if (index === currentTab) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: index }, replaceUrl: true });
  }
}
