# Google watchlist scraper

Scrapes Google's ["my watchlist" collection](https://www.google.com/search?q=my+watchlist), retrieves metadata from [TMDB](https://www.themoviedb.org/) and syncs them to an RSS file.

⚠️ WIP, not done.

---

## How to run

1. Clone the project and `cd` into the directory.

2. Run `npm install`

3. Find and open your Google watchlist here: [https://www.google.com/interests/saved]

4. Click the "Share" button, choose "View only link", and click "Continue". Copy the resulting link.

5. [Get an API token from TMDB](https://developer.themoviedb.org/reference/intro/getting-started)

6. Copy `.env.example` and rename to `.env`. Set `GOOGLE_WATCHLIST_URL` to the URL you generated in step 4, and set `TMDB_API_TOKEN` to your TMDB token.

7. Run `npm run start` to scrape and return your watchlist.

8. Do what you like with it.