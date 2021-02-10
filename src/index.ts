import express, { Request, Response } from 'express'
import {promise as ping} from 'ping'
import Mustache from 'mustache'
import {readFileSync} from 'fs'

const PORT: number = Number.parseInt(process.env.PORT || "8080")
const PING_INTERVAL: number = Number.parseInt(process.env.PING_INTERVAL || "1000")
const DB_MAX_SIZE: number = 100000

const app = express()

const pingDB = function() {
	let db = new Array<{time: number, response_time: number | 'unknown'}>()
	
	return {
		insert(time: number, ping_time: number | 'unknown') {
			if (db.length + 1 > DB_MAX_SIZE) {
				for (let i = 0; i < 100; i++) {
					db.shift
				}
			}
			db.push({time, response_time: ping_time})
		},
		getAll() {
			return db
		}
	}
}()
const rootTemplate = readFileSync('./static/index.html', {encoding: 'utf-8'})
const pageTemplate = readFileSync('./static/page.html', {encoding: 'utf-8'})

setInterval(() => {
	ping.probe("1.1.1.1").then((res) => {
		pingDB.insert(Date.now(), res.time)
	})
}, 1000)

app.get("/", (req: Request, res: Response) => {
	const all = pingDB.getAll()

	let online = 0;
	let online_24h = 0

	all.forEach((val) => {
		if (val.response_time == 'unknown') {
		} else {
			online += 1
			if (val.time > (Date.now() - 864000000))
				online_24h += 1
		}
	})

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
	const all = pingDB.getAll()

	let view = {
		logs: page == 1 ? all.slice(0, 9) : all.slice(((page - 1) * 10) - 1, ((page - 1) * 10) + 8),
		next_page_number: page + 1,
		prev_page_number: (page == 1 ? 1 : page - 1)
	}

	res.type('.html').end(Mustache.render(pageTemplate, view))
})

app.listen(PORT, () => {
	console.log(`Started on http://[::1]:${PORT}`)
})
