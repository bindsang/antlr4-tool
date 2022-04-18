#!/usr/bin/env node

import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv
  .slice(2)
  .map(a => '"' + a + '"')
  .join(' ')

const cliPath = path.join(__dirname, 'cli.js')
exec(
  `node  --experimental-import-meta-resolve --experimental-vm-modules "${cliPath}" ${args}`,
  function (err, stdout, stderr) {
    if (err) throw err
    console.log(stdout)
  }
)
