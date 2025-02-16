/**
 * Scrape watchlist from Google
 * and create an RSS feed
 */

require('dotenv').config();
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const axios = require('axios');
const { Feed } = require('feed');

const rssFile = './_site/index.xml';
const watchlistFile = './_cache/watchlist.json';
const unknownsFile = './_site/unknowns.json';
const overrideCache = process.env.OVERRIDE_CACHE ?? false;
const tmdb = 'https://api.themoviedb.org/3/search/multi?include_adult=false&language=en-US&page=1';
const tmdbOptions = {
	method: 'GET',
	headers: {
		accept: 'application/json',
		Authorization: 'Bearer ' + process.env.TMDB_API_TOKEN
	}
}


// Scrape Google's 'my watchlist'
async function scrape() {
	let document = {};
	let elements = [];
	let items = [];
	let prevFirstItem = null;

	console.log('👀 Checking for new data from your watchlist at ' + process.env.GOOGLE_WATCHLIST_URL);

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
				console.log('Page ' + (i + 1) + ': ' + prevFirstItem);
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

// Fetch metadata for each movie
// Skip movies already in the cache
async function collectMovieData(movies, cachedData = []) {
	console.log('Getting TMDB metadata for ' + movies.length + ' movies');

	// Build a lookup map for cached movies using a slugified title as key.
	const cachedMap = cachedData.reduce((map, movie) => {
		map[slugify(movie.title)] = movie;
		return map;
	}, {});

	const movieData = [];

	// Process movies in batches to avoid rate-limiting issues.
	for (let i = 0; i < movies.length; i += 5) {
		//console.log('Progress... ' + (i + 5));
		
		// Get a batch of movies from the scraped list
		const batch = movies.slice(i, i + 5);
		
		// For each movie in the batch, check if it exists in the cache.
		const batchPromises = batch.map(movieTitle => {
			const key = slugify(movieTitle);
			if (cachedMap[key] && !overrideCache) {
				console.log(`- Skipping cached: ${movieTitle}`);
				// Return the cached movie data as a resolved promise.
				return Promise.resolve(cachedMap[key]);
			} else {
				console.log(`+ Querying for: ${movieTitle}`);
				return fetchMovieData(movieTitle);
			}
		});
		
		// Wait for the current batch to finish.
		const batchResults = await Promise.all(batchPromises);
		movieData.push(...batchResults.filter(result => result));
		
		// Wait 0.5 seconds before processing the next batch.
		await new Promise(resolve => setTimeout(resolve, 500));
	}

	return movieData;
}
  

// Fetch TMDB data for each movie
async function fetchMovieData(movie, resultIndex = 0) {
	// fallback data
	const fallback = {
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
			return fallback;
		}

		let result = results[resultIndex];

		if (result) {
			let title = result.title || result.name;
			let releaseDate = result.release_date || result.first_air_date;
			let year = new Date(releaseDate).getFullYear();

			if (title == 'Silicon Valley') {
				console.log('+++++++')
				console.log('Silicon Valley', result);
				console.log('Release date', releaseDate);
				console.log('Release year', year);
				console.log('+++++++')
			}

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

		return fallback;
	})
	.catch(err => {
		console.error(err)
		return fallback;
	});
}

function slugify(str) {
	return str
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// Check if the watchlist is still fresh
function isCacheFresh(date) {
    const HOUR = 1000 * 60 * 60;
    const anHourAgo = Date.now() - HOUR;
	const fresh = date > anHourAgo; // less than an hour ago

	console.log('How long since last cache update? ' + (fresh ? "⏳ < 1hr" : "⌛️ > 1hr"));

	return overrideCache ? !overrideCache : fresh;
}

// Check if the cached list is the same as the scraped list
function isCacheCurrent(cached, scraped) {
	// Compares the first ten items of the cache to the first ten items of the scrape
	const cachedFirstTen = JSON.stringify(cached.slice(0, 10).map(i => slugify(i.title)));
	const scrapedFirstTen = JSON.stringify(scraped.slice(0,10).map(i => slugify(i)));
	const fresh = cachedFirstTen === scrapedFirstTen;

	//console.log('Cached: ', cachedFirstTen);
	//console.log('Scraped: ', scrapedFirstTen);

	console.log('Checking if cache is current... ' + (fresh ? '👍' : '💩'));

	return overrideCache ? !overrideCache : fresh;
}

// Gets watchlist, either from cached json file, or by scraping a new one
async function init() {
	let cached = {};
	let scraped = [];
	let data = [];
	let cacheFileExists = fs.existsSync(watchlistFile);
	if (cacheFileExists) {
		cached = fs.readFileSync(watchlistFile, {encoding: 'utf8'});
		cached = JSON.parse(cached ? cached : '{}');
		cacheFileExists = cacheFileExists && 'generated' in cached && 'data' in cached;
	}

	console.log();
	console.log('------');
	console.log('👋 Starting watchlist-to-RSS!');

	if (cacheFileExists) {
		// if cached watchlist is stale, re-scrape from Google
		scraped = !isCacheFresh(cached.generated) ? await scrape() : scraped;

		if (cached.data.length) {
			data = cached.data;

			console.log('Cache length ', cached.data.length);

			if (scraped.length && !isCacheCurrent(cached.data, scraped)) {
				// If the cached watchlist file is not current, regenerate it
				console.log('💸 Updating cached watchlist file ' + watchlistFile);
				data = await collectMovieData(scraped, cached.data);
				data = combineWatchlists(data, cached.data);
				createWatchlistFile(data);
			} else {
				console.log('✅ Using cached watchlist file ' + watchlistFile)
			}
		}
	} else {
		console.log('🌱 Starting fresh')
		// If the cached watchlist file doesn't exist, generate one
		scraped = await scrape();
		data = await collectMovieData(scraped);
		createWatchlistFile(data);
	}

	createRssFile(data);
	await createUnknownsFile(data);

	return data;
}

// Generate RSS watchlist file
function createRssFile(data) {
	let feed = new Feed({
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
				id: movie.title + releaseYear,
				//date: new Date(movie.dateAdded),
			});
		});
	}
	
	feed = feed.rss2();
	feed = feed.replaceAll('<guid>', '<guid isPermaLink="false">'); // lame fix
	
	fs.writeFile(rssFile, feed,
		{encoding: 'utf8'},
		(err) => err ? console.error(err) : console.log('✅ Generated RSS at ' + rssFile)
	);
} 

// Generate JSON watchlist file
function createWatchlistFile(data) {
	data = {
		generated: Date.now(),
		data: data
	}

	fs.writeFile(watchlistFile, JSON.stringify(data),
		{encoding: 'utf8'},
		(err) => err ? console.error(err) : console.log('✅ Generated new ' + watchlistFile)
	);
}

async function createUnknownsFile(data) {
	// Items that came back as "person" or weren't matched (id === 0)
	const people = data.filter(item => item.mediaType === 'person');
	const unmatched = data.filter(item => item.id === 0);

	// Identify duplicates based on slugified titles.
	// Count occurrences and then collect items beyond the first occurrence.
	const titleCount = {};
	const duplicates = [];
	data.forEach(item => {
		const key = slugify(item.title);
		titleCount[key] = (titleCount[key] || 0) + 1;
		if (titleCount[key] > 1) {
		duplicates.push(item);
		}
	});

	// For each duplicate, re-run TMDB query using resultIndex=1.
	// If a new result is found (with a different id), use that; otherwise, keep the duplicate.
	const reRunDuplicates = [];
	for (const dup of duplicates) {
		console.log(`Re-querying TMDB for duplicate: ${dup.title}`);
		const fixed = await fetchMovieData(dup.title, 1);
		if (fixed && fixed.id !== dup.id) {
			reRunDuplicates.push(fixed);
		} else {
			reRunDuplicates.push(dup);
		}
	}

	// Combine all unknown items.
	const unknowns = [...people, ...unmatched, ...reRunDuplicates];

	console.log(
		'Looking for unknowns... ' +
		(unknowns.length === 0 ? '👍 None found' : '⚠️  Found ' + unknowns.length)
	);

	const unknownsData = {
		generated: Date.now(),
		data: unknowns
	};

	fs.writeFile(
		unknownsFile,
		JSON.stringify(unknownsData, null, 2),
		{ encoding: 'utf8' },
		err =>
		err
			? console.error(err)
			: console.log('✅ Generated unknowns file at ' + unknownsFile)
	);
}  

function combineWatchlists(newData, cachedData) {
	// Build a map of cached movies by id for quick lookup.
	const cachedById = cachedData.reduce((map, movie) => {
		map[movie.id] = movie;
		return map;
	}, {});
	
	// For each movie in newData, check if it exists in cache.
	return newData.map(movie => {
		if (cachedById[movie.id]) {
			// Preserve the cached dateAdded value.
			return { ...movie, dateAdded: cachedById[movie.id].dateAdded };
		}
		// If not in cache, keep the new data (which already includes a dateAdded)
		return movie;
	});
}

(async () => {
	// Run it
	await init();
})()