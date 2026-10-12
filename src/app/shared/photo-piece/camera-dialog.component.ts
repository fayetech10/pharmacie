import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { canvasVersBlob, libererCanvas } from '../../core/utils/image-compression';
import { mesurerNettete, NETTETE_MIN, Zone } from '../../core/utils/photo-qualite';

export interface CameraDialogData {
  libelle: string;
  /** « carte » : cadre au format carte (CNI), la photo est recadrée dessus. */
  cadrage: 'carte' | 'document';
  /** Appelé juste avant d'ouvrir l'appareil photo du téléphone (repli). */
  avantAppareilNatif: () => void;
}

/** Marge gardée autour du cadre : la carte entière, bords compris, figure sur la photo. */
const MARGE_CADRE = 0.05;
/**
 * Zoom appliqué quand la caméra le permet : l'agent tient le téléphone à 20-25 cm, bien
 * au-delà de la distance minimale de mise au point, et la carte garde sa définition (le
 * zoom recadre le capteur, plus fin que la vidéo). En deçà de 2×, le téléphone reste sur
 * l'objectif principal (le téléobjectif ne fait pas le point de près).
 */
const ZOOM_CARTE = 1.6;
/** Images d'une rafale : on garde la plus nette (tremblement, mise au point qui oscille). */
const IMAGES_RAFALE = 10;
/** Netteté affichée « nette » au-dessus de ce seuil, « floue » sous celui du contrôle de qualité. */
const NETTETE_AFFICHEE = NETTETE_MIN * 1.25;

/** Caméra arrière retenue (à mise au point automatique), gardée pour les photos suivantes. */
let cameraRetenue: string | undefined;

/**
 * Caméra intégrée à la page, en plein écran.
 *
 * Avec `<input capture>`, le téléphone ouvre son application photo et la page passe en
 * arrière-plan : faute de mémoire, Android (comme iOS) la recharge souvent au retour, et la
 * saisie est perdue. Ici la page reste au premier plan. Le cadre au format carte donne en
 * prime une CNI qui remplit la photo, droite et entière : la lecture automatique y gagne.
 *
 * Contre le flou : cadre assez petit (ou zoom) pour tenir le téléphone à bonne distance,
 * caméra à mise au point automatique, mise au point au toucher, indicateur de netteté, et
 * déclencheur qui garde l'image la plus nette d'une courte rafale.
 *
 * Se ferme avec la photo (Blob JPEG), ou sans rien si l'agent annule. Sans caméra
 * accessible (page hors HTTPS, accès refusé), propose l'appareil photo du téléphone.
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

      <div *ngIf="data.cadrage === 'carte' && !erreur && !enPause" #cadre class="cam-cadre"
           [class.zoome]="zoome" [class.nette]="nettete === 'nette'" [class.floue]="nettete === 'floue'" aria-hidden="true">
        <span class="cam-coin hg"></span><span class="cam-coin hd"></span>
        <span class="cam-coin bg"></span><span class="cam-coin bd"></span>
      </div>

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
        <p class="cam-aide" [class.floue]="nettete === 'floue'" aria-live="polite">{{ aide }}</p>
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
    .cam-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #000; }

    /* Cadre volontairement en retrait de l'écran : pour le remplir, la carte reste à bonne distance
       de l'objectif, là où la mise au point se fait. Plus grand quand le zoom a pu être appliqué. */
    .cam-cadre { position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%);
      width: min(80vw, calc((100vh - 280px) * 1.585)); aspect-ratio: 85.6 / 54; /* format carte ID-1 */
      border: 2px solid rgba(255,255,255,.85); border-radius: 14px; pointer-events: none;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.55); transition: border-color .2s; }
    .cam-cadre.zoome { width: min(90vw, calc((100vh - 280px) * 1.585)); }
    .cam-coin { position: absolute; width: 28px; height: 28px; border: 4px solid #fff; transition: border-color .2s; }
    .cam-cadre.nette, .cam-cadre.nette .cam-coin { border-color: #34d399; }
    .cam-cadre.floue, .cam-cadre.floue .cam-coin { border-color: #fbbf24; }
    .cam-coin.hg { top: -4px; left: -4px; border-right: 0; border-bottom: 0; border-top-left-radius: 14px; }
    .cam-coin.hd { top: -4px; right: -4px; border-left: 0; border-bottom: 0; border-top-right-radius: 14px; }
    .cam-coin.bg { bottom: -4px; left: -4px; border-right: 0; border-top: 0; border-bottom-left-radius: 14px; }
    .cam-coin.bd { bottom: -4px; right: -4px; border-left: 0; border-top: 0; border-bottom-right-radius: 14px; }

    .cam-focus { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; border: 2px solid #fbbf24;
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
    .cam-torche { position: absolute; right: 20px; bottom: 150px; background: rgba(255,255,255,.9); color: #1f2937; }
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
    .cam-aide { margin: 0; max-width: 420px; font-size: 14.5px; line-height: 1.4; text-align: center;
      text-shadow: 0 1px 3px rgba(0,0,0,.6); }
    .cam-aide.floue { color: #fde68a; }
    .cam-declencheur { width: 76px; height: 76px; padding: 6px; border-radius: 50%; border: 4px solid #fff;
      background: transparent; cursor: pointer; }
    .cam-declencheur span { display: block; width: 100%; height: 100%; border-radius: 50%; background: #fff;
      transition: transform .15s; }
    .cam-declencheur.en-cours span { transform: scale(.7); background: #34d399; }
    .cam-declencheur:disabled { cursor: default; }
    .cam-declencheur:disabled:not(.en-cours) { opacity: .4; }
    .cam-lien { border: 0; background: transparent; color: rgba(255,255,255,.85); font-size: 13px;
      text-decoration: underline; cursor: pointer; padding: 4px 8px; }
  `]
})
export class CameraDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('cadre') cadreRef?: ElementRef<HTMLElement>;

  pret = false;
  enCapture = false;
  /** Caméra coupée le temps que l'agent passe par l'appareil photo du téléphone. */
  enPause = false;
  erreur = '';
  torchDisponible = false;
  torcheAllumee = false;
  /** Zoom appliqué : le cadre peut être plus grand sans rapprocher la carte. */
  zoome = false;
  nettete: 'inconnue' | 'nette' | 'floue' = 'inconnue';
  /** Point touché pour la mise au point (cercle affiché un instant). */
  pointFocus: { x: number; y: number } | null = null;

  private flux: MediaStream | null = null;
  private detruit = false;
  private readonly canvasMesure = document.createElement('canvas');
  private minuterieNettete?: ReturnType<typeof setInterval>;
  private minuterieFocus?: ReturnType<typeof setTimeout>;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: CameraDialogData,
    private dialogRef: MatDialogRef<CameraDialogComponent, Blob>
  ) {}

  get aide(): string {
    const objet = this.data.cadrage === 'carte' ? 'la carte' : 'le document';
    if (this.nettete === 'floue') {
      return `Image floue : éloignez un peu le téléphone (${this.zoome ? '20 à 25' : '15 à 20'} cm) `
        + `ou touchez ${objet} à l'écran pour faire la mise au point.`;
    }
    if (this.nettete === 'nette') return 'Image nette : prenez la photo.';
    return this.data.cadrage === 'carte'
      ? 'Placez la carte dans le cadre : à plat, en entier, sans reflet.'
      : 'Cadrez le document en entier, à plat et bien éclairé.';
  }

  ngAfterViewInit() {
    void this.demarrer();
  }

  ngOnDestroy() {
    this.detruit = true;
    this.arreter();
    libererCanvas(this.canvasMesure);
  }

  fermer(photo?: Blob) {
    this.arreter();
    this.dialogRef.close(photo);
  }

  /**
   * Prend une courte rafale et garde l'image la plus nette : un léger tremblement ou une
   * mise au point qui oscille au moment du déclenchement ne gâchent plus la photo.
   */
  async prendre() {
    const video = this.videoRef.nativeElement;
    if (!video.videoWidth || !video.videoHeight || this.enCapture) return;
    this.enCapture = true;
    const zone = this.zoneCapturee(video);
    const meilleure = document.createElement('canvas');
    meilleure.width = Math.round(zone.largeur);
    meilleure.height = Math.round(zone.hauteur);
    try {
      const ctx = meilleure.getContext('2d');
      if (!ctx) throw new Error('Canvas non supporté');
      let meilleurScore = -1;
      for (let i = 0; i < IMAGES_RAFALE && this.flux; i++) {
        if (i > 0) await imageSuivante(video);
        const score = mesurerNettete(video, zone, this.canvasMesure);
        if (score > meilleurScore) {
          meilleurScore = score;
          ctx.drawImage(video, zone.x, zone.y, zone.largeur, zone.hauteur, 0, 0, meilleure.width, meilleure.height);
        }
      }
      if (!this.flux) return; // caméra fermée pendant la rafale
      try { navigator.vibrate?.(60); } catch { /* vibration optionnelle */ }
      this.fermer(await canvasVersBlob(meilleure, 'image/jpeg', 0.95));
    } catch {
      this.enCapture = false;
      this.erreur = 'La photo n\'a pas pu être prise.';
    } finally {
      libererCanvas(meilleure);
    }
  }

  /** Mise au point sur le point touché (si l'appareil le permet), puis retour à l'autofocus continu. */
  async mettreAuPoint(evenement: MouseEvent) {
    const piste = this.flux?.getVideoTracks()[0];
    const video = this.videoRef.nativeElement;
    if (!piste || !video.videoWidth || this.enCapture) return;
    const ecran = video.getBoundingClientRect();
    this.pointFocus = { x: evenement.clientX - ecran.left, y: evenement.clientY - ecran.top };
    const point = this.versVideo(video, evenement.clientX, evenement.clientY);
    clearTimeout(this.minuterieFocus);
    this.minuterieFocus = setTimeout(() => this.pointFocus = null, 800);
    try {
      await piste.applyConstraints({ advanced: [{
        pointsOfInterest: [{ x: point.x / video.videoWidth, y: point.y / video.videoHeight }],
        focusMode: 'single-shot'
      } as any] });
      setTimeout(() => {
        piste.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }).catch(() => { /* non supporté */ });
      }, 3000);
    } catch { /* mise au point au toucher non supportée : l'autofocus continu fait le travail */ }
  }

  /**
   * Repli : l'appareil photo du téléphone (caméra trop faible, préférence de l'agent). La
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
    const capacites = piste?.getCapabilities?.() as Capacites | undefined;
    // Mise au point continue : best-effort, selon l'appareil.
    try {
      await piste?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
    } catch { /* non supporté */ }
    if (this.data.cadrage === 'carte' && capacites?.zoom && capacites.zoom.max >= ZOOM_CARTE) {
      try {
        await piste.applyConstraints({ advanced: [{ zoom: Math.max(capacites.zoom.min, ZOOM_CARTE) } as any] });
        this.zoome = true;
      } catch { /* zoom refusé : le cadre reste petit */ }
    }
    this.torchDisponible = !!capacites?.torch;
    const video = this.videoRef.nativeElement;
    video.srcObject = flux;
    video.play?.().catch(() => { /* lecture automatique gérée par l'attribut autoplay */ });
    this.suivreNettete();
  }

  /** Mesure la netteté quelques fois par seconde pour guider l'agent (cadre vert / orange). */
  private suivreNettete() {
    clearInterval(this.minuterieNettete);
    this.minuterieNettete = setInterval(() => {
      const video = this.videoRef?.nativeElement;
      if (!this.flux || !this.pret || this.enCapture || !video?.videoWidth) return;
      const score = mesurerNettete(video, this.zoneCapturee(video), this.canvasMesure);
      // Deux seuils : l'indicateur ne clignote pas autour d'une valeur limite.
      if (score >= NETTETE_AFFICHEE) this.nettete = 'nette';
      else if (score < NETTETE_MIN) this.nettete = 'floue';
    }, 350);
  }

  private arreter() {
    clearInterval(this.minuterieNettete);
    this.flux?.getTracks().forEach(piste => piste.stop());
    this.flux = null;
    this.torchDisponible = false;
    this.torcheAllumee = false;
    this.zoome = false;
    this.nettete = 'inconnue';
  }

  /** Point de l'écran → pixels de la vidéo, affichée en « object-fit: cover ». */
  private versVideo(video: HTMLVideoElement, x: number, y: number): { x: number; y: number } {
    const lv = video.videoWidth, hv = video.videoHeight;
    const ecran = video.getBoundingClientRect();
    const echelle = Math.max(ecran.width / lv, ecran.height / hv);
    return {
      x: Math.min(lv, Math.max(0, (x - ecran.left - (ecran.width - lv * echelle) / 2) / echelle)),
      y: Math.min(hv, Math.max(0, (y - ecran.top - (ecran.height - hv * echelle) / 2) / echelle))
    };
  }

  /** Zone de la vidéo à garder : le cadre de visée (et sa marge) pour une carte, l'image entière sinon. */
  private zoneCapturee(video: HTMLVideoElement): Zone {
    const lv = video.videoWidth, hv = video.videoHeight;
    const cadre = this.cadreRef?.nativeElement;
    if (this.data.cadrage !== 'carte' || !cadre) return { x: 0, y: 0, largeur: lv, hauteur: hv };

    const visee = cadre.getBoundingClientRect();
    const marge = visee.width * MARGE_CADRE;
    const debut = this.versVideo(video, visee.left - marge, visee.top - marge);
    const fin = this.versVideo(video, visee.right + marge, visee.bottom + marge);
    const largeur = fin.x - debut.x;
    const hauteur = fin.y - debut.y;
    // Mesure aberrante (vidéo pas encore dimensionnée à l'écran) : on garde l'image entière.
    return largeur > 50 && hauteur > 50
      ? { x: debut.x, y: debut.y, largeur, hauteur }
      : { x: 0, y: 0, largeur: lv, hauteur: hv };
  }
}

type Capacites = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number };
};

/** Haute définition : une fois recadrée sur la carte, il reste assez de pixels par caractère. */
const DEFINITION: MediaTrackConstraints = { width: { ideal: 3840 }, height: { ideal: 2160 } };

/**
 * Ouvre la caméra arrière, en s'assurant qu'elle fait la mise au point. Sur un téléphone à
 * plusieurs caméras arrière, le navigateur peut retenir le grand-angle ou la caméra macro, à
 * mise au point fixe : vue de près, la carte y reste floue quoi qu'on fasse. On cherche alors
 * une autre caméra arrière qui fait la mise au point, et on la garde pour les photos suivantes.
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

/** Attend l'image suivante de la vidéo (au plus 150 ms, si le flux se fige). */
function imageSuivante(video: HTMLVideoElement): Promise<void> {
  return new Promise(resolve => {
    const delai = setTimeout(resolve, 150);
    const rappel = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number })
      .requestVideoFrameCallback;
    if (rappel) {
      rappel.call(video, () => {
        clearTimeout(delai);
        resolve();
      });
    }
  });
}
