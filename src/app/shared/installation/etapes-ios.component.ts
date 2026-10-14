import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { InstallationService } from '../../core/hors-ligne/installation.service';

/**
 * Marche à suivre pour installer l'application sur iPhone / iPad, selon le navigateur.
 *
 * <p>Safari ne propose pas d'installation par programme : c'est l'agent qui fait le geste
 * Partager → « Sur l'écran d'accueil ». Un lien ouvert depuis WhatsApp ou Facebook s'affiche
 * dans leur navigateur intégré, qui n'a pas ce geste : il faut d'abord rouvrir la page dans
 * Safari (retour fréquent du terrain : « ça refuse de s'installer sur les iPhones »).</p>
 */
@Component({
  selector: 'app-etapes-ios',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <ol class="m-0 pl-5 flex flex-col gap-1.5 text-[13px] leading-snug">
      <li *ngIf="installation.navigateurIos === 'safari-requis'">
        <strong>Ouvrez cette page dans Safari</strong> : touchez
        <mat-icon class="!text-base !w-4 !h-4 align-text-bottom">more_horiz</mat-icon> (ou
        <mat-icon class="!text-base !w-4 !h-4 align-text-bottom">explore</mat-icon>) puis « Ouvrir dans Safari ».
        Ou copiez l'adresse <strong class="break-all">{{ installation.adresse }}</strong> dans Safari.
      </li>
      <li>
        Touchez <mat-icon class="!text-base !w-4 !h-4 align-text-bottom">ios_share</mat-icon> <strong>Partager</strong>
        <ng-container [ngSwitch]="installation.navigateurIos">
          <span *ngSwitchCase="'autre'">(dans la barre d'adresse, ou dans le menu du navigateur)</span>
          <span *ngSwitchDefault>(en bas de l'écran ; en haut à droite sur iPad)</span>
        </ng-container>.
      </li>
      <li>
        Faites défiler et touchez <mat-icon class="!text-base !w-4 !h-4 align-text-bottom">add_box</mat-icon>
        <strong>« Sur l'écran d'accueil »</strong>, puis <strong>« Ajouter »</strong>.
      </li>
      <li>Ouvrez l'application depuis sa nouvelle icône <strong>CSU Sénégal</strong>.</li>
    </ol>
  `
})
export class EtapesIosComponent {
  constructor(public installation: InstallationService) {}
}
