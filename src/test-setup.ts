import '@testing-library/jest-dom/vitest';

function dispatchMediaEvent(media: HTMLMediaElement, type: string) {
  media.dispatchEvent(new Event(type));
}

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: function play(this: HTMLMediaElement) {
      dispatchMediaEvent(this, 'play');
      return Promise.resolve();
    },
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    writable: true,
    value: function pause(this: HTMLMediaElement) {
      dispatchMediaEvent(this, 'pause');
    },
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    writable: true,
    value: function load(this: HTMLMediaElement) {
      dispatchMediaEvent(this, 'emptied');
    },
  });
}
