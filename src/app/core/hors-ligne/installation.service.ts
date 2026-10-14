import { Injectable, NgZone } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter } from 'rxjs';

/** Événement non standard de Chrome/Edge/Samsung : proposition d'installation de l'application. */
interface EvenementInstallation extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CLE_PLUS_TARD = 'csu_installation_plus_tard';
/** « Plus tard » : la proposition revient une semaine après. */
const DELAI_RAPPEL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Temps laissé au navigateur pour proposer l'installation de lui-même (Chrome attend souvent
 * un premier geste de l'utilisateur) avant d'afficher la marche à suivre manuelle.
 */
const DELAI_PROPOSITION_MS = 4000;

/**
 * Ce que l'application peut dire à l'agent sur l'installation :
 *  - `bouton`  : le navigateur accepte l'installation en un clic ;
 *  - `ios`     : iPhone / iPad, geste Partager → « Sur l'écran d'accueil » ;
 *  - `manuel`  : le navigateur ne propose rien de lui-même (Firefox, Samsung Internet…) : menu ;
 *  - `http`    : adresse non sécurisée — installation et hors ligne impossibles ;
 *  - `developpement` : version de développement (ng serve), sans mode hors ligne ;
 *  - `aucune`  : déjà installée, écartée récemment, ou le navigateur n'a pas encore répondu.
 */
export type SituationInstallation = 'bouton' | 'ios' | 'manuel' | 'http' | 'developpement' | 'aucune';

/**
 * Navigateur utilisé sur iPhone / iPad : le bouton « Partager » n'est pas au même endroit, et
 * certains ne savent pas installer (navigateur intégré à WhatsApp, Facebook… ; Chrome ou Firefox
 * avant iOS 16.4) — il faut alors rouvrir la page dans Safari.
 */
export type NavigateurIos = 'safari' | 'autre' | 'safari-requis';

/**
 * Installation de l'application sur le téléphone (application web progressive) et mises à jour.
 *
 * <p>Construit au démarrage (AppComponent) : Chrome n'émet qu'une fois, tôt, l'événement qui
 * permet de proposer l'installation — il faut l'avoir écouté avant la connexion.</p>
 *
 * <p>Sur iPhone, Safari ne propose pas d'installation par programme : on montre le geste
 * (Partager → « Sur l'écran d'accueil »).</p>
 */
@Injectable({ providedIn: 'root' })
export class InstallationService {
  private evenement: EvenementInstallation | null = null;
  private installeeMaintenant = false;
  private delaiEcoule = false;
  /** Proposition écartée (« Plus tard ») — relue du stockage, remise à zéro par le menu du compte. */
  private ecarteeLe = 0;

  constructor(private zone: NgZone, private swUpdate: SwUpdate, private snackBar: MatSnackBar) {
    try { this.ecarteeLe = Number(localStorage.getItem(CLE_PLUS_TARD)) || 0; } catch { /* stockage indisponible */ }
    setTimeout(() => this.zone.run(() => this.delaiEcoule = true), DELAI_PROPOSITION_MS);
    window.addEventListener('beforeinstallprompt', evenement => {
      evenement.preventDefault(); // pas de bandeau du navigateur : c'est l'application qui propose
      this.zone.run(() => this.evenement = evenement as EvenementInstallation);
    });
    window.addEventListener('appinstalled', () => this.zone.run(() => {
      this.installeeMaintenant = true;
      this.evenement = null;
    }));
    this.surveillerMisesAJour();
  }

  /** L'application tourne déjà installée (icône sur l'écran d'accueil). */
  get estInstallee(): boolean {
    return this.installeeMaintenant
      || window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  /** Le navigateur accepte une installation en un clic (Android, ordinateur). */
  get peutInstaller(): boolean {
    return !!this.evenement && !this.estInstallee;
  }

  /** iPhone / iPad dans Safari : installation à faire à la main. */
  get estIosAInstaller(): boolean {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && !this.estInstallee;
  }

  /** Navigateur iOS en cours (cf. NavigateurIos). */
  get navigateurIos(): NavigateurIos {
    const ua = navigator.userAgent;
    // Navigateurs intégrés aux applications : pas d'« Ajouter à l'écran d'accueil ».
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|WhatsApp|GSA\//i.test(ua)) return 'safari-requis';
    if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) {
      // Chrome, Firefox, Edge… n'installent sur iOS qu'à partir d'iOS 16.4.
      const version = /OS (\d+)_(\d+)/.exec(ua);
      const recent = !version || +version[1] > 16 || (+version[1] === 16 && +version[2] >= 4);
      return recent ? 'autre' : 'safari-requis';
    }
    return 'safari';
  }

  /** Appareil tactile (téléphone, tablette) : c'est là qu'installer a un sens. */
  get estTactile(): boolean {
    return !!window.matchMedia?.('(pointer: coarse)').matches;
  }

  /** Ce qu'il faut montrer à l'agent (cf. SituationInstallation). */
  get situation(): SituationInstallation {
    if (this.estInstallee || Date.now() - this.ecarteeLe < DELAI_RAPPEL_MS) return 'aucune';
    // Sans HTTPS, le navigateur refuse tout : installation, mode hors ligne, caméra intégrée.
    if (!window.isSecureContext) return 'http';
    if (this.estIosAInstaller) return 'ios';
    if (!this.swUpdate.isEnabled) return 'developpement';
    if (this.peutInstaller) return 'bouton';
    return this.delaiEcoule ? 'manuel' : 'aucune';
  }

  /** Adresse actuelle, pour expliquer pourquoi l'installation est impossible en http://. */
  get adresse(): string {
    return window.location.origin;
  }

  /** Menu du compte : refait la proposition, même si elle avait été écartée. */
  reproposer() {
    this.ecarteeLe = 0;
    this.delaiEcoule = true;
    try { localStorage.removeItem(CLE_PLUS_TARD); } catch { /* stockage indisponible */ }
  }

  async installer(): Promise<boolean> {
    const evenement = this.evenement;
    if (!evenement) return false;
    await evenement.prompt();
    const choix = await evenement.userChoice;
    this.zone.run(() => this.evenement = null);
    return choix.outcome === 'accepted';
  }

  plusTard() {
    this.ecarteeLe = Date.now();
    try { localStorage.setItem(CLE_PLUS_TARD, String(this.ecarteeLe)); } catch { /* stockage indisponible */ }
  }

  /** Nouvelle version déployée et téléchargée : on propose de recharger. */
  private surveillerMisesAJour() {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        this.snackBar.open('Une nouvelle version de l\'application est prête.', 'Recharger', { duration: 15_000 })
          .onAction().subscribe(() => document.location.reload());
      });
  }
}
