import { describe, expect, test } from '@jest/globals';
import { buildOsmHtml } from './osmHtml';

describe('OSM route composition padding', () => {
  test('uses asymmetric layout padding when fitting a reviewed route', () => {
    const html = buildOsmHtml({
      route: [
        { lat: -31.9523, lng: 115.8613 },
        { lat: -31.953, lng: 115.862 },
      ],
      fitPadding: { top: 132, right: 82, bottom: 77, left: 82 },
    });

    expect(html).toContain('var fitPadding = {"top":132,"right":82,"bottom":77,"left":82};');
    expect(html).toContain('paddingTopLeft: [fitPadding.left, fitPadding.top]');
    expect(html).toContain('paddingBottomRight: [fitPadding.right, fitPadding.bottom]');
  });
});
