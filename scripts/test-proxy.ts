import { chromium } from 'playwright';

async function testProxy() {
  const proxy = {
    server: 'http://p.webshare.io:80',
    username: '74y8tyiaug-rotate',
    password: 'kxjhcgiqy3rte',
  };

  console.log('Launching browser with proxy...');

  const browser = await chromium.launch({
    headless: false, // Set to true for headless mode
    proxy,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();

  try {
    // Test 1: Check IP address
    console.log('Checking IP address...');
    await page.goto('https://httpbin.org/ip', { timeout: 30000 });
    const ipContent = await page.textContent('body');
    console.log('Your IP via proxy:', ipContent);

    // Test 2: Try a simple page
    console.log('\nTesting navigation...');
    await page.goto('https://example.com', { timeout: 30000 });
    const title = await page.title();
    console.log('Page title:', title);

    console.log('\n✅ Proxy is working!');
  } catch (error) {
    console.error('❌ Proxy test failed:', error);
  } finally {
    await browser.close();
  }
}

testProxy();
