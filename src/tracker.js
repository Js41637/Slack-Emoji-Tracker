import needle from 'needle'
import moment from 'moment'
import config from '../config.json'
import SlackAPI from 'slackbotapi'
import emojiList from '../emojiList.json'
import { Emoji } from './database'

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
  if (data.user == slack.slackData.self.id || data.user in config.ignoredUsers) return;

  if (data.text.charAt(0) == config.prefix) {
    let command = data.text.substring(1).split(' ')[0]
      //let context = data.text.split(' ').slice(1).join(' ')

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
      default:
        return
    }
  } else {
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

slack.on('emoji_changed', data => {
  console.log(_moment(), 'on_emoji_change')
  if (!data.subtype) return getCustomEmoji()
  else if (data.subtype == 'remove') {
    data.names.forEach(emoji => delete customEmojiList[emoji])
  } else if (data.subtype == 'add') {
    if (data.name in customEmojiList) return console.log(_moment(), "New emoji already in the list?", data.name)
    else customEmojiList[data.name] = data.value
  } else {
    console.error(_moment(), "Got an abnormal emoji_changed event")
  }
})

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

const _moment = () => {
  return moment().format('YYYY-MM-DD-HH:mm:ss')
}

getCustomEmoji()
