import Promise from 'bluebird'
import moment from 'moment'
//import config from '../config.json'
import { executeQuery } from './database'

export default function parseCommand(user, text, getUser) {
  return new Promise(resolve => {
    let command = text.substring(1).split(' ')[0]
      //let context = text.split(' ').slice(1).join(' ') || undefined
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
        executeQuery('SELECT COUNT(*) as total, COUNT(DISTINCT name) as count, user, date, name from Emoji ORDER BY date DESC LIMIT 1').then(results => {
          let stats = results.next()
          console.log(stats)
          return resolve(`I have recorded ${stats.row.count} different Emojis being used ${stats.row.total} times with the last Emoji being :${stats.row.name}: from ${stats.row.user ? getUser(stats.row.user).name : 'Unknown'} ${moment(stats.row.date).isValid() ? moment().to(stats.row.date) : 'unknown time ago'}`)
        })
        break;
      default:
        return
    }
  })
}

// Helper function to add date to logs
//const _moment = () => {
//  return moment().format('YYYY-MM-DD-HH:mm:ss')
//}
