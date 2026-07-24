import { Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import jsQR from 'jsqr';

/**
 * Bouton « Scanner » qui ouvre la caméra en PLEIN ÉCRAN et décode un QR code (numéro de
 * lettre de garantie ou de bon de commande). Émet le texte décodé via (scanned).
 *
 * Caméra optimisée : capture haute résolution + mise au point continue, cadre de visée,
 * décodage sous-échantillonné (rapide, moins de chauffe), lampe torche en basse lumière
 * et vibration au succès. Repli sans caméra (ou hors HTTPS) : import d'une photo du QR.
 */
@Component({
  selector: 'app-qr-scanner',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <button type="button" class="qr-btn" (click)="ouvrir()" title="Scanner un QR code">
      <mat-icon>qr_code_scanner</mat-icon> Scanner
    </button>

    <div class="qr-overlay" *ngIf="open">
      <div class="qr-panel">
        <div class="qr-stage" [class.qr-hidden]="!!error">
          <video #video class="qr-video" autoplay playsinline muted></video>
          <div class="qr-frame">
            <span class="qr-corner tl"></span>
            <span class="qr-corner tr"></span>
            <span class="qr-corner bl"></span>
            <span class="qr-corner br"></span>
            <div class="qr-scanline"></div>
          </div>
        </div>

        <!-- Barre du haut : titre + fermer -->
        <div class="qr-topbar">
          <span class="qr-title">Scanner le QR code</span>
          <button type="button" class="qr-close" (click)="fermer()" aria-label="Fermer">✕</button>
        </div>

        <!-- Message d'erreur centré (caméra indisponible) -->
        <div class="qr-error-box" *ngIf="error">
          <mat-icon>videocam_off</mat-icon>
          <p>{{ error }}</p>
        </div>

        <!-- Lampe torche flottante -->
        <button *ngIf="torchDisponible" type="button" class="qr-torch" [class.on]="torchOn"
                (click)="basculerTorche()" [attr.aria-label]="torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'">
          <mat-icon>{{ torchOn ? 'flashlight_on' : 'flashlight_off' }}</mat-icon>
        </button>

        <!-- Commandes du bas -->
        <div class="qr-bottom">
          <p class="qr-hint" *ngIf="!error">Centrez le QR code dans le cadre</p>
          <label class="qr-file">
            <mat-icon>photo_camera</mat-icon> Scanner depuis une photo
            <input type="file" accept="image/*" capture="environment" (change)="decoderFichier($event)" hidden>
          </label>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .qr-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
      border: 1px solid #2f6e54; color: #2f6e54; background: #fff; border-radius: 8px;
      cursor: pointer; font-weight: 600; }
    .qr-btn:hover { background: #eef7f2; }
    .qr-btn mat-icon { font-size: 20px; width: 20px; height: 20px; }

    /* Plein écran */
    .qr-overlay { position: fixed; inset: 0; background: #000; z-index: 1000; }
    .qr-panel { position: absolute; inset: 0; overflow: hidden; }

    .qr-stage { position: absolute; inset: 0; }
    .qr-video { width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
    .qr-hidden { display: none; }

    /* Cadre de visée centré (grand) */
    .qr-frame { position: absolute; top: 50%; left: 50%; width: min(82vw, 62vh); aspect-ratio: 1;
      transform: translate(-50%, -52%); border-radius: 18px;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.5); }
    .qr-corner { position: absolute; width: 32px; height: 32px; border: 3px solid #34d399; }
    .qr-corner.tl { top: -2px; left: -2px; border-right: 0; border-bottom: 0; border-top-left-radius: 14px; }
    .qr-corner.tr { top: -2px; right: -2px; border-left: 0; border-bottom: 0; border-top-right-radius: 14px; }
    .qr-corner.bl { bottom: -2px; left: -2px; border-right: 0; border-top: 0; border-bottom-left-radius: 14px; }
    .qr-corner.br { bottom: -2px; right: -2px; border-left: 0; border-top: 0; border-bottom-right-radius: 14px; }
    .qr-scanline { position: absolute; left: 6%; right: 6%; height: 2px; top: 8%;
      background: linear-gradient(90deg, transparent, #34d399, transparent);
      box-shadow: 0 0 8px #34d399; animation: qrscan 2.2s ease-in-out infinite; }
    @keyframes qrscan { 0% { top: 8%; } 50% { top: 88%; } 100% { top: 8%; } }
    @media (prefers-reduced-motion: reduce) { .qr-scanline { animation: none; top: 50%; } }

    /* Barre du haut */
    .qr-topbar { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: center;
      justify-content: space-between; gap: 12px; color: #fff;
      padding: max(14px, env(safe-area-inset-top)) 18px 16px;
      background: linear-gradient(to bottom, rgba(0,0,0,.65), transparent); }
    .qr-title { font-weight: 700; font-size: 16px; text-shadow: 0 1px 3px rgba(0,0,0,.5); }
    .qr-close { border: none; background: rgba(255,255,255,.18); color: #fff; width: 38px; height: 38px;
      border-radius: 50%; font-size: 18px; cursor: pointer; line-height: 1; }
    .qr-close:hover { background: rgba(255,255,255,.32); }

    /* Lampe torche flottante */
    .qr-torch { position: absolute; right: 20px; bottom: 108px; width: 54px; height: 54px; border: none;
      border-radius: 50%; background: rgba(255,255,255,.9); color: #1f2937; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 10px rgba(0,0,0,.4); }
    .qr-torch.on { background: #fbbf24; color: #1f2937; }
    .qr-torch mat-icon { font-size: 26px; width: 26px; height: 26px; }

    /* Commandes du bas */
    .qr-bottom { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column;
      align-items: center; gap: 12px; padding: 18px 18px max(18px, env(safe-area-inset-bottom));
      background: linear-gradient(to top, rgba(0,0,0,.7), transparent); }
    .qr-hint { color: #fff; margin: 0; font-size: .95rem; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
    .qr-file { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 12px 18px; border: 1px solid rgba(255,255,255,.6); border-radius: 10px; cursor: pointer;
      color: #fff; font-size: .95rem; font-weight: 600; background: rgba(255,255,255,.12); }
    .qr-file:hover { background: rgba(255,255,255,.24); }

    /* Erreur centrée */
    .qr-error-box { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      display: flex; flex-direction: column; align-items: center; gap: 10px; color: #fff;
      text-align: center; padding: 0 28px; }
    .qr-error-box mat-icon { font-size: 46px; width: 46px; height: 46px; opacity: .85; }
    .qr-error-box p { margin: 0; font-size: .95rem; max-width: 340px; line-height: 1.4; }
  `]
})
export class QrScannerComponent implements OnDestroy {
  @Output() scanned = new EventEmitter<string>();
  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  open = false;
  error = '';
  torchDisponible = false;
  torchOn = false;

  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private rafId = 0;
  private lastDecode = 0;
  /** Intervalle mini entre deux décodages (~16 img/s) : fluide, sans surchauffer l'appareil. */
  private readonly decodeIntervalMs = 60;
  private readonly canvas = document.createElement('canvas');

  async ouvrir() {
    this.open = true;
    this.error = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'Caméra indisponible sur cet appareil ou ce navigateur (HTTPS requis). Utilisez « Scanner depuis une photo ».';
      return;
    }
    try {
      // Caméra arrière, la plus nette possible (le décodage, lui, est sous-échantillonné).
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      this.track = this.stream.getVideoTracks()[0] ?? null;
      // Mise au point continue + détection de la lampe torche (best-effort, selon l'appareil).
      try { await this.track?.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] }); } catch { /* non supporté */ }
      const caps: any = this.track?.getCapabilities?.();
      this.torchDisponible = !!(caps && caps.torch);
      setTimeout(() => this.demarrerLecture(), 0); // attend le rendu du <video>
    } catch {
      this.error = 'Accès caméra refusé ou indisponible. Utilisez « Scanner depuis une photo ».';
    }
  }

  fermer() {
    this.open = false;
    this.arreter();
  }

  ngOnDestroy() {
    this.arreter();
  }

  /** Allume/éteint la lampe torche (si l'appareil l'expose). */
  async basculerTorche() {
    if (!this.track || !this.torchDisponible) return;
    try {
      this.torchOn = !this.torchOn;
      await this.track.applyConstraints({ advanced: [{ torch: this.torchOn } as any] });
    } catch {
      this.torchDisponible = false;
      this.torchOn = false;
    }
  }

  private demarrerLecture() {
    const video = this.videoRef?.nativeElement;
    if (!video || !this.stream) return;
    video.srcObject = this.stream;
    video.play?.().catch(() => { /* autoplay géré par l'attribut */ });
    const boucle = (t: number) => {
      if (!this.open) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && t - this.lastDecode >= this.decodeIntervalMs) {
        this.lastDecode = t;
        // Décodage sous-échantillonné (≤ 640 px) : jsQR bien plus rapide sur mobile.
        const code = this.decoderImage(video, video.videoWidth, video.videoHeight, 640, false);
        if (code) { this.emettre(code); return; }
      }
      this.rafId = requestAnimationFrame(boucle);
    };
    this.rafId = requestAnimationFrame(boucle);
  }

  decoderFichier(event: Event) {
    const input = event.target as HTMLInputElement;
    const fichier = input.files?.[0];
    if (!fichier) return;
    const img = new (window as any).Image() as HTMLImageElement;
    const url = URL.createObjectURL(fichier);
    img.onload = () => {
      // Photo figée : on peut se permettre un décodage plus fin (bidirectionnel, plus haute résolution).
      const code = this.decoderImage(img, img.naturalWidth, img.naturalHeight, 1400, true);
      URL.revokeObjectURL(url);
      input.value = '';
      if (code) {
        this.emettre(code);
      } else {
        this.error = 'Aucun QR code lisible sur cette photo. Réessayez en cadrant mieux le code.';
      }
    };
    img.src = url;
  }

  /**
   * Décode un QR depuis une source (vidéo ou image), en sous-échantillonnant à `maxSide`
   * pixels sur le plus grand côté pour accélérer jsQR. `thorough` tente aussi les couleurs
   * inversées (utile pour une photo, superflu pour le flux vidéo en direct).
   */
  private decoderImage(source: CanvasImageSource, srcW: number, srcH: number,
                       maxSide: number, thorough: boolean): string | null {
    if (!srcW || !srcH) return null;
    const scale = maxSide > 0 ? Math.min(1, maxSide / Math.max(srcW, srcH)) : 1;
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    this.canvas.width = w;
    this.canvas.height = h;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    const donnees = ctx.getImageData(0, 0, w, h);
    const resultat = jsQR(donnees.data, w, h, { inversionAttempts: thorough ? 'attemptBoth' : 'dontInvert' });
    return resultat?.data?.trim() || null;
  }

  private emettre(code: string) {
    try { navigator.vibrate?.(80); } catch { /* vibration optionnelle */ }
    this.fermer();
    this.scanned.emit(code);
  }

  private arreter() {
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.track = null;
    this.torchOn = false;
    this.torchDisponible = false;
  }
}
