import { chromium } from 'playwright';
import { scrapeFlatfy } from '../scrape-flatfy';

const closeMock = jest.fn();
const gotoMock = jest.fn();

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  gotoMock.mockRejectedValue(new Error('navigation failed'));
  (chromium.launch as jest.Mock).mockResolvedValue({
    close: closeMock,
    newContext: jest.fn().mockResolvedValue({
      addInitScript: jest.fn(),
      newPage: jest.fn().mockResolvedValue({
        goto: gotoMock,
      }),
    }),
  });
});

describe('scrapeFlatfy', () => {
  test('closes the browser when scraping throws after launch', async () => {
    await expect(scrapeFlatfy()).rejects.toThrow('navigation failed');

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
