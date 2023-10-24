/* eslint-disable no-promise-executor-return */
import fs from 'fs';
import puppeteer from 'puppeteer';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://farejadordeprodutos.com.br/pesquisa', { waitUntil: 'networkidle2' });
  await page.waitForSelector('#search_categs', { visible: true, timeout: 9999999 });
  await Promise.race([page.waitForNetworkIdle(), sleep(5000)]);

  const cookies = JSON.stringify(await page.cookies());
  const sessionStorage = await page.evaluate(() => JSON.stringify(sessionStorage));
  const localStoragee = await page.evaluate(() => JSON.stringify(localStorage));

  fs.writeFileSync('session.json', JSON.stringify({ cookies, sessionStorage, localStorage: localStoragee }), 'utf-8');

  await browser.close();
})();
