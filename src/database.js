import path from 'path'
import fs from 'fs'
import CRUD from 'createreadupdatedelete.js'

const dbDir = path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.Slack-Emoji-Tracker')
const dbFile = path.join(dbDir, 'database.sqlite')

if (!fs.existsSync(dbDir))
  fs.mkdirSync(dbDir)

export function Emoji() {
  CRUD.Entity.call(this)
}

CRUD.define(Emoji, {
  table: 'Emoji',
  primary: 'emojiId',
  fields: ['emojiId', 'name', 'lastUsed', 'lastUsedBy', 'useCount', 'reactionCount'],
  orderProperty: 'useCount',
  orderDirection: 'DESC',
  createStatement: 'CREATE TABLE Emoji (emojiId INTEGER PRIMARY KEY NOT NULL, name VARCHAR(128) NOT NULL, lastUsed DATETIME, lastUsedBy VARCHAR(128), useCount INTEGER DEFAULT 0, reactionCount INTEGER DEFAULT 0)'
})

CRUD.setAdapter(new CRUD.SQLiteAdapter(dbFile, {
  estimatedSize: 25 * 1024 * 1024
}))
