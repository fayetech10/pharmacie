import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => {
    console.error(err);
    const pre = document.createElement('pre');
    pre.id = 'bootstrap-error';
    pre.style.cssText = 'padding:16px;color:#b91c1c;white-space:pre-wrap;font:13px monospace';
    pre.textContent = 'BOOTSTRAP ERROR: ' + (err && (err.stack || err.message || err));
    document.body.appendChild(pre);
  });
