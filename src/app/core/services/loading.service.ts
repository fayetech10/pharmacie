import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeRequests = 0;
  public isLoading$ = new BehaviorSubject<boolean>(false);

  /**
   * Requêtes de données de la page affichée, en cours (voir `AttentePageComponent`).
   * Indépendant de la barre de progression : une requête discrète (sans barre) qui charge
   * la page compte ici ; une tâche d'arrière-plan (`ARRIERE_PLAN`) ne compte nulle part.
   */
  private requetesPage = 0;
  /** Change à chaque changement de page : une requête lancée par la page précédente ne compte plus. */
  private generationPage = 0;
  readonly requetesPage$ = new BehaviorSubject<number>(0);

  show() {
    this.activeRequests++;
    this.isLoading$.next(true);
  }

  hide() {
    this.activeRequests--;
    if (this.activeRequests <= 0) {
      this.activeRequests = 0;
      this.isLoading$.next(false);
    }
  }

  /** Une requête de la page démarre ; retourne la génération à rendre à `finRequetePage`. */
  debutRequetePage(): number {
    this.requetesPage++;
    this.requetesPage$.next(this.requetesPage);
    return this.generationPage;
  }

  finRequetePage(generation: number) {
    if (generation !== this.generationPage) return;
    this.requetesPage = Math.max(0, this.requetesPage - 1);
    this.requetesPage$.next(this.requetesPage);
  }

  /**
   * Nouvelle page : on oublie les requêtes de la précédente (un export long lancé juste
   * avant de partir ne doit pas retenir l'affichage de la page suivante).
   */
  nouvellePage() {
    this.generationPage++;
    this.requetesPage = 0;
    this.requetesPage$.next(0);
  }
}
