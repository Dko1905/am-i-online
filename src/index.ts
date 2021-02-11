import express, { Request, Response } from 'express'
import {promise as ping} from 'ping'
import db from 'croxydb'
import Mustache from 'mustache'
import {readFileSync} from 'fs'

// Environment variables
const PORT: number = Number.parseInt(process.env.PORT || "8080")
const PING_INTERVAL: number = Number.parseInt(process.env.PING_INTERVAL || "1000")
const DB_MAX_SIZE: number = 100000

// Init variables
const app = express()
db.setAdapter('jsondb')

if (db.get('pingResponseTime') == undefined) {
	db.push('pingResponseTime', {start: 0, stop: 0})
}

// Read templates
const rootTemplate = readFileSync('./static/index.html', {encoding: 'utf-8'})
const pageTemplate = readFileSync('./static/page.html', {encoding: 'utf-8'})

let start: number
let lastTime: number | 'unknown' = 0
setInterval(() => {
	ping.probe("1.1.1.1").then((res) => {
		if (res.time == 'unknown' && lastTime != 'unknown') {
			start = Date.now()
		} else if (lastTime == 'unknown' && res.time != 'unknown') {
			const stop = Date.now()
			if (Math.floor((stop - start) / 1000) < 5) {
				console.info("Not pushing: drop is under 5 seconds")
			} else {
				console.info("pushing: ")
				console.info({
					start, stop
				})
				db.push("pingResponseTime", {
					start,
					stop
				})
			}
		}
		lastTime = res.time
	})
}, 1000)

app.get("/", (req: Request, res: Response) => {
	const all: {start: number, stop: number}[] = db.get("pingResponseTime")

	let online = 0;
	let online_24h = 0

	// Calculate percentage of time not being online.

	let view;
	if (online > 0) {
		view = {
			server_net_percent: `${online / all.length * 100} %`,
			server_24h_net_percent: `${online_24h / all.length * 100} %`
		}
	} else {
		view = {
			server_net_percent: `${0} %`,
			server_24h_net_percent: `${0} %`
		}
	}

	res.type('.html').end(Mustache.render(rootTemplate, view))
})
app.get("/page/:page", (req: Request, res: Response) => {
	const page: number = Number.parseInt(req.params.page)
	let all: {start: number, stop: number}[] = db.get("pingResponseTime")

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

	res.type('.html').end(Mustache.render(pageTemplate, view))
})

app.listen(PORT, () => {
	console.log(`Started on http://[::1]:${PORT}`)
})
