import needle from 'needle'
import moment from 'moment'
import config from '../config.json'
import SlackAPI from 'slackbotapi'
import emojiList from '../emojiList.json'
import { Emoji } from './database'
import parseCommand from './commands'

if (!config.prefix || !config.slackBotToken) {
  console.error("Invalid config, please fill in the first 2 required config fields")
  process.exit()
}

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
    parseCommand(data.user, data.text, ::slack.getUser).then(resp => {
      slack.sendMsg(data.channel, resp)
    })
  } else if (data.channel.charAt(0) != 'D') {
    if (data.text.match(/:[a-z0-9\-\+]+\:/g)) {
      let match = data.text.match(/:[a-z0-9\-\+]+\:/g)
      let found = {}
      match.forEach(emoji => {
        if (emoji in found) return; // So it doesn't count more than 1 in a message
        found[emoji] = true
        console.log(_moment(), 'Matched emoji', emoji)

        let e = emoji.slice(1, -1)
        if (e in emojiList) {
          // check if emoji is an alias of another emoji
          let split = emojiList[e].split(':')
          e = (split[0] == 'alias' && split[1] && split[1] in emojiList) ? split[1] : e

          let entry = new Emoji() // Create new entry
          entry.name = e
          entry.date = moment().utc().format()
          entry.user = data.user
          entry.Persist() // Save dat shit
        } else {
          console.log(emoji, "is not in the list")
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
    data.names.forEach(emoji => delete emojiList[emoji])
  } else if (data.subtype == 'add') {
    if (data.name in emojiList) return console.log(_moment(), "New emoji already in the list?", data.name)
    else emojiList[data.name] = data.value
  } else {
    console.error(_moment(), "Got an abnormal emoji_changed event", data)
  }
})

// Grab any Custom Emoji on a team
const getCustomEmoji = (attempt) => {
  console.log(_moment(), 'getCustomEmoji')
  needle.get(`https://slack.com/api/emoji.list?token=${config.slackBotToken}`, (err, resp, body) => {
    if (!err && body.ok) {
      Object.assign(emojiList, body.emoji)
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
