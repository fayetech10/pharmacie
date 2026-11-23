import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Directive, HostListener, Inject, OnDestroy } from '@angular/core';

/**
 * Turns data tables rendered inside the authenticated app into labeled cards on phones.
 * The original table and Angular event handlers stay in place, so paging, sorting and
 * business actions continue to use the existing page logic.
 */
@Directive({
  selector: '[appMobileCardTables]',
  standalone: true
})
export class MobileCardTablesDirective implements AfterViewInit, OnDestroy {
  private observer?: MutationObserver;
  private observedRoot?: HTMLElement;
  private openOverlay?: HTMLElement;
  private openTrigger?: HTMLButtonElement;
  private readonly headersCache = new WeakMap<HTMLTableElement, string[]>();
  private readonly documentClickListener = (event: Event) => this.onDocumentClick(event as MouseEvent);
  private readonly documentKeyListener = (event: Event) => this.onDocumentKeydown(event as KeyboardEvent);

  private readonly iconLabels: Record<string, string> = {
    visibility: 'Consulter', remove_red_eye: 'Consulter', open_in_new: 'Consulter',
    description: 'Consulter', info: 'Informations', info_outline: 'Informations',
    edit: 'Modifier', edit_note: 'Modifier', delete: 'Supprimer', delete_outline: 'Supprimer',
    download: 'Télécharger', picture_as_pdf: 'Télécharger le PDF', print: 'Imprimer',
    send: 'Transmettre', forward_to_inbox: 'Transmettre', check: 'Valider',
    check_circle: 'Valider', fact_check: 'Contrôler', replay: 'Rétablir',
    close: 'Fermer', cancel: 'Annuler', more_horiz: 'Plus d’options'
  };

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  ngAfterViewInit(): void {
    const win = this.document.defaultView;
    if (!win) return;
    this.document.addEventListener('click', this.documentClickListener, true);
    this.document.addEventListener('keydown', this.documentKeyListener, true);
    this.syncViewport();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.document.removeEventListener('click', this.documentClickListener, true);
    this.document.removeEventListener('keydown', this.documentKeyListener, true);
    this.closeMenu();
  }

  private onDocumentClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest<HTMLButtonElement>('[data-mobile-card-trigger]');
    if (trigger) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.toggleMenu(trigger);
      return;
    }

    if (!this.isPhoneLayout() || !target) return;
    const row = target.closest<HTMLTableRowElement>('tbody tr[data-mobile-card-clickable="true"]');
    if (!row || !row.contains(target)) return;
    if (target.closest('a,button,input,select,textarea,[role="button"],[data-mobile-card-trigger]')) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.activateCard(row);
  }

  private onDocumentKeydown(event: KeyboardEvent): void {
    if (!this.isPhoneLayout() || !['Enter', ' '].includes(event.key)) return;
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest<HTMLTableRowElement>('tbody tr[data-mobile-card-clickable="true"]');
    if (!row || target !== row) return;
    event.preventDefault();
    this.activateCard(row);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.closeMenu();
    this.syncViewport();
  }

  private syncViewport(): void {
    if (!this.isPhoneLayout()) {
      this.observer?.disconnect();
      this.observer = undefined;
      if (this.observedRoot) this.clearMobileDecorations(this.observedRoot);
      this.observedRoot = undefined;
      return;
    }

    const root = this.document.querySelector<HTMLElement>('main');
    if (!root || root === this.observedRoot) return;
    this.observer?.disconnect();
    this.observedRoot = root;

    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver(records => this.processMutations(records));
      // Restrict observation to page content. Header, navigation, toasts and dialogs don't
      // need table processing and were generating pointless whole-page work.
      this.observer.observe(root, { childList: true, subtree: true });
    }
    this.prepareTables(root);
  }

  private prepareTables(root: ParentNode): void {
    const tables = root.querySelectorAll<HTMLTableElement>('table:not([data-mobile-card-skip])');
    tables.forEach(table => {
      this.prepareTable(table);
    });
    root.querySelectorAll<HTMLElement>('.m-card').forEach(card => this.prepareCard(card));
  }

  private processMutations(records: MutationRecord[]): void {
    if (!this.isPhoneLayout()) return;
    const tables = new Set<HTMLTableElement>();
    const rows = new Set<HTMLTableRowElement>();
    const cards = new Set<HTMLElement>();

    const addTree = (node: Node): void => {
      if (!(node instanceof Element)) return;
      if (node.matches('table:not([data-mobile-card-skip])')) tables.add(node as HTMLTableElement);
      node.querySelectorAll<HTMLTableElement>('table:not([data-mobile-card-skip])').forEach(table => tables.add(table));
      if (node.matches('tr')) rows.add(node as HTMLTableRowElement);
      node.querySelectorAll<HTMLTableRowElement>('tr').forEach(row => rows.add(row));
      if (node.matches('.m-card')) cards.add(node as HTMLElement);
      node.querySelectorAll<HTMLElement>('.m-card').forEach(card => cards.add(card));
    };

    records.forEach(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const table = target?.closest<HTMLTableElement>('table:not([data-mobile-card-skip])');
      if (table) {
        if (target === table || target?.closest('thead')) tables.add(table);
        else {
          const row = target?.closest<HTMLTableRowElement>('tbody tr');
          if (row) rows.add(row);
        }
      }
      const card = target?.closest<HTMLElement>('.m-card');
      if (card) cards.add(card);
      record.addedNodes.forEach(addTree);
    });

    tables.forEach(table => this.prepareTable(table));
    rows.forEach(row => {
      if (row.isConnected && !tables.has(row.closest('table') as HTMLTableElement)) {
        const table = row.closest<HTMLTableElement>('table:not([data-mobile-card-skip])');
        if (table) {
          const headers = this.headersCache.get(table) || this.headersOf(table);
          this.labelCells(row, headers);
          this.prepareRow(row, headers);
        }
      }
    });
    cards.forEach(card => this.prepareCard(card));
  }

  private prepareTable(table: HTMLTableElement): void {
    if (!this.isPhoneLayout()) return;
    table.classList.add('mobile-card-table');
    const headers = this.headersOf(table);
    this.headersCache.set(table, headers);
    Array.from(table.tBodies).forEach(body => Array.from(body.rows).forEach(row => {
      this.labelCells(row, headers);
      this.prepareRow(row, headers);
    }));
  }

  private prepareCard(card: HTMLElement): void {
    if (!this.isPhoneLayout()) return;
    const groups = Array.from(card.querySelectorAll<HTMLElement>('.m-actions'));
    const controls = groups.flatMap(group => this.actionElements(group));
    if (controls.length > 1) {
      groups.forEach(group => group.classList.add('mobile-card-action-group'));
      if (!card.querySelector('[data-mobile-card-trigger]') && groups[0]) {
        groups[0].appendChild(this.createTrigger());
      }
    } else {
      groups.forEach(group => group.classList.remove('mobile-card-action-group'));
      card.querySelector('[data-mobile-card-trigger]')?.remove();
    }
  }

  private clearMobileDecorations(root: ParentNode): void {
    root.querySelectorAll('table.mobile-card-table').forEach(table => table.classList.remove('mobile-card-table'));
    root.querySelectorAll('.mobile-card-action-source').forEach(cell => cell.classList.remove('mobile-card-action-source'));
    root.querySelectorAll('[data-mobile-card-trigger-cell]').forEach(cell => cell.remove());
    root.querySelectorAll('.mobile-card-action-group').forEach(group => group.classList.remove('mobile-card-action-group'));
    root.querySelectorAll('[data-mobile-card-clickable], [data-mobile-card-primary-action]').forEach(row => {
      row.removeAttribute('data-mobile-card-clickable');
      row.removeAttribute('data-mobile-card-primary-action');
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-label');
    });
    root.querySelectorAll('[data-mobile-label]').forEach(cell => cell.removeAttribute('data-mobile-label'));
  }

  private headersOf(table: HTMLTableElement): string[] {
    const row = table.tHead?.rows.item(0);
    if (!row) return [];
    return Array.from(row.cells).map(cell => this.cleanText(cell.innerText || cell.textContent || ''));
  }

  private labelCells(row: HTMLTableRowElement, headers: string[]): void {
    Array.from(row.cells).forEach(cell => {
      if (cell.hasAttribute('data-mobile-card-trigger')) return;
      const label = headers[cell.cellIndex] || '';
      if (label && !cell.hasAttribute('data-mobile-label')) {
        cell.setAttribute('data-mobile-label', label);
      }
    });
  }

  private prepareRow(row: HTMLTableRowElement, headers: string[]): void {
    if (!row.isConnected) return;
    const cells = Array.from(row.cells).filter(cell => !cell.hasAttribute('data-mobile-card-trigger'));
    const actionIndex = headers.findIndex(header => /^(actions?|options?)$/i.test(header.trim()));
    let actionCells = actionIndex >= 0
      ? cells.filter(cell => cell.cellIndex === actionIndex)
      : cells.filter(cell => this.actionElements(cell).length > 0).slice(-1);
    let actionElements = actionCells.flatMap(cell => this.actionElements(cell));

    // A detail link in the data itself makes the whole card an entry point.
    const dataLink = cells
      .filter(cell => !actionCells.includes(cell))
      .flatMap(cell => Array.from(cell.querySelectorAll<HTMLAnchorElement>('a[href]')))
      .find(anchor => this.isInternalLink(anchor));
    const detailAction = actionElements.find(element => this.isViewAction(element));
    if (detailAction && !dataLink) {
      row.dataset['mobileCardPrimaryAction'] = 'true';
    } else {
      delete row.dataset['mobileCardPrimaryAction'];
    }

    const clickable = this.isPhoneLayout() && (!!dataLink || !!detailAction);
    row.dataset['mobileCardClickable'] = clickable ? 'true' : 'false';
    if (clickable) {
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Ouvrir ${this.firstCellText(row) || 'les détails'}`);
    } else {
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-label');
    }

    if (actionElements.length > 1) {
      actionCells.forEach(cell => cell.classList.add('mobile-card-action-source'));
      this.ensureTrigger(row);
      return;
    }

    actionCells.forEach(cell => cell.classList.remove('mobile-card-action-source'));
    this.removeTrigger(row);
    // A single view-only action is redundant on the card: the entire card opens it.
    if (detailAction && !dataLink) {
      actionCells.forEach(cell => cell.classList.add('mobile-card-action-source'));
    }
  }

  private actionElements(cell: HTMLElement): HTMLElement[] {
    return Array.from(cell.querySelectorAll<HTMLElement>('button, a[href]'))
      .filter(element => !element.closest('[data-mobile-card-trigger]'))
      .filter(element => !element.hasAttribute('download'))
      .filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true')
      .filter(element => !element.hidden && !element.closest('[hidden], .hidden'));
  }

  private isInternalLink(anchor: HTMLAnchorElement): boolean {
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    try {
      return new URL(anchor.href, this.document.baseURI).origin === this.document.defaultView?.location.origin;
    } catch {
      return false;
    }
  }

  private isViewAction(element: HTMLElement): boolean {
    const label = this.actionLabel(element).toLocaleLowerCase('fr');
    const icon = this.iconName(element);
    return /consulter|voir|détail|detail|ouvrir|informations|patient|dossier/.test(label)
      || ['visibility', 'remove_red_eye', 'open_in_new', 'description', 'info', 'info_outline'].includes(icon);
  }

  private ensureTrigger(row: HTMLTableRowElement): void {
    if (row.querySelector('[data-mobile-card-trigger]')) return;
    const cell = this.document.createElement('td');
    cell.dataset['mobileCardTriggerCell'] = 'true';
    cell.appendChild(this.createTrigger());
    row.appendChild(cell);
  }

  private createTrigger(): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-card-more';
    button.dataset['mobileCardTrigger'] = 'true';
    button.setAttribute('aria-label', 'Actions disponibles');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const icon = this.document.createElement('mat-icon');
    icon.textContent = 'more_vert';
    button.appendChild(icon);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu(button);
    });
    return button;
  }

  private removeTrigger(row: HTMLTableRowElement): void {
    row.querySelector('[data-mobile-card-trigger-cell]')?.remove();
  }

  private toggleMenu(trigger: HTMLButtonElement): void {
    if (this.openTrigger === trigger) {
      this.closeMenu();
      return;
    }
    this.closeMenu();
    const row = trigger.closest<HTMLTableRowElement>('tr');
    const card = trigger.closest<HTMLElement>('.m-card');
    const controls = row ? this.controlsForRow(row) : card ? this.controlsForCard(card) : [];
    if (!controls.length) return;

    const overlay = this.document.createElement('div');
    overlay.className = 'mobile-table-menu-overlay';
    overlay.setAttribute('role', 'presentation');
    const menu = this.document.createElement('div');
    menu.className = 'mobile-table-action-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Actions de la ligne');

    controls.forEach(control => {
      const item = this.document.createElement('button');
      item.type = 'button';
      item.className = 'mobile-table-action-item';
      item.setAttribute('role', 'menuitem');
      const icon = this.document.createElement('mat-icon');
      icon.textContent = this.iconName(control) || 'arrow_forward';
      const label = this.document.createElement('span');
      label.textContent = this.actionLabel(control);
      item.append(icon, label);
      if (/supprimer|delete|rejeter|annuler/i.test(label.textContent || '')) {
        item.classList.add('is-destructive');
      }
      item.addEventListener('click', event => {
        event.stopPropagation();
        this.closeMenu();
        control.click();
      });
      menu.appendChild(item);
    });

    overlay.appendChild(menu);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) this.closeMenu();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMenu();
        trigger.focus();
      }
    });
    this.document.body.appendChild(overlay);

    const rect = trigger.getBoundingClientRect();
    const win = this.document.defaultView;
    const right = Math.max(12, (win?.innerWidth || 375) - rect.right);
    const top = Math.max(12, Math.min(rect.bottom, (win?.innerHeight || 640) - 300));
    menu.style.top = `${top}px`;
    menu.style.right = `${right}px`;
    this.openOverlay = overlay;
    this.openTrigger = trigger;
    trigger.setAttribute('aria-expanded', 'true');
    menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }

  private controlsForRow(row: HTMLTableRowElement): HTMLElement[] {
    return Array.from(row.querySelectorAll<HTMLTableCellElement>('.mobile-card-action-source'))
      .flatMap(cell => this.actionElements(cell));
  }

  private controlsForCard(card: HTMLElement): HTMLElement[] {
    return Array.from(card.querySelectorAll<HTMLElement>('.m-actions.mobile-card-action-group'))
      .flatMap(group => this.actionElements(group));
  }

  private closeMenu(): void {
    this.openOverlay?.remove();
    this.openOverlay = undefined;
    this.openTrigger?.setAttribute('aria-expanded', 'false');
    this.openTrigger = undefined;
  }

  private activateCard(row: HTMLTableRowElement): void {
    const cells = Array.from(row.cells).filter(cell => !cell.hasAttribute('data-mobile-card-trigger'));
    const table = row.closest('table');
    const headers = table ? this.headersOf(table) : [];
    const actionIndex = headers.findIndex(header => /^(actions?|options?)$/i.test(header.trim()));
    const primaryLink = cells
      .filter(cell => actionIndex < 0 || cell.cellIndex !== actionIndex)
      .flatMap(cell => Array.from(cell.querySelectorAll<HTMLAnchorElement>('a[href]')))
      .find(anchor => this.isInternalLink(anchor));
    if (primaryLink) {
      primaryLink.click();
      return;
    }
    const lastCell = cells[cells.length - 1];
    const primaryAction = lastCell ? this.actionElements(lastCell).find(element => this.isViewAction(element)) : undefined;
    primaryAction?.click();
  }

  private firstCellText(row: HTMLTableRowElement): string {
    const cell = Array.from(row.cells).find(item => !item.hasAttribute('data-mobile-card-trigger'));
    return this.cleanText(cell?.innerText || cell?.textContent || '').slice(0, 70);
  }

  private actionLabel(element: HTMLElement): string {
    const explicit = element.getAttribute('aria-label') || element.getAttribute('title');
    if (explicit?.trim()) return explicit.trim();
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('mat-icon, svg, .material-icons').forEach(icon => icon.remove());
    const text = this.cleanText(clone.innerText || clone.textContent || '');
    if (text) return text;
    const icon = this.iconName(element);
    return this.iconLabels[icon] || 'Ouvrir';
  }

  private iconName(element: HTMLElement): string {
    return this.cleanText(element.querySelector('mat-icon')?.textContent || '')
      || element.querySelector('svg')?.getAttribute('aria-label')?.trim()
      || '';
  }

  private cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private isPhoneLayout(): boolean {
    return (this.document.defaultView?.matchMedia('(max-width: 767px)').matches) ?? false;
  }

}
