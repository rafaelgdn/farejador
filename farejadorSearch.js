/* eslint-disable no-console */
/* eslint-disable no-nested-ternary */
/* eslint-disable no-continue */
/* eslint-disable no-param-reassign */
/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-await-in-loop */
import fs from 'fs';
import puppeteer from 'puppeteer';
import { cookies, localStorage as farejadorLocalStorage } from './session.json';

const config = {
  adTime: '30', // 15, 30, 45, 60, 90, 180, 365 - dias
  minSales: '1', // 1, 2, 5, 10 - per day
};

const setCookies = async ({ page }) => {
  const pageCookies = JSON.parse(cookies);
  const pageLocalStorage = JSON.parse(farejadorLocalStorage);
  const pageLocalStorageEntries = Object.entries(pageLocalStorage);
  const pageLocalStorageArray = pageLocalStorageEntries.map(([key, value]) => ({
    key,
    value,
  }));

  await page.setRequestInterception(true);

  page.on('request', (r) => {
    if (r.url() === 'https://farejadordeprodutos.com.br/') {
      r.respond({
        status: 200,
        contentType: 'text/plain',
        body: 'Inserting Cookies and Storage. Please await...',
      });
    } else r.continue();
  });

  await page.goto('https://farejadordeprodutos.com.br', { waitUntil: 'networkidle2' });

  await page.evaluate((pageStorage) => {
    pageStorage.map(({ key, value }) => localStorage.setItem(key, value));
  }, pageLocalStorageArray);

  const formattedCookies = pageCookies.map(
    ({
      name, value, domain, path, httpOnly, secure, sameSite,
    }) => ({
      name,
      value,
      domain,
      path,
      httpOnly,
      secure,
      sameSite,
    }),
  );

  await page.setCookie(...formattedCookies);
};

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runSearch = async ({ values, page, root = 0 }) => {
  for (const value of values) {
    await page.select(`#categs select[root="${root}"]`, value);
    root += 1;

    const { goNextIteration } = await page.waitForSelector(`#categs select[root="${root}"]`, { visible: true, timeout: 1000 })
      .catch(async () => {
        root -= 1;
        await page.select('#sel_periodo', config.adTime);
        await page.select('#sel_media', config.minSales);
        await page.click('#btn_farejar');

        const { ads } = await Promise.race([
          page.waitForSelector('#ads article', { visible: true, timeout: 300000 }).then(() => ({ ads: true })),
          page.waitForSelector('#no-ads p', { visible: true, timeout: 300000 }).then(() => ({ ads: false })),
        ]);

        if (!ads) return { goNextIteration: true };

        await page.waitForSelector('#progress div[style="width: 0px;"]', { timeout: 300000 });

        const infos = await page.evaluate(() => {
          const articles = document.querySelectorAll('#ads article');
          const articlesArr = Array.from(articles);
          return articlesArr.map((article) => ({
            title: article.querySelector('h3').innerText,
            adTime: article.querySelectorAll('.row')[0].querySelectorAll('h4')[0].innerText,
            sales: article.querySelectorAll('.row')[0].querySelectorAll('h4')[1].innerText,
            price: article.querySelectorAll('.row')[1].querySelectorAll('h4')[0].innerText,
            full: !!article.querySelector('div.tagFull'),
            medal: article.querySelector('div.platinum') ? 'platinum'
              : article.querySelector('div.gold') ? 'gold'
                : article.querySelector('div.silver') ? 'lider'
                  : 'none',
          }));
        });

        console.log('Infos found: ', infos);

        const csvContent = infos.map((item) => Object.values(item).join(','));

        fs.appendFileSync('output.csv', `${csvContent.join('\n')}\n`, 'utf-8');

        return { goNextIteration: true };
      });

    if (goNextIteration) continue;

    const { next } = await page.waitForSelector(`#categs select[root="${root}"]`, { visible: true, timeout: 1000 })
      .catch(() => ({ next: true }));

    if (next) continue;

    const selector = await page.$(`#categs select[root="${root}"]`);

    const options = await page.evaluate((slt) => {
      const optionElements = slt.querySelectorAll('option');
      const optionValues = Array.from(optionElements).map((option) => option.value);
      return optionValues.filter((opt) => opt);
    }, selector);

    if (options) {
      root = await runSearch({
        values: options,
        page,
        root,
      });
    }
  }

  if (root === 0) {
    console.log('Finished!!!');
    return 'Finished!!!';
  }

  root -= 1;
  return root;
};

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await setCookies({ page });

  await page.goto('https://farejadordeprodutos.com.br/pesquisa', { waitUntil: 'networkidle2' });

  await page.waitForSelector('#categs', { visible: true });

  const values = await page.evaluate(() => {
    const nodes = document.querySelector('#categs select[root="0"]').childNodes;
    const nodesArr = Array.from(nodes);
    return nodesArr.map((node) => node.value).filter((a) => a);
  });

  await runSearch({ values, page });

  console.log('Finished!!!!');

  // await page.click('#search_categs');
})();
