import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { InstallationService } from '../../core/hors-ligne/installation.service';
import { EtapesIosComponent } from './etapes-ios.component';

/**
 * Proposition d'installation affichée sur la page de connexion, sur téléphone et tablette,
 * pour TOUS les comptes (le bandeau de l'application ne la fait qu'aux postes et centres).
 *
 * <p>Avant la connexion, exprès : sur iPhone, l'application installée a sa propre mémoire et
 * ne reprend pas la session ouverte dans Safari — se connecter puis installer obligeait à se
 * connecter deux fois.</p>
 */
@Component({
  selector: 'app-installation-connexion',
  standalone: true,
  imports: [CommonModule, MatIconModule, EtapesIosComponent],
  template: `
    <section *ngIf="visible" class="mb-5 p-4 rounded-xl border border-primary-200 bg-primary-light text-text-primary"
             aria-label="Installer l'application">
      <div class="flex items-start gap-3">
        <span class="w-9 h-9 shrink-0 rounded-lg bg-primary text-white flex items-center justify-center">
          <mat-icon class="!text-xl !w-5 !h-5">install_mobile</mat-icon>
        </span>
        <div class="min-w-0 flex-1">
          <strong class="block text-[14px] mb-1">Installez l'application sur ce téléphone</strong>

          <ng-container [ngSwitch]="installation.situation">
            <ng-container *ngSwitchCase="'ios'">
              <p class="m-0 mb-2 text-[12.5px] text-text-secondary">
                Faites-le <strong>avant de vous connecter</strong> : sur iPhone, l'application installée ne reprend pas
                la connexion ouverte dans Safari.
              </p>
              <app-etapes-ios></app-etapes-ios>
            </ng-container>
            <p *ngSwitchCase="'bouton'" class="m-0 text-[12.5px] text-text-secondary">
              Elle s'ouvrira comme une application, en plein écran, depuis son icône.
            </p>
            <p *ngSwitchCase="'manuel'" class="m-0 text-[12.5px] text-text-secondary">
              Ouvrez le menu du navigateur (<mat-icon class="!text-base !w-4 !h-4 align-text-bottom">more_vert</mat-icon>)
              puis <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.
            </p>
          </ng-container>

          <div class="flex flex-wrap items-center gap-2 mt-3">
            <button *ngIf="installation.situation === 'bouton'" type="button" class="btn btn-primary btn-sm"
                    (click)="installer()">
              <mat-icon>download</mat-icon> Installer
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="plusTard()">Plus tard</button>
          </div>
        </div>
      </div>
    </section>
  `
})
export class InstallationConnexionComponent {
  constructor(public installation: InstallationService) {}

  get visible(): boolean {
    return this.installation.estTactile && ['bouton', 'ios', 'manuel'].includes(this.installation.situation);
  }

  async installer() {
    await this.installation.installer();
  }

  plusTard() {
    this.installation.plusTard();
  }
}
