import puppeteer from 'puppeteer';
import 'dotenv/config'
import {getNextWeekDay} from "./utils.js";

if (!process.env.DAY) {
  throw new Error('DAY not exists in env');
}

(async () => {
  const date = getNextWeekDay(parseInt(process.env.DAY));
  console.log(`Staring... date: ${date}`);

  const priorityPlaces = (process.env.PRIORITY_PLACES ?? '').split(',').map(place => place.trim());
  console.log('Priority places', priorityPlaces);

  const browser = await puppeteer.launch({
    // headless: false, // for debugging
    slowMo: 25,
    args: ["--no-sandbox"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1024 });

  console.log('Opening login page');
  await page.goto(`${process.env.URL}/Web/index.php?redirect=%2FWeb%2Fdashboard.php`);

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
          return [element.getAttribute('data-resourceid'), element.classList.contains('mine')];
        })
        .toArray(),
    };
  });

  console.log('Places', result.places);
  console.log('Reserved', result.reserved);

  const freePlaces = result['places'].filter(([placeId, name]) => {
    return result['reserved']
      .map(([placeId, mine]) => placeId)
      .indexOf(placeId) === -1;
  });

  console.log('Free places', freePlaces);

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
  console.log('> Sorted free places', sortedFreePlaces);
  console.log('> First free place', firstFreePlace);

  if (!firstFreePlace) {
    console.log('* Error: no free places :(');
    await browser.close();
    return;
  }

  const minePlaces = result.reserved.filter(([placeId, mine]) => mine);
  console.log('Mine places', minePlaces);

  if (minePlaces.length) {
    console.log('* Error: you already have a reservation');
    await browser.close();
    return;
  }

  const reservationUrl = `${process.env.URL}/Web/reservation?rid=${firstFreePlace[0]}&sid=3&rd=${date}`;
  await page.goto(reservationUrl);
  console.log('reservation-url', reservationUrl);

  console.log('Waiting for submit button');
  const submitSelector = '.reservation-buttons > button';
  await page.waitForSelector(submitSelector);

  console.log('Typing plate and description');
  await page.type('input#reservation-title', process.env.REGISTER_PLATE);
  await page.type('textarea#reservation-description', 'Całodniowa');

  console.log('Submitting');
  await page.click(submitSelector);

  console.log('Waiting for success');
  await page.waitForSelector('.reservation-save-message-pending', { timeout: 60*1000 });
  console.log('* Success!');

  await browser.close();
})();
