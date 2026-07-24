import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BcsuService } from '../../../core/services/bcsu.service';
import { AuthService } from '../../../core/services/auth.service';
import { compressImageToDataUrl } from '../../../core/utils/image-compression';

type SlotKey = 'cachetImage' | 'signatureImage';

interface Slot {
  key: SlotKey;
  label: string;
  hint: string;
  image: string | null;
}

/**
 * Paramétrage de l'agent BCSU : cachet et signature apposés automatiquement
 * sur les lettres de garantie (aperçu à l'écran + export PDF).
 */
@Component({
  selector: 'app-parametrage-bcsu',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatCardModule, MatSnackBarModule],
  templateUrl: './parametrage-bcsu.component.html'
})
export class ParametrageBcsuComponent implements OnInit {
  slots: Slot[] = [
    {
      key: 'signatureImage',
      label: 'Signature',
      hint: 'Photographiez ou importez votre signature sur fond clair.',
      image: null
    },
    {
      key: 'cachetImage',
      label: 'Cachet',
      hint: 'Photographiez ou importez le cachet de la structure sur fond clair.',
      image: null
    }
  ];
  loading = true;
  saving = false;

  constructor(
    private bcsuService: BcsuService,
    private authService: AuthService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (!user) { this.loading = false; return; }
    this.bcsuService.getParametrage(user.userId).subscribe({
      next: (p) => {
        this.setSlot('cachetImage', p?.cachetImage || null);
        this.setSlot('signatureImage', p?.signatureImage || null);
        this.loading = false;
      },
      error: () => { this.loading = false; }
    });
  }

  private setSlot(key: SlotKey, image: string | null) {
    const slot = this.slots.find(s => s.key === key);
    if (slot) slot.image = image;
  }

  onFileSelected(slot: Slot, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Veuillez sélectionner une image', 'Fermer', { duration: 3000 });
      input.value = '';
      return;
    }
    compressImageToDataUrl(file, 80 * 1024)
      .then(dataUrl => { slot.image = dataUrl; })
      .catch(() => this.snackBar.open("Impossible de traiter l'image", 'Fermer', { duration: 3000 }));
    input.value = '';
  }

  removeImage(slot: Slot) {
    slot.image = null;
  }

  enregistrer() {
    this.saving = true;
    const req: Record<SlotKey, string | null> = {
      cachetImage: this.slots.find(s => s.key === 'cachetImage')?.image || null,
      signatureImage: this.slots.find(s => s.key === 'signatureImage')?.image || null
    };
    this.bcsuService.updateParametrage(req).subscribe({
      next: () => {
        this.saving = false;
        this.snackBar.open('Paramétrage enregistré : le cachet et la signature seront apposés sur vos lettres de garantie', 'Fermer', { duration: 4000 });
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open('Erreur : ' + (err.error?.message || err.message), 'Fermer', { duration: 5000, panelClass: 'error-snackbar' });
      }
    });
  }
}
