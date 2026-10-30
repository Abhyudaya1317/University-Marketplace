// Load the root component and configuration used to start the Angular application.
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Start the standalone Angular app and report startup failures in the console.
bootstrapApplication(App, appConfig)
  .catch((error) => console.error('CampusX could not start:', error));
