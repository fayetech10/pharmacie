import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { canvasVersBlob, libererCanvas } from '../../core/utils/image-compression';

export interface CameraDialogData {
  libelle: string;
  /** Appelé juste avant d'ouvrir l'appareil photo du téléphone (repli). */
  avantAppareilNatif: () => void;
}

/** Caméra arrière retenue (à mise au point automatique), gardée pour les photos suivantes. */
let cameraRetenue: string | undefined;

/**
 * Caméra intégrée à la page, en plein écran : on vise, on déclenche, la photo est prise.
 *
 * Volontairement simple (demande du 14/10/2026) : ni cadre de format, ni indicateur de
 * netteté, ni sélection automatique de la meilleure image. L'image entière de la caméra est
 * gardée telle quelle.
 *
 * Avec `<input capture>`, le téléphone ouvre son application photo et la page passe en
 * arrière-plan : faute de mémoire, Android (comme iOS) la recharge souvent au retour, et la
 * saisie est perdue. Ici la page reste au premier plan. Sans caméra accessible (page hors
 * HTTPS, accès refusé), l'appareil photo du téléphone reste proposé.
 *
 * Se ferme avec la photo (Blob JPEG), ou sans rien si l'agent annule.
 */
@Component({
  selector: 'app-camera-dialog',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="cam">
      <video #video class="cam-video" autoplay playsinline muted (loadeddata)="pret = true"
             (click)="mettreAuPoint($event)"></video>
      <input #natif type="file" accept="image/*" capture="environment" hidden
             (change)="photoNative($event)" (cancel)="relancer()">

      <span *ngIf="pointFocus" class="cam-focus" [style.left.px]="pointFocus.x" [style.top.px]="pointFocus.y"></span>

      <div class="cam-haut">
        <span class="cam-titre">{{ data.libelle }}</span>
        <button type="button" class="cam-rond" (click)="fermer()" aria-label="Fermer la caméra">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div *ngIf="!pret && !erreur && !enPause" class="cam-centre">
        <mat-spinner diameter="34"></mat-spinner>
        <p>Ouverture de la caméra…</p>
      </div>

      <div *ngIf="erreur || enPause" class="cam-centre" [attr.role]="erreur ? 'alert' : null">
        <mat-icon class="cam-icone">{{ erreur ? 'videocam_off' : 'pause_circle' }}</mat-icon>
        <p>{{ erreur || 'Caméra intégrée en pause.' }}</p>
        <button *ngIf="enPause && !erreur" type="button" class="cam-secours" (click)="relancer()">
          <mat-icon>videocam</mat-icon> Relancer la caméra
        </button>
        <button type="button" class="cam-secours" (click)="utiliserAppareilNatif(natif)">
          <mat-icon>photo_camera</mat-icon> Utiliser l'appareil photo du téléphone
        </button>
      </div>

      <button *ngIf="torchDisponible && !erreur && !enPause" type="button" class="cam-rond cam-torche"
              [class.allumee]="torcheAllumee" (click)="basculerTorche()"
              [attr.aria-label]="torcheAllumee ? 'Éteindre la lampe' : 'Allumer la lampe'">
        <mat-icon>{{ torcheAllumee ? 'flashlight_on' : 'flashlight_off' }}</mat-icon>
      </button>

      <div *ngIf="!erreur && !enPause" class="cam-bas">
        <button type="button" class="cam-declencheur" [class.en-cours]="enCapture" [disabled]="!pret || enCapture"
                (click)="prendre()" aria-label="Prendre la photo"><span></span></button>
        <button type="button" class="cam-lien" (click)="utiliserAppareilNatif(natif)">
          Appareil photo du téléphone
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .cam { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; color: #fff; }
    .cam-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }

    .cam-focus { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border: 2px solid #fff;
      border-radius: 50%; pointer-events: none; animation: camfocus .8s ease-out forwards; }
    @keyframes camfocus { from { transform: scale(1.4); opacity: 1; } to { transform: scale(1); opacity: 0; } }

    .cam-haut { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center;
      justify-content: space-between; gap: 12px; padding: max(14px, env(safe-area-inset-top)) 16px 18px;
      background: linear-gradient(to bottom, rgba(0,0,0,.7), transparent); }
    .cam-titre { font-weight: 700; font-size: 16px; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
    .cam-rond { width: 44px; height: 44px; border: none; border-radius: 50%; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.18); color: #fff; }
    .cam-rond:hover { background: rgba(255,255,255,.32); }
    .cam-torche { position: absolute; right: 20px; bottom: 130px; background: rgba(255,255,255,.9); color: #1f2937; }
    .cam-torche.allumee { background: #fbbf24; }

    .cam-centre { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(340px, 86vw);
      display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
    .cam-centre p { margin: 0; font-size: 15px; line-height: 1.45; }
    .cam-icone { font-size: 46px; width: 46px; height: 46px; opacity: .85; }
    .cam-secours { display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; padding: 12px 18px;
      border: 1px solid rgba(255,255,255,.6); border-radius: 10px; background: rgba(255,255,255,.12);
      color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }

    .cam-bas { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column;
      align-items: center; gap: 12px; padding: 18px 18px max(18px, env(safe-area-inset-bottom));
      background: linear-gradient(to top, rgba(0,0,0,.75), transparent); }
    .cam-declencheur { width: 76px; height: 76px; padding: 6px; border-radius: 50%; border: 4px solid #fff;
      background: transparent; cursor: pointer; }
    .cam-declencheur span { display: block; width: 100%; height: 100%; border-radius: 50%; background: #fff;
      transition: transform .15s; }
    .cam-declencheur.en-cours span { transform: scale(.7); }
    .cam-declencheur:disabled { cursor: default; }
    .cam-declencheur:disabled:not(.en-cours) { opacity: .4; }
    .cam-lien { border: 0; background: transparent; color: rgba(255,255,255,.85); font-size: 13px;
      text-decoration: underline; cursor: pointer; padding: 4px 8px; }
  `]
})
export class CameraDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;

  pret = false;
  enCapture = false;
  /** Caméra coupée le temps que l'agent passe par l'appareil photo du téléphone. */
  enPause = false;
  erreur = '';
  torchDisponible = false;
  torcheAllumee = false;
  /** Point touché pour la mise au point (cercle affiché un instant). */
  pointFocus: { x: number; y: number } | null = null;

  private flux: MediaStream | null = null;
  private detruit = false;
  private minuterieFocus?: ReturnType<typeof setTimeout>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: CameraDialogData,
    private dialogRef: MatDialogRef<CameraDialogComponent, Blob>
  ) {}

  ngAfterViewInit() {
    void this.demarrer();
  }

  ngOnDestroy() {
    this.detruit = true;
    this.arreter();
  }

  fermer(photo?: Blob) {
    this.arreter();
    this.dialogRef.close(photo);
  }

  /** Prend la photo : l'image entière de la caméra, telle quelle. */
  async prendre() {
    const video = this.videoRef.nativeElement;
    if (!video.videoWidth || !video.videoHeight || this.enCapture) return;
    this.enCapture = true;
    const image = document.createElement('canvas');
    image.width = video.videoWidth;
    image.height = video.videoHeight;
    try {
      const ctx = image.getContext('2d');
      if (!ctx) throw new Error('Canvas non supporté');
      ctx.drawImage(video, 0, 0, image.width, image.height);
      try { navigator.vibrate?.(60); } catch { /* vibration optionnelle */ }
      this.fermer(await canvasVersBlob(image, 'image/jpeg', 0.95));
    } catch {
      this.enCapture = false;
      this.erreur = 'La photo n\'a pas pu être prise.';
    } finally {
      libererCanvas(image);
    }
  }

  /** Mise au point sur le point touché (si l'appareil le permet), puis retour à l'autofocus continu. */
  async mettreAuPoint(evenement: MouseEvent) {
    const piste = this.flux?.getVideoTracks()[0];
    const video = this.videoRef.nativeElement;
    if (!piste || !video.videoWidth || this.enCapture) return;
    const ecran = video.getBoundingClientRect();
    this.pointFocus = { x: evenement.clientX - ecran.left, y: evenement.clientY - ecran.top };
    clearTimeout(this.minuterieFocus);
    this.minuterieFocus = setTimeout(() => this.pointFocus = null, 800);
    try {
      await piste.applyConstraints({ advanced: [{
        pointsOfInterest: [{ x: this.pointFocus.x / ecran.width, y: this.pointFocus.y / ecran.height }],
        focusMode: 'single-shot'
      } as any] });
      setTimeout(() => {
        piste.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => { /* non supporté */ });
      }, 3000);
    } catch { /* mise au point au toucher non supportée : l'autofocus continu fait le travail */ }
  }

  /**
   * Repli : l'appareil photo du téléphone (préférence de l'agent, caméra indisponible). La
   * caméra intégrée est coupée d'abord, sans quoi l'application photo ne pourrait pas s'en servir.
   */
  utiliserAppareilNatif(entree: HTMLInputElement) {
    if (!this.erreur) {
      this.arreter();
      this.pret = false;
      this.enPause = true;
    }
    this.data.avantAppareilNatif();
    entree.click();
  }

  /** Retour de l'appareil photo du téléphone sans photo : on relance la caméra intégrée. */
  relancer() {
    if (!this.enPause || this.detruit) return;
    this.enPause = false;
    void this.demarrer();
  }

  photoNative(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const fichier = entree.files?.[0];
    entree.value = '';
    if (fichier) this.fermer(fichier);
    else this.relancer();
  }

  /** Allume/éteint la lampe torche (si l'appareil l'expose). */
  async basculerTorche() {
    const piste = this.flux?.getVideoTracks()[0];
    if (!piste) return;
    try {
      this.torcheAllumee = !this.torcheAllumee;
      await piste.applyConstraints({ advanced: [{ torch: this.torcheAllumee } as any] });
    } catch {
      this.torchDisponible = false;
      this.torcheAllumee = false;
    }
  }

  private async demarrer() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.erreur = 'Caméra intégrée indisponible sur ce navigateur (connexion HTTPS requise).';
      return;
    }
    let flux: MediaStream;
    try {
      flux = await ouvrirCameraArriere();
    } catch (err) {
      this.erreur = (err as DOMException)?.name === 'NotAllowedError'
        ? 'L\'accès à la caméra a été refusé. Autorisez-le dans le navigateur, ou utilisez l\'appareil photo du téléphone.'
        : 'Aucune caméra utilisable n\'a été trouvée.';
      return;
    }
    if (this.detruit || this.enPause) {
      flux.getTracks().forEach(piste => piste.stop());
      return;
    }
    this.flux = flux;
    const piste = flux.getVideoTracks()[0];
    // Mise au point continue : best-effort, selon l'appareil.
    try {
      await piste?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
    } catch { /* non supporté */ }
    this.torchDisponible = !!(piste?.getCapabilities?.() as Capacites | undefined)?.torch;
    const video = this.videoRef.nativeElement;
    video.srcObject = flux;
    video.play?.().catch(() => { /* lecture automatique gérée par l'attribut autoplay */ });
  }

  private arreter() {
    clearTimeout(this.minuterieFocus);
    this.flux?.getTracks().forEach(piste => piste.stop());
    this.flux = null;
    this.torchDisponible = false;
    this.torcheAllumee = false;
  }
}

type Capacites = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

/** Bonne définition : un document reste lisible sur la photo. */
const DEFINITION: MediaTrackConstraints = { width: { ideal: 3840 }, height: { ideal: 2160 } };

/**
 * Ouvre la caméra arrière, en s'assurant qu'elle fait la mise au point. Sur un téléphone à
 * plusieurs caméras arrière, le navigateur peut retenir le grand-angle ou la caméra macro, à
 * mise au point fixe. On cherche alors une autre caméra arrière qui fait la mise au point, et
 * on la garde pour les photos suivantes.
 */
async function ouvrirCameraArriere(): Promise<MediaStream> {
  if (cameraRetenue) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...DEFINITION, deviceId: { exact: cameraRetenue } } });
    } catch {
      cameraRetenue = undefined;
    }
  }
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { ...DEFINITION, facingMode: { ideal: 'environment' } }
  });
  const piste = flux.getVideoTracks()[0];
  const premiere = piste?.getSettings().deviceId;
  if (faitLaMiseAuPoint(piste) !== false) {
    cameraRetenue = premiere;
    return flux;
  }

  // Une caméra à la fois : la plupart des téléphones n'en ouvrent pas deux ensemble.
  flux.getTracks().forEach(p => p.stop());
  const autres = (await navigator.mediaDevices.enumerateDevices())
    .filter(appareil => appareil.kind === 'videoinput' && appareil.deviceId && appareil.deviceId !== premiere)
    .filter(appareil => !/front|user|avant|facetime/i.test(appareil.label))
    .slice(0, 3);
  for (const appareil of autres) {
    let essai: MediaStream;
    try {
      essai = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...DEFINITION, deviceId: { exact: appareil.deviceId } } });
    } catch {
      continue;
    }
    if (faitLaMiseAuPoint(essai.getVideoTracks()[0])) {
      cameraRetenue = appareil.deviceId;
      return essai;
    }
    essai.getTracks().forEach(p => p.stop());
  }
  // Aucune autre ne fait mieux : on reprend la première.
  cameraRetenue = premiere;
  return navigator.mediaDevices.getUserMedia({
    audio: false, video: { ...DEFINITION, ...(premiere ? { deviceId: { exact: premiere } } : { facingMode: { ideal: 'environment' } }) }
  });
}

/** true / false selon que la caméra annonce une mise au point automatique ; null si elle ne dit rien (iOS). */
function faitLaMiseAuPoint(piste: MediaStreamTrack | undefined): boolean | null {
  const modes = (piste?.getCapabilities?.() as Capacites | undefined)?.focusMode;
  if (!modes?.length) return null;
  return modes.includes('continuous') || modes.includes('single-shot');
}
