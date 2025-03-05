import puppeteer from 'puppeteer';
import 'dotenv/config'
import {getNextWeekDay} from "./utils.js";

const log = (...args) => {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

if (typeof process.env.DAY === 'undefined') {
  throw new Error('DAY not exists in env');
}

(async () => {
  if (process.env.DELAY) {
    log(`DELAY is set, so I wait ${parseInt(process.env.DELAY)}ms.`);
    await new Promise((resolve) => setTimeout(resolve, parseInt(process.env.DELAY)));
  }

  console.log('===');

  const startTime = Date.now();
  const date = getNextWeekDay(parseInt(process.env.DAY));
  log(`Staring... date: ${date}`);

  const priorityPlaces = (process.env.PRIORITY_PLACES ?? '').split(',').map(place => place.trim());
  log('Priority places', priorityPlaces);

  const browser = await puppeteer.launch({
    // headless: false, // for debugging
    // slowMo: 25,
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1024 });

  log('Opening login page');
  await page.goto(`${process.env.URL}/Web/index.php?redirect=%2FWeb%2Fdashboard.php`);

  log('Waiting for login button');
  const searchResultSelector = 'button[name=login][type=submit]';
  await page.waitForSelector(searchResultSelector);

  log('Typing email and pass');
  await page.type('input#email', process.env.EMAIL);
  await page.type('input#password', process.env.PASSWORD);
  await page.click(searchResultSelector);

  log('Submit, waiting for login');
  await page.waitForSelector('span.bi-person-circle');

  for (let i = 1; i <= 50; i++) {
    console.log(`=== step ${i} ===`);

    const reservationsUrl = `${process.env.URL}/Web/schedule.php?sd=${date}&sid=3`;
    log('Going to list reservations', reservationsUrl);
    await page.goto(reservationsUrl);

    log('Waiting for reservations');
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
            return [element.getAttribute('data-resourceid'), element.classList.contains('mine')];
          })
          .toArray(),
      };
    });

    log('Places', result.places);
    log('Reserved', result.reserved);

    const freePlaces = result['places'].filter(([placeId, name]) => {
      return result['reserved']
        .map(([placeId, mine]) => placeId)
        .indexOf(placeId) === -1;
    });

    log('Free places', freePlaces);

    const sortedFreePlaces = freePlaces.sort((a, b) => {
      const indexA = priorityPlaces.indexOf(a[1]);
      const indexB = priorityPlaces.indexOf(b[1]);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      } else if (indexA !== -1) {
        return -1;
      } else if (indexB !== -1) {
        return 1;
      } else {
        return 0;
      }
    });

    const firstFreePlace = sortedFreePlaces[0];
    log('> Sorted free places', sortedFreePlaces);
    log('> First free place', firstFreePlace);

    if (!firstFreePlace) {
      log('* Error: no free places :(');
      await browser.close();
      return;
    }

    const minePlaces = result.reserved.filter(([placeId, mine]) => mine);
    log('Mine places', minePlaces);

    if (minePlaces.length) {
      log('* Error: you already have a reservation');
      await browser.close();
      return;
    }

    const reservationUrl = `${process.env.URL}/Web/reservation?rid=${firstFreePlace[0]}&sid=3&rd=${date}`;
    await page.goto(reservationUrl);
    log('reservation-url', reservationUrl);

    log('Waiting for submit button');
    const submitSelector = '.reservation-buttons > button';
    await page.waitForSelector(submitSelector);

    const errors = await page.evaluate(() => {
      return document
        .querySelectorAll('.reservation-errors')
        .entries()
        .map(([id, element]) => {
          return element.innerText;
        })
        .toArray();
    });

    log('Errors', errors);

    if (errors && errors.length) {
      console.log('Errors detected, skipping...');
      continue;
    }

    log('Typing plate and description');
    await page.type('input#reservation-title', process.env.REGISTER_PLATE);
    await page.type('textarea#reservation-description', 'Całodniowa');

    if (!process.env.DRY_RUN) {
      log('Submitting');
      await page.click(submitSelector);

      log('Waiting for success');
      const result = await page.waitForSelector('.reservation-save-message-pending, .booked-modal', {
        timeout: 60 * 1000
      });
      const className = await result.evaluate(el => el.className);

      if (className === 'reservation-save-message-pending') {
        log('* Success!');
      } else {
        log('* Error! :(');
      }
    } else {
      log('DRY RUN, exited!');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    console.log('=== end step ===');
  }

  console.log(`Execute time without delay: ${Date.now()-startTime}`)

  await browser.close();
})();
