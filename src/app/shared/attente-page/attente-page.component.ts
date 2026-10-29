import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subscription, debounceTime, filter, race, take, timer } from 'rxjs';
import { LoadingService } from '../../core/services/loading.service';

/** Silence réseau (ms) après lequel la page est jugée chargée — couvre les chargements en cascade. */
const SILENCE_MS = 100;
/** Le squelette n'apparaît qu'au-delà de ce délai : un chargement rapide ne fait rien clignoter. */
const DELAI_SQUELETTE_MS = 150;
/** Plafond : passé ce délai, la page s'affiche quand même (ses propres indicateurs prennent le relais). */
const ATTENTE_MAX_MS = 15_000;

/**
 * Une « page » = le chemin + l'onglet (`tab`) : changer d'onglet d'un espace depuis la barre
 * latérale est un changement de page, mais pas un filtre gardé dans l'URL (statut, poste…).
 */
function cleDePage(url: string): string {
  const [chemin, requete = ''] = url.split('#')[0].split('?');
  return `${chemin}?tab=${new URLSearchParams(requete).get('tab') ?? '0'}`;
}

/**
 * Masque la page tant que ses données ne sont pas arrivées.
 *
 * À chaque changement de page, le contenu est caché ET inerte (aucun bouton visible ni
 * cliquable, même au clavier) jusqu'à ce que toutes les requêtes lancées par la page soient
 * terminées ; un squelette le remplace si l'attente se prolonge. Fonctionne pour tous les
 * écrans sans les retoucher : il suffit d'envelopper le `router-outlet`.
 *
 * Ne retiennent PAS l'affichage : les données déjà en cache (affichées tout de suite), les
 * requêtes marquées `ARRIERE_PLAN` (badges, aperçus qui ont leur propre indicateur,
 * synchronisation hors ligne) et celles lancées après l'affichage (recherche, filtres, envoi).
 *
 * Page qui ne lance aucune requête au premier rendu (retour sur un écran déjà visité, données
 * en cache) : affichée d'un coup, sans fondu ni animations d'entrée (`.sans-entree`) — les
 * rejouer donnait l'impression qu'elle rechargeait ses données à chaque visite.
 */
@Component({
  selector: 'app-attente-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Squelette de page enrichi — apparaît si l'attente se prolonge au-delà de DELAI_SQUELETTE_MS -->
    <div *ngIf="!prete && squelette" class="relative">
      <div class="absolute inset-x-0 top-0 skeleton-container" role="status" aria-live="polite">
        <span class="sr-only">Chargement de la page…</span>

        <!-- En-tête de page simulé -->
        <div class="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div class="flex flex-col gap-2.5 flex-1">
            <div class="skeleton skeleton-title h-7 w-2/3 max-w-[320px]"></div>
            <div class="skeleton h-4 w-2/5 max-w-[200px]" style="animation-delay: 50ms"></div>
          </div>
          <div class="skeleton h-10 w-[130px] rounded-md max-sm:hidden" style="animation-delay: 100ms"></div>
        </div>

        <!-- Cartes KPI simulées -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div *ngFor="let k of kpis; let i = index"
               class="skeleton skeleton-kpi h-[76px] sm:h-[84px]"
               [style.animation-delay.ms]="80 + i * 60"></div>
        </div>

        <!-- Barre de filtres simulée -->
        <div class="flex gap-3 mb-5 flex-wrap">
          <div class="skeleton h-[42px] flex-1 min-w-[200px]" style="animation-delay: 340ms"></div>
          <div class="skeleton h-[42px] w-[140px] max-sm:hidden" style="animation-delay: 400ms"></div>
        </div>

        <!-- Tableau simulé (desktop) -->
        <div class="card p-0 overflow-hidden max-sm:hidden" style="animation-delay: 460ms">
          <!-- En-tête tableau -->
          <div class="flex gap-4 px-5 py-3.5 border-b border-border-light bg-[#FAFBFC]">
            <div *ngFor="let col of tableauCols; let i = index"
                 class="skeleton h-3.5"
                 [style.width.%]="col"
                 [style.animation-delay.ms]="500 + i * 40"></div>
          </div>
          <!-- Lignes -->
          <div *ngFor="let row of lignesTableau; let r = index"
               class="flex gap-4 px-5 py-4 border-b border-border-light last:border-0">
            <div *ngFor="let col of tableauCols; let c = index"
                 class="skeleton h-3.5"
                 [style.width.%]="col - 5 + r * 2"
                 [style.animation-delay.ms]="560 + r * 50 + c * 30"></div>
          </div>
        </div>

        <!-- Cartes mobiles simulées (mobile) -->
        <div class="sm:hidden flex flex-col gap-3">
          <div *ngFor="let row of lignesMobiles; let i = index"
               class="card p-4">
            <div class="flex justify-between mb-3">
              <div class="skeleton h-5 w-1/2" [style.animation-delay.ms]="500 + i * 80"></div>
              <div class="skeleton h-5 w-1/4" [style.animation-delay.ms]="530 + i * 80"></div>
            </div>
            <div class="skeleton h-4 w-1/3 mb-3" [style.animation-delay.ms]="560 + i * 80"></div>
            <div class="flex justify-between items-center">
              <div class="skeleton h-6 w-1/3" [style.animation-delay.ms]="590 + i * 80"></div>
              <div class="skeleton h-8 w-8 rounded-full" [style.animation-delay.ms]="620 + i * 80"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div [class.attente-page-masquee]="!prete"
         [class.attente-page-revelee]="prete && !immediate"
         [class.sans-entree]="immediate"
         [attr.inert]="prete ? null : ''"
         [attr.aria-busy]="prete ? null : 'true'">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    /* Le conteneur de squelettes entre avec un fondu doux */
    .skeleton-container {
      animation: skeletonFadeIn 300ms ease-out backwards;
    }
    @keyframes skeletonFadeIn {
      from { opacity: 0; transform: translateY(4px); }
    }

    /* Masqué mais toujours mis en page : graphiques et tableaux se dimensionnent normalement. */
    .attente-page-masquee { visibility: hidden; }
    /* Opacité seule (pas de transform) : les éléments position: fixed des écrans restent intacts. */
    .attente-page-revelee { animation: attentePageRevelee 250ms ease-out backwards; }
    @keyframes attentePageRevelee { from { opacity: 0; } }
  `]
})
export class AttentePageComponent {
  private router = inject(Router);
  private loading = inject(LoadingService);

  /** Données de la page arrivées : contenu visible et utilisable. */
  prete = false;
  /** Attente prolongée : le squelette s'affiche. */
  squelette = false;
  /** Rien à attendre au premier rendu : page affichée d'un coup, sans animations d'entrée. */
  immediate = false;

  /** 4 cartes KPI skeleton */
  readonly kpis = [0, 1, 2, 3];
  /** Largeurs variées des colonnes du tableau squelette */
  readonly tableauCols = [18, 22, 15, 25, 12, 8];
  /** Lignes du tableau squelette */
  readonly lignesTableau = [0, 1, 2, 3, 4];
  /** Cartes mobiles */
  readonly lignesMobiles = [0, 1, 2, 3];

  private clePage = '';
  private attente?: Subscription;

  constructor() {
    // Créé en pleine navigation (connexion, retour sur l'espace) : les requêtes d'une
    // session précédente ne comptent pas.
    this.loading.nouvellePage();
    this.clePage = cleDePage(this.router.url);
    this.attendre();
    inject(DestroyRef).onDestroy(() => this.attente?.unsubscribe());

    this.router.events.pipe(takeUntilDestroyed()).subscribe(e => {
      if (e instanceof NavigationStart) {
        // Dès le départ : les requêtes lancées par le constructeur de la nouvelle page comptent.
        if (cleDePage(e.url) !== this.clePage) this.loading.nouvellePage();
      } else if (e instanceof NavigationEnd) {
        const cle = cleDePage(e.urlAfterRedirects);
        if (cle !== this.clePage) {
          this.clePage = cle;
          this.attendre();
        }
      }
    });
  }

  private attendre() {
    this.attente?.unsubscribe();
    this.prete = false;
    this.squelette = false;
    this.immediate = false;

    const calme$ = this.loading.requetesPage$.pipe(
      debounceTime(SILENCE_MS),
      filter(enCours => enCours === 0)
    );
    this.attente = new Subscription();
    // Tâche suivante : la page vient d'être rendue (ngOnInit joué) et ses requêtes, s'il y en
    // a, sont déjà comptées. Aucune → tout est là (cache) ou rien n'est à charger.
    this.attente.add(timer(0).subscribe(() => {
      if (this.loading.requetesPage$.value === 0) this.reveler(true);
    }));
    this.attente.add(timer(DELAI_SQUELETTE_MS).subscribe(() => (this.squelette = true)));
    this.attente.add(race(calme$, timer(ATTENTE_MAX_MS)).pipe(take(1)).subscribe(() => this.reveler(false)));
  }

  private reveler(immediate: boolean) {
    this.attente?.unsubscribe();
    this.prete = true;
    this.squelette = false;
    this.immediate = immediate;
  }
}
