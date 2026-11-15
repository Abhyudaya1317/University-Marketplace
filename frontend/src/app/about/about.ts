import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountNavigation } from '../shared/account-navigation';

@Component({
  selector: 'app-about',
  imports: [AccountNavigation, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {}
