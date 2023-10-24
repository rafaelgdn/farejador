/* eslint-disable consistent-return */
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
  headless: false,
  adTime: '365', // 15, 30, 45, 60, 90, 180, 365 - dias
  minSales: '1', // 1, 2, 5, 10 - per day
  ccr: 10,
  mainCategories: [
    'MLB5672', // Acessórios para Veículos
    'MLB271599', // Agro
    // 'MLB1403', // Alimentos e Bebidas
    'MLB1071', // Animais
    // 'MLB1367', // Antiguidades e Coleções
    'MLB1368', // Arte, Papelaria e Armarinho
    'MLB1384', // Bebês
    'MLB1246', // Beleza e Cuidado Pessoal
    'MLB1132', // Brinquedos e Hobbies
    'MLB1430', // Calçados, Roupas e Bolsas
    'MLB1039', // Câmeras e Acessórios
    'MLB1574', // Casa, Móveis e Decoração
    'MLB1051', // Celulares e Telefones
    'MLB1500', // Construção
    'MLB5726', // Eletrodomésticos
    'MLB1000', // Eletrônicos, Áudio e Vídeo
    'MLB1276', // Esportes e Fitness
    'MLB263532', // Ferramentas
    'MLB12404', // Festas e Lembrancinhas
    'MLB1144', // Games
    'MLB1499', // Indústria e Comércio
    'MLB1648', // Informática
    // 'MLB218519', // Ingressos
    'MLB1182', // Instrumentos Musicais
    'MLB3937', // Joias e Relógios
    'MLB1196', // Livros, Revistas e Comics
    // 'MLB1168', // Música, Filmes e Seriados
    'MLB264586', // Saúde
    'MLB1953', // Mais Categorias
  ],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const divideArrayInBatches = (array, batchSize) => array.reduce((resultArray, item, index) => {
  const chunkIndex = Math.floor(index / batchSize);

  if (!resultArray[chunkIndex]) {
    resultArray[chunkIndex] = [];
  }

  resultArray[chunkIndex].push(item);

  return resultArray;
}, []);

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

const runSearch = async ({
  values, page, rt = 0, browser,
}) => {
  let root = rt;

  for (const value of values) {
    await page.select(`#categs select[root="${root}"]`, value);
    await Promise.race([page.waitForNetworkIdle(), sleep(5000)]);
    root += 1;

    const { goNextIteration } = await page.waitForSelector(`#categs select[root="${root}"]`, { visible: true, timeout: 1000 })
      .catch(async () => {
        root -= 1;
        let gotInfos = false;
        let attempts = 0;

        // await page.select('#sel_periodo', config.adTime);
        // await page.select('#sel_media', config.minSales);
        await page.waitForSelector('#btn_farejar', { visible: true });

        while (!gotInfos && attempts < 20) {
          try {
            await page.click('#btn_farejar');
            await page.focus('#progress');

            const { ads } = await Promise.race([
              page.waitForSelector('#ads article').then(() => ({ ads: true })),
              page.waitForSelector('#no-ads p').then(() => ({ ads: false })),
            ]);

            if (!ads) {
              gotInfos = true;
              return { goNextIteration: true };
            }

            await page.waitForSelector('#progress div[style="width: 0px;"]');

            const infos = await page.evaluate(() => {
              const articles = document.querySelectorAll('#ads article');
              const articlesArr = Array.from(articles);
              return articlesArr.map((article) => ({
                title: article.querySelector('h3').innerText,
                adTime: article.querySelectorAll('div.content-data h4')?.[0]?.innerText?.replace('dias', '')?.trim(),
                sales: article.querySelectorAll('div.content-data h4')?.[1]?.innerText?.replace('+', ''),
                price: article.querySelectorAll('div.content-data h4')?.[2]?.innerText,
                full: !!article.querySelector('div.tagFull'),
                medal: (article.querySelector('div.reputation')?.innerText)?.toLowerCase()?.includes('gold') ? 'gold'
                  : article.querySelector('div.reputation')?.innerText?.toLowerCase()?.includes('platinum') ? 'platinum'
                    : article.querySelector('div.reputation')?.innerText?.toLowerCase()?.includes('lider') ? 'lider'
                      : 'noMedal',
              })).filter(({ title }) => title !== 'Calcule seus ganhos');
            });

            console.log('Infos found: ', infos);

            const csvContent = infos.map((item) => Object.values(item).join(':'));

            fs.appendFileSync(`output-${config.adTime}-${config.minSales}.csv`, `${csvContent.join('\n')}\n`, 'utf-8');

            gotInfos = true;

            return { goNextIteration: true };
          } catch (error) {
            attempts += 1;
            console.log({ error: error.message, attempts });
            await sleep(300000);
          }
        }
      });

    if (goNextIteration) { continue; }

    const { next } = await page.waitForSelector(`#categs select[root="${root}"]`, { visible: true, timeout: 5000 })
      .catch(() => ({ next: true }));

    if (next) { continue; }

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
        rt: root,
      });
    }
  }

  if (root === 0) {
    console.log('Finished!!!');
    await browser?.close();
    return 'Finished!!!';
  }

  root -= 1;
  return root;
};

(async () => {
  let browser;

  const valuesBatches = divideArrayInBatches(
    config.mainCategories,
    config.mainCategories.length / config.ccr,
  );

  const width = Math.floor(1920 / 4) - 50;
  const height = (1080 / 2) - 100;

  const pages = await Promise.all(valuesBatches.map(async (_, i) => {
    await sleep(i * 2000);
    browser = await puppeteer.launch({ headless: config.headless, maxConcurrentSessions: 1, args: [`--window-size=${width},${height}`] });
    const page = await browser.newPage();
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    await page.setViewport({ width, height });
    await setCookies({ page });
    await page.goto('https://farejadordeprodutos.com.br/pesquisa', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#por_categ-tab', { visible: true });
    await page.click('#por_categ-tab');
    await page.waitForSelector('#search_categs', { visible: true });
    return page;
  }));

  const result = await Promise.allSettled(pages.map(async (page, index) => {
    await runSearch({ values: valuesBatches[index], page, browser });
  }));

  console.log('Finished All!!!!', { result });
  return 'Finished All!!!!';
})();
