import needle from 'needle'
import moment from 'moment'
import config from '../config.json'
import SlackAPI from 'slackbotapi'
import emojiList from '../emojiList.json'
import { Emoji, executeQuery } from './database'

if (!config.prefix || !config.slackBotToken) {
  console.error("Invalid config, please fill in the first 2 required config fields")
  process.exit()
}

var customEmojiList = null;

const slack = new SlackAPI({
  token: config.slackBotToken,
  logging: false,
  autoReconnect: true
})

slack.on('message', data => {
  if (data.type != 'message' || !data.text || !data.channel || data.subtype) return;

  // Ignore the bots own messages and other bots
  if (data.user == slack.slackData.self.id || data.user in config.ignoredUsers || data.user == 'USLACKBOT') return;

  if (data.text.charAt(0) == config.prefix) {
    let command = data.text.substring(1).split(' ')[0]
    let context = data.text.split(' ').slice(1).join(' ') || undefined

    switch (command.toLowerCase()) {
      case 'topemoji':
        Emoji.FindOne({}).then(resp => {
          slack.sendMsg(data.channel, resp ? `:${resp.name}: is the most used Emoji and has been recorded ${resp.useCount} times` : 'Dunno')
        })
        break;
      case 'topemojis':
        Emoji.Find({}, { limit: 10 }).then(resp => {
          if (!resp.length) return slack.sendMsg(data.channel, 'Dunno')
          let out = [`*Top ${resp.length} most used Emojis:*`]
          resp.forEach(e => {
            out.push(`:${e.name}: - ${e.useCount}`)
          })
          slack.sendMsg(data.channel, out.join('\n'))
        })
        break;
      case 'emojistats':
        executeQuery('SELECT SUM(useCount) AS total, COUNT(*) AS count, lastUsed FROM Emoji').then(count => {
          executeQuery('SELECT name as name, lastUsed as date, lastUsedBy as user FROM Emoji ORDER BY lastUsed DESC LIMIT 1').then(latest => {
            try {
              let results = Object.assign(count.next().row, latest.next().row)
              slack.sendMsg(data.channel, `I have recorded ${results.count} different Emojis being used ${results.total} times with the last Emoji being :${results.name}: from ${slack.getUser(results.user).name || 'Unknown'} ${moment().to(results.date)}`)
            } catch (e) {
              console.error("Error counting stuff")
              slack.sendMsg(data.channel, `Error counting shit`)
            }
          })
        })
        break;
      case 'deletecount':
        if (data.user != config.admin) return slack.sendMsg(data.channel, `Access Denied`)
        if (!context) return
        var toDelete = context.split(' ')[0]
        var delAmount = parseInt(context.split(' ')[1])
        if (toDelete && delAmount && !isNaN(delAmount)) {
          var emojiName = toDelete.match(/(:\w+:)/) ? toDelete.slice(1, -1) : toDelete
          Emoji.findOneByName(emojiName).then(resp => {
            if (resp) {
              console.log(_moment(), "Deleting", delAmount, emojiName)
              resp.useCount -= delAmount
              if (resp.useCount < 0) resp.useCount = 0
              resp.Persist()
              slack.sendMsg(data.channel, `Success! New count for :${emojiName}: is at ${resp.useCount}`)
            } else slack.sendMsg(data.channel, `No emoji found by that name`)
          })
        } else slack.sendMsg(data.channel, `Error: deletecount <emoji> <amount>`)
        break;
      default:
        return
    }
  } else if (data.channel.charAt(0) != 'D') {
    if (data.text.match(/(:\w+:)/g)) {
      let match = data.text.match(/(:\w+:)/g)
      let found = {}
      match.forEach(emoji => {
        if (emoji in found) return; // So it doesn't count more than 1 in a message
        found[emoji] = true
        let e = emoji.slice(1, -1)
        if (e in emojiList || e in customEmojiList) {
          Emoji.findOneByName(e).then(resp => {
            let entry = resp ? resp : new Emoji() // Edit or create new entry
            entry.name = e
            entry.lastUsed = moment().utc().format()
            entry.lastUsedBy = data.user
            entry.useCount++;
            entry.Persist() // Save dat shit
          })
        } else {
          console.log(emoji, "is not in any list")
        }
      })
    }
  }
})

// Update our cache of custom emoji if any change
slack.on('emoji_changed', data => {
  console.log(_moment(), 'on_emoji_change', data)
  if (!data.subtype) return getCustomEmoji() // If no subtype slack suggests fetching the whole list again
  else if (data.subtype == 'remove') {
    data.names.forEach(emoji => delete customEmojiList[emoji])
  } else if (data.subtype == 'add') {
    if (data.name in customEmojiList) return console.log(_moment(), "New emoji already in the list?", data.name)
    else customEmojiList[data.name] = data.value
  } else {
    console.error(_moment(), "Got an abnormal emoji_changed event", data)
  }
})

// Grab any Custom Emoji on a team
const getCustomEmoji = (attempt) => {
  console.log(_moment(), 'getCustomEmoji')
  needle.get(`https://slack.com/api/emoji.list?token=${config.slackBotToken}`, (err, resp, body) => {
    if (!err && body.ok) {
      customEmojiList = body.emoji;
    } else {
      if (!attempt) getCustomEmoji(true)
      else console.error(_moment(), "Error fetching custom emojis", err || body.error)
    }
  })
}

// Helper function to add date to logs
const _moment = () => {
  return moment().format('YYYY-MM-DD-HH:mm:ss')
}

console.log(_moment(), "Starting up")
getCustomEmoji()
