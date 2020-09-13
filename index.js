const axios = require('axios');
const fs = require('fs');
const handlebars = require('handlebars');
const nconf = require('nconf');
const defaultConfig = require('./config');

/**
 * Setup configuration to use (in-order):
 * 1. Command-line arguments
 * 2. Environment variables
 * 3. File located at './config.local.json' excluded from this repo
 * 4. Default values in the file located at './config.json'
 * @returns {{username: string, password: string, folder: string, delay: number}}
 */
const getConfig = () => {
  nconf
    .argv()
    .env()
    .file({ file: './config.local.json' })
    .defaults(defaultConfig);

  const username = nconf.get('username');
  const password = nconf.get('password');

  if (!username || !password) {
    throw new Error('Username or password are empty');
  }

  return {
    username,
    password,
    folder: nconf.get('folder'),
    delay: nconf.get('delay'),
  };
};

/**
 * Get _csrf token from the page
 * @param {string} html - Html to parse
 * @returns {string|null} _csrf token or null if not found
 */
const getCsrf = (html) => {
  const csrfMatch = html.match(/"_csrf" value="[^"]+/);
  return csrfMatch ? csrfMatch[0].replace('"_csrf" value="', '') : null;
};

/**
 * Get session cookies from a list of cookies
 * @param {Array<string>} cookies - Cookies to parse
 * @returns {string} Session cookies
 */
const getSessionCookie = (cookies) =>
  cookies
    .map((item) => item.split(';')[0])
    .filter((item) => item.indexOf('session') === 0)
    .join(';');

/**
 * Add date to the page comments
 * @param {string} html - Page content
 * @param {string} date - Date
 * @returns {string}
 */
const addDateToPage = (html, date) => {
  const find = 'Released under the MIT license: http://jsbin.mit-license.org';
  return html.replace(find, `${find}\n\nLast update: ${date}`);
};

/**
 * Handlebars helper to show a date in the format 'DD MMM YYYY'
 * @param {string} dateString - ISO date
 * @returns {string} Date in the 'DD MMM YYYY' format
 */
const formatDate = (dateString) => {
  const [ddd, MMM, DD, YYYY] = new Date(dateString.replace('Z', ''))
    .toDateString()
    .split(' ');
  return [DD, MMM, YYYY].join(' ');
};
handlebars.registerHelper('date', formatDate);
/**
 * Handlebars helper to check if a string is equal to a value
 */
const ifEquals = function (arg1, arg2, options) {
  return arg1 == arg2 ? options.fn(this) : options.inverse(this);
};
handlebars.registerHelper('ifEquals', ifEquals);

/**
 * Create html for the list
 * @param {Array} data - Data to transform into html
 * @returns {string}
 */
const createHtmlList = (data) => {
  const source = fs.readFileSync('./template.handlebars', 'utf-8');
  const template = handlebars.compile(source);
  const result = template(data);
  return result;
};

/**
 * Fetch the login page and get the anonymous _csrf and session cookies
 */
const fetchLoginPage = async () => {
  const res = await axios({
    url: 'https://jsbin.com/login',
  });
  const csrf = getCsrf(res.data);
  const sessionCookie = getSessionCookie(res.headers['set-cookie']);
  return { csrf, sessionCookie };
};

/**
 * Log in and get the user session cookies
 * @param {{csrf: string, sessionCookie: string, username: string, password: string}} param - Anonymous info
 * @param {string} param.csrf - Anonymous _csrf token
 * @param {string} param.sessionCookie - Anonymous session cookies
 * @param {string} param.username - User username
 * @param {string} param.password - User password
 */
const fetchLoginInfo = async ({ csrf, sessionCookie, username, password }) => {
  const res = await axios({
    url: 'https://jsbin.com/login',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: sessionCookie,
    },
    data: `username=${username}&key=${password}&_csrf=${csrf}`,
    method: 'POST',
  });
  return getSessionCookie(res.headers['set-cookie']);
};

/**
 * Fetch the user list page and return it as a json
 * @param {string} sessionCookie - User session cookies
 * @returns {Promise<Array>}
 */
const fetchListPage = async (sessionCookie) => {
  const res = await axios({
    url: 'https://jsbin.com/list',
    headers: {
      Cookie: sessionCookie,
    },
  });
  return res.data.flat();
};

/**
 * Clean the output folder and create the files for the list
 * @param {Array} list - List of items
 * @param {string} username - User username
 * @param {string} folder - Folder to save to
 */
const saveListToFile = (list, username, folder) => {
  const data = {
    username,
    last_exported: new Date().toISOString(),
    list,
  };
  const htmlList = createHtmlList(data);
  fs.rmdirSync(folder, { recursive: true });
  fs.mkdirSync(folder);
  fs.writeFileSync(`${folder}/data.json`, JSON.stringify(data, null, 2));
  fs.writeFileSync(`${folder}/index.html`, htmlList);
};

/**
 * Delay a given callback by the given milliseconds
 * @param {function} fx - Function to delay
 * @param {number} ms - Milliseconds of the delay
 * @returns {Promise} Promise resolving the given callback
 */
const sleep = (fx, ms) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(fx()), ms);
  });

/**
 * Fetch the page and save it to file with the proper metadata
 * @param {*} item - Item to fetch and save
 * @param {string} sessionCookie - User session cookies
 * @param {string} folder - Folder to save to
 */
const fetchAndSaveItem = async (
  { url, code, revision, last_updated },
  sessionCookie,
  folder
) => {
  const { data } = await axios({
    url: `https://jsbin.com${url}/quiet`,
    headers: {
      Cookie: sessionCookie,
    },
  });
  const dataWithDate = addDateToPage(data, last_updated);
  fs.writeFileSync(`${folder}/${code}-${revision}.html`, dataWithDate);
  console.log(`${code}/${revision}`);
};

/**
 * Fetch and save all the items of the list
 * @param {Array} list - List of items
 * @param {string} sessionCookie - User session cookies
 * @param {string} folder - Folder to save to
 * @param {number} delay - Milliseconds of the delay
 * @returns {Promise<Array>}
 */
const fetchItems = async (list, sessionCookie, folder, delay) =>
  list
    .slice(0, 2) // TODO
    .reduce(
      (acc, item) =>
        acc.then(() =>
          sleep(() => fetchAndSaveItem(item, sessionCookie, folder), delay)
        ),
      Promise.resolve([])
    );

const jsbinExport = async () => {
  try {
    console.log('Started!');
    const { username, password, folder, delay } = getConfig();
    const { csrf, sessionCookie } = await fetchLoginPage();
    const loggedInSessionCookie = await fetchLoginInfo({
      csrf,
      sessionCookie,
      username,
      password,
    });
    const list = await fetchListPage(loggedInSessionCookie);
    saveListToFile(list, username, folder);
    await fetchItems(list, loggedInSessionCookie, folder, delay);
    console.log(`List of ${list.length} items generated`);
  } catch (err) {
    console.error('Error!', err);
  }
};

jsbinExport();
