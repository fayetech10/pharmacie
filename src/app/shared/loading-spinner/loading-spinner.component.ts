import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { LoadingService } from '../../core/services/loading.service';

/**
 * Barre de progression NProgress-style, fine et non bloquante.
 *
 * Comportement :
 *  - Apparaît au bout de 200 ms de chargement (pas de flash pour les requêtes rapides).
 *  - Monte rapidement jusqu'à ~30 %, puis ralentit progressivement (simule un progrès
 *    déterministe alors que le temps réel est inconnu).
 *  - Quand le chargement se termine, saute à 100 % puis disparaît en fondu.
 */
@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-spinner.component.html',
  styleUrls: ['./loading-spinner.component.css']
})
export class LoadingSpinnerComponent implements OnDestroy {
  private loadingService = inject(LoadingService);

  /** Pourcentage visuel de la barre (0–100). */
  progress = 0;
  /** Phase du cycle : idle → loading → finishing → idle. */
  phase: 'idle' | 'loading' | 'finishing' = 'idle';

  private sub: Subscription;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private showDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.sub = this.loadingService.isLoading$.pipe(
      distinctUntilChanged()
    ).subscribe(loading => {
      if (loading) {
        this.scheduleStart();
      } else {
        this.finish();
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.clearTimers();
  }

  /** Attend 200 ms avant de montrer la barre : les requêtes rapides ne provoquent aucun flash. */
  private scheduleStart() {
    // S'il y avait un finish en cours, on le cancelle et on reprend
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    // Si déjà en loading, on laisse continuer
    if (this.phase === 'loading') return;

    // Si un délai est déjà programmé, on ne double pas
    if (this.showDelayTimer) return;

    this.showDelayTimer = setTimeout(() => {
      this.showDelayTimer = null;
      this.start();
    }, 200);
  }

  private start() {
    this.progress = 0;
    this.phase = 'loading';

    // Premier saut rapide
    setTimeout(() => {
      if (this.phase === 'loading') {
        this.progress = 15 + Math.random() * 10; // 15–25%
      }
    }, 50);

    // Progression dégressive toutes les 300 ms
    this.clearTick();
    this.tickTimer = setInterval(() => {
      if (this.phase !== 'loading') {
        this.clearTick();
        return;
      }
      this.trickle();
    }, 350);
  }

  /** Micro-avancement dégressif : plus la barre est avancée, plus elle ralentit. */
  private trickle() {
    if (this.progress >= 95) return;

    let increment: number;
    if (this.progress < 30) {
      increment = 5 + Math.random() * 8;       // Rapide au début
    } else if (this.progress < 60) {
      increment = 2 + Math.random() * 4;       // Moyen
    } else if (this.progress < 80) {
      increment = 0.5 + Math.random() * 2;     // Lent
    } else {
      increment = 0.1 + Math.random() * 0.5;   // Quasi stagnant
    }

    this.progress = Math.min(95, this.progress + increment);
  }

  /** Le chargement est terminé : barre → 100 % puis disparition. */
  private finish() {
    // Annuler le délai de démarrage si la requête a fini avant 200 ms
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
      // La barre n'a jamais été visible → rien à animer
      this.phase = 'idle';
      this.progress = 0;
      return;
    }

    if (this.phase === 'idle') return;

    this.clearTick();
    this.progress = 100;
    this.phase = 'finishing';

    this.finishTimer = setTimeout(() => {
      this.finishTimer = null;
      this.phase = 'idle';
      this.progress = 0;
    }, 500);
  }

  private clearTick() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private clearTimers() {
    this.clearTick();
    if (this.showDelayTimer) {
      clearTimeout(this.showDelayTimer);
      this.showDelayTimer = null;
    }
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
  }
}
