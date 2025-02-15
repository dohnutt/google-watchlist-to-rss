/**
 * Scrape watchlist from Google
 * and create an RSS feed
 */

const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const axios = require('axios');
const { Feed } = require('feed');
require('dotenv').config();

const watchlistFile = 'index.xml';
const cacheFile = 'cache.json';
const unknownsFile = 'unknowns.json';
const tmdb = 'https://api.themoviedb.org/3/search/multi?include_adult=false&language=en-US&page=1';
const tmdbOptions = {
	method: 'GET',
	headers: {
		accept: 'application/json',
		Authorization: 'Bearer ' + process.env.TMDB_API_TOKEN
	}
}
const slugify = str => {
	return str
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}
let watchlist = [];

// Scrape Google's 'my watchlist'
async function scrape() {
	let document = {};
	let elements = [];
	let items = [];
	let prevFirstItem = null;

	console.log('Checking for new data from your watchlist at ' + process.env.GOOGLE_WATCHLIST_URL);

	for (let i = 0; i <= 5; i++) {
		await axios.request({
			method: 'GET',
			url: process.env.GOOGLE_WATCHLIST_URL + '?pageNumber=' + (i + 1),
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
			}
		}).then(response => {
			document = new JSDOM(response.data).window.document;
			elements = document.querySelectorAll('[data-hveid] a[aria-label]');

			items.push([]);

			// Find and collect items
			for (let el of elements) {
				if (el.getAttribute('aria-label') === prevFirstItem) {
					// Stop because this item is same as prev
					return;
				}

				items[i].push(el.getAttribute('aria-label'));
			};

			if (items[i][0] === prevFirstItem) {
				// Stop because first item here is same as prev
				console.log('Stopping because prev equals current: ' + items[i][0] + ' = ' + prevFirstItem)
				return;
			} else {
				// Set first item for next iteration
				prevFirstItem = items[i][0];
				console.log((i + 1) + ': ' + prevFirstItem);
			}
			
		}).catch(error => {
			console.error(error);
		});
	}

	items = items.filter(arr => arr.length);
	items = items.flat(Infinity);

	console.log();

	return await items;
}

// Fetch IDs for each movie
async function collectMovieData(movies) {
	console.log()
	console.log('Getting data for ' + movies.length + ' movies');
	const movieData = [];
  
	for (let i = 0; i < movies.length; i += 5) {
		console.log('Progress... ' + (i + 5));
		
		// Fetch a batch of 5 movies concurrently
		const batchResults = await Promise.all(
			movies.slice(i, i + 5).map(movie => fetchMovieData(movie))
		);

		// Filter out bad results
		movieData.push(...batchResults.filter(result => result));
		
		// Wait for 0.5 seconds before the next batch to handle rate-limiting
		await new Promise(resolve => setTimeout(resolve, 500));
	}
  
	return movieData;
  }

// Fetch TMDB data for each movie
async function fetchMovieData(movie) {
	// fallback data
	let data = {
		id: 0,
		title: movie,
		releaseDate: null,
		releaseYear: null,
		mediaType: null,
		dateAdded: Date.now(),
		googleSearchUrl: 'https://google.ca/search?q=' + encodeURI(movie)
	};

	return await fetch(
		tmdb + '&query=' + encodeURI(movie),
		tmdbOptions
	)
	.then(response => response.json())
	.then(json => json.results)
	.then(results => {
		if (results.length === 0) {
			return data;
		}

		let result = results[0];

		if (result) {
			let title = result.title || result.name;
			let releaseDate = result.release_date || result.first_air_date;
			let year = new Date(releaseDate).getFullYear();

			return {
				id: result.id,
				title: title,
				releaseDate: releaseDate,
				releaseYear: year,
				mediaType: result.media_type,
				dateAdded: Date.now(),
				googleSearchUrl: 'https://google.ca/search?q=' + encodeURI(title + ' ' + '(' + year + ')')
			}
		}
	})
	.catch(err => console.error(err));
}

// Check if the cache is still fresh
function isCacheFresh(date) {
    const HOUR = 1000 * 60 * 60;
    const anHourAgo = Date.now() - HOUR;
	const fresh = date > anHourAgo; // less than an hour ago

	return fresh;
}

// Check if the cache is the same as the watchlist
function isCacheCurrent(cached, scraped) {
	// Compares the first ten items of the cache to the first ten items of the scrape
	const cachedFirstTen = cached.slice(0, 10);
	const scrapedFirstTen = scraped.slice(0,10);
	const fresh = !Object.entries(cachedFirstTen).every(item => scrapedFirstTen.includes(item));

	//console.log('Cached: ', cachedFirstTen.map(i => i.title));
	//console.log('Scraped: ', scrapedFirstTen.map(i => i));

	console.log('Checking if cache is current... ' + (fresh ? '👍' : '💩'));

	return fresh;
}

// Gets watchlist, either from cached json file, or by scraping a new one
async function getWatchlist() {
	cached = {};

	console.log();
	console.log('------');

	if (fs.existsSync(cacheFile)) {
		cached = fs.readFileSync(cacheFile, {encoding: 'utf8'});
		cached = JSON.parse(cached);
	}

	if ('generated' in cached && isCacheFresh(cached.generated)) {
		console.log('✅ Using ' + cacheFile)
		data = cached.data;
	} else {
		const scrapedData = await scrape();
		data = await collectMovieData(scrapedData);

		if ('data' in cached && cached.data.length) {
			if (!isCacheCurrent(cached.data, scrapedData)) {
				// If the cache file is not current, regenerate it
				createCacheFile(data);
			}
		}
	}
	
	createRssFile(data);
	createUnknowns(data);

	return data;
}

// Generate RSS watchlist file
function createRssFile(data) {
	const feed = new Feed({
		title: 'Google watchlist',
		description: 'Watchlist feature from Google, in RSS format',
		id: 'https://google-watchlist-rss.netlify.app',
		link: 'https://google-watchlist-rss.netlify.app',
		updated: new Date()
	});

	if (data.length) {
		data.forEach(movie => {
			let releaseYear = movie.releaseYear ? ' (' + movie.releaseYear + ')' : '';
			feed.addItem({
				title: movie.title + releaseYear,
				id: movie.id,
				date: new Date(movie.dateAdded),
			});
		});
	}
	
	fs.writeFile(watchlistFile, feed.rss2(),
		{encoding: 'utf8'},
		(err) => err ? console.error(err) : console.log('✅ Generated RSS at ' + watchlistFile)
	);
}

// Generate JSON cache file
function createCacheFile(data) {
	data = {
		generated: Date.now(),
		data: data
	}
	
	fs.writeFile(cacheFile, JSON.stringify(data),
		{encoding: 'utf8'},
		(err) => err ? console.error(err) : console.log('✅ Generated new ' + cacheFile)
	);
}

function createUnknowns(data) {
	let map = {};
	let duplicates = [];
	let people = data.filter(item => item.mediaType === 'person');
	let unmatched = data.filter(item => item.id === 0);

	data.forEach(item => {
		const keyValue = item.id;
		if (map[keyValue]) {
			duplicates.push(item);
		} else {
			map[keyValue] = true;
		}
	});

	let unknowns = [ ...duplicates, ...people, ...unmatched];
	
	console.log(
		'Looking for unknowns... ' +
		(unknowns.length === 0 ? 'None found' : '⚠️  Found ' + unknowns.length)
	);

	data = {
		generated: Date.now(),
		data: unknowns
	}

	// Generate JSON cache
	fs.writeFile(unknownsFile, JSON.stringify(data),
		{encoding: 'utf8'},
		(err) => err ? console.error(err) : console.log('✅ Generated ' + unknownsFile)
	);
}

// It's working. Changes page with `?pageNumber` URL param
// It pulls each page of results and groups them.
// 
// Then queries TMDB to retrieve metadata for each movie.
// Create a cache from the data so it doesn't have to fully scrape every time.
// Then create an RSS feed from the data
//
// Run it on a cron often

(async () => {
	watchlist = await getWatchlist();
})()