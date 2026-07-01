/**
 * @since 2026-05-06
 * @author vivaxy
 */
import { expect, test } from 'vitest';
import {
  CommitMessage,
  serializeSubject,
  serializeHeader,
  serialize,
} from '../commit-message';

test('CommitMessage trims whitespace around scope', function () {
  const commitMessage = new CommitMessage();
  commitMessage.scope = '  auth  ';
  expect(commitMessage.scope).toBe('auth');
});

test('CommitMessage trims whitespace around gitmoji', function () {
  const commitMessage = new CommitMessage();
  commitMessage.gitmoji = '  :sparkles:  ';
  expect(commitMessage.gitmoji).toBe(':sparkles:');
});

test('CommitMessage trims whitespace around subject', function () {
  const commitMessage = new CommitMessage();
  commitMessage.subject = '  add login  ';
  expect(commitMessage.subject).toBe('add login');
});

test('CommitMessage trims whitespace around body', function () {
  const commitMessage = new CommitMessage();
  commitMessage.body = '  body content  ';
  expect(commitMessage.body).toBe('body content');
});

test('CommitMessage trims whitespace around footer', function () {
  const commitMessage = new CommitMessage();
  commitMessage.footer = '  BREAKING CHANGE: api  ';
  expect(commitMessage.footer).toBe('BREAKING CHANGE: api');
});

test('CommitMessage trims whitespace around ci', function () {
  const commitMessage = new CommitMessage();
  commitMessage.ci = '  Yes  ';
  expect(commitMessage.ci).toBe('Yes');
});

test('serializeSubject returns gitmoji alone when subject is empty', function () {
  expect(serializeSubject({ gitmoji: ':sparkles:', subject: '' })).toBe(
    ':sparkles:',
  );
});

test('serializeSubject returns subject alone when gitmoji is empty', function () {
  expect(serializeSubject({ gitmoji: '', subject: 'add login' })).toBe(
    'add login',
  );
});

test('serializeSubject joins gitmoji and subject with a single space', function () {
  expect(
    serializeSubject({ gitmoji: ':sparkles:', subject: 'add login' }),
  ).toBe(':sparkles: add login');
});

test('serializeSubject returns empty string when both gitmoji and subject are empty', function () {
  expect(serializeSubject({ gitmoji: '', subject: '' })).toBe('');
});

test('serializeHeader renders scope-only header', function () {
  expect(
    serializeHeader({
      ci: '',
      scope: 'auth',
      gitmoji: '',
      subject: '',
      tag: '',
    }),
  ).toBe('auth: ');
});

test('serializeHeader renders scope and subject', function () {
  expect(
    serializeHeader({
      ci: '',
      scope: 'auth',
      gitmoji: '',
      subject: 'add login',
      tag: '',
    }),
  ).toBe('auth: add login');
});

test('serializeHeader renders scope, gitmoji, and subject', function () {
  expect(
    serializeHeader({
      ci: '',
      scope: 'auth',
      gitmoji: ':sparkles:',
      subject: 'add login',
      tag: '',
    }),
  ).toBe('auth: :sparkles: add login');
});

test('serializeHeader appends [skip ci] when ci is Yes', function () {
  expect(
    serializeHeader({
      ci: 'Yes',
      scope: 'auth',
      gitmoji: '',
      subject: 'add login',
      tag: '',
    }),
  ).toBe('auth: add login [skip ci]');
});

test('serializeHeader renders tag', function () {
  expect(
    serializeHeader({
      ci: '',
      scope: 'auth',
      gitmoji: '',
      subject: 'add login',
      tag: '[release]',
    }),
  ).toBe('auth: add login [release]');
});

test('serializeHeader renders tag and appends [skip ci] when ci is Yes', function () {
  expect(
    serializeHeader({
      ci: 'Yes',
      scope: 'auth',
      gitmoji: '',
      subject: 'add login',
      tag: '[release]',
    }),
  ).toBe('auth: add login [release] [skip ci]');
});

test('serialize renders header-only message', function () {
  const commitMessage = new CommitMessage();
  commitMessage.scope = 'auth';
  commitMessage.subject = 'add login';
  expect(serialize(commitMessage)).toBe('auth: add login');
});

test('serialize joins header and body with a blank line', function () {
  const commitMessage = new CommitMessage();
  commitMessage.scope = 'auth';
  commitMessage.subject = 'add login';
  commitMessage.body = 'body content';
  expect(serialize(commitMessage)).toBe('auth: add login\n\nbody content');
});

test('serialize joins header and footer with a blank line', function () {
  const commitMessage = new CommitMessage();
  commitMessage.scope = 'auth';
  commitMessage.subject = 'add login';
  commitMessage.footer = 'BREAKING CHANGE: api';
  expect(serialize(commitMessage)).toBe(
    'auth: add login\n\nBREAKING CHANGE: api',
  );
});

test('serialize joins header, body, and footer with blank lines', function () {
  const commitMessage = new CommitMessage();
  commitMessage.scope = 'auth';
  commitMessage.subject = 'add login';
  commitMessage.body = 'body content';
  commitMessage.footer = 'BREAKING CHANGE: api';
  expect(serialize(commitMessage)).toBe(
    'auth: add login\n\nbody content\n\nBREAKING CHANGE: api',
  );
});

test('serializeHeader with net/http nested scope', function () {
  expect(
    serializeHeader({
      ci: '',
      scope: 'net/http',
      gitmoji: '',
      subject: 'fix timeout handling',
      tag: '',
    }),
  ).toBe('net/http: fix timeout handling');
});

test('serializeHeader with scope and ticket reference', function () {
  expect(
    serializeHeader({
      ci: '',
      scope: 'auth (PROJ-123)',
      gitmoji: '',
      subject: 'fix login bug',
      tag: '',
    }),
  ).toBe('auth (PROJ-123): fix login bug');
});
