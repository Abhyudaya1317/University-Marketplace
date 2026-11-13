import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

// Give new marketplace users short directions without changing any buying or selling flows.
@Component({
  selector: 'app-how-to-use',
  imports: [AccountNavigation, RouterLink],
  templateUrl: './how-to-use.html',
  styleUrl: './how-to-use.css',
})
export class HowToUse {}
