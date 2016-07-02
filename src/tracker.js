import needle from 'needle'
import moment from 'moment'
import config from '../config.json'
import SlackAPI from 'slackbotapi'
import originalEmojiList from '../emojiList.json'
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

// totally made these bad bois myself #regexiseasy
const emojiRegex = /:[a-zA-Z0-9-_+]+:(:skin-tone-[2-6]:)?/g
const codeBlockRegex = /(^|\s|[_*\?\.,\-!\^;:{(\[%$#+=\u2000-\u206F\u2E00-\u2E7F"])```([\s\S]*?)?```(?=$|\s|[_*\?\.,\-!\^;:})\]%$#+=\u2000-\u206F\u2E00-\u2E7F…"])/g
const codeRegex = /(^|\s|[\?\.,\-!\^;:{(\[%$#+=\u2000-\u206F\u2E00-\u2E7F"])\`(.*?\S *)?\`/g

var emojiList = originalEmojiList

slack.on('message', data => {
  if (data.type != 'message' || !data.text || !data.channel || data.subtype) return;

  // Ignore the bots own messages and other bots
  if (data.user == slack.slackData.self.id || data.user in config.ignoredUsers || data.user == 'USLACKBOT') return;

  if (data.text.charAt(0) == config.prefix) {
    parseCommand(data.user, data.text, ::slack.getUser).then(resp => {
      slack.sendMsg(data.channel, resp)
    })
  } else if (data.channel.charAt(0) == 'D') {
    var newMessage = data.text.replace(data.text.match(codeBlockRegex), "")
    newMessage = newMessage.replace(newMessage.match(codeRegex), "").trim()
    if (newMessage.match(emojiRegex)) {
      let match = newMessage.match(emojiRegex)
      let found = {}
      match.forEach(emoji => {
        let e = emoji.slice(1, -1).split('::')[0] // dont count emojis with different skintones
        if (e in found) return; // So it doesn't count more than 1 in a message
        found[e] = true

        if (e in emojiList) {
          // check if emoji is an alias of another emoji
          let split = emojiList[e].split(':')
          let ee = (split[0] == 'alias' && split[1] && split[1] in emojiList) ? split[1] : e

          console.log(_moment(), `Matched Emoji: ${emoji} | Clean: ${e} | Alias: ${ee}`)

          let entry = new Emoji() // Create new entry
          entry.name = ee
          entry.date = moment().utc().format()
          entry.user = data.user
          entry.Persist() // Save dat shit
        } else {
          console.log(_moment(), "Matched Emoji but it wasn't in our list", emoji, e)
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
      emojiList = originalEmojiList // reset emoji list
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

// Clean refresh every 24 hours
setInterval(() => {
  console.log(_moment(), 'updateInterval getCustomEmoji')
  getCustomEmoji()
}, 8.64e+7);

// Fetches custom emoji list on startup
console.log(_moment(), "Starting up")
getCustomEmoji()
