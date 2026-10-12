import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** Masque le bouton d'annulation : force le pharmacien à cliquer sur le bouton de confirmation pour fermer. */
  hideCancel?: boolean;
  /** Empêche la fermeture par Échap ou clic à l'extérieur (information à ne pas perdre). */
  disableClose?: boolean;
}

export interface PromptOptions {
  title?: string;
  message?: string;
  label?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  required?: boolean;
  multiline?: boolean;
  initialValue?: string;
  maxLength?: number;
  /** Saisie masquée (mot de passe). */
  motDePasse?: boolean;
}

/**
 * Service centralisé pour les dialogues de confirmation.
 * Remplace les appels `confirm()` natifs par le ConfirmDialogComponent stylé.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  constructor(private dialog: MatDialog) {}

  /** Retourne un Observable<boolean> : true si l'utilisateur confirme. */
  ask(options: ConfirmOptions): Observable<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      disableClose: options.disableClose ?? false,
      data: {
        title: options.title ?? 'Confirmation',
        message: options.message,
        confirmText: options.confirmText ?? 'Confirmer',
        cancelText: options.cancelText ?? 'Annuler',
        danger: options.danger ?? false,
        hideCancel: options.hideCancel ?? false
      }
    });
    return ref.afterClosed().pipe(map(result => result === true));
  }

  /**
   * Affiche des accès (identifiant + mot de passe temporaire) que le serveur ne renverra
   * plus jamais : seul « J'ai noté » ferme la fenêtre, pas un clic à côté.
   */
  afficherAcces(title: string, identifiant: string, motDePasse: string, destinataire = 'l\'utilisateur'): Observable<boolean> {
    return this.ask({
      title,
      message: `Communiquez ces accès à ${destinataire} :\n\nIdentifiant : ${identifiant}\nMot de passe temporaire : ${motDePasse}\n\nLe mot de passe devra être changé à la première connexion.`,
      confirmText: 'J\'ai noté',
      hideCancel: true,
      disableClose: true
    });
  }

  /**
   * Ouvre une modale de saisie texte (remplace le `prompt()` natif).
   * Retourne la valeur saisie (trim) si validé, sinon `null` (annulé).
   */
  prompt(options: PromptOptions): Observable<string | null> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '460px',
      data: {
        title: options.title ?? 'Saisie',
        message: options.message ?? '',
        confirmText: options.confirmText ?? 'Valider',
        cancelText: options.cancelText ?? 'Annuler',
        danger: options.danger ?? false,
        prompt: true,
        label: options.label,
        placeholder: options.placeholder ?? '',
        required: options.required ?? false,
        multiline: options.multiline ?? false,
        initialValue: options.initialValue ?? '',
        maxLength: options.maxLength,
        motDePasse: options.motDePasse ?? false
      }
    });
    return ref.afterClosed().pipe(map(result => (typeof result === 'string' ? result : null)));
  }
}
