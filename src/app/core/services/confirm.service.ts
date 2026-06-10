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
      data: {
        title: options.title ?? 'Confirmation',
        message: options.message,
        confirmText: options.confirmText ?? 'Confirmer',
        cancelText: options.cancelText ?? 'Annuler',
        danger: options.danger ?? false
      }
    });
    return ref.afterClosed().pipe(map(result => result === true));
  }
}
