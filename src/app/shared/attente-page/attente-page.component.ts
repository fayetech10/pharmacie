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
 */
@Component({
  selector: 'app-attente-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Ancre de hauteur nulle : le squelette se pose sur le contenu masqué sans le décaler. -->
    <div *ngIf="!prete && squelette" class="relative">
      <div class="absolute inset-x-0 top-0" role="status" aria-live="polite">
        <span class="sr-only">Chargement de la page…</span>
        <div class="flex flex-col gap-2 mb-6">
          <div class="skeleton h-7 w-2/3 max-w-[320px]"></div>
          <div class="skeleton h-4 w-1/2 max-w-[240px]"></div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div class="skeleton h-[84px]"></div>
          <div class="skeleton h-[84px] max-sm:hidden"></div>
          <div class="skeleton h-[84px] max-sm:hidden"></div>
        </div>
        <div class="card p-5 flex flex-col gap-4">
          <div class="skeleton h-5 w-1/3"></div>
          <div *ngFor="let largeur of lignes" class="skeleton h-4" [style.width.%]="largeur"></div>
        </div>
      </div>
    </div>

    <div [class.attente-page-masquee]="!prete"
         [class.attente-page-revelee]="prete"
         [attr.inert]="prete ? null : ''"
         [attr.aria-busy]="prete ? null : 'true'">
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    /* Masqué mais toujours mis en page : graphiques et tableaux se dimensionnent normalement. */
    .attente-page-masquee { visibility: hidden; }
    /* Opacité seule (pas de transform) : les éléments position: fixed des écrans restent intacts. */
    .attente-page-revelee { animation: attentePageRevelee 200ms ease-out backwards; }
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
  readonly lignes = [92, 78, 85, 64, 88];

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

    const calme$ = this.loading.requetesPage$.pipe(
      debounceTime(SILENCE_MS),
      filter(enCours => enCours === 0)
    );
    this.attente = new Subscription();
    this.attente.add(timer(DELAI_SQUELETTE_MS).subscribe(() => (this.squelette = true)));
    this.attente.add(race(calme$, timer(ATTENTE_MAX_MS)).pipe(take(1)).subscribe(() => this.reveler()));
  }

  private reveler() {
    this.attente?.unsubscribe();
    this.prete = true;
    this.squelette = false;
  }
}
