import express, { Request, Response } from 'express'
import { promise as ping } from 'ping'
import db from 'croxydb'
import Mustache from 'mustache'
import { readFileSync } from 'fs'

// Environment variables
const PORT: number = Number.parseInt(process.env.PORT || "8080")
const PING_INTERVAL: number = Number.parseInt(process.env.PING_INTERVAL || "1000")
const PING_MIN_OUTAGE = 5 // Seconds it min must be down

// Init variables
const app = express()
db.setAdapter('jsondb')

if (db.get('pingResponseTime') == undefined) {
	db.push('pingResponseTime', { start: 0, stop: 1 })
}

// Read templates
const rootTemplate = readFileSync('./static/index.html', { encoding: 'utf-8' })
const pageTemplate = readFileSync('./static/page.html', { encoding: 'utf-8' })

let start: number
let lastTime: number | 'unknown' = 0
setInterval(() => {
	const cloudflareDns = ping.probe("1.1.1.1", {
		timeout: 1
	})
	const googleDns = ping.probe('8.8.8.8', {
		timeout: 1
	})
	const googleUrl = ping.probe('google.com', {
		timeout: 1
	})
	const openDns = ping.probe('208.67.222.123', {
		timeout: 1
	})
	Promise.all([cloudflareDns, googleDns, googleUrl, openDns])
		.then((responseArray) => {
			// Go through all responses, save the timings
			let responseTimeArr: number[] = []

			for (const pingResponse of responseArray) {
				if (pingResponse.time != 'unknown') {
					responseTimeArr.push(pingResponse.time)
				}
			}
			const responseTime = responseTimeArr.length > 0 ? responseTimeArr.reduce((prev, current) => prev + current ) / responseTimeArr.length : 'unknown'

			if (responseTime == 'unknown' && lastTime != 'unknown') {
				start = Date.now()
			} else if (lastTime == 'unknown' && responseTime != 'unknown') {
				const stop = Date.now()
				if (Math.floor((stop - start)/ 1000) < PING_MIN_OUTAGE) {
					console.info("Not pushing: drop is under 5 seconds")
				} else {
					console.info("Pushing:")
					console.info({
						start, stop
					})
					db.push("pingResponseTime", {
						start,
						stop
					})
				}
			}
			lastTime = responseTime
		})
}, PING_INTERVAL)

app.get("/", (req: Request, res: Response) => {
	const renderStart = Date.now()
	const all: { start: number, stop: number }[] = db.get("pingResponseTime")

	let offline = 0
	let offline_24h = 0

	all.forEach(val => {
		offline += val.stop - val.start
		if (val.stop > (Date.now() - 8.64e+7)) {
			offline_24h += val.stop - val.start
		}
	})

	let view;
	if (offline > 0) {
		view = {
			server_nonet: `${Math.floor(offline / 1000)} seconds`,
			server_24h_nonet: `${Math.floor(offline_24h / 1000)} seconds`
		}
	} else {
		view = {
			server_net_percent: `${0} %`,
			server_24h_net_percent: `${0} %`
		}
	}

	const render = Mustache.render(rootTemplate, view)

	console.info(`Took ${Date.now() - renderStart} ms to render`)
	res.type('.html').end(render)
})
app.get("/page/:page", (req: Request, res: Response) => {
	const renderStart = Date.now()

	const page: number = Number.parseInt(req.params.page)
	let all: { start: number, stop: number }[] = db.get("pingResponseTime")

	all = page == 1 ? all.slice(0, 9) : all.slice(((page - 1) * 10) - 1, ((page - 1) * 10) + 8)

	const viewArr = all.map((val) => {
		return {
			start: new Date(val.start).toISOString(),
			stop: new Date(val.stop).toISOString(),
			duration_in_seconds: Math.floor((val.stop - val.start) / 1000),
			duration_in_minutes: Math.floor((val.stop - val.start) / 1000 / 60)
		}
	})

	let view = {
		logs: viewArr,
		next_page_number: page + 1,
		prev_page_number: (page == 1 ? 1 : page - 1),
		last_page_number: Math.ceil(page / 10) + 1
	}

	const render = Mustache.render(pageTemplate, view)

	console.info(`Took ${Date.now() - renderStart} ms to render`)
	res.type('.html').end(render)
})

app.listen(PORT, () => {
	console.log(`Started on http://[::1]:${PORT}`)
})
