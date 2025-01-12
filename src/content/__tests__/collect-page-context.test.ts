import { describe, expect, test } from 'vitest';
import { collectPageContext } from '../dom/collect-page-context';

describe('collectPageContext', () => {
  test('extracts title, meta images, favicon, thumbnails, and video posters', () => {
    const doc = document.implementation.createHTMLDocument('Fallback Title');

    doc.head.innerHTML = `
      <title>Fallback Title</title>
      <meta property="og:title" content="OpenGraph Title">
      <meta name="twitter:title" content="Twitter Title">
      <meta property="og:image:secure_url" content="/secure.jpg">
      <meta property="og:image" content="/og.jpg">
      <meta name="twitter:image" content="/twitter.jpg">
      <link rel="thumbnail" href="/thumb.jpg">
      <link rel="image_src" href="/image-src.jpg">
      <link rel="icon" href="/favicon.ico">
    `;
    doc.body.innerHTML = `
      <video src="/video.mp4" poster="/poster.jpg"></video>
    `;

    expect(
      collectPageContext(doc, { pageUrl: 'https://example.com/watch' }),
    ).toMatchObject({
      pageTitle: 'Fallback Title',
      ogTitle: 'OpenGraph Title',
      twitterTitle: 'Twitter Title',
      ogImageSecure: 'https://example.com/secure.jpg',
      ogImage: 'https://example.com/og.jpg',
      twitterImage: 'https://example.com/twitter.jpg',
      thumbnailLink: 'https://example.com/thumb.jpg',
      imageSrc: 'https://example.com/image-src.jpg',
      faviconUrl: 'https://example.com/favicon.ico',
      videoPosterCandidates: [
        {
          src: 'https://example.com/video.mp4',
          poster: 'https://example.com/poster.jpg',
        },
      ],
    });
  });
});
