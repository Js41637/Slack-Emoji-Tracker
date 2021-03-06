import { RtmClient, MemoryDataStore, RTM_EVENTS, CLIENT_EVENTS } from '@slack/client'
import needle from 'needle'
import moment from 'moment'
import config from '../config.json'
import originalEmojiList from '../emojiList.json'
import { Emoji } from './database'
import parseCommand from './commands'

let DEVMODE = process.argv[2] == '--dev' ? true : false

if (!config.prefix || !config.slackBotToken) {
  console.error("Invalid config, please fill in the first 2 required config fields")
  process.exit()
}

const rtm = new RtmClient(config.slackBotToken, {
  logLevel: 'error',
  dataStore: new MemoryDataStore(),
  autoReconnect: true,
  autoMark: false
})
rtm.start()

// totally made these bad bois myself #regexiseasy
const emojiRegex = /:[a-zA-Z0-9-_+]+:(:skin-tone-[2-6]:)?/g
const codeBlockRegex = /(^|\s|[_*\?\.,\-!\^;:{(\[%$#+=\u2000-\u206F\u2E00-\u2E7F"])```([\s\S]*?)?```(?=$|\s|[_*\?\.,\-!\^;:})\]%$#+=\u2000-\u206F\u2E00-\u2E7F…"])/g
const codeRegex = /(^|\s|[\?\.,\-!\^;:{(\[%$#+=\u2000-\u206F\u2E00-\u2E7F"])\`(.*?\S *)?\`/g

var emojiList = originalEmojiList

rtm.on(RTM_EVENTS.MESSAGE, data => {
  if (data.type != 'message' || !data.text || !data.channel || data.subtype) return;

  // Ignore the bots own messages and other bots
  if (data.user == rtm.activeUserId || data.user in config.ignoredUsers || data.user == 'USLACKBOT') return;

  if (data.text.charAt(0) == config.prefix) {
    parseCommand(data.user, data.text, rtm.dataStore.users).then(resp => {
      rtm.sendMessage(resp, data.channel)
    })
  } else if ((DEVMODE && data.channel.charAt(0) == 'D') || (!DEVMODE && data.channel.charAt(0) != 'D')) {
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
rtm.on(RTM_EVENTS.EMOJI_CHANGED, data => {
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
var attempts = 0
const getCustomEmoji = () => {
  console.log(_moment(), 'getCustomEmoji')
  needle.get(`https://slack.com/api/emoji.list?token=${config.slackBotToken}`, (err, resp, body) => {
    if (!err && body.ok) {
      attempts = 0
      emojiList = originalEmojiList // reset emoji list
      Object.assign(emojiList, body.emoji)
    } else {
      console.error(_moment(), "Error fetching custom emojis", err || body.error)
      if (attempts < 4) {
        attempts++;
        setTimeout(() => { getCustomEmoji() }, 1500)
      } else {
        console.log("Failed to fetch custom emoji after 4 tries, rebooting")
        setTimeout(() => { process.exit(1) }, 4000)
      }
    }
  })
}

// Helper function to add date to logs
const _moment = () => {
  return moment().format('YYYY-MM-DD hh:mm:ssS')
}

// Clean refresh every 24 hours
setInterval(() => {
  console.log(_moment(), 'updateInterval getCustomEmoji')
  getCustomEmoji()
}, 8.64e+7);

// Fetches custom emoji list on startup
console.log(_moment(), "Starting up", DEVMODE ? '- Dev Mode' : '')
getCustomEmoji()

const sendErrorToDebugChannel = (type, error) => {
  if (error && error.message && error.stack) {
    console.error(_moment(), "Caught Error:", type, error.message, error.stack);
    if (config.debugChannel) {
      let message = 'Slack-Emoji-Tracker: Caught ' + type + ' ```' + error.message + '\n' + error.stack + '```';
      postMessage(message)
    }
  } else {
    console.error(_moment(), "Caught Error:", type, error)
    if (config.debugChannel) postMessage(`Slack-Emoji-Tracker: Caught ${type} \`\`\`${typeof error == 'string' ? error : JSON.stringify(error)} \`\`\``)
  }
}

const postMessage = message => needle.post('https://slack.com/api/chat.postMessage', {
  text: message,
  channel: config.debugChannel,
  as_user: 'true',
  token: config.slackBotToken
})

rtm.on(CLIENT_EVENTS.RTM.DISCONNECT, () => {
  console.error(_moment(), 'SlackRTM Error - Disconnected')
  sendErrorToDebugChannel('disconnect', 'Disconnected from SlackRTM')
  setTimeout(() => { process.exit(1) }, 4000)
})

rtm.on(CLIENT_EVENTS.RTM.UNABLE_TO_RTM_START, () => {
  console.error(_moment(), 'SlackRTM Error - Unable to connect to RTM')
  sendErrorToDebugChannel('unableToRTMStart', 'Unable to connect to RTM')
  setTimeout(() => { process.exit(1) }, 4000)
})

process.on('uncaughtException', err => {
  sendErrorToDebugChannel('uncaughtException', err)
  setTimeout(() => { process.exit(1) }, 4000)
})

process.on('unhandledRejection', err => sendErrorToDebugChannel('unhandledRejection', err))

process.on('rejectionHandled', err => sendErrorToDebugChannel('handledRejection', err))
