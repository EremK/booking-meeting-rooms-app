import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL's auto-cleanup only registers itself if it detects a global `afterEach`,
// which isn't present since `test.globals` is off (test files import explicitly instead).
afterEach(cleanup);

// jsdom doesn't implement <dialog>'s imperative showModal()/close() -- only the `open`
// attribute reflection. Polyfill just enough for ConfirmDialog's usage to work under test.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
}
if (!HTMLDialogElement.prototype.close) {
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}
