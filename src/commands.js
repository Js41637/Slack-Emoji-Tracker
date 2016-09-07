import Promise from 'bluebird'
import moment from 'moment'
//import config from '../config.json'
import { executeQuery } from './database'
import _ from 'lodash'

export default function parseCommand(user, text, users) {
  return new Promise(resolve => {
    let command = text.substring(1).split(' ')[0]
    let context = text.split(' ').slice(1).join(' ') || undefined
    switch (command.toLowerCase()) {
      case 'topemoji':
        executeQuery('SELECT name as name, COUNT(*) as count FROM Emoji GROUP BY name ORDER BY COUNT(*) DESC LIMIT 1').then(results => {
          let top = results.next()
          return resolve(top ? `:${top.row.name}: is the most used Emoji and has been recorded ${top.row.count} times` : 'Dunno')
        })
        break;
      case 'topemojis':
        executeQuery('SELECT name as name, COUNT(*) as count FROM Emoji GROUP BY name ORDER BY COUNT(*) DESC LIMIT 10').then(results => {
          if (!results.rs.rows.length) return resolve('Dunno')
          let out = [`*Top ${results.rs.rows.length} most used Emojis:*`]
          results.rs.rows._array.forEach(e => {
            out.push(`:${e.name}: - ${e.count}`)
          })
          return resolve(out.join('\n'))
        })
        break;
      case 'emojistats':
        executeQuery('SELECT COUNT(*) as total, COUNT(DISTINCT name) as count FROM Emoji').then(count => {
          executeQuery('SELECT user, date, name from Emoji ORDER BY date DESC LIMIT 1').then(user => {
            try {
              let stats = Object.assign(count.next().row, user.next().row)
              return resolve(`I have recorded ${stats.count} different Emojis being used ${stats.total} times with the last Emoji being :${stats.name}: from ${stats.user ? _.get(users, stats.user + '.name', 'Unknown') : 'Unknown'} ${moment(stats.date).isValid() ? moment().to(stats.date) : 'unknown time ago'}`)
            } catch (e) {
              console.error(_moment(), "Error returning emoji stats, either there is no stats or something went horribly wrong \n ## ERROR \n", e, '\n # END ERROR')
              return resolve("Error parsing stats")
            }
          })
        })
        break;
      case 'useremojistats':
      case 'useremoji':
      case 'userstats':
        {
          if (!context) return resolve("Specify a user pls")

          let id = context.slice(0, 2) == "<@" ? context.slice(2, -1) : null
          let dude = id ? users[id] : _.find(users, { name: context })
          let limit = 6
          if (!dude) return resolve("No user by dat name m8")
          executeQuery('SELECT name, date from Emoji WHERE user = \'' + dude.id + '\' ORDER BY date DESC LIMIT 1').then(newest => {
            executeQuery('SELECT name, COUNT(*) as count from Emoji WHERE user = \'' + dude.id + '\' GROUP BY name ORDER BY COUNT(*) DESC LIMIT ' + limit).then(top => {
              try {
                let latest = newest.next().row
                let topemoji = top.rs.rows._array
                let out = [`*Emoji Statistics for ${dude.name}:* \n *Last Used*: :${latest.name}:  about ${moment().to(latest.date)} \n *Top ${topemoji.length} most used Emoji*:`]
                topemoji.forEach(e => {
                  out.push(`:${e.name}: - ${e.count}`)
                })
                return resolve(out.join('\n'))
              } catch (e) {
                console.error(_moment(), "Error fetching user stats, either user has no stats or something went horrible wrong \n ## ERROR \n", e, '\n # END ERROR')
                return resolve("No stats for this user, I think, or something went horribly wrong")
              }
            })
          })
          break;
        }
      case 'emojiuptime':
        {
          const time = moment.duration(parseInt(process.uptime(), 10), 'seconds')
          const duration = type => time[type]() !== 0 ? `${time[type]()} ${type.slice(0, -1)}${(time[type]() > 1 ? 's' : '')}` : false
          const getUpTime = (firstHalf, seconds) => firstHalf.replace(/, /, '').length !== 0 ? `${firstHalf} and ${seconds || '0 seconds'}` : seconds

          return resolve(`Emoji Tracking has been flying smooth for ${getUpTime(['days', 'hours', 'minutes'].map(duration).filter(Boolean).join(', '), duration('seconds'))}`)
        }
      default:
        return
    }
  })
}

// Helper function to add date to logs
const _moment = () => {
  return moment().format('YYYY-MM-DD-HH:mm:ss')
}
