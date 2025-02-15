# Google watchlist scraper

Scrapes Google's ["my watchlist" collection](https://www.google.com/search?q=my+watchlist) and syncs them to [my Letterboxd watchlist](https://letterboxd.com/dohnutt/watchlist/)

🛑 Perhaps should have looked it up first, but the Letterboxd API is in closed beta.

⚠️ WIP, not done. Only scrapes Google watchlist as of right now.

---

## How to run

1. Clone the project and `cd` into the directory.

2. Run `npm install`

3. Find and open your Google watchlist here: https://www.google.com/interests/saved

4. Click the "Share" button, choose "View only link", and click "Continue". Copy the resulting link.

5. Create a `.env` file with the following contents in the project's root directory. Replace the URL with the link you generated in step 4.

```dotenv
GOOGLE_WATCHLIST_URL='https://www.google.com/collections/s/list/aJMxPOnLboE4SU1ChkOhP3ZBP0bQdf/U8F-lG_6BmM'
```

6. Run `npm run start` to scrape and return your watchlist.

7. Do what you like with it.