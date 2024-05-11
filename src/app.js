import puppeteer from 'puppeteer';
import 'dotenv/config'
import {getNextWeekDay} from "./utils.js";

(async () => {
  const date = getNextWeekDay(2);
  console.log(`Staring... date: ${date}`)
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 25,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1024 });

  console.log('Opening login page');
  await page.goto(`${process.env.URL}/Web/?`);

  console.log('Waiting for login button');
  const searchResultSelector = 'button[name=login][type=submit]';
  await page.waitForSelector(searchResultSelector);

  console.log('Typing email and pass');
  await page.type('input#email', process.env.EMAIL);
  await page.type('input#password', process.env.PASSWORD);
  await page.click(searchResultSelector);

  console.log('Submit, waiting for login');
  await page.waitForSelector('.availabilityDashboard');

  const reservationsUrl = `${process.env.URL}/Web/schedule.php?sd=${date}&sid=3`;
  console.log('Going to list reservations', reservationsUrl);
  await page.goto(reservationsUrl);

  console.log('Waiting for reservations');
  await page.waitForSelector('table.reservations');

  const result = await page.evaluate(() => {
    return {
      places: document
        .querySelector('table.reservations')
        .querySelectorAll('a.resourceNameSelector')
        .entries()
        .map(([id, element]) => {
          return [element.getAttribute('data-resourceid'), element.innerText];
        })
        .toArray(),
      reserved: document
        .querySelector('table.reservations')
        .querySelectorAll('div.reserved')
        .entries()
        .map(([id, element]) => {
          return element.getAttribute('data-resourceid');
        })
        .toArray(),
    };
  });

  const freePlaces = result['places'].filter(([placeId, name]) => {
    return result['reserved'].indexOf(placeId) === -1;
  });

  const firstFreePlace = freePlaces[0];

  console.log('result', result);
  console.log('freePlaces', freePlaces);

  // if (firstFreePlace) {
  //   await page.goto('${process.env.URL}/Web/reservation?rid=' + firstFreePlace[0] + '&sid=3&rd=' + date);
  //   console.log('reservation-url', '${process.env.URL}/Web/reservation?rid=' + firstFreePlace[0] + '&sid=3&rd=' + date);
  //
  //   const submitSelector = '.reservation-buttons > button';
  //   await page.waitForSelector(submitSelector);
  //
  //   await page.type('input#reservation-title', process.env.REGISTER_PLATE);
  //   await page.type('textarea#reservation-description', 'Całodniowa');
  //   await page.click(submitSelector);
  //
  //   await page.waitForSelector('.reservation-save-message-pending', { timeout: 120*1000 });
  // } else {
  //   console.log('no free places :(');
  // }

  await browser.close();
})();