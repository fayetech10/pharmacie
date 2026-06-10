import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private activeRequests = 0;
  public isLoading$ = new BehaviorSubject<boolean>(false);

  show() {
    this.activeRequests++;
    this.isLoading$.next(true);
  }

  hide() {
    this.activeRequests--;
    if (this.activeRequests <= 0) {
      this.activeRequests = 0;
      this.isLoading$.next(false);
    }
  }
}
