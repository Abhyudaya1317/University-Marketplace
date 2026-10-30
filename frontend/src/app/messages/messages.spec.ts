import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { Messages } from './messages';

describe('Private messaging', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Messages],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ conversationId: '12' })) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the authenticated inbox and requested conversation', () => {
    const fixture = TestBed.createComponent(Messages);
    const component = fixture.componentInstance as any;

    http
      .match('/api/auth/me')
      .forEach((request) => request.flush({ success: true, user: { id: 8 } }));
    http.expectOne('/api/messages').flush({ success: true, conversations: [conversation(12)] });
    http.expectOne('/api/messages/12').flush({ success: true, conversation: thread(12) });

    expect(component.currentUserId()).toBe(8);
    expect(component.conversations().map((item: { id: number }) => item.id)).toEqual([12]);
    expect(component.conversation().messages[0].body).toBe('Hello');
    fixture.destroy();
  });

  it('sends a trimmed message to the open conversation and refreshes the thread and inbox', () => {
    const fixture = TestBed.createComponent(Messages);
    const component = fixture.componentInstance as any;

    http
      .match('/api/auth/me')
      .forEach((request) => request.flush({ success: true, user: { id: 8 } }));
    http.expectOne('/api/messages').flush({ success: true, conversations: [] });
    http.expectOne('/api/messages/12').flush({ success: true, conversation: thread(12) });

    component.draft.set('  Is this still available?  ');
    component.sendMessage();

    const sendRequest = http.expectOne('/api/messages/12');
    expect(sendRequest.request.method).toBe('POST');
    expect(sendRequest.request.body).toEqual({ body: 'Is this still available?' });
    sendRequest.flush({ success: true, message: { id: 20 } });

    http.expectOne('/api/messages/12').flush({ success: true, conversation: thread(12) });
    http.expectOne('/api/messages').flush({ success: true, conversations: [conversation(12)] });
    expect(component.draft()).toBe('');
    expect(component.notice()).toBe('Message sent.');
    fixture.destroy();
  });

  it('shows the API access error when an account is not a conversation participant', () => {
    const fixture = TestBed.createComponent(Messages);
    const component = fixture.componentInstance as any;

    http
      .match('/api/auth/me')
      .forEach((request) => request.flush({ success: true, user: { id: 99 } }));
    http.expectOne('/api/messages').flush({ success: true, conversations: [] });
    http
      .expectOne('/api/messages/12')
      .flush(
        { success: false, message: 'This conversation was not found.' },
        { status: 404, statusText: 'Not Found' },
      );

    expect(component.error()).toBe('This conversation was not found.');
    expect(component.conversation()).toBeNull();
    fixture.destroy();
  });
});

function conversation(id: number) {
  return {
    id,
    updatedAt: new Date().toISOString(),
    otherUser: { id: 3, fullName: 'Campus Seller' },
    listing: { id: 41, title: 'Blue jeans', price: '80.00', photoUrl: null, status: 'ACTIVE' },
    lastMessage: null,
  };
}

function thread(id: number) {
  return {
    id,
    otherUser: { id: 3, fullName: 'Campus Seller' },
    listing: { id: 41, title: 'Blue jeans', price: '80.00', photoUrl: null, status: 'ACTIVE' },
    messages: [
      {
        id: 19,
        senderId: 3,
        senderName: 'Campus Seller',
        body: 'Hello',
        createdAt: new Date().toISOString(),
      },
    ],
  };
}
